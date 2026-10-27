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

async function writeLog(supabaseUrl: string, serviceKey: string, row: Record<string, unknown>) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.error('Failed to write to whatsapp_logs:', err);
  }
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
      JSON.stringify({ error: 'WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const payload = await req.json();
    let {
      conversationId,
      phoneNumber,
      displayName,
      type = 'text',
      text,
      replyToMessageId,
      mediaUrl,
      mimeType,
      fileName,
      pollQuestion,
      pollOptions,
      allowMultipleAnswers,
      templateElementName,
      templateLanguage = 'en',
      variables = [],
      headerMediaUrl,
      headerFileName,
      templateId,
    } = payload;

    // 1. Resolve or Create Conversation
    let recipientPhone = '';
    let targetConvId = conversationId;

    if (!targetConvId && phoneNumber) {
      // First contact outreach via RPC
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_get_or_create_conversation`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({ p_raw_phone: phoneNumber, p_display_name: displayName || null }),
      });
      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        return new Response(JSON.stringify({ error: `Failed to resolve contact: ${errText}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetConvId = await rpcRes.json();
      recipientPhone = normalizePhone(phoneNumber);
    } else if (targetConvId) {
      // Look up conversation & contact
      const convRes = await fetch(
        `${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${targetConvId}&select=id,whatsapp_contact_id,whatsapp_contacts_metadata(phone_number,raw_phone_number,display_name)`,
        { headers: dbHeaders }
      );
      if (convRes.ok) {
        const convData = await convRes.json();
        if (convData && convData.length > 0 && convData[0].whatsapp_contacts_metadata) {
          const contact = convData[0].whatsapp_contacts_metadata;
          recipientPhone = normalizePhone(contact.raw_phone_number || contact.phone_number);
          if (!displayName) displayName = contact.display_name;
        }
      }
    }

    if (!recipientPhone) {
      return new Response(JSON.stringify({ error: 'Recipient phone number could not be determined' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check parent message wamid if reply
    let parentWaMessageId: string | null = null;
    if (replyToMessageId) {
      const parentRes = await fetch(
        `${supabaseUrl}/rest/v1/whatsapp_messages?id=eq.${replyToMessageId}&select=wa_message_id`,
        { headers: dbHeaders }
      );
      if (parentRes.ok) {
        const parentData = await parentRes.json();
        if (parentData?.[0]?.wa_message_id) {
          parentWaMessageId = parentData[0].wa_message_id;
        }
      }
    }

    // 2. Build Meta API payload
    const metaPayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
    };

    if (parentWaMessageId) {
      metaPayload.context = { message_id: parentWaMessageId };
    }

    let messageBody = text || '';

    if (type === 'text') {
      metaPayload.type = 'text';
      metaPayload.text = { body: text || '', preview_url: true };
    } else if (type === 'media') {
      const lowerMime = (mimeType || '').toLowerCase();
      let mediaType = 'document';
      if (lowerMime.startsWith('image/')) mediaType = 'image';
      else if (lowerMime.startsWith('video/')) mediaType = 'video';
      else if (lowerMime.startsWith('audio/')) mediaType = 'audio';

      metaPayload.type = mediaType;
      if (mediaType === 'document') {
        metaPayload.document = { link: mediaUrl, filename: fileName || 'attachment' };
      } else if (mediaType === 'image') {
        metaPayload.image = { link: mediaUrl, caption: fileName || '' };
      } else if (mediaType === 'video') {
        metaPayload.video = { link: mediaUrl, caption: fileName || '' };
      } else {
        metaPayload.audio = { link: mediaUrl };
      }
      messageBody = fileName || mediaUrl;
    } else if (type === 'poll') {
      metaPayload.type = 'interactive';
      const cleanOptions = (Array.isArray(pollOptions) ? pollOptions : []).map((opt: string) => ({
        option_name: String(opt).slice(0, 100),
      }));
      metaPayload.interactive = {
        type: 'poll',
        action: {
          name: (pollQuestion || 'Poll').slice(0, 256),
          options: cleanOptions,
        },
        allows_multiple_answers: !!allowMultipleAnswers,
      };
      messageBody = pollQuestion;
    } else if (type === 'template') {
      metaPayload.type = 'template';
      const components: any[] = [];

      // Header component
      if (headerMediaUrl) {
        const lowerName = (headerFileName || '').toLowerCase();
        let headerType = 'document';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp')) {
          headerType = 'image';
        } else if (lowerName.endsWith('.mp4')) {
          headerType = 'video';
        }

        if (headerType === 'document') {
          components.push({
            type: 'header',
            parameters: [{ type: 'document', document: { link: headerMediaUrl, filename: headerFileName || 'document.pdf' } }],
          });
        } else if (headerType === 'image') {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: headerMediaUrl } }],
          });
        } else {
          components.push({
            type: 'header',
            parameters: [{ type: 'video', video: { link: headerMediaUrl } }],
          });
        }
      }

      // Body parameters
      if (Array.isArray(variables) && variables.length > 0) {
        components.push({
          type: 'body',
          parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
        });
      }

      metaPayload.template = {
        name: templateElementName,
        language: { code: templateLanguage || 'en' },
        ...(components.length > 0 ? { components } : {}),
      };
      messageBody = `Template: ${templateElementName}`;
    }

    // 3. Send to Meta Cloud API
    const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaPayload),
    });

    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      const errMsg = metaData?.error?.message || metaData?.error?.error_user_msg || JSON.stringify(metaData);
      console.error('Meta send error:', errMsg);
      await writeLog(supabaseUrl, serviceKey, {
        recipient_phone: recipientPhone,
        recipient_name: displayName || null,
        template_name: templateElementName || null,
        language: templateLanguage,
        status: 'failed',
        error_message: errMsg,
        response_payload: metaData,
        failed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: errMsg, details: metaData }), {
        status: metaRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wamid = metaData?.messages?.[0]?.id || null;

    // 4. Save to whatsapp_messages
    const insertMessageRes = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        conversation_id: targetConvId,
        direction: 'OUTBOUND',
        message_type: type,
        body: messageBody,
        media_url: mediaUrl || headerMediaUrl || null,
        mime_type: mimeType || null,
        metadata: {
          poll_data: type === 'poll' ? { pollQuestion, pollOptions, allowMultipleAnswers } : undefined,
          template_name: templateElementName,
          variables,
          meta_response: metaData,
        },
        parent_message_id: replyToMessageId || null,
        template_id: templateId || null,
        wa_message_id: wamid,
        created_at: new Date().toISOString(),
      }),
    });

    let insertedMessage = null;
    if (insertMessageRes.ok) {
      const saved = await insertMessageRes.json();
      insertedMessage = saved?.[0] || null;

      // Status history entry
      if (insertedMessage?.id) {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_status_history`, {
          method: 'POST',
          headers: dbHeaders,
          body: JSON.stringify({
            message_id: insertedMessage.id,
            status: 'sent',
            changed_at: new Date().toISOString(),
          }),
        });
      }
    }

    // Update conversation updated_at
    await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${targetConvId}`, {
      method: 'PATCH',
      headers: dbHeaders,
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    });

    // Best effort log
    await writeLog(supabaseUrl, serviceKey, {
      recipient_phone: recipientPhone,
      recipient_name: displayName || null,
      template_name: templateElementName || null,
      language: templateLanguage,
      status: 'sent',
      wa_message_id: wamid,
      response_payload: metaData,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: insertedMessage,
        conversationId: targetConvId,
        wa_message_id: wamid,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('whatsapp-send exception:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
