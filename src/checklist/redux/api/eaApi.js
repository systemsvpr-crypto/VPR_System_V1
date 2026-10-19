// Data access for EA (executive-assistant) tasks.
//   ea_tasks       — one row per task; id === task_id (DB trigger). status is
//                    'pending' → 'done' (awaiting approval) → approved
//                    (admin_done true); an extension puts it back to
//                    'pending' at a later planned_date.
//   ea_tasks_done  — one snapshot per doer action (AllTasks.jsx writes them):
//                    status 'pending' = completion awaiting approval,
//                    'extended' = extension notice.
//
// The approval page works on snapshots but keys rows by the EA task:
// rows come back as { ...snapshot, id: task_id, done_id: snapshot.id } and
// extension notices are reported as status 'extend' (the page's
// "send remark" state).
import supabase from "../../SupabaseClient";
import {
  applyDateFilter,
  chunk,
  currentUserName,
  fetchAllRows,
  fetchRowRange,
  idsOf,
  nowIST,
  sanitizeSearch,
  scopeToCurrentUser,
} from "./taskApiUtils";

const HISTORY_LIMIT = 1000;

// ── Task Management list (QuickTask "EA" tab) ──────────────────────────────

// Not-yet-approved EA tasks, earliest planned first.
// Signature mirrors QuickTask's export call:
// fetchEAData(page, pageSize, search, dateFilter, givenByFilter, doerFilter)
export const fetchEAData = async (
  page = 0,
  pageSize = 50,
  searchTerm = "",
  dateFilter = "all",
  givenByFilter = "",
  doerFilter = "",
) => {
  const search = sanitizeSearch(searchTerm);
  const build = () => {
    let q = supabase
      .from("ea_tasks")
      .select("*")
      .not("admin_done", "is", true)
      .order("planned_date", { ascending: true })
      .order("task_id", { ascending: true });
    q = scopeToCurrentUser(q, "doer_name");
    if (givenByFilter) q = q.eq("given_by", givenByFilter);
    if (doerFilter) q = q.eq("doer_name", doerFilter);
    if (search)
      q = q.or(
        `task_description.ilike.*${search}*,doer_name.ilike.*${search}*,given_by.ilike.*${search}*`,
      );
    return applyDateFilter(q, dateFilter, "planned_date");
  };
  const data = await fetchRowRange(build, Math.max(0, page) * pageSize, pageSize);
  return { data, page: Math.max(0, page), hasMore: data.length === pageSize };
};

// Edit one EA task: { updatedTask, originalTask }. The edit form mixes
// checklist-style keys (name, require_attachment "yes"/"no", remark) with
// EA ones, so map them onto ea_tasks' columns. Returns the updated rows.
export const updateEATaskApi = async ({ updatedTask = {} } = {}) => {
  const taskId = updatedTask.task_id ?? updatedTask.id;
  if (taskId === undefined || taskId === null) throw new Error("EA task id is missing");
  const u = updatedTask;
  const updates = {};
  if (u.given_by !== undefined) updates.given_by = u.given_by;
  const doer = u.doer_name ?? u.name;
  if (doer !== undefined) updates.doer_name = doer;
  if (u.phone_number !== undefined) updates.phone_number = u.phone_number;
  if (u.task_description !== undefined) updates.task_description = u.task_description;
  if (u.audio_url !== undefined) updates.audio_url = u.audio_url;
  if (u.duration !== undefined) updates.duration = u.duration || null;
  if (u.instruction_attachment_url !== undefined)
    updates.instruction_attachment_url = u.instruction_attachment_url;
  if (u.instruction_attachment_type !== undefined)
    updates.instruction_attachment_type = u.instruction_attachment_type;
  if (u.attachment !== undefined || u.require_attachment !== undefined)
    updates.attachment =
      u.attachment === true ||
      u.attachment === "yes" ||
      String(u.require_attachment || "").toLowerCase() === "yes";
  const remarks = u.remarks ?? u.remark;
  if (remarks !== undefined) updates.remarks = remarks || null;
  updates.updated_at = nowIST();

  const { data, error } = await supabase
    .from("ea_tasks")
    .update(updates)
    .eq("task_id", taskId)
    .select();
  if (error) throw error;
  return data || [];
};

