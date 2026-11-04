export {};
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 1. Webhook Verification Handshake (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const verifyToken = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const expectedToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'vpr_whatsapp_verify_secret';

    if (mode === 'subscribe' && verifyToken === expectedToken) {
      console.log('Webhook verified successfully');
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Incoming Notification Handling (POST)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const body = await req.json();

    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value) continue;

          // 2.1 Process Status Updates (sent, delivered, read, failed)
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const wamid = statusObj.id;
              const statusName = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'
              const timestampIso = statusObj.timestamp
                ? new Date(Number(statusObj.timestamp) * 1000).toISOString()
                : new Date().toISOString();

              // Find message by wa_message_id
              const msgRes = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_messages?wa_message_id=eq.${wamid}&select=id`,
                { headers: dbHeaders }
              );
              if (msgRes.ok) {
                const msgs = await msgRes.json();
                if (msgs && msgs.length > 0) {
                  const messageId = msgs[0].id;
                  await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_status_history`, {
                    method: 'POST',
                    headers: dbHeaders,
                    body: JSON.stringify({
                      message_id: messageId,
                      status: statusName,
                      changed_at: timestampIso,
                    }),
                  });
                }
              }

              // Update whatsapp_logs if applicable
              const patchField = statusName === 'delivered' ? 'delivered_at' : statusName === 'read' ? 'read_at' : statusName === 'failed' ? 'failed_at' : null;
              if (patchField) {
                await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs?wa_message_id=eq.${wamid}`, {
                  method: 'PATCH',
                  headers: dbHeaders,
                  body: JSON.stringify({ status: statusName, [patchField]: timestampIso }),
                });
              }
            }
          }

          // 2.2 Process Inbound Messages
          if (Array.isArray(value.messages)) {
            const contacts = value.contacts || [];
            const profileName = contacts[0]?.profile?.name || null;

            for (const msg of value.messages) {
              const fromPhone = msg.from;
              const wamid = msg.id;
              const timestampIso = msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000).toISOString()
                : new Date().toISOString();

              // Duplicate guard
              const existCheck = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_messages?wa_message_id=eq.${wamid}&select=id`,
                { headers: dbHeaders }
              );
              if (existCheck.ok) {
                const existing = await existCheck.json();
                if (existing && existing.length > 0) {
                  continue; // Already processed
                }
              }

              // Resolve or create conversation
              const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_get_or_create_conversation`, {
                method: 'POST',
                headers: dbHeaders,
                body: JSON.stringify({ p_raw_phone: fromPhone, p_display_name: profileName }),
              });

              if (!rpcRes.ok) {
                console.error('Failed to get/create conv in webhook:', await rpcRes.text());
                continue;
              }

              const convId = await rpcRes.json();

              // Extend contact 24-hour session window
              const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              // Look up contact id for this conv
              const convInfoRes = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${convId}&select=whatsapp_contact_id,unread_count`,
                { headers: dbHeaders }
              );
              let currentUnread = 0;
              if (convInfoRes.ok) {
                const convInfo = await convInfoRes.json();
                if (convInfo?.[0]?.whatsapp_contact_id) {
                  await fetch(
                    `${supabaseUrl}/rest/v1/whatsapp_contacts_metadata?id=eq.${convInfo[0].whatsapp_contact_id}`,
                    {
                      method: 'PATCH',
                      headers: dbHeaders,
                      body: JSON.stringify({
                        meta_session_expires_at: sessionExpiry,
                        updated_at: new Date().toISOString(),
                      }),
                    }
                  );
                }
                currentUnread = convInfo?.[0]?.unread_count || 0;
              }

              // Determine Message Body & Type
              let msgType = msg.type || 'text';
              let bodyText = '';
              let mediaUrl = null;
              let mimeType = null;

              if (msgType === 'text') {
                bodyText = msg.text?.body || '';
              } else if (msgType === 'image') {
                bodyText = msg.image?.caption || 'Photo';
                mimeType = msg.image?.mime_type || 'image/jpeg';
              } else if (msgType === 'video') {
                bodyText = msg.video?.caption || 'Video';
                mimeType = msg.video?.mime_type || 'video/mp4';
              } else if (msgType === 'audio') {
                bodyText = 'Voice Message';
                mimeType = msg.audio?.mime_type || 'audio/ogg';
              } else if (msgType === 'document') {
                bodyText = msg.document?.filename || 'Document';
                mimeType = msg.document?.mime_type || 'application/pdf';
              } else if (msgType === 'reaction') {
                bodyText = msg.reaction?.emoji || '';
              } else if (msgType === 'interactive') {
                const inter = msg.interactive;
                if (inter?.type === 'button_reply') bodyText = inter.button_reply?.title || '';
                else if (inter?.type === 'list_reply') bodyText = inter.list_reply?.title || '';
                else bodyText = 'Interactive response';
              } else {
                bodyText = `[${msgType}]`;
              }

              // Insert inbound message
              await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                method: 'POST',
                headers: dbHeaders,
                body: JSON.stringify({
                  conversation_id: convId,
                  direction: 'INBOUND',
                  message_type: msgType,
                  body: bodyText,
                  media_url: mediaUrl,
                  mime_type: mimeType,
                  metadata: { raw: msg },
                  wa_message_id: wamid,
                  created_at: timestampIso,
                }),
              });

              // Update conversation unread_count and updated_at
              await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${convId}`, {
                method: 'PATCH',
                headers: dbHeaders,
                body: JSON.stringify({
                  unread_count: currentUnread + 1,
                  updated_at: timestampIso,
                }),
              });
            }
          }
        }
      }
    }

    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    // Always return 200 to acknowledge Meta to avoid webhook spam
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
});
