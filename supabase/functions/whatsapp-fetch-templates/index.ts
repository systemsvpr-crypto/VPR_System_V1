  export {};
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getEffectiveWabaId(token: string, configuredWabaId?: string, phoneId?: string): Promise<{ wabaId: string; note?: string; diagnostics: any }> {
  const diagnostics: any = {
    configuredWabaId: configuredWabaId ? `${configuredWabaId.substring(0, 4)}... (len ${configuredWabaId.length})` : 'missing',
    phoneId: phoneId ? `${phoneId.substring(0, 4)}... (len ${phoneId.length})` : 'missing',
  };

  // 1. Try the configured WABA ID directly if it looks valid (not a placeholder)
  if (configuredWabaId && !configuredWabaId.includes('<') && configuredWabaId.trim().length > 5) {
    const testRes = await fetch(`https://graph.facebook.com/v21.0/${configuredWabaId.trim()}/message_templates?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (testRes.ok) {
      return { wabaId: configuredWabaId.trim(), diagnostics };
    }
    diagnostics.directWabaError = await testRes.text();
  }

  // 2. Auto-resolve from Phone Number ID if configured WABA ID failed or is placeholder
  if (phoneId && !phoneId.includes('<') && phoneId.trim().length > 5) {
    const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId.trim()}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const phoneText = await phoneRes.text();
    diagnostics.phoneResStatus = phoneRes.status;
    if (phoneRes.ok) {
      try {
        const phoneData = JSON.parse(phoneText);
        const resolvedId = phoneData?.whatsapp_business_account?.id;
        if (resolvedId) {
          return { wabaId: resolvedId, note: 'auto-resolved-from-phone', diagnostics };
        }
      } catch (e) {
        diagnostics.phoneParseErr = String(e);
      }
    } else {
      diagnostics.phoneResBody = phoneText;
    }
  }

  return { wabaId: configuredWabaId || '', diagnostics };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const rawWabaId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'WHATSAPP_ACCESS_TOKEN is not configured in Supabase secrets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const { wabaId, diagnostics } = await getEffectiveWabaId(token, rawWabaId, phoneId);

    if (!wabaId || wabaId.includes('<')) {
      return new Response(
        JSON.stringify({
          error: 'WhatsApp Business Account ID (WABA ID) could not be resolved. Please set WHATSAPP_BUSINESS_ACCOUNT_ID to your real 15-digit WABA ID from Meta Developer Portal or Business Settings.',
          diagnostics,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let allTemplates: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`;

    while (nextUrl) {
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({
            error: `Meta API error (${res.status}): ${errText}`,
            attemptedWabaId: wabaId,
          }),
          {
            status: res.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const json = await res.json();
      if (Array.isArray(json.data)) {
        allTemplates = allTemplates.concat(json.data);
      }
      nextUrl = json.paging?.next || null;
    }

    let savedCount = 0;
    for (const t of allTemplates) {
      let headerType = 'NONE';
      let headerText = null;
      let headerSampleUrl = null;
      let bodyText = '';
      let footerText = null;
      let buttons: any[] = [];

      for (const comp of t.components || []) {
        if (comp.type === 'HEADER') {
          headerType = comp.format || 'TEXT';
          headerText = comp.text || null;
          headerSampleUrl = comp.example?.header_handle?.[0] || comp.example?.header_url?.[0] || null;
        } else if (comp.type === 'BODY') {
          bodyText = comp.text || '';
        } else if (comp.type === 'FOOTER') {
          footerText = comp.text || null;
        } else if (comp.type === 'BUTTONS') {
          buttons = comp.buttons || [];
        }
      }

      const row = {
        element_name: t.name,
        meta_template_id: t.id,
        category: t.category || 'MARKETING',
        language: t.language || 'en',
        body_text: bodyText,
        status: t.status || 'PENDING',
        header_type: headerType,
        header_text: headerText,
        header_sample_url: headerSampleUrl,
        footer_text: footerText,
        buttons: buttons,
        updated_at: new Date().toISOString(),
      };

      // Strategy 1: Try ON CONFLICT upsert (works if UNIQUE constraint exists on element_name)
      let saveRes = await fetch(
        `${supabaseUrl}/rest/v1/whatsapp_templates?on_conflict=element_name`,
        {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(row),
        }
      );

      // Strategy 2: Fallback — if UNIQUE constraint is missing (42P10 error), DELETE + INSERT
      if (!saveRes.ok) {
        const errBody = await saveRes.text();
        if (errBody.includes('42P10') || errBody.includes('unique or exclusion constraint')) {
          // Delete existing row with same element_name, then insert fresh
          await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_templates?element_name=eq.${encodeURIComponent(t.name)}`,
            { method: 'DELETE', headers: dbHeaders }
          );
          saveRes = await fetch(`${supabaseUrl}/rest/v1/whatsapp_templates`, {
            method: 'POST',
            headers: { ...dbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ ...row, created_at: new Date().toISOString() }),
          });
        } else {
          console.error('Failed to save template:', t.name, errBody);
        }
      }

      if (saveRes.ok) {
        savedCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, fetched: allTemplates.length, saved: savedCount, wabaId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('whatsapp-fetch-templates error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
