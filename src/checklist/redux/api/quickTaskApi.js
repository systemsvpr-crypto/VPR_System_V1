// Data access behind Task Management (QuickTask.jsx) and the checklist part
// of the admin approval page.
//
// Checklist "unique tasks": ChecklistTask.jsx stores one row per occurrence,
// so Task Management lists series instead — the `checklist_unique_tasks`
// view keeps, per division + department + description + doer, the latest
// still-open occurrence (its planned_date is the series' end date, which
// "Regenerate" extends from). Editing or deleting a series only touches its
// open occurrences, so submitted/approved history is never rewritten.
//
// Delegation and EA tasks are one row per task, listed directly.
import supabase from "../../SupabaseClient";
import { CHECKLIST_PENDING_FILTER } from "./checkListApi";
import { DELEGATION_PENDING_FILTER } from "./delegationApi";
import {
  applyDateFilter,
  chunk,
  currentUserName,
  fetchAllRows,
  fetchRowRange,
  idsOf,
  nowIST,
  sameText,
  sanitizeSearch,
  scopeToCurrentUser,
  toYesNo,
} from "./taskApiUtils";

export { fetchEAData, updateEATaskApi, deleteEATasksApi } from "./eaApi";

const UNIQUE_VIEW = "checklist_unique_tasks";
const HISTORY_LIMIT = 1000;

const searchFilter = (term) => {
  const s = sanitizeSearch(term);
  return s
    ? `task_description.ilike.*${s}*,name.ilike.*${s}*,given_by.ilike.*${s}*,department.ilike.*${s}*`
    : "";
};

// Shared filter set for the checklist/delegation lists.
const applyListFilters = (q, { search, dateFilter, department, givenBy, doer, frequency }) => {
  let query = scopeToCurrentUser(q);
  if (department) query = query.eq("department", department);
  if (givenBy) query = query.eq("given_by", givenBy);
  if (doer) query = query.eq("name", doer);
  if (frequency) query = query.ilike("frequency", frequency);
  const or = searchFilter(search);
  if (or) query = query.or(or);
  return applyDateFilter(query, dateFilter, "planned_date");
};

// ── Lists (positional signature matches QuickTask's export calls) ─────────

// fetchChecklistData(page, pageSize, search, dateFilter, department, givenBy, doer, frequency)
export const fetchChecklistData = async (
  page = 0,
  pageSize = 50,
  search = "",
  dateFilter = "all",
  department = "",
  givenBy = "",
  doer = "",
  frequency = "",
) => {
  const build = () =>
    applyListFilters(
      supabase
        .from(UNIQUE_VIEW)
        .select("*")
        .order("task_start_date", { ascending: true })
        .order("task_id", { ascending: true }),
      { search, dateFilter, department, givenBy, doer, frequency },
    );
  const data = await fetchRowRange(build, Math.max(0, page) * pageSize, pageSize);
  return { data, page: Math.max(0, page), hasMore: data.length === pageSize };
};

// Open delegation tasks. Same signature as fetchChecklistData.
export const fetchDelegationData = async (
  page = 0,
  pageSize = 50,
  search = "",
  dateFilter = "all",
  department = "",
  givenBy = "",
  doer = "",
  frequency = "",
) => {
  const build = () =>
    applyListFilters(
      supabase
        .from("delegation")
        .select("*")
        .or(DELEGATION_PENDING_FILTER)
        .order("planned_date", { ascending: true })
        .order("task_id", { ascending: true }),
      { search, dateFilter, department, givenBy, doer, frequency },
    );
  const data = await fetchRowRange(build, Math.max(0, page) * pageSize, pageSize);
  return { data, page: Math.max(0, page), hasMore: data.length === pageSize };
};

