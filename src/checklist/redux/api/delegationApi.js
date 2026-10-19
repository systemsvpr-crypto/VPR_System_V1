// Data access for one-time (delegated) tasks.
//   delegation       — the task itself; id === task_id (DB trigger)
//   delegation_done  — one snapshot row per doer submission (done or
//                      extension), the unit the admin approves/rejects
//
// A delegation task is "pending" for the doer while submission_date is null
// or its status is 'extend' (an extension moves planned_date and keeps it
// open). Submitting from delegation.jsx writes a delegation_done snapshot and
// updates the task; AllTasks.jsx writes straight to `delegation` without a
// snapshot, so the approval list also surfaces those submitted tasks, with a
// synthetic id `delegation-<task_id>` (no snapshot row to point at).
//
// `color_code_for` counts submissions per task (1 = done first time,
// 2+ = needed extensions) — the dashboard buckets completed tasks by it.
import { createAsyncThunk } from "@reduxjs/toolkit";
import supabase from "../../SupabaseClient";
import {
  currentUserName,
  fetchAllRows,
  localDateString,
  nowIST,
  scopeToCurrentUser,
  uploadProofFiles,
} from "./taskApiUtils";

const BUCKET = "checklist"; // AllTasks uploads delegation proofs here too
export const DELEGATION_PENDING_FILTER =
  "submission_date.is.null,status.in.(extend,extended)";
const HISTORY_LIMIT = 1000;
const SYNTHETIC_PREFIX = "delegation-";

// planned_date is a zone-less `timestamp` holding local wall-clock, so an
// ISO instant from the page is rewritten as local "YYYY-MM-DDTHH:MM:SS".
const toLocalTimestamp = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const t = d.toTimeString().slice(0, 8);
  return `${localDateString(d)}T${t}`;
};

// Snapshot ids are numeric; synthetic AllTasks rows carry the prefix.
const snapshotIdOf = (id) => (/^\d+$/.test(String(id ?? "")) ? Number(id) : null);
const taskIdFromSynthetic = (id) =>
  String(id ?? "").startsWith(SYNTHETIC_PREFIX)
    ? Number(String(id).slice(SYNTHETIC_PREFIX.length)) || null
    : null;

// A delegation row submitted outside delegation.jsx, shaped like a snapshot.
const syntheticFromTask = (row) => ({
  ...row,
  id: `${SYNTHETIC_PREFIX}${row.task_id}`,
  task_id: row.task_id,
  status: row.status === "yes" ? "done" : row.status,
  reason: row.remark || null,
  image_url: row.image || null,
  submission_timestamp: row.submission_date,
});

// ── Doer lists (slice/delegationSlice.js) ──────────────────────────────────

export const fetchDelegationPendingApi = async () =>
  fetchAllRows(() =>
    scopeToCurrentUser(
      supabase
        .from("delegation")
        .select("*")
        .or(DELEGATION_PENDING_FILTER)
        .order("planned_date", { ascending: true })
        .order("task_id", { ascending: true }),
    ),
  );

export const fetchDelegationDoneApi = async () =>
  fetchAllRows(() =>
    scopeToCurrentUser(
      supabase
        .from("delegation_done")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
    ),
  );

// ── Doer submission (delegation.jsx) ───────────────────────────────────────

// { selectedDataArray, uploadedImages, imageLocationData } →
// [{ id, status: "success" | "error", error? }] — one entry per task.
export const insertDelegationDoneAndUpdate = createAsyncThunk(
  "delegation/submit",
  async (
    { selectedDataArray = [], uploadedImages = {}, imageLocationData = {} } = {},
    { rejectWithValue },
  ) => {
    try {
      const results = [];
      for (const item of selectedDataArray) {
        const id = item.id;
        try {
          const { data: task, error: taskError } = await supabase
            .from("delegation")
            .select("*")
            .eq("task_id", id)
            .maybeSingle();
          if (taskError) throw taskError;

          const staged = uploadedImages[id];
          const urls = staged ? await uploadProofFiles(BUCKET, id, staged) : [];
          const imageUrl = urls[0] || item.image_url || null;
          const imageUrls = urls.length ? urls : imageUrl ? [imageUrl] : null;
          const location = imageLocationData[id] || item.image_location_data || null;
          const isExtend = item.status === "extend";
          const submittedAt = item.submission_timestamp || nowIST();

          // A newer submission supersedes any earlier extension notice.
          await supabase
            .from("delegation_done")
            .update({ admin_done: true })
            .eq("task_id", id)
            .eq("status", "extend")
            .not("admin_done", "is", true);

          const { error: insertError } = await supabase.from("delegation_done").insert([
            {
              task_id: id,
              name: item.name ?? task?.name ?? null,
              department: item.department || task?.department || null,
              given_by: item.given_by || task?.given_by || null,
              task_description: item.task_description ?? task?.task_description ?? null,
              task_start_date: item.task_start_date || null,
              planned_date: item.planned_date || null,
              status: item.status,
              next_extend_date: item.next_extend_date || null,
              reason: item.reason || null,
              duration: item.duration || null,
              image_url: imageUrl,
              image_urls: imageUrls,
              image_location_data: location,
              require_attachment: item.require_attachment ?? null,
              audio_url: item.audio_url ?? task?.audio_url ?? null,
              instruction_attachment_url: task?.instruction_attachment_url ?? null,
              instruction_attachment_type: task?.instruction_attachment_type ?? null,
              submission_date: submittedAt,
              admin_done: false,
            },
          ]);
          if (insertError) throw insertError;

          const updates = {
            status: item.status,
            remark: item.reason || null,
            admin_done: false,
          };
          if (task?.color_code_for !== undefined && task?.color_code_for !== null) {
            updates.color_code_for = (Number(task.color_code_for) || 0) + 1;
          }
          if (isExtend) {
            updates.submission_date = null;
            updates.next_extend_date = item.next_extend_date || null;
            const nextPlanned = toLocalTimestamp(item.next_extend_date);
            if (nextPlanned) updates.planned_date = nextPlanned;
          } else {
            updates.submission_date = submittedAt;
            updates.rejection_reason = null;
            if (imageUrl) updates.image = imageUrl;
            if (imageUrls) updates.image_urls = imageUrls;
            if (location) updates.image_location_data = location;
          }
          const { error: updateError } = await supabase
            .from("delegation")
            .update(updates)
            .eq("task_id", id);
          if (updateError) throw updateError;

          results.push({ id, status: "success" });
        } catch (err) {
          console.error(`Delegation submit failed for task ${id}:`, err);
          results.push({ id, status: "error", error: err?.message || String(err) });
        }
      }
      return results;
    } catch (err) {
      return rejectWithValue(err?.message || "Submission failed");
    }
  },
);

