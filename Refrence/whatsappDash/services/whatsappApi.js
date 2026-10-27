import supabase from "../../../SupabaseClient";

// ---------------------------------------------------------------------------
// Edge Function invocation helper
// ---------------------------------------------------------------------------

// supabase-js throws a generic FunctionsHttpError ("Edge Function returned a
// non-2xx status code") on 4xx/5xx responses, discarding the JSON body the
// function actually sent back. The real reason lives on `error.context`,
// the raw Response — read it so callers/toasts show the actual cause.
async function throwFunctionError(error) {
  let message = error.message;
  const response = error.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
    } catch {
      // Body wasn't JSON — fall back to the generic message.
    }
  }
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchInboxConversations() {
  const { data, error } = await supabase
    .from("vw_whatsapp_chat_inbox")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const messages = data || [];
  const statuses = await fetchLatestStatuses(messages.map((m) => m.id));
  return messages.map((m) => ({ ...m, latest_status: statuses[m.id] || null }));
}

async function fetchLatestStatuses(messageIds) {
  if (!messageIds.length) return {};

  const { data, error } = await supabase
    .from("whatsapp_message_status_history")
    .select("message_id, status, changed_at")
    .in("message_id", messageIds)
    .order("changed_at", { ascending: true });

  if (error) throw error;

  const latest = {};
  (data || []).forEach((row) => {
    latest[row.message_id] = row.status; // later rows overwrite — ascending order
  });
  return latest;
}