export const fetchUsersApi = async () => {
  try {
    const { data, error } = await supabase
      .from("checklist_users")
      .select("*")
      .order("user_name", { ascending: true });
    if (error) {
      console.warn("Checklist quickTaskApi fetchUsersApi warning:", error?.message || error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Checklist quickTaskApi fetchUsersApi exception:", err?.message || err);
    return [];
  }
};

// ── Edits ──────────────────────────────────────────────────────────────────

// Maps an edit form's fields onto checklist/delegation columns. Dates and
// frequency are read-only in the forms (they define the series), so they
// are never written here. `remarkColumn` differs: checklist uses `remark`,
// delegation `remarks`.
const editableColumns = (u, remarkColumn) => {
  const out = {};
  const copy = (key, value = u[key]) => {
    if (value !== undefined) out[key] = value;
  };
  copy("department");
  copy("given_by");
  copy("name");
  copy("task_description");
  copy("audio_url");
  if (u.duration !== undefined) out.duration = u.duration || null;
  if (u.enable_reminder !== undefined) out.enable_reminder = toYesNo(u.enable_reminder, "yes");
  if (u.require_attachment !== undefined) out.require_attachment = toYesNo(u.require_attachment, "no");
  copy("instruction_attachment_url");
  copy("instruction_attachment_type");
  if (u.reminder_days_before !== undefined)
    out.reminder_days_before = Number(u.reminder_days_before) || 1;
  const remark = u.remark ?? u.remarks;
  if (remark !== undefined) out[remarkColumn] = remark || null;
  return out;
};

// Open rows of `table` belonging to the series described by `original`
// Open rows of `table` belonging to the series described by `original`
// ({ department, name, task_description }), matched null-safely.
const findOpenSeriesIds = async (table, pendingFilter, original) => {
  const rows = await fetchAllRows(() => {
    let q = supabase
      .from(table)
      .select("task_id, department, name, task_description")
      .or(pendingFilter)
      .order("task_id", { ascending: true });
    const name = original?.name?.trim();
    if (name) {
      q = q.ilike("name", name);
    }
    return q;
  });
  return rows
    .filter(
      (r) =>
        sameText(r.name, original?.name) &&
        sameText(r.department, original?.department) &&
        sameText(r.task_description, original?.task_description),
    )
    .map((r) => r.task_id);
};

const updateByIds = async (table, ids, updates) => {
  const rows = [];
  for (const part of chunk(ids)) {
    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .in("task_id", part)
      .select();
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
};

// Checklist series edit: updates the series occurrences matching originalTask
// as well as the edited task itself (via updatedTask id/task_id).
export const updateChecklistTaskApi = async ({ updatedTask = {}, originalTask = null } = {}) => {
  const updates = editableColumns(updatedTask, "remark");
  if (!Object.keys(updates).length) return { updatedTask, originalTask, rows: [] };
  const seriesIds = originalTask
    ? await findOpenSeriesIds("checklist", CHECKLIST_PENDING_FILTER, originalTask)
    : [];
  const ownIds = idsOf([updatedTask]);
  const ids = [...new Set([...seriesIds, ...ownIds])];
  const rows = await updateByIds("checklist", ids, updates);
  return { updatedTask, originalTask, rows };
};

// Delegation edit: updates the series occurrences matching originalTask
// as well as the edited task itself (via updatedTask id/task_id).
export const updateDelegationTaskApi = async ({ updatedTask = {}, originalTask = null } = {}) => {
  const updates = editableColumns(updatedTask, "remark");
  if (!Object.keys(updates).length) return { updatedTask, originalTask, rows: [] };
  const seriesIds = originalTask
    ? await findOpenSeriesIds("delegation", DELEGATION_PENDING_FILTER, originalTask)
    : [];
  const ownIds = idsOf([updatedTask]);
  const ids = [...new Set([...seriesIds, ...ownIds])];
  const rows = await updateByIds("delegation", ids, updates);
  return { updatedTask, originalTask, rows };
};

// ── Deletes ────────────────────────────────────────────────────────────────

const deleteByIds = async (table, ids) => {
  for (const part of chunk(ids)) {
    const { error } = await supabase.from(table).delete().in("task_id", part);
    if (error) throw error;
  }
};

// Deletes the open occurrences of each selected checklist series (rows from
// the unique view) — completed history stays. Returns the selected ids.
export const deleteChecklistTasksApi = async (tasks) => {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  const ids = new Set();
  for (const t of list) {
    if (t && typeof t === "object") {
      const seriesIds = await findOpenSeriesIds("checklist", CHECKLIST_PENDING_FILTER, {
        department: t.department,
        name: t.name,
        task_description: t.task_description,
      });
      seriesIds.forEach((id) => ids.add(id));
      const own = t.task_id ?? t.id;
      if (own !== undefined && own !== null) ids.add(own);
    } else if (t !== undefined && t !== null) {
      ids.add(t);
    }
  }
  await deleteByIds("checklist", [...ids]);
  return idsOf(list);
};

export const deleteDelegationTasksApi = async (tasks) => {
  const ids = idsOf(tasks);
  await deleteByIds("delegation", ids);
  return ids;
};

// ── Checklist approvals (AdminApprovalPage.jsx) ────────────────────────────

// Submitted, not-yet-approved occurrences, newest submission first.
export const fetchPendingChecklistApprovals = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from("checklist")
      .select("*")
      .not("submission_date", "is", null)
      .not("admin_done", "is", true)
      .or("status.is.null,status.neq.rejected")
      .order("submission_date", { ascending: false })
      .order("task_id", { ascending: false }),
  );
  return rows.map((r) => ({ ...r, submission_timestamp: r.submission_date }));
};

export const approveChecklistTask = async (id) => {
  const { error } = await supabase
    .from("checklist")
    .update({
      admin_done: true,
      admin_approved_by: currentUserName() || "Admin",
      admin_approval_date: nowIST(),
      rejection_reason: null,
    })
    .eq("task_id", id);
  if (error) throw error;
  return { id };
};

// The occurrence drops back into the doer's pending list with the reason.
export const rejectChecklistTask = async (id, reason) => {
  const { error } = await supabase
    .from("checklist")
    .update({
      status: "rejected",
      rejection_reason: reason,
      submission_date: null,
      admin_done: false,
    })
    .eq("task_id", id);
  if (error) throw error;
  return { id };
};

// Approved or rejected occurrences, newest first.
export const fetchChecklistHistory = async () => {
  const { data, error } = await supabase
    .from("checklist")
    .select("*")
    .or("admin_done.eq.true,status.eq.rejected")
    .order("updated_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return data || [];
};