// Delete EA tasks (rows or ids). Returns the deleted ids.
export const deleteEATasksApi = async (tasks) => {
  const ids = idsOf(tasks);
  for (const part of chunk(ids)) {
    const { error } = await supabase.from("ea_tasks").delete().in("task_id", part);
    if (error) throw error;
  }
  return ids;
};

// ── Admin approval (AdminApprovalPage.jsx) ─────────────────────────────────

const withTaskFields = async (snapshots) => {
  const taskIds = [...new Set(snapshots.map((s) => s.task_id).filter((v) => v != null))];
  const tasks = new Map();
  for (const part of chunk(taskIds)) {
    const { data, error } = await supabase.from("ea_tasks").select("*").in("task_id", part);
    if (error) throw error;
    (data || []).forEach((t) => tasks.set(String(t.task_id), t));
  }
  return snapshots.map((s) => {
    const task = tasks.get(String(s.task_id)) || {};
    return {
      ...s,
      done_id: s.id,
      id: s.task_id ?? s.id,
      task_id: s.task_id,
      name: s.doer_name,
      department: "EA",
      status: s.status === "extended" ? "extend" : s.status,
      instruction_attachment_url: task.instruction_attachment_url ?? null,
      instruction_attachment_type: task.instruction_attachment_type ?? null,
      audio_url: s.audio_url ?? task.audio_url ?? null,
      submission_timestamp: s.submission_date,
    };
  });
};

// Snapshots awaiting review, newest first (the page keeps one per task).
export const fetchPendingEAApprovals = async () => {
  const snapshots = await fetchAllRows(() =>
    supabase
      .from("ea_tasks_done")
      .select("*")
      .not("admin_done", "is", true)
      .in("status", ["pending", "done", "extended", "extend"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  );
  return withTaskFields(snapshots);
};

// Approved or rejected snapshots, newest first.
export const fetchApprovedEA = async () => {
  const { data, error } = await supabase
    .from("ea_tasks_done")
    .select("*")
    .or("admin_done.eq.true,status.eq.rejected")
    .order("updated_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return withTaskFields(data || []);
};

// Approve: the snapshot becomes 'done', earlier notices for the task are
// settled, and the EA task itself is marked approved.
export const approveEATaskV2 = async (taskId, doneId) => {
  const approval = {
    admin_done: true,
    admin_approved_by: currentUserName() || "Admin",
    admin_approval_date: nowIST(),
    rejection_reason: null,
  };
  if (doneId !== undefined && doneId !== null) {
    const { error } = await supabase
      .from("ea_tasks_done")
      .update({ ...approval, status: "done" })
      .eq("id", doneId);
    if (error) throw error;
  }
  if (taskId !== undefined && taskId !== null) {
    const { error: noticeError } = await supabase
      .from("ea_tasks_done")
      .update({ admin_done: true })
      .eq("task_id", taskId)
      .not("admin_done", "is", true);
    if (noticeError) throw noticeError;

    const { error } = await supabase
      .from("ea_tasks")
      .update({ admin_done: true, status: "done", updated_at: nowIST() })
      .eq("task_id", taskId);
    if (error) throw error;
  }
  return { taskId, doneId };
};

// Reject: the snapshot is marked rejected and the EA task goes back to
// 'pending' for the doer with the reason in `remarks`.
export const rejectEATask = async (taskId, doneId, reason) => {
  if (doneId !== undefined && doneId !== null) {
    const { error } = await supabase
      .from("ea_tasks_done")
      .update({ status: "rejected", rejection_reason: reason, admin_done: false })
      .eq("id", doneId);
    if (error) throw error;
  }
  if (taskId !== undefined && taskId !== null) {
    const { error } = await supabase
      .from("ea_tasks")
      .update({
        status: "pending",
        remarks: reason,
        admin_done: false,
        updated_at: nowIST(),
      })
      .eq("task_id", taskId);
    if (error) throw error;
  }
  return { taskId, doneId };
};