export async function fetchApprovedTemplates() {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("status", "APPROVED")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchPendingTemplates() {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchAllWhatsappTemplates() {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Reads — Users (for new-chat contact picker)
// ---------------------------------------------------------------------------

/**
 * Fetch users from public.users for the new-chat contact picker.
 * When `query` is provided, filters server-side with ILIKE on user_name and
 * number so only matching rows are returned — no full-table JS filter needed.
 * Returns an array of { id, user_name, number }.
 */
export async function fetchUsers(query = "") {
  console.log("[fetchUsers] called with query:", JSON.stringify(query));

  // `number` is BIGINT — only filter out NULLs; empty-string check is invalid for BIGINT.
  let req = supabase
    .from("users")
    .select("id, user_name, number")
    .not("number", "is", null)
    .order("user_name", { ascending: true })
    .limit(50);

  if (query && query.trim()) {
    const q = query.trim();
    const isNumeric = /^\d+$/.test(q);

    if (isNumeric) {
      // BIGINT column — use exact equality for numeric queries.
      // Also allow user_name ILIKE for names that happen to be all digits.
      console.log("[fetchUsers] numeric query — using eq on number OR ilike on user_name:", q);
      req = req.or(`user_name.ilike.%${q}%,number.eq.${q}`);
    } else {
      // Text query — ILIKE only on user_name (BIGINT columns don't support ILIKE).
      console.log("[fetchUsers] text query — applying ILIKE on user_name:", q);
      req = req.ilike("user_name", `%${q}%`);
    }
  } else {
    console.log("[fetchUsers] no query — fetching all users with a phone number");
  }

  const { data, error, status, statusText } = await req;

  console.log("[fetchUsers] Supabase response →", {
    status,
    statusText,
    rowCount: data?.length ?? null,
    error,
    firstRow: data?.[0] ?? null,
  });

  if (error) {
    console.error("[fetchUsers] ERROR from Supabase:", error);
    throw error;
  }

  const rows = data || [];
  console.log("[fetchUsers] returning", rows.length, "row(s)");
  return rows;
}

// ---------------------------------------------------------------------------
// Reads/writes — Bulk contacts (CSV-imported address book for bulk sends)
// ---------------------------------------------------------------------------

/**
 * Fetch persisted bulk-import contacts for the New Chat "Bulk Import" tab.
 * Returns an array of { id, raw_phone_number, phone_number, display_name,
 * batch_label, created_at }.
 */
export async function fetchBulkContacts(query = "") {
  let req = supabase
    .from("whatsapp_bulk_contacts")
    .select("id, raw_phone_number, phone_number, display_name, batch_label, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (query && query.trim()) {
    const q = query.trim();
    req = req.or(`display_name.ilike.%${q}%,raw_phone_number.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) throw error;
  return data || [];
}

/**
 * Upsert CSV-imported rows into whatsapp_bulk_contacts. Conflicts on the
 * normalized phone_number (set by a DB trigger) so re-importing the same
 * numbers in a different format updates the existing row instead of
 * duplicating it. Returns the upserted rows.
 */
export async function upsertBulkContacts(rows) {
  if (!rows.length) return [];

  // Deduplicate within the payload by normalized 10-digit phone number
  // so PostgreSQL's ON CONFLICT DO UPDATE won't encounter the same key twice in a single statement
  const seen = new Map();
  rows.forEach((row) => {
    const raw = String(row.raw_phone_number || row.phone_number || "").trim();
    const digits = raw.replace(/\D/g, "");
    const normalizedKey = digits.length >= 10 ? digits.slice(-10) : digits;
    if (normalizedKey) {
      seen.set(normalizedKey, row);
    }
  });

  const uniqueRows = Array.from(seen.values());
  if (!uniqueRows.length) return [];

  const { data, error } = await supabase
    .from("whatsapp_bulk_contacts")
    .upsert(uniqueRows, { onConflict: "phone_number" })
    .select("id, raw_phone_number, phone_number, display_name, batch_label, created_at");
  if (error) throw error;
  return data || [];
}

export async function deleteBulkContacts(ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("whatsapp_bulk_contacts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export async function updateBulkContact(id, updates) {
  const { data, error } = await supabase
    .from("whatsapp_bulk_contacts")
    .update(updates)
    .eq("id", id)
    .select("id, raw_phone_number, phone_number, display_name, batch_label, created_at")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

// Shared by the media-message composer and the template header-media picker
// (IMAGE/VIDEO/DOCUMENT headers need a real public URL to hand to Meta).
export async function uploadWhatsappMedia(file, keyPrefix = "whatsapp") {
  const timestamp = Date.now();
  const fileName = `${keyPrefix}_${timestamp}_${file.name.replace(/\s+/g, "_")}`;

  const { error: uploadError } = await supabase.storage.from("whatsapp").upload(fileName, file);
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from("whatsapp").getPublicUrl(fileName);
  return publicUrl;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function markConversationRead(conversationId) {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function softDeleteMessages(messageIds) {
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", messageIds);

  if (error) throw error;
}

export async function syncTemplatesFromMeta() {
  const { data, error } = await supabase.functions.invoke("whatsapp-fetch-templates", {
    body: {},
  });
  if (error) {
    // If whatsapp-fetch-templates is not found, attempt whatsapp-create-template with action: sync
    try {
      const syncRes = await supabase.functions.invoke("whatsapp-create-template", {
        body: { action: "sync" },
      });
      if (syncRes.data?.success) return syncRes.data;
    } catch (fallbackErr) {
      console.warn("whatsapp-create-template sync fallback skipped:", fallbackErr);
    }
    await throwFunctionError(error);
  }
  if (data?.error) throw new Error(data.error);
  return data; // { fetched, saved }
}

export async function createWhatsappTemplate(payload) {
  // 1. Try calling the Supabase Edge Function 'whatsapp-create-template'
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-create-template", {
      body: payload,
    });
    if (!error && data?.success) {
      return data;
    }
    if (error) {
      console.warn("[createWhatsappTemplate] Edge function invoke returned error:", error);
      // If error message is from Meta validation, throw it directly
      if (data?.error) throw new Error(data.error);
    }
    if (data?.error) {
      throw new Error(data.error);
    }
  } catch (fnErr) {
    // If it's a Meta error, re-throw it so the user sees the real Meta rejection reason
    const msg = fnErr.message || "";
    if (
      msg &&
      !msg.includes("FunctionsFetchError") &&
      !msg.includes("Failed to send a request") &&
      !msg.includes("Relay Error")
    ) {
      throw fnErr;
    }
    console.warn("[createWhatsappTemplate] Edge function not yet deployed or network unreachable, staging directly to DB:", fnErr);
  }

  // 2. Direct DB fallback: Save template to whatsapp_templates with status 'PENDING'
  // so the user can test the interface immediately even before pasting the Edge Function in Supabase
  const sanitizedName = String(payload.name || payload.elementName || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_");

  const formattedButtons = (payload.buttons || []).map((b) => ({
    type: (b.type || "QUICK_REPLY").toUpperCase(),
    text: b.text || "",
    url: b.url || null,
    phone_number: b.phone_number || b.phoneNumber || null,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("whatsapp_templates")
    .upsert(
      {
        element_name: sanitizedName,
        category: (payload.category || "MARKETING").toUpperCase(),
        language: payload.language || "en",
        body_text: payload.bodyText || "",
        status: "PENDING",
        header_type: payload.headerType || "NONE",
        header_text: payload.headerType === "TEXT" ? (payload.headerText || null) : null,
        header_sample_url: payload.headerSampleUrl || null,
        footer_text: payload.footerText || null,
        buttons: formattedButtons,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "element_name" }
    )
    .select()
    .single();

  if (insertErr) throw insertErr;
  return { success: true, template: inserted, isStaged: true, status: "PENDING" };
}

export async function deleteWhatsappTemplate(templateId, elementName) {
  try {
    await supabase.functions.invoke("whatsapp-create-template", {
      body: { action: "delete", templateId, elementName },
    });
  } catch (err) {
    console.warn("[deleteWhatsappTemplate] Edge function delete failed, falling back to local soft-delete:", err);
  }

  const { error } = await supabase
    .from("whatsapp_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);

  if (error) throw error;
  return true;
}

export async function sendTextMessage({ conversationId, text, replyToMessageId }) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: { conversationId, type: "text", text, replyToMessageId },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data.message;
}

export async function sendMediaMessage({ conversationId, mediaUrl, mimeType, fileName }) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: { conversationId, type: "media", mediaUrl, mimeType, fileName },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data.message;
}

/**
 * Send an interactive poll (list message) to a conversation.
 * The poll is stored as message_type='poll' with metadata.poll_data containing
 * the question, options (with zeroed vote counts), and allow_multiple flag.
 */
export async function sendPollMessage({
  conversationId,
  pollQuestion,
  pollOptions,
  allowMultipleAnswers = false,
}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: {
      conversationId,
      type: "poll",
      pollQuestion,
      pollOptions,
      allowMultipleAnswers,
    },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data.message;
}


export async function sendTemplateMessage({
  conversationId,
  templateElementName,
  templateLanguage,
  variables,
  headerMediaUrl,
  headerFileName,
}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: {
      conversationId,
      type: "template",
      templateElementName,
      templateLanguage,
      variables,
      headerMediaUrl,
      headerFileName,
    },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data.message;
}

/**
 * Initiate a first-contact outbound message to a brand-new (or existing)
 * WhatsApp contact using an approved template.
 *
 * The edge function calls fn_get_or_create_conversation() server-side so
 * this is safe to call even if the contact has never messaged before —
 * no duplicate conversations will be created.
 *
 * Returns { message, conversationId } on success so the caller can
 * immediately navigate to the new or existing thread.
 */
export async function initiateNewChat({
  phoneNumber,
  displayName,
  templateElementName,
  templateLanguage,
  variables = [],
  buttonVariables = [],
  buttonUrlParam = null,
  headerMediaUrl,
  headerFileName,
  mimeType,
}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: {
      phoneNumber,
      displayName,
      type: "template",
      templateElementName,
      templateLanguage,
      variables,
      buttonVariables,
      buttonUrlParam,
      headerMediaUrl,
      headerFileName,
      mimeType,
    },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  // Edge function now returns { success, message, conversationId }
  return { message: data.message, conversationId: data.conversationId };
}

// ---------------------------------------------------------------------------
// Reads/Writes — Contacts & Forwarding
// ---------------------------------------------------------------------------

export async function fetchContacts() {
  const { data, error } = await supabase
    .from("whatsapp_contacts_metadata")
    .select("id, phone_number, raw_phone_number, display_name, created_at, meta_session_expires_at")
    .is("deleted_at", null)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function sendMessageToContact(contactId, messagePayload) {
  // 1. Resolve conversationId for this contact
  const { data: convData, error: convError } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("whatsapp_contact_id", contactId)
    .maybeSingle();

  if (convError) throw convError;

  let conversationId;
  if (convData) {
    conversationId = convData.id;
  } else {
    const { data: contactData, error: contactError } = await supabase
      .from("whatsapp_contacts_metadata")
      .select("raw_phone_number, display_name")
      .eq("id", contactId)
      .single();
    if (contactError) throw contactError;

    const { data: newConvId, error: rpcError } = await supabase.rpc(
      "fn_get_or_create_conversation",
      {
        p_raw_phone: contactData.raw_phone_number,
        p_display_name: contactData.display_name,
      }
    );
    if (rpcError) throw rpcError;
    conversationId = newConvId;
  }

  // 2. Determine type and content from messagePayload
  const isMedia = messagePayload.message_type === "media" || messagePayload.message_type === "audio";
  let sentMessage;

  if (isMedia) {
    sentMessage = await sendMediaMessage({
      conversationId,
      mediaUrl: messagePayload.media_url,
      mimeType: messagePayload.mime_type,
      fileName: messagePayload.metadata?.fileName || messagePayload.body || "file",
    });
  } else {
    sentMessage = await sendTextMessage({
      conversationId,
      text: messagePayload.body,
    });
  }

  // 3. Mark the message as forwarded in the database
  if (sentMessage && sentMessage.id) {
    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({ is_forwarded: true })
      .eq("id", sentMessage.id);
    if (updateError) {
      console.error("Failed to mark message as forwarded in DB:", updateError);
    }
  }

  return sentMessage;
}

export async function executeForwarding(selectedContactIds, selectedMessageIds) {
  if (!selectedContactIds.length || !selectedMessageIds.length) {
    return { successCount: 0, failedContacts: [] };
  }

  // 1. Fetch full payload details of the selected messages, chronologically ordered
  const { data: messages, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .in("id", selectedMessageIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!messages || !messages.length) {
    return { successCount: 0, failedContacts: [] };
  }

  const failedContacts = [];
  let successCount = 0;

  // Fetch all contact details so we can report failed contacts with name/number
  const { data: contactDetails, error: contactErr } = await supabase
    .from("whatsapp_contacts_metadata")
    .select("id, display_name, phone_number, raw_phone_number")
    .in("id", selectedContactIds);
  
  if (contactErr) throw contactErr;

  const contactsMap = {};
  (contactDetails || []).forEach((c) => {
    contactsMap[c.id] = c;
  });

  // 2. Map over selectedContactIds and send messages sequentially
  for (const contactId of selectedContactIds) {
    const contact = contactsMap[contactId] || { id: contactId, display_name: "Unknown", phone_number: "" };
    let contactFailed = false;

    for (const msg of messages) {
      try {
        await sendMessageToContact(contactId, msg);
        // Add a small delay to make sure they do not overlap in delivery
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Failed to send message to contact ${contactId}:`, err);
        contactFailed = true;
        break; // skip remaining messages for this contact since session is likely inactive
      }
    }

    if (contactFailed) {
      failedContacts.push({
        id: contact.id,
        displayName: contact.display_name || contact.raw_phone_number || "Unknown Contact",
        phoneNumber: contact.raw_phone_number ? `+${contact.raw_phone_number}` : contact.phone_number,
      });
    } else {
      successCount++;
    }
  }

  return { successCount, failedContacts };
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export function subscribeToConversations(onChange) {
  const channel = supabase
    .channel("whatsapp-conversations-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "whatsapp_conversations" },
      onChange,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToContacts(onChange) {
  const channel = supabase
    .channel("whatsapp-contacts-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "whatsapp_contacts_metadata" },
      onChange,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToMessages(conversationId, onEvent) {
  const channel = supabase
    .channel(`whatsapp-messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "whatsapp_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      onEvent,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToStatusHistory(onInsert) {
  // whatsapp_message_status_history has no conversation_id column to filter
  // on directly, so we listen globally and let the caller check whether the
  // affected message_id belongs to the conversation currently open.
  const channel = supabase
    .channel("whatsapp-status-history-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_message_status_history" },
      onInsert,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ---------------------------------------------------------------------------
// Broadcast Schedules API
// ---------------------------------------------------------------------------

export async function fetchBroadcastSchedules() {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .select(`
      *,
      whatsapp_templates ( id, element_name, category, body_text ),
      whatsapp_bulk_contacts ( id, display_name, raw_phone_number, phone_number )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createBroadcastSchedule(scheduleData) {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .insert([scheduleData])
    .select();

  if (error) throw error;
  return data?.[0];
}

export async function deleteBroadcastSchedule(id) {
  const { error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function updateBroadcastScheduleStatus(id, newStatus) {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0];
}

export async function updateBroadcastSchedule(id, updateData) {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0];
}

export async function triggerRecurringCron() {
  const { data, error } = await supabase.functions.invoke("whatsapp-recurring-cron", {
    body: {},
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------------------------------------------------------------------------
// Purchase Module Notifications
// ---------------------------------------------------------------------------

/**
 * Sends a Purchase Order notification to a vendor via WhatsApp using Meta approved template `po_notificaiton`.
 * Attaches the generated PO PDF as the document header.
 *
 * Template format:
 * 📦 *Purchase Order Notification*
 * Dear {{1}},
 * We are pleased to share the details of your new Purchase Order:
 * 🔹 *PO Number:* {{2}}
 * 📅 *PO Date:* {{3}}
 * 📌 Kindly acknowledge receipt and initiate processing at the earliest.
 * Thank you for your continued support!
 * *Best Regards,*
 *
 * @param {Object} params
 * @param {string} params.vendorPhone - Recipient phone number (e.g. +91 9876543210)
 * @param {string} params.vendorName - Vendor company name ({{1}})
 * @param {string} params.poNumber - Purchase order number ({{2}})
 * @param {string} params.poDate - PO creation/revised date ({{3}})
 * @param {Blob|File} params.pdfBlob - Generated PO PDF blob to upload and attach
 * @returns {Promise<{ success: boolean, message?: any, conversationId?: string, error?: string }>}
 */
export async function sendPoWhatsappNotification({
  vendorPhone,
  vendorName,
  poNumber,
  poDate,
  pdfBlob,
}) {
  if (!vendorPhone || String(vendorPhone).trim() === "" || vendorPhone === "-") {
    console.warn(`[sendPoWhatsappNotification] No phone number for vendor ${vendorName}`);
    return { success: false, error: "No phone number available for vendor" };
  }

  // Sanitize recipient phone digits
  const cleanPhone = String(vendorPhone).replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 10) {
    console.warn(`[sendPoWhatsappNotification] Invalid phone number ${vendorPhone}`);
    return { success: false, error: "Invalid phone number" };
  }

  // 1. Upload PDF blob to Supabase Storage in 'whatsapp' bucket
  const cleanPoNo = String(poNumber).replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `PO_${cleanPoNo}.pdf`;
  const fileObj = pdfBlob instanceof File ? pdfBlob : new File([pdfBlob], fileName, { type: "application/pdf" });

  const publicPdfUrl = await uploadWhatsappMedia(fileObj, "po_documents");

  // 2. Send via WhatsApp Meta Template
  const result = await initiateNewChat({
    phoneNumber: cleanPhone,
    displayName: vendorName || "Vendor",
    templateElementName: "po_notification",
    templateLanguage: "en",
    variables: [
      vendorName || "Valued Supplier", // {{1}}
      poNumber || "PO-001",            // {{2}}
      poDate || new Date().toISOString().split("T")[0], // {{3}}
    ],
    headerMediaUrl: publicPdfUrl,
    headerFileName: fileName,
    mimeType: "application/pdf",
  });

  return { success: true, ...result };
}

/**
 * Send Quotation Notification to Vendor via WhatsApp
 * Template: quotation_notification
 * Variables:
 *   {{1}} - Vendor Name
 *   {{2}} - Quotation / Indent / RFQ Number
 *   {{3}} - Quotation Date
 * Header Media:
 *   Embedded PDF Quotation Document
 * Button:
 *   Dynamic URL parameter: ids=<indent_ids>&v=<vendor_slot>
 */
export async function sendQuotationWhatsappNotification({
  vendorPhone,
  vendorName,
  quotationNumber,
  quotationDate,
  idsParam,
  vendorIndex = 1,
  pdfBlob = null,
  headerMediaUrl = null,
}) {
  if (!vendorPhone || String(vendorPhone).trim() === "" || vendorPhone === "-") {
    console.warn(`[sendQuotationWhatsappNotification] No phone number for vendor ${vendorName}`);
    return { success: false, error: `No phone number available for ${vendorName || "vendor"}` };
  }

  // Sanitize recipient phone digits
  const cleanPhone = String(vendorPhone).replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 10) {
    console.warn(`[sendQuotationWhatsappNotification] Invalid phone number ${vendorPhone}`);
    return { success: false, error: `Invalid phone number for ${vendorName || "vendor"}` };
  }

  // Parameter passed to dynamic button URL: ids={{1}} -> e.g. "e5ed5403-c5b8-4257-b826-661876661d5b&v=1"
  const buttonParam = `${idsParam}&v=${vendorIndex}`;

  let publicPdfUrl = headerMediaUrl;
  let fileName = "Quotation_Document.pdf";

  // Upload PDF blob if provided
  if (pdfBlob) {
    try {
      const cleanQuoNo = String(quotationNumber).replace(/[^a-zA-Z0-9_-]/g, "_");
      fileName = `Quotation_${cleanQuoNo}.pdf`;
      const fileObj = pdfBlob instanceof File ? pdfBlob : new File([pdfBlob], fileName, { type: "application/pdf" });
      publicPdfUrl = await uploadWhatsappMedia(fileObj, "quotation_documents");
    } catch (uploadErr) {
      console.warn("Quotation PDF upload for WhatsApp warning:", uploadErr);
    }
  }

  const result = await initiateNewChat({
    phoneNumber: cleanPhone,
    displayName: vendorName || "Vendor",
    templateElementName: "quotation_notification",
    templateLanguage: "en",
    variables: [
      vendorName || "Valued Supplier", // {{1}}
      quotationNumber || "RFQ-001",    // {{2}}
      quotationDate || new Date().toISOString().split("T")[0], // {{3}}
    ],
    headerMediaUrl: publicPdfUrl,
    headerFileName: fileName,
    mimeType: publicPdfUrl ? "application/pdf" : undefined,
    buttonVariables: [buttonParam],
    buttonUrlParam: buttonParam,
  });

  return { success: true, ...result };
}

/**
 * Fetch Converted and Unconverted client contacts directly from the Leads system
 * Matches the logic in Leads Contacts page (leads_companies, leads_quotations, leads_followups, leads_quotation_updates).
 */
export async function fetchLeadsClientsGrouped() {
  try {
    const [companiesRes, quotesRes, quoteUpdatesRes, followupsRes] = await Promise.all([
      supabase.from("leads_companies").select("*, leads_company_contacts(*)").eq("is_active", true),
      supabase.from("leads_quotations").select("consignee_name"),
      supabase.from("leads_quotation_updates").select("company_name, status"),
      supabase.from("leads_followups").select("company_name, enquiry_status, customer_feedback"),
    ]);

    const conversionSet = new Set();
    (quotesRes.data || []).forEach((q) => {
      const name = (q.consignee_name || "").trim().toLowerCase();
      if (name) conversionSet.add(name);
    });

    (quoteUpdatesRes.data || []).forEach((qu) => {
      const name = (qu.company_name || "").trim().toLowerCase();
      const status = (qu.status || "").toLowerCase();
      if (name && status.includes("order received")) {
        conversionSet.add(name);
      }
    });

    (followupsRes.data || []).forEach((f) => {
      const name = (f.company_name || "").trim().toLowerCase();
      const enq = (f.enquiry_status || "").toLowerCase();
      const feed = (f.customer_feedback || "").toLowerCase();
      if (
        name &&
        (enq === "order received" ||
          enq === "make quotation" ||
          enq === "expected" ||
          feed.includes("order confirmed") ||
          feed.includes("order received") ||
          feed.includes("interested"))
      ) {
        conversionSet.add(name);
      }
    });

    const converted = [];
    const unconverted = [];
    const seenPhones = new Set();

    (companiesRes.data || []).forEach((c) => {
      const cName = (c.name || "").trim();
      const cKey = cName.toLowerCase();
      const isConverted = c.status === "Converted" || conversionSet.has(cKey);

      // Collect valid phone contacts for this company
      const phoneEntries = [];
      const rawCompanyPhone = String(c.phone || "").replace(/\D/g, "");
      if (rawCompanyPhone.length >= 10) {
        phoneEntries.push({
          name: cName,
          phone: rawCompanyPhone.slice(-10),
          contactPerson: cName,
          designation: "Company Main",
        });
      }

      (c.leads_company_contacts || []).forEach((cp) => {
        const rawPersonPhone = String(cp.number || "").replace(/\D/g, "");
        if (rawPersonPhone.length >= 10) {
          const personNum = rawPersonPhone.slice(-10);
          phoneEntries.push({
            name: cp.name ? `${cp.name} (${cName})` : cName,
            phone: personNum,
            contactPerson: cp.name || cName,
            designation: cp.designation || "Contact Person",
          });
        }
      });

      phoneEntries.forEach((entry, idx) => {
        const phoneKey = entry.phone;
        // Avoid duplicate phone entries
        const uniqueKey = `${isConverted ? "conv" : "unconv"}_${phoneKey}`;
        if (seenPhones.has(uniqueKey)) return;
        seenPhones.add(uniqueKey);

        const entryId = isConverted
          ? `lead_conv_${c.id}_${idx}`
          : `lead_unconv_${c.id}_${idx}`;

        const item = {
          id: entryId,
          name: entry.name,
          companyName: cName,
          contactPerson: entry.contactPerson,
          designation: entry.designation,
          phone: entry.phone,
          isConverted,
          isLead: true,
          batch_label: isConverted ? "Converted Client" : "Unconverted Client",
          division: c.division || "",
          city: c.city || c.state || "",
        };

        if (isConverted) {
          converted.push(item);
        } else {
          unconverted.push(item);
        }
      });
    });

    return { converted, unconverted };
  } catch (err) {
    console.error("[fetchLeadsClientsGrouped] error:", err);
    return { converted: [], unconverted: [] };
  }
}
