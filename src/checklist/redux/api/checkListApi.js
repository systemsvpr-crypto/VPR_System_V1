// Data access for `checklist` — one row per occurrence of a recurring task
// (ChecklistTask.jsx expands a frequency into a year of rows up front).
// Every row has id === task_id (a DB trigger keeps them equal) because some
// pages key on `id` and others on `task_id`.
//
// Lifecycle of an occurrence:
//   pending          submission_date is null (or status 'extend' — an
//                    extension keeps the occurrence open at a later
//                    planned_date)
//   awaiting review  submission_date set, admin_done false
//   approved         admin_done true (+ admin_approved_by / _date)
//   rejected         submission_date cleared again, status 'rejected' and
//                    rejection_reason kept so approval history can show it
//
// These helpers back SalesDataPage (doer submit + admin "Mark Done") and the
// Settings history purge; approval-page helpers live in quickTaskApi.js.
import supabase from "../../SupabaseClient";
import {
  chunk,
  currentUserName,
  nowIST,
  scopeToCurrentUser,
  uploadProofFiles,
} from "./taskApiUtils";

export const CHECKLIST_PAGE_SIZE = 50;
export const CHECKLIST_PENDING_FILTER =
  "submission_date.is.null,status.in.(extend,extended)";
const BUCKET = "checklist";

// Pending occurrences, earliest due first (SalesDataPage pages by 50).
export const fetchChecklistPendingApi = async ({ page = 1, pageSize = CHECKLIST_PAGE_SIZE } = {}) => {
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = supabase
    .from("checklist")
    .select("*")
    .or(CHECKLIST_PENDING_FILTER)
    .order("planned_date", { ascending: true })
    .order("task_id", { ascending: true })
    .range(from, from + pageSize - 1);
  query = scopeToCurrentUser(query);
  const { data, error } = await query;
  if (error) throw error;
  return { data: data || [], page: Math.max(1, page), hasMore: (data || []).length === pageSize };
};

// Submitted occurrences, most recent first.
export const fetchChecklistHistoryApi = async ({ page = 1, pageSize = CHECKLIST_PAGE_SIZE } = {}) => {
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = supabase
    .from("checklist")
    .select("*")
    .not("submission_date", "is", null)
    .order("submission_date", { ascending: false })
    .range(from, from + pageSize - 1);
  query = scopeToCurrentUser(query);
  const { data, error } = await query;
  if (error) throw error;
  return { data: data || [], page: Math.max(1, page), hasMore: (data || []).length === pageSize };
};

// Doer submission from SalesDataPage:
// [{ taskId, status: "yes"|"no", remarks, image: { name, type, previewUrl } | null, … }]
// Returns the updated rows.
export const submitChecklistApi = async (items = []) => {
  const updated = [];
  for (const item of items) {
    const taskId = item.taskId ?? item.task_id ?? item.id;
    if (taskId === undefined || taskId === null) continue;
    const updates = {
      status: item.status || "yes",
      remark: item.remarks ?? item.remark ?? null,
      submission_date: nowIST(),
      admin_done: false,
    };
    if (item.image) {
      const urls = await uploadProofFiles(BUCKET, taskId, [item.image]);
      if (urls.length) {
        updates.image = urls[0];
        updates.image_urls = urls;
      }
    }
    const { data, error } = await supabase
      .from("checklist")
      .update(updates)
      .eq("task_id", taskId)
      .select();
    if (error) throw error;
    updated.push(...(data || []));
  }
  return updated;
};

// Admin "Mark Done" on submitted rows. Returns { data, error } (never
// throws) — SalesDataPage destructures `error` itself.
export const postChecklistAdminDoneAPI = async (ids = []) => {
  try {
    const list = (Array.isArray(ids) ? ids : [ids])
      .map((v) => (v && typeof v === "object" ? v.task_id ?? v.id : v))
      .filter((v) => v !== undefined && v !== null);
    const data = [];
    for (const part of chunk(list)) {
      const { data: rows, error } = await supabase
        .from("checklist")
        .update({
          admin_done: true,
          admin_approved_by: currentUserName() || "Admin",
          admin_approval_date: nowIST(),
          rejection_reason: null,
        })
        .in("task_id", part)
        .select();
      if (error) return { data, error };
      data.push(...(rows || []));
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

// Settings → "Purge history": permanently removes approved occurrences
// submitted more than `days` days ago. Returns { count }.
export const bulkDeleteApprovedChecklists = async (days = 90) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Number(days) || 0));
  const cutoffDate = cutoff.toISOString().split("T")[0];
  const { error, count } = await supabase
    .from("checklist")
    .delete({ count: "exact" })
    .eq("admin_done", true)
    .lt("submission_date", cutoffDate);
  if (error) throw error;
  return { count: count || 0 };
};
