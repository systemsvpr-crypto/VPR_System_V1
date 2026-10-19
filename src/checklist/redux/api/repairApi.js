// Data access for repair_tasks — one row per breakdown ticket raised from
// RepairTask.jsx (filled_by = who reported it, assigned_person = who fixes
// it). Unlike maintenance there is no schedule: a ticket is "pending" while
// submission_date is null, gets worked through interim statuses (Under
// Observation, Temporary Fix...) without leaving that queue, and is only
// submitted for admin approval once it reaches a final status (Completed /
// Done / Cancelled). Approve sets admin_done; reject sends it back to the
// doer's queue with status 'rejected' + rejection_reason.
//
// Note: `repair` in this module is the storage bucket for work photos and
// bill copies (AllTasks.jsx uploads there) — there is no `repair` table.
import supabase from "../../SupabaseClient";
import { fetchAllRows } from "./taskApiUtils";

const TABLE = "repair_tasks";
export const REPAIR_PAGE_SIZE = 100;

export const nowIST = () =>
  new Date(Date.now() + 330 * 60000).toISOString().replace("Z", "+05:30");

const readLocal = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

// Plain users see only tickets assigned to them; other roles see all.
const scopeToCurrentUser = (query) => {
  const role = readLocal("role").toLowerCase();
  const user = readLocal("user-name");
  if (role === "user" && user) return query.eq("assigned_person", user);
  return query;
};

// Status labels carry emoji + Hindi ("✅ Completed (कार्य पूर्ण)"), so match
// on the English keyword. These end the doer's work on the ticket.
export const isFinalRepairStatus = (status) => {
  const s = String(status || "").toLowerCase();
  return (
    s.includes("complete") ||
    s === "done" ||
    s.includes("cancel") ||
    s.includes("approved")
  );
};

// The approval page reads doer/assigner from the generic `name`/`given_by`
// keys shared by every task type — alias them onto repair rows.
const withGenericKeys = (row) => ({
  ...row,
  name: row.name ?? row.assigned_person,
  given_by: row.given_by ?? row.filled_by,
  task_description: row.task_description ?? row.issue_description,
});

// ── Lists (slice thunks) ───────────────────────────────────────────────────

export const fetchRepairDataApi = async ({ page = 1, pageSize = REPAIR_PAGE_SIZE } = {}) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    let query = supabase.from(TABLE).select("*").is("submission_date", null);
    query = scopeToCurrentUser(query);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchRepairDataApi query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = (data || []).map(withGenericKeys);
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchRepairDataApi exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};

export const fetchRepairHistoryApi = async ({ page = 1, pageSize = REPAIR_PAGE_SIZE } = {}) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    let query = supabase.from(TABLE).select("*").not("submission_date", "is", null);
    query = scopeToCurrentUser(query);
    const { data, error } = await query
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchRepairHistoryApi query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = (data || []).map(withGenericKeys);
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchRepairHistoryApi exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};

// ── Ticket updates ─────────────────────────────────────────────────────────

const toAmount = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// [{ taskId, status, partReplaced, billAmount, remarks, vendorName?,
//    workPhotoUrl?, billCopyUrl? }] — AllTasks.jsx awaits this directly,
// RepairDataPage / RepairView go through the `updateRepair` thunk.
// Only keys the caller actually sent are written, so a form that has no
// vendor field (RepairDataPage) can't blank out an existing vendor_name;
// photo URLs are only written when a new file was uploaded.
// Resolves to the updated rows.
export const updateRepairData = async (items) => {
  const list = Array.isArray(items) ? items : [items];
  const results = [];
  for (const item of list) {
    if (item?.taskId === undefined || item?.taskId === null) {
      throw new Error("Repair task id is missing");
    }
    const updates = { updated_at: nowIST() };
    if (item.status !== undefined) updates.status = item.status;
    if (item.partReplaced !== undefined) updates.part_replaced = item.partReplaced || null;
    const amount = toAmount(item.billAmount);
    if (amount !== undefined) updates.bill_amount = amount;
    if (item.remarks !== undefined) updates.remarks = item.remarks || null;
    if (item.vendorName !== undefined) updates.vendor_name = item.vendorName || null;
    if (item.workPhotoUrl) updates.work_photo_url = item.workPhotoUrl;
    if (item.billCopyUrl) updates.bill_copy_url = item.billCopyUrl;

    if (item.status !== undefined) {
      if (isFinalRepairStatus(item.status)) {
        updates.submission_date = nowIST();
        updates.admin_done = false;
        updates.rejection_reason = null;
      } else {
        // Moved back to an interim status — keep it in the doer's queue.
        updates.submission_date = null;
      }
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

export const fetchPendingRepairApprovals = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from(TABLE)
      .select("*")
      .not("submission_date", "is", null)
      .or("admin_done.is.null,admin_done.eq.false")
      .order("submission_date", { ascending: false }),
  );
  return rows.map(withGenericKeys);
};

export const approveRepairTask = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      admin_done: true,
      admin_approved_by: readLocal("user-name") || "Admin",
      admin_approval_date: nowIST(),
      rejection_reason: null,
      updated_at: nowIST(),
    })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] || null;
};

export const rejectRepairTask = async (id, reason) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "rejected",
      rejection_reason: reason || null,
      admin_done: false,
      submission_date: null,
      admin_approved_by: readLocal("user-name") || "Admin",
      admin_approval_date: nowIST(),
      updated_at: nowIST(),
    })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] || null;
};

// Approval history: approved tickets plus rejected ones not yet redone.
export const fetchApprovedRepairs = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from(TABLE)
      .select("*")
      .or("admin_done.eq.true,status.eq.rejected")
      .order("admin_approval_date", { ascending: false, nullsFirst: false }),
  );
  return rows.map(withGenericKeys);
};

// ── Dashboard ──────────────────────────────────────────────────────────────

// Raw rows, newest first, one page at a time (Dashboard.jsx loops until a
// short page). Rows are returned untouched — the dashboard already falls
// back from name/given_by to assigned_person/filled_by itself.
export const fetchAllRepairTasks = async (page = 1, pageSize = 1000) => {
  try {
    const from = (Math.max(1, page) - 1) * pageSize;
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("fetchAllRepairTasks query warning:", error?.message || error);
      return { data: [], page, hasMore: false };
    }
    const rows = data || [];
    return { data: rows, page, hasMore: rows.length === pageSize };
  } catch (err) {
    console.warn("fetchAllRepairTasks exception:", err?.message || err);
    return { data: [], page, hasMore: false };
  }
};
