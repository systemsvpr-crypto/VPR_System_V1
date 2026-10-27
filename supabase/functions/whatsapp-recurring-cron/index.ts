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

function calculateNextRun(current: Date, freq: string): Date {
  const next = new Date(current);
  const f = (freq || '').toLowerCase();
  if (f === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (f === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (f === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (f === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

  if (!token || !phoneNumberId) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp credentials not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const nowIso = new Date().toISOString();

    // Query due schedules (exclude one-time immediate sends)
    const dueUrl = `${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?status=eq.active&deleted_at=is.null&send_type=neq.send&or=(next_run_at.lte.${nowIso},and(next_run_at.is.null,send_date.lte.${nowIso}))`;
    const schedulesRes = await fetch(dueUrl, { headers: dbHeaders });

    if (!schedulesRes.ok) {
      const err = await schedulesRes.text();
      return new Response(JSON.stringify({ error: `Failed to fetch schedules: ${err}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const schedules = await schedulesRes.json();
    const results: any[] = [];

    for (const item of schedules || []) {
      // Lock schedule row to running
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: dbHeaders,
        body: JSON.stringify({ schedule_status: 'running' }),
      });

      // Resolve contact phone
      let targetPhone = item.contact_phone;
      if (!targetPhone && item.contact_id) {
        const contactRes = await fetch(
          `${supabaseUrl}/rest/v1/whatsapp_bulk_contacts?id=eq.${item.contact_id}&select=phone_number,raw_phone_number`,
          { headers: dbHeaders }
        );
        if (contactRes.ok) {
          const cData = await contactRes.json();
          if (cData?.[0]) {
            targetPhone = cData[0].raw_phone_number || cData[0].phone_number;
          }
        }
      }

      if (!targetPhone) {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({
            schedule_status: 'failed',
            status: 'failed',
            last_error: 'No target phone number specified',
          }),
        });
        results.push({ id: item.id, success: false, error: 'No phone' });
        continue;
      }

      const normPhone = normalizePhone(targetPhone);

      // Resolve template name and language if missing
      let templateName = item.template_element_name || item.template_name;
      let templateLang = item.template_language || 'en';
      if (!templateName && item.template_id) {
        try {
          const tplRes = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_templates?id=eq.${item.template_id}&select=element_name,language`,
            { headers: dbHeaders }
          );
          if (tplRes.ok) {
            const tpls = await tplRes.json();
            if (tpls?.[0]) {
              templateName = tpls[0].element_name;
              templateLang = tpls[0].language || templateLang;
            }
          }
        } catch (_) {}
      }

      if (!templateName) {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({
            schedule_status: 'failed',
            status: 'failed',
            last_error: 'Template element name could not be resolved',
          }),
        });
        results.push({ id: item.id, success: false, error: 'No template name' });
        continue;
      }

      // Build Meta template payload
      const metaPayload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
        },
      };

      if (item.media_url) {
        (metaPayload.template as any).components = [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: { link: item.media_url, filename: 'Attachment' },
              },
            ],
          },
        ];
      }

      // Send to Meta
      let sendSuccess = false;
      let lastError = null;

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaPayload),
        });

        const metaData = await metaRes.json();
        if (metaRes.ok) {
          sendSuccess = true;
        } else {
          lastError = metaData?.error?.message || JSON.stringify(metaData);
        }
      } catch (err: any) {
        lastError = err.message;
      }

      // Update schedule state
      const newRunCount = (item.run_count || 0) + (sendSuccess ? 1 : 0);
      const isRecurring = item.send_type === 'recurring' && item.frequency;

      if (isRecurring) {
        const nextDate = calculateNextRun(new Date(), item.frequency);
        const hasExpired = item.end_date && new Date(nextDate).getTime() > new Date(item.end_date).getTime();

        await fetch(`${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({
            run_count: newRunCount,
            last_run_at: new Date().toISOString(),
            next_run_at: hasExpired ? null : nextDate.toISOString(),
            status: hasExpired ? 'completed' : 'active',
            schedule_status: hasExpired ? 'completed' : (sendSuccess ? 'active' : 'failed'),
            last_error: lastError,
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_broadcast_schedules?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({
            run_count: newRunCount,
            last_run_at: new Date().toISOString(),
            status: sendSuccess ? 'completed' : 'failed',
            schedule_status: sendSuccess ? 'sent' : 'failed',
            last_error: lastError,
            updated_at: new Date().toISOString(),
          }),
        });
      }

      results.push({ id: item.id, success: sendSuccess, error: lastError });

      // Small throttle to be courteous with Meta API
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return new Response(
      JSON.stringify({ success: true, processed: schedules.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('recurring cron error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