// ── Admin approval (AdminApprovalPage.jsx) ─────────────────────────────────

// Snapshots awaiting review, newest first, plus AllTasks submissions that
// have no snapshot (synthetic ids).
export const fetchPendingApprovals = async () => {
  const snapshots = await fetchAllRows(() =>
    supabase
      .from("delegation_done")
      .select("*")
      .not("admin_done", "is", true)
      .in("status", ["done", "extend", "yes", "pending"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  );
  const covered = new Set(snapshots.map((r) => String(r.task_id)));

  const direct = await fetchAllRows(() =>
    supabase
      .from("delegation")
      .select("*")
      .not("submission_date", "is", null)
      .not("admin_done", "is", true)
      .neq("status", "rejected")
      .order("submission_date", { ascending: false }),
  );

  return [
    ...snapshots.map((r) => ({ ...r, submission_timestamp: r.submission_date })),
    ...direct
      .filter((r) => !covered.has(String(r.task_id)))
      .map(syntheticFromTask),
  ];
};

// Approved or rejected submissions, newest first.
export const fetchDelegationHistory = async () => {
  const { data: snapshots, error } = await supabase
    .from("delegation_done")
    .select("*")
    .or("admin_done.eq.true,status.eq.rejected")
    .order("updated_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  const covered = new Set((snapshots || []).map((r) => String(r.task_id)));

  const { data: direct, error: directError } = await supabase
    .from("delegation")
    .select("*")
    .eq("admin_done", true)
    .order("updated_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (directError) throw directError;

  const when = (r) => new Date(r.admin_approval_date || r.updated_at || r.created_at || 0).getTime();
  return [
    ...(snapshots || []),
    ...(direct || [])
      .filter((r) => !covered.has(String(r.task_id)))
      .map(syntheticFromTask),
  ].sort((a, b) => when(b) - when(a));
};

// Approve a submission: { id (snapshot or synthetic), status: "done", taskId }.
export const updateDelegationDoneStatus = createAsyncThunk(
  "delegation/approve",
  async ({ id, status = "done", taskId } = {}) => {
    const approval = {
      admin_done: true,
      admin_approved_by: currentUserName() || "Admin",
      admin_approval_date: nowIST(),
      rejection_reason: null,
    };
    let resolvedTaskId = taskId ?? taskIdFromSynthetic(id);

    const snapshotId = snapshotIdOf(id);
    if (snapshotId !== null) {
      const { data, error } = await supabase
        .from("delegation_done")
        .update({ ...approval, status })
        .eq("id", snapshotId)
        .select();
      if (error) throw error;
      resolvedTaskId = resolvedTaskId ?? data?.[0]?.task_id ?? null;
    }

    if (resolvedTaskId !== null && resolvedTaskId !== undefined) {
      // Earlier extension notices for the same task are settled too.
      const { error: noticeError } = await supabase
        .from("delegation_done")
        .update({ admin_done: true })
        .eq("task_id", resolvedTaskId)
        .eq("status", "extend")
        .not("admin_done", "is", true);
      if (noticeError) throw noticeError;

      const { error } = await supabase
        .from("delegation")
        .update({ ...approval, status })
        .eq("task_id", resolvedTaskId);
      if (error) throw error;
    }
    return { id, status, taskId: resolvedTaskId };
  },
);

// Reject a submission: the task drops back into the doer's pending list
// (submission_date cleared) carrying the reason in `remark`.
export const rejectDelegationTask = async (id, taskId, reason) => {
  const resolvedTaskId = taskId ?? taskIdFromSynthetic(id);
  const snapshotId = snapshotIdOf(id);
  if (snapshotId !== null) {
    const { error } = await supabase
      .from("delegation_done")
      .update({ status: "rejected", rejection_reason: reason, admin_done: false })
      .eq("id", snapshotId);
    if (error) throw error;
  }
  if (resolvedTaskId !== null && resolvedTaskId !== undefined) {
    const { error } = await supabase
      .from("delegation")
      .update({
        status: "rejected",
        rejection_reason: reason,
        remark: reason,
        submission_date: null,
        admin_done: false,
      })
      .eq("task_id", resolvedTaskId);
    if (error) throw error;
  }
  return { id, taskId: resolvedTaskId };
};
