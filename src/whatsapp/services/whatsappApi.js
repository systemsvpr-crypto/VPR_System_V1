// ============================================================================
// WHATSAPP DASHBOARD — PRODUCTION SUPABASE DATA LAYER
// ============================================================================
import { supabase } from "../../supabase";
import { getAllCustomers } from "../../services/customerService";
import { getAllVendors } from "../../services/vendorService";

// Export undefined so UI components know we are in live Supabase mode, not demo mode
export const MAX_INLINE_MEDIA_BYTES = undefined;

// Purge obsolete local demo storage keys if present
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("vpr_wa_db_v1");
    localStorage.removeItem("vpr_wa_db_v2");
  } catch (e) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Edge Function invocation helper
// ---------------------------------------------------------------------------
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
  if (!messageIds || !messageIds.length) return {};

  const { data, error } = await supabase
    .from("whatsapp_message_status_history")
    .select("message_id, status, changed_at")
    .in("message_id", messageIds)
    .order("changed_at", { ascending: true });

  if (error) throw error;

  const latest = {};
  (data || []).forEach((row) => {
    latest[row.message_id] = row.status;
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
// Reads — Users & Contacts
// ---------------------------------------------------------------------------

export async function fetchUsers(query = "") {
  let req = supabase
    .from("users")
    .select("user_id, full_name, username, phone_number")
    .not("phone_number", "is", null)
    .neq("phone_number", "")
    .order("full_name", { ascending: true })
    .limit(50);

  if (query && query.trim()) {
    const q = query.trim();
    req = req.or(`full_name.ilike.%${q}%,username.ilike.%${q}%,phone_number.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) throw error;
  return (data || []).map((u) => ({
    id: u.user_id,
    user_name: u.full_name || u.username || "Unknown",
    number: u.phone_number,
  }));
}

export async function fetchContacts() {
  const { data, error } = await supabase
    .from("whatsapp_contacts_metadata")
    .select("id, phone_number, raw_phone_number, display_name, created_at, meta_session_expires_at")
    .is("deleted_at", null)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function updateContact(contactId, updates) {
  const { data, error } = await supabase
    .from("whatsapp_contacts_metadata")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads/writes — Bulk contacts (CSV address book)
// ---------------------------------------------------------------------------

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

export async function upsertBulkContacts(rows) {
  if (!rows || !rows.length) return [];

  const seen = new Map();
  rows.forEach((row) => {
    const raw = String(row.raw_phone_number || row.phone_number || "").trim();
    const digits = raw.replace(/\D/g, "");
    const normalizedKey = digits.length >= 10 ? digits.slice(-10) : digits;
    if (normalizedKey) {
      seen.set(normalizedKey, {
        ...row,
        phone_number: normalizedKey,
        raw_phone_number: digits.length === 10 ? `91${digits}` : digits,
      });
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
  if (!ids || !ids.length) return;
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

export async function uploadWhatsappMedia(file, keyPrefix = "whatsapp") {
  const timestamp = Date.now();
  const safeName = file.name.replace(/\s+/g, "_");
  const fileName = `${keyPrefix}_${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("whatsapp").upload(fileName, file);
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from("whatsapp").getPublicUrl(fileName);
  return publicUrl;
}

// ---------------------------------------------------------------------------
// Writes & Status
// ---------------------------------------------------------------------------

export async function markConversationRead(conversationId) {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function softDeleteMessages(messageIds) {
  if (!messageIds || !messageIds.length) return;
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", messageIds);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

export async function syncTemplatesFromMeta() {
  const { data, error } = await supabase.functions.invoke("whatsapp-fetch-templates", {
    body: {},
  });
  if (error) {
    await throwFunctionError(error);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createWhatsappTemplate(payload) {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-create-template", {
      body: { action: "create", ...payload },
    });
    if (!error && data?.success) {
      return data;
    }
    if (data?.error) throw new Error(data.error);
    if (error) await throwFunctionError(error);
  } catch (fnErr) {
    const msg = fnErr.message || "";
    if (
      msg &&
      !msg.includes("FunctionsFetchError") &&
      !msg.includes("Failed to send a request") &&
      !msg.includes("Relay Error")
    ) {
      throw fnErr;
    }
    console.warn("[createWhatsappTemplate] Edge function unavailable, staging directly:", fnErr);
  }

  // Fallback direct DB insert with status PENDING
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

// ---------------------------------------------------------------------------
// Outbound Messages
// ---------------------------------------------------------------------------

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
  templateLanguage = "en",
  variables = [],
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

export async function initiateNewChat({
  phoneNumber,
  displayName,
  templateElementName,
  templateLanguage = "en",
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
  return { message: data.message, conversationId: data.conversationId };
}

export async function sendMessageToContact(contactId, messagePayload) {
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

  if (sentMessage && sentMessage.id) {
    await supabase
      .from("whatsapp_messages")
      .update({ is_forwarded: true })
      .eq("id", sentMessage.id);
  }

  return sentMessage;
}

export async function executeForwarding(selectedContactIds, selectedMessageIds) {
  if (!selectedContactIds.length || !selectedMessageIds.length) {
    return { successCount: 0, failedContacts: [] };
  }

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

  const { data: contactDetails, error: contactErr } = await supabase
    .from("whatsapp_contacts_metadata")
    .select("id, display_name, phone_number, raw_phone_number")
    .in("id", selectedContactIds);

  if (contactErr) throw contactErr;

  const contactsMap = {};
  (contactDetails || []).forEach((c) => {
    contactsMap[c.id] = c;
  });

  for (const contactId of selectedContactIds) {
    const contact = contactsMap[contactId] || { id: contactId, display_name: "Unknown", phone_number: "" };
    let contactFailed = false;

    for (const msg of messages) {
      try {
        await sendMessageToContact(contactId, msg);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Failed to send message to contact ${contactId}:`, err);
        contactFailed = true;
        break;
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
// Broadcast Schedules
// ---------------------------------------------------------------------------

export async function fetchBroadcastSchedules() {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .select(`
      *,
      whatsapp_templates ( id, element_name, category, body_text ),
      whatsapp_bulk_contacts ( id, display_name, raw_phone_number, phone_number )
    `)
    .is("deleted_at", null)
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
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function updateBroadcastScheduleStatus(id, newStatus) {
  const { data, error } = await supabase
    .from("whatsapp_broadcast_schedules")
    .update({ status: newStatus, schedule_status: newStatus, updated_at: new Date().toISOString() })
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
// Audience (Live VPR Customers & Vendors)
// ---------------------------------------------------------------------------

export async function fetchLeadsClientsGrouped() {
  const toEntries = (rows, kind) => {
    const seen = new Set();
    return (rows || [])
      .map((r) => ({ r, phone: String(r.phone_number || "").replace(/\D/g, "").slice(-10) }))
      .filter(({ phone }) => phone.length === 10 && !seen.has(phone) && seen.add(phone))
      .map(({ r, phone }) => ({
        id: `${kind}_${r.customer_id || r.vendor_id}`,
        name: r.name,
        companyName: r.name,
        contactPerson: r.name,
        designation: kind === "customer" ? "Customer" : "Vendor",
        phone,
        isConverted: kind === "customer",
        isLead: true,
        batch_label: kind === "customer" ? "Customer" : "Vendor",
        division: "",
        city: r.location || "",
      }));
  };
  try {
    const [customers, vendors] = await Promise.all([
      getAllCustomers().catch(() => []),
      getAllVendors().catch(() => []),
    ]);
    return { converted: toEntries(customers, "customer"), unconverted: toEntries(vendors, "vendor") };
  } catch (err) {
    console.error("[fetchLeadsClientsGrouped] error:", err);
    return { converted: [], unconverted: [] };
  }
}

// ---------------------------------------------------------------------------
// Realtime Subscriptions
// ---------------------------------------------------------------------------

export function subscribeToConversations(onChange) {
  const channel = supabase
    .channel("whatsapp-conversations-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "whatsapp_conversations" },
      onChange
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
      onChange
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
      onEvent
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToStatusHistory(onInsert) {
  const channel = supabase
    .channel("whatsapp-status-history-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_message_status_history" },
      onInsert
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
