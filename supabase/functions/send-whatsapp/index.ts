// Supabase Edge Function: sends approved WhatsApp templates via the Meta
// WhatsApp Cloud API (e.g. "order_confirmation", "purchase_delivered_2", "dispatch_confirmation", "indent_created").
//
// Required secrets (set with `supabase secrets set`):
//   WHATSAPP_ACCESS_TOKEN   - permanent/system-user access token for the Meta app
//   WHATSAPP_PHONE_NUMBER_ID - the "Phone number ID" of the sending WhatsApp number
//
// Request body:
//   { phone: string, template: string, language?: string, parameters?: string[], headerParameters?: string[],
//     headerDocument?: { link: string, filename?: string } }
// headerDocument is for templates whose header is a Document (e.g. "document_share");
// the link must be a public https URL Meta can fetch.

// Editor-only typing: the Supabase Edge runtime provides `Deno` globally, but a
// plain TS language server doesn't know it. `export {}` makes this a module so
// the declaration below is local and can't clash with Deno's own global.
export {};
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// Best-effort insert into whatsapp_logs; never lets a logging failure break the send.
async function writeLog(row: Record<string, unknown>) {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    const r = await fetch(`${url}/rest/v1/whatsapp_logs`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) console.error('whatsapp_logs insert failed:', r.status, await r.text());
  } catch (e) {
    console.error('whatsapp_logs insert error:', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let log: Record<string, unknown> = {};
  try {
    const { phone, template, language, parameters, headerParameters, headerDocument, module, referenceType, referenceId, sentBy, recipientName } = await req.json();
    log = {
      template_name: template ?? null,
      language: language || 'en',
      module: module ?? null,
      reference_type: referenceType ?? null,
      reference_id: referenceId != null ? String(referenceId) : null,
      sent_by: sentBy ?? null,
      recipient_name: recipientName ?? null,
      parameters: parameters ?? null,
      header_parameters: headerParameters ?? null,
      header_document: headerDocument ?? null,
    };

    let targetPhone = phone;

    // Intercept a special placeholder string to use a phone number defined in Supabase secrets
    if (targetPhone === 'USE_ADMIN_SECRET') {
      targetPhone = Deno.env.get('ADMIN_PHONE_NUMBER');
    }

    log.recipient_phone = targetPhone ? normalizePhone(String(targetPhone)) : null;

    if (!targetPhone) {
      await writeLog({ ...log, status: 'failed', error_message: 'phone is required', failed_at: new Date().toISOString() });
      return new Response(JSON.stringify({ error: 'phone is required (or ADMIN_PHONE_NUMBER secret is missing)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!template) {
      await writeLog({ ...log, status: 'failed', error_message: 'template is required', failed_at: new Date().toISOString() });
      return new Response(JSON.stringify({ error: 'template is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

    if (!token || !phoneNumberId) {
      await writeLog({ ...log, status: 'failed', error_message: 'WhatsApp credentials not configured', failed_at: new Date().toISOString() });
      return new Response(JSON.stringify({ error: 'WhatsApp credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = normalizePhone(String(targetPhone));

    const components: Array<{ type: string; parameters: Array<Record<string, unknown>> }> = [];

    if (headerDocument?.link) {
      components.push({
        type: 'header',
        parameters: [{
          type: 'document',
          document: { link: String(headerDocument.link), filename: String(headerDocument.filename || 'document.pdf') },
        }],
      });
    } else if (headerParameters && Array.isArray(headerParameters) && headerParameters.length > 0) {
      components.push({
        type: 'header',
        parameters: headerParameters.map((text: unknown) => ({ type: 'text', text: String(text ?? '') })),
      });
    }

    if (parameters && Array.isArray(parameters)) {
      components.push({
        type: 'body',
        parameters: parameters.map((text: unknown) => ({ type: 'text', text: String(text ?? '') })),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: language || 'en' },
        components,
      },
    };

    const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await resp.json();
    console.log(`Meta API responded with status ${resp.status}:`, result);

    log.request_payload = payload;
    log.http_status = resp.status;
    log.response_payload = result;

    if (!resp.ok) {
      await writeLog({
        ...log,
        status: 'failed',
        error_code: result?.error?.code != null ? String(result.error.code) : null,
        error_message: result?.error?.message ?? null,
        failed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: false, error: result, metaStatus: resp.status }), {
        status: 200, // Return 200 so supabase-js invoke doesn't swallow the JSON body
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await writeLog({ ...log, status: 'sent', wa_message_id: result?.messages?.[0]?.id ?? null });

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await writeLog({ ...log, status: 'failed', error_message: err instanceof Error ? err.message : String(err), failed_at: new Date().toISOString() });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
