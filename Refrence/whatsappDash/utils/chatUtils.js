export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDayLabel(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  
  const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = dToday.getTime() - dDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return formatter.format(date).replace(/,/g, "");
  }
}

export function parseTemplateBody(bodyText, variables) {
  let output = bodyText;
  variables.forEach((val, idx) => {
    const token = `{{${idx + 1}}}`;
    output = output.split(token).join(val && val.trim() ? val : token);
  });
  return output;
}

export function extractTemplateVariables(bodyText) {
  const matches = bodyText.match(/{{\d+}}/g) || [];
  const unique = [...new Set(matches)];
  return unique.sort(
    (a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")),
  );
}

export function isMetaSessionActive(expiresAtIso, nowIso = new Date().toISOString()) {
  if (!expiresAtIso) return false;
  return new Date(expiresAtIso).getTime() > new Date(nowIso).getTime();
}

export function lastMessagePreview(message) {
  if (!message) return "";
  switch (message.type) {
    case "IMAGE":
      return "📷 Photo";
    case "VIDEO":
      return "🎥 Video";
    case "AUDIO":
      return "🎵 Voice Note / Audio";
    case "LOCATION":
      return "📍 Location Shared";
    case "CONTACT":
      return "📇 Contact Card";
    case "STICKER":
      return "🎨 Sticker";
    case "UNSUPPORTED": {
      const subType = message.metadata?.raw?.unsupported?.type;
      if (subType === "poll_creation" || subType === "poll" || message.body?.includes("WhatsApp Poll")) {
        return "📊 Poll";
      }
      if (subType === "event" || message.body?.includes("WhatsApp Event")) {
        return "📅 Event";
      }
      return message.body || "⚠️ Unsupported Message";
    }
    case "REACTION":
      return "📌 Reaction";
    case "POLL":
      return message.body && !message.body.includes("WhatsApp Poll")
        ? `📊 Poll: ${message.body}`
        : "📊 Poll";
    case "EVENT":
      return message.body || "📅 Scheduled Event";
    case "DOCUMENT":
      return `📄 ${message.body || "Document"}`;
    case "TEMPLATE":
      return message.body;
    default:
      return message.body;
  }
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// ---------------------------------------------------------------------------
// DB <-> UI shape mapping (public.vw_whatsapp_chat_inbox / whatsapp_messages)
// ---------------------------------------------------------------------------

const AVATAR_PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-pink-500 to-rose-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-violet-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-pink-600",
  "from-slate-500 to-slate-700",
];

export function avatarColorForId(id) {
  if (!id) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// Forces a real download of a Supabase Storage / Meta media link.
// The `download` attribute on an <a> is silently ignored by browsers for
// cross-origin URLs (which is what every media_url here is, relative to the
// app's own origin) — it just opens the file in a new tab instead. Fetching
// the file as a blob and downloading that same-origin object URL sidesteps
// this and forces an actual save-to-disk.
export async function handleDownload(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("Download failed, falling back to opening the file:", err);
    window.open(url, "_blank");
  }
}

export function fileTypeFromMime(mimeType) {
  if (!mimeType) return "FILE";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("document")) return "DOCX";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "ZIP";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLSX";
  return "FILE";
}

export function mapDbMessageType(dbType, mimeType, metadata) {
  if (dbType === "poll" || metadata?.poll_data || metadata?.raw?.unsupported?.type === "poll_creation") {
    return "POLL";
  }
  switch (dbType) {
    case "template":
      return "TEMPLATE";
    case "poll":
      return "POLL";
    case "media": {
      if (mimeType?.startsWith("image/")) return "IMAGE";
      if (mimeType?.startsWith("video/")) return "VIDEO";
      if (mimeType?.startsWith("audio/")) return "AUDIO";
      return "DOCUMENT";
    }
    case "audio":
      return "AUDIO";
    case "location":
      return "LOCATION";
    case "contacts":
      return "CONTACT";
    case "sticker":
      return "STICKER";
    case "event":
      return "EVENT";
    case "unsupported":
      return "UNSUPPORTED";
    case "reaction":
      return "REACTION";
    case "text_reply":
    case "button_reply":
    case "text":
    default:
      return "TEXT";
  }
}

export function mapDbStatus(dbStatus) {
  if (!dbStatus) return "SENT";
  const upper = dbStatus.toUpperCase();
  return ["SENT", "DELIVERED", "READ"].includes(upper) ? upper : null; // 'failed' -> no ticks
}

