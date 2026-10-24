// Data access for the module's broadcast notifications (Notifications.jsx,
// and the unread badge in AdminLayout). An admin posts a notification aimed
// at a role ("all" | "superadmin" | "admin" | "hod" | "user"); per-user read
// state lives in checklist_notification_reads (one row per user per
// notification), so the list comes back with an `isRead` flag for the asking
// user and the poster's checklist_users row as `creator`.
//
// Audience by the asker's (lower-cased) role: administrator/admin see every
// notification (they manage the feed); everyone else sees "all" plus the
// targets matching their role — div_admin counts as an admin-level reader.
import supabase from "../../SupabaseClient";
import { fetchAllRows, fetchAllRowsInChunks } from "./taskApiUtils";

const TABLE = "checklist_notifications";
const READS_TABLE = "checklist_notification_reads";
const USERS_TABLE = "checklist_users";

const ROLE_TARGETS = {
  hod: ["all", "hod"],
  div_admin: ["all", "admin"],
  user: ["all", "user"],
};

// checklist_users.id is a bigint; localStorage hands it over as a string.
const toUserId = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const attachCreators = async (rows) => {
  const ids = [...new Set(rows.map((r) => r.created_by).filter((v) => v !== null && v !== undefined))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, creator: null }));
  const users = await fetchAllRowsInChunks(ids, (chunk) =>
    supabase.from(USERS_TABLE).select("id, user_name, profile_image").in("id", chunk),
  );
  const byId = new Map(users.map((u) => [String(u.id), u]));
  return rows.map((r) => ({ ...r, creator: byId.get(String(r.created_by)) || null }));
};

export const fetchNotificationsApi = async ({ role, userId } = {}) => {
  try {
    const roleKey = String(role || "").toLowerCase();
    const isManager = roleKey === "administrator" || roleKey === "admin";

    const rows = await fetchAllRows(() => {
      let q = supabase
        .from(TABLE)
        .select("id, title, message, role_target, created_by, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (!isManager) q = q.in("role_target", ROLE_TARGETS[roleKey] || ["all"]);
      return q;
    });

    const uid = toUserId(userId);
    let readIds = new Set();
    if (uid !== null && rows.length > 0) {
      const reads = await fetchAllRows(() =>
        supabase.from(READS_TABLE).select("notification_id").eq("user_id", uid),
      );
      readIds = new Set(reads.map((r) => String(r.notification_id)));
    }

    const withCreators = await attachCreators(rows);
    return withCreators.map((r) => ({ ...r, isRead: readIds.has(String(r.id)) }));
  } catch (err) {
    console.warn("fetchNotificationsApi error:", err);
    return [];
  }
};

// { title, message, roleTarget, createdBy } → the new notification in list shape.
export const createNotificationApi = async ({ title, message, roleTarget, createdBy }) => {
  const t = (title || "").trim();
  const m = (message || "").trim();
  if (!t || !m) throw new Error("Title and message are required.");

  const { data, error } = await supabase
    .from(TABLE)
    .insert([{ title: t, message: m, role_target: roleTarget || "all", created_by: toUserId(createdBy) }])
    .select("id, title, message, role_target, created_by, created_at")
    .single();
  if (error) throw new Error(error.message);

  const [withCreator] = await attachCreators([data]);
  return { ...withCreator, isRead: false };
};

// Read rows go with it (ON DELETE CASCADE on the reads table).
export const deleteNotificationApi = async (id) => {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return id;
};

export const markNotificationReadApi = async ({ notificationId, userId }) => {
  const uid = toUserId(userId);
  if (uid === null) throw new Error("Missing user id.");
  // Plain insert (not upsert): soft delete turns the unique constraint into a
  // partial index, which ON CONFLICT can't target. 23505 = already marked read.
  const { error } = await supabase
    .from(READS_TABLE)
    .insert([{ notification_id: notificationId, user_id: uid }]);
  if (error && error.code !== "23505") throw new Error(error.message);
  return { notificationId };
};
