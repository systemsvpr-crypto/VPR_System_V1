// Data access for maintenance_tasks — one row per scheduled occurrence of a
// machine/part maintenance job (MaintenanceTask.jsx expands a frequency into
// a year of rows up front). A row is "pending" while submission_date is null,
// "awaiting approval" once the doer submits (admin_done false), and final
// once an admin approves (admin_done true) or rejects it.
//
// Rejecting clears submission_date so the occurrence drops back into the
// doer's pending queue, but keeps status 'rejected' + rejection_reason so the
// approval history can still show it until it is resubmitted.
//
// The admin-approval / dashboard helpers here are plain async functions (the
// pages await them directly); the paged list/update helpers back the thunks
// in slice/maintenanceSlice.js.
import supabase from "../../SupabaseClient";
import { fetchAllRows } from "./taskApiUtils";

const TABLE = "maintenance_tasks";
const BUCKET = "maintenance";
export const MAINTENANCE_PAGE_SIZE = 50;
export const MAINTENANCE_HISTORY_PAGE_SIZE = 100;

// Pages stamp completion times as IST wall-clock with an explicit offset
// (see AllTasks.jsx) — keep the same shape so every writer agrees.
export const nowIST = () =>
  new Date(Date.now() + 330 * 60000).toISOString().replace("Z", "+05:30");

const pad = (n) => String(n).padStart(2, "0");
// task_start_date / planned_date are `timestamp` (no zone) holding local
// wall-clock strings, so compare against a local, zone-less string too.
const endOfTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59:59`;
};

const readLocal = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

// Plain users only ever see their own occurrences; every other role sees all
// (maintenance rows all carry department "Maintenance", so there is no
// finer department scope to apply server side).
const scopeToCurrentUser = (query, nameColumn = "name") => {
  const role = readLocal("role").toLowerCase();
  const user = readLocal("user-name");
  if (role === "user" && user) return query.eq(nameColumn, user);
  return query;
};

// PostgREST's `or=(...)` filter syntax treats , ( ) as delimiters — strip
// them from free-text search so a stray comma can't break the request.
const sanitizeSearch = (term) => String(term || "").replace(/[,()*%\\]/g, " ").trim();

// ── Lists (slice thunks) ───────────────────────────────────────────────────

// Pending occurrences, oldest first. `dueOnly` (default for the numeric
// `maintenanceData(1)` call used by the doer-facing pages) hides future
// occurrences so a daily job doesn't flood the list with a year of rows;
// QuickTask's management view passes an object and sees every pending row.
export const fetchMaintenanceDataApi = async ({
  page = 1,
  pageSize = MAINTENANCE_PAGE_SIZE,
  frequency = "",
  searchTerm = "",
  dueOnly = false,
} = {}) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    let query = supabase.from(TABLE).select("*").is("submission_date", null);
    query = scopeToCurrentUser(query);
    if (dueOnly) query = query.lte("task_start_date", endOfTodayLocal());
    if (frequency) query = query.ilike("freq", frequency);
    const term = sanitizeSearch(searchTerm);
    if (term) {
      query = query.or(
        `task_description.ilike.%${term}%,name.ilike.%${term}%,machine_name.ilike.%${term}%,part_name.ilike.%${term}%`,
      );
    }
    const { data, error } = await query
      .order("task_start_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchMaintenanceDataApi query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = data || [];
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchMaintenanceDataApi exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};

// Submitted occurrences (awaiting approval or approved), newest first.
export const fetchMaintenanceHistoryApi = async ({
  page = 1,
  pageSize = MAINTENANCE_HISTORY_PAGE_SIZE,
} = {}) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    let query = supabase.from(TABLE).select("*").not("submission_date", "is", null);
    query = scopeToCurrentUser(query);
    const { data, error } = await query
      .order("submission_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchMaintenanceHistoryApi query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = data || [];
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchMaintenanceHistoryApi exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};

// ── Edits ──────────────────────────────────────────────────────────────────

// Columns an edit form may change. Anything else on the payload (UI-only
// fields like originalAudioUrl, the dashboard's `frequency` alias, ids) is
// dropped so a stray key can't make PostgREST reject the whole update.
const SERIES_EDITABLE = [
  "machine_name",
  "part_name",
  "part_area",
  "given_by",
  "name",
  "department",
  "task_description",
  "audio_url",
  "freq",
  "duration",
  "remarks",
  "instruction_attachment_url",
  "instruction_attachment_type",
  "require_attachment",
  "enable_reminder",
  "enable_reminders",
  "priority",
];
// A single-row edit may also move that one occurrence in time.
const ROW_EDITABLE = [...SERIES_EDITABLE, "task_start_date", "planned_date"];

const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
};

// Two call shapes exist:
//  • `{ updatedTask, originalTask }` (QuickTask, TaskNavigationTab) — edit a
//    whole series: every still-pending occurrence matching the original
//    machine/part/area/description/doer gets the new values. Falls back to
//    the single row `updatedTask.id` if the original fields match nothing
//    (the dashboard's mapped rows don't always carry the raw columns).
//  • a flat row `{ id, ...columns }` (MaintenanceView) — edit that one row.
// Resolves to the updated rows.
export const updateMaintenanceTaskApi = async (arg) => {
  const isSeries = arg && typeof arg === "object" && "updatedTask" in arg;
  const updatedTask = isSeries ? arg.updatedTask || {} : arg || {};
  const originalTask = isSeries ? arg.originalTask : null;
  const id = updatedTask.id;

  if (!isSeries || !originalTask) {
    if (id === undefined || id === null) throw new Error("Maintenance task id is missing");
    const updates = pick(updatedTask, ROW_EDITABLE);
    if (updates.task_start_date && !updatedTask.planned_date) {
      updates.planned_date = updates.task_start_date;
    }
    if (Object.keys(updates).length === 0) return [];
    const { data, error } = await supabase.from(TABLE).update(updates).eq("id", id).select();
    if (error) throw error;
    return data || [];
  }

  const updates = pick(updatedTask, SERIES_EDITABLE);
  if (Object.keys(updates).length === 0) return [];
  let query = supabase.from(TABLE).update(updates).is("submission_date", null);
  let matchers = 0;
  ["machine_name", "part_name", "part_area", "task_description", "name"].forEach((col) => {
    const v = originalTask[col];
    if (v !== undefined && v !== null && v !== "" && v !== "-") {
      query = query.eq(col, v);
      matchers++;
    }
  });

  let rows = [];
  if (matchers > 0) {
    const { data, error } = await query.select();
    if (error) throw error;
    rows = data || [];
  }
  if (rows.length === 0 && id !== undefined && id !== null) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(pick(updatedTask, ROW_EDITABLE))
      .eq("id", id)
      .select();
    if (error) throw error;
    rows = data || [];
  }
  return rows;
};

// Accepts full rows (QuickTask's selection) or bare ids.
export const deleteMaintenanceTasksApi = async (tasks) => {
  const ids = [
    ...new Set(
      (Array.isArray(tasks) ? tasks : [tasks])
        .map((t) => (t && typeof t === "object" ? t.id ?? t.task_id : t))
        .filter((v) => v !== undefined && v !== null),
    ),
  ];
  if (ids.length === 0) return [];
  for (let i = 0; i < ids.length; i += 150) {
    const { error } = await supabase.from(TABLE).delete().in("id", ids.slice(i, i + 150));
    if (error) throw error;
  }
  return ids;
};

// MaintenanceDataPage hands over the proof image only as an object-URL
// preview (`blob:`), not the File — fetch it back into a Blob to upload.
const uploadProofImage = async (taskId, image) => {
  if (!image) return null;
  let blob = image.file || image.blob || null;
  if (!blob && image.previewUrl) {
    const res = await fetch(image.previewUrl);
    blob = await res.blob();
  }
  if (!blob) return null;
  const safeName = String(image.name || "proof").replace(/[^\w.-]+/g, "_");
  const path = `${taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: image.type || blob.type || undefined, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
};

