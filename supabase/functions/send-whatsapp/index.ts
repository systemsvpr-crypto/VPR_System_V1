// Supabase Edge Function: sends approved WhatsApp templates via the Meta
// WhatsApp Cloud API (e.g. "order_confirmation", "purchase_delivered_2", "dispatch_confirmation", "indent_created").
//
// Required secrets (set with `supabase secrets set`):
//   WHATSAPP_ACCESS_TOKEN   - permanent/system-user access token for the Meta app
//   WHATSAPP_PHONE_NUMBER_ID - the "Phone number ID" of the sending WhatsApp number
//
// Request body:
//   { phone: string, template: string, language?: string, parameters?: string[], headerParameters?: string[] }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, template, language, parameters, headerParameters } = await req.json();

    let targetPhone = phone;

    // Intercept a special placeholder string to use a phone number defined in Supabase secrets
    if (targetPhone === 'USE_ADMIN_SECRET') {
      targetPhone = Deno.env.get('ADMIN_PHONE_NUMBER');
    }

    if (!targetPhone) {
      return new Response(JSON.stringify({ error: 'phone is required (or ADMIN_PHONE_NUMBER secret is missing)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!template) {
      return new Response(JSON.stringify({ error: 'template is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

    if (!token || !phoneNumberId) {
      return new Response(JSON.stringify({ error: 'WhatsApp credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = normalizePhone(String(targetPhone));

    const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = [];

    if (headerParameters && Array.isArray(headerParameters) && headerParameters.length > 0) {
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

    if (!resp.ok) {
      return new Response(JSON.stringify({ success: false, error: result, metaStatus: resp.status }), {
        status: 200, // Return 200 so supabase-js invoke doesn't swallow the JSON body
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
