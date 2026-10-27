export {};
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const rawWabaId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '';
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'WHATSAPP_ACCESS_TOKEN is not configured in Supabase secrets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let wabaId = rawWabaId.trim();
  if (wabaId.includes('<') || wabaId.length < 5) {
    // Attempt auto-resolve from phoneId if valid
    if (phoneId && !phoneId.includes('<') && phoneId.length > 5) {
      try {
        const pRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}?fields=whatsapp_business_account`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pRes.ok) {
          const pJson = await pRes.json();
          wabaId = pJson?.whatsapp_business_account?.id || '';
        }
      } catch (_) {}
    }
  }

  if (!wabaId || wabaId.includes('<')) {
    return new Response(
      JSON.stringify({ error: 'Valid WHATSAPP_BUSINESS_ACCOUNT_ID is required (currently placeholder or missing)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const payload = await req.json();
    const action = payload.action || 'create';

    if (action === 'delete') {
      const elementName = payload.elementName || payload.name;
      if (!elementName) {
        return new Response(JSON.stringify({ error: 'elementName is required for delete' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Call Meta DELETE
      const deleteUrl = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(elementName)}`;
      const metaDelRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Soft delete in database
      await fetch(
        `${supabaseUrl}/rest/v1/whatsapp_templates?element_name=eq.${encodeURIComponent(elementName)}`,
        {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({ deleted_at: new Date().toISOString() }),
        }
      );

      const delData = await metaDelRes.json();
      return new Response(JSON.stringify({ success: true, meta: delData }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create') {
      const {
        name,
        category = 'MARKETING',
        language = 'en',
        components = [],
        headerType = 'NONE',
        headerText = null,
        headerSampleUrl = null,
        bodyText = '',
        footerText = null,
        buttons = [],
      } = payload;

      const slugName = (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_');

      if (!slugName) {
        return new Response(JSON.stringify({ error: 'Valid template name is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Prepare Meta Components array if not already provided
      let metaComponents = components;
      if (!metaComponents || metaComponents.length === 0) {
        metaComponents = [];
        if (headerType && headerType !== 'NONE') {
          const headerComp: any = { type: 'HEADER', format: headerType };
          if (headerType === 'TEXT' && headerText) {
            headerComp.text = headerText;
          } else if (headerSampleUrl) {
            headerComp.example = { header_handle: [headerSampleUrl] };
          }
          metaComponents.push(headerComp);
        }
        if (bodyText) {
          metaComponents.push({ type: 'BODY', text: bodyText });
        }
        if (footerText) {
          metaComponents.push({ type: 'FOOTER', text: footerText });
        }
        if (Array.isArray(buttons) && buttons.length > 0) {
          metaComponents.push({ type: 'BUTTONS', buttons });
        }
      }

      const metaPayload = {
        name: slugName,
        category,
        language,
        components: metaComponents,
      };

      // POST to Meta
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
      });

      const metaData = await metaRes.json();

      if (!metaRes.ok) {
        const errMsg = metaData?.error?.message || JSON.stringify(metaData);
        return new Response(JSON.stringify({ error: errMsg, details: metaData }), {
          status: metaRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Upsert into whatsapp_templates
      const dbRow = {
        element_name: slugName,
        meta_template_id: metaData.id || null,
        category,
        language,
        body_text: bodyText,
        status: metaData.status || 'PENDING',
        header_type: headerType,
        header_text: headerText,
        header_sample_url: headerSampleUrl,
        footer_text: footerText,
        buttons: buttons,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await fetch(`${supabaseUrl}/rest/v1/whatsapp_templates`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(dbRow),
      });

      return new Response(JSON.stringify({ success: true, data: metaData, template: dbRow }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('whatsapp-create-template error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