// Doer submission: [{ taskId, status: "Done"|"Issue", remarks, image }].
// Marks each occurrence submitted (awaiting admin approval).
export const submitMaintenanceApi = async (items) => {
  const list = Array.isArray(items) ? items : [items];
  const results = [];
  for (const item of list) {
    const imageUrl = await uploadProofImage(item.taskId, item.image);
    const updates = {
      status: item.status || "Done",
      remarks: item.remarks || null,
      submission_date: nowIST(),
      admin_done: false,
      rejection_reason: null,
    };
    if (imageUrl) {
      updates.uploaded_image_url = imageUrl;
      updates.image_urls = [imageUrl];
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", item.taskId)
      .select();
    if (error) throw error;
    results.push(...(data || []));
  }
  return results;
};

// ── Admin approval (AdminApprovalPage) ─────────────────────────────────────

export const fetchPendingMaintenanceApprovals = async () =>
  fetchAllRows(() =>
    supabase
      .from(TABLE)
      .select("*")
      .not("submission_date", "is", null)
      // (rejected rows have submission_date cleared, so they drop out here)
      .or("admin_done.is.null,admin_done.eq.false")
      .order("submission_date", { ascending: false }),
  );

export const approveMaintenanceTask = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      admin_done: true,
      admin_approved_by: readLocal("user-name") || "Admin",
      admin_approval_date: nowIST(),
      rejection_reason: null,
    })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] || null;
};

export const rejectMaintenanceTask = async (id, reason) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "rejected",
      rejection_reason: reason || null,
      admin_done: false,
      submission_date: null,
      admin_approved_by: readLocal("user-name") || "Admin",
      admin_approval_date: nowIST(),
    })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] || null;
};

// Approval history: approved rows plus rejected ones not yet resubmitted.
export const fetchApprovedMaintenance = async () =>
  fetchAllRows(() =>
    supabase
      .from(TABLE)
      .select("*")
      .or("admin_done.eq.true,status.eq.rejected")
      .order("admin_approval_date", { ascending: false, nullsFirst: false }),
  );

// ── Dashboard ──────────────────────────────────────────────────────────────

// Raw rows up to the end of today, newest first, one page at a time —
// Dashboard.jsx loops pages until one comes back short.
export const fetchAllMaintenanceTasksForDashboard = async (page = 1, pageSize = 1000) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .lte("planned_date", endOfTodayLocal())
      .order("planned_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchAllMaintenanceTasksForDashboard query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = data || [];
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchAllMaintenanceTasksForDashboard exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};