export function mapDbMessageToUi(m) {
  const type = mapDbMessageType(m.message_type, m.mime_type, m.metadata);

  let metadata = m.metadata || undefined;
  if (type === "POLL") {
    const pollData = metadata?.poll_data || {
      question: m.body && !m.body.includes("WhatsApp Poll") ? m.body : "Poll",
      options: [
        { id: "1", text: "Option A", votes: 0 },
        { id: "2", text: "Option B", votes: 0 }
      ],
      allow_multiple: true
    };
    metadata = { ...(metadata || {}), poll_data: pollData };
  }

  return {
    id: m.id,
    direction: m.direction,
    timestamp: m.created_at,
    type,
    body: m.body,
    mediaUrl: m.media_url,
    fileType: type === "DOCUMENT" ? fileTypeFromMime(m.mime_type) : undefined,
    status: m.direction === "OUTBOUND" ? mapDbStatus(m.latest_status) : undefined,
    reactions: [], // no reactions table yet — reaction UI is local-only for now
    replyToMessageId: m.parent_message_id || undefined,
    isForwarded: !!m.is_forwarded,
    templateId: m.template_id || undefined,
    // Snapshot written by whatsapp-send at send time for 'template' messages —
    // see whatsapp_messages.metadata comment in whatsapp_schema.sql.
    templateHeader: m.metadata?.header || undefined,
    templateFooter: m.metadata?.footer || undefined,
    templateButtons: m.metadata?.buttons || undefined,
    metadata,
  };
}

export function mapDbConversationToUi(row) {
  const customerName =
    row.display_name || row.external_contact_name || row.raw_phone_number || "Unknown Contact";

  const syntheticLastMessage = row.last_message_id
    ? {
      id: row.last_message_id,
      direction: row.last_message_direction,
      timestamp: row.last_message_at,
      type: mapDbMessageType(row.last_message_type, row.last_message_mime_type),
      body: row.last_message_text,
      isForwarded: row.last_message_is_forwarded,
    }
    : null;

  return {
    chatId: row.conversation_id,
    contactId: row.whatsapp_contact_id,
    displayName: row.display_name,
    customerName,
    phoneNumber: row.raw_phone_number ? `+${row.raw_phone_number}` : row.phone_number,
    avatarColor: avatarColorForId(row.conversation_id),
    isGroup: false,
    tags: [],
    metaSessionExpiresAt: row.meta_session_expires_at,
    is_session_active: row.is_session_active,
    unreadCount: row.unread_count || 0,
    awaitingReply: row.last_message_direction === "INBOUND",
    messages: syntheticLastMessage ? [syntheticLastMessage] : [],
  };
}

/**
 * Groups consecutive IMAGE / VIDEO messages from the same sender within a 15-second window
 * into a single synthetic MEDIA_ALBUM message for WhatsApp album gallery rendering.
 */
export function groupConsecutiveMediaMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const result = [];
  let currentGroup = [];

  const parseSec = (ts) => {
    if (!ts) return 0;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
  };

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    if (currentGroup.length === 1) {
      result.push(currentGroup[0]);
    } else {
      const first = currentGroup[0];
      const last = currentGroup[currentGroup.length - 1];
      // Pick first non-empty caption if present
      const captionMsg = currentGroup.find((m) => m.body && m.body.trim().length > 0);
      result.push({
        id: `album_${first.id}`,
        type: "MEDIA_ALBUM",
        direction: first.direction,
        timestamp: last.timestamp || first.timestamp,
        status: last.status || first.status,
        body: captionMsg ? captionMsg.body : undefined,
        mediaItems: currentGroup,
      });
    }
    currentGroup = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isMedia = msg.type === "IMAGE" || msg.type === "VIDEO";

    if (!isMedia) {
      flushGroup();
      result.push(msg);
      continue;
    }

    if (currentGroup.length === 0) {
      currentGroup.push(msg);
    } else {
      const prevMsg = currentGroup[currentGroup.length - 1];
      const sameDirection = msg.direction === prevMsg.direction;
      const prevTime = parseSec(prevMsg.timestamp);
      const currTime = parseSec(msg.timestamp);
      const within15s = Math.abs(currTime - prevTime) <= 15;

      if (sameDirection && within15s) {
        currentGroup.push(msg);
      } else {
        flushGroup();
        currentGroup = [msg];
      }
    }
  }

  flushGroup();
  return result;
}
