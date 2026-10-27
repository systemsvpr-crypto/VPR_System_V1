// Data access behind task assignment: the Department / Assign-From / Doer
// dropdowns, and the bulk insert that turns generated occurrences into
// checklist or delegation rows.
//
// Departments come from the Settings master list (checklist_departments)
// plus whatever checklist_users work in (each user carries comma-separated
// `department`/`user_access` and `division` lists); doers come from
// checklist_users. Assign-From names come from the assign_from master list.
//
// The two "unique" dropdown helpers have two consumers each: the plain
// `fetch…Api` functions return what the dashboard/QuickTask selects render
// directly, while the redux thunks in slice/assignTaskSlice.js keep richer
// objects for the assign forms (division-aware departments, doer records
// with leave/HOD fields).
import supabase from "../../SupabaseClient";
import { chunk, toYesNo } from "./taskApiUtils";
import { normalizePriority } from "../../utils/taskPriority";

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const userDepartments = (u) => splitList(u.department || u.user_access);

const fetchActiveUsers = async () => {
  // "*" because the doer records feed the assign forms' leave/HOD filters
  // (status, leave_date, leave_end_date, reported_by, can_self_assign, …).
  try {
    const { data, error } = await supabase
      .from("checklist_users")
      .select("*")
      .order("user_name", { ascending: true });
    if (error) {
      console.warn("Checklist assignTaskApi fetchActiveUsers warning:", error?.message || error);
      return [];
    }
    return (data || []).filter(
      (u) => u.user_name && String(u.status || "").toLowerCase() !== "inactive",
    );
  } catch (err) {
    console.warn("Checklist assignTaskApi fetchActiveUsers exception:", err?.message || err);
    return [];
  }
};

// [{ department }] — departments from checklist_departments master list only.
export const fetchUniqueDepartmentDataApi = async () => {
  try {
    const seen = new Map();
    const add = (department) => {
      const dep = String(department || "").trim();
      if (!dep) return;
      const key = dep.toLowerCase();
      if (!seen.has(key)) seen.set(key, { department: dep });
    };

    // Fetch from checklist_departments master list
    const { data: depts, error: deptErr } = await supabase
      .from("checklist_departments")
      .select("department")
      .order("department", { ascending: true });
    if (deptErr) throw deptErr;
    (depts || []).forEach((d) => add(d.department));

    return [...seen.values()].sort((a, b) =>
      a.department.localeCompare(b.department),
    );
  } catch (err) {
    console.error("fetchUniqueDepartmentDataApi:", err);
    return [];
  }
};

// Sorted, de-duplicated Assign-From names: every active VPR user whose role
// is USER. Names use the same full_name → username fallback as the
// checklist_users view, so they line up with doer names.
export const fetchUniqueGivenByDataApi = async () => {
  try {
    const names = new Set();

    // 1. Fetch from assign_from table
    try {
      const { data: af, error: afError } = await supabase
        .from("assign_from")
        .select("name");
      if (!afError && Array.isArray(af)) {
        af.forEach((r) => {
          const n = String(r.name || "").trim();
          if (n) names.add(n);
        });
      }
    } catch (_) {}

    // 2. Fetch all active users from users table
    try {
      const { data, error } = await supabase
        .from("users")
        .select("full_name, username, is_active");
      if (!error && Array.isArray(data)) {
        data
          .filter((u) => u.is_active !== false)
          .forEach((u) => {
            const n =
              String(u.full_name || "").trim() ||
              String(u.username || "").trim();
            if (n) names.add(n);
          });
      }
    } catch (_) {}

    return [...names].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("fetchUniqueGivenByDataApi:", err);
    return [];
  }
};

// Active users, optionally narrowed by department and/or division.
// `filter` may be undefined, a department string, or { department, division }.
export const fetchDoerUsersApi = async (filter) => {
  const department =
    typeof filter === "string" ? filter : filter?.department || "";
  const division = typeof filter === "object" && filter ? filter.division || "" : "";
  const users = await fetchActiveUsers();
  return users.filter((u) => {
    if (
      department &&
      !userDepartments(u).some(
        (d) => d.toLowerCase() === department.trim().toLowerCase(),
      )
    )
      return false;
    if (
      division &&
      !splitList(u.division).some(
        (d) => d.toLowerCase() === division.trim().toLowerCase(),
      )
    )
      return false;
    return true;
  });
};

// Sorted doer names (plain strings — the dashboard selects render them as-is).
export const fetchUniqueDoerNameDataApi = async (filter) => {
  try {
    const users = await fetchDoerUsersApi(filter);
    return [...new Set(users.map((u) => u.user_name))].sort((a, b) =>
      a.localeCompare(b),
    );
  } catch (err) {
    console.error("fetchUniqueDoerNameDataApi:", err);
    return [];
  }
};

// ── Insert ──────────────────────────────────────────────────────────────────

const isOneTime = (frequency) => {
  const f = String(frequency || "").toLowerCase();
  return (
    !f ||
    f === "one-time" ||
    f.includes("one time") ||
    f.includes("no recurrence")
  );
};

// Form rows are camelCase ({ doer, givenBy, dueDate, originalStartDate, … });
// a few callers (BulkImportModal, QuickTask regenerate) send `description`
// instead of `task_description`. Map them onto the table's columns.
const toTaskRow = (t, table) => {
  const row = {
    name: t.doer ?? t.name ?? t.doerName ?? null,
    department: t.department ?? null,
    given_by: t.givenBy ?? t.given_by ?? null,
    task_description: t.task_description ?? t.description ?? "",
    audio_url: t.audio_url ?? null,
    instruction_attachment_url: t.instruction_attachment_url ?? null,
    instruction_attachment_type: t.instruction_attachment_type ?? null,
    frequency: t.frequency ?? null,
    duration: t.duration || null,
    enable_reminder: toYesNo(t.enableReminders ?? t.enable_reminder, "yes"),
    require_attachment: toYesNo(t.requireAttachment ?? t.require_attachment, "no"),
    // task_start_date = the admin-selected series start (same on every
    // occurrence); planned_date = this occurrence's due date.
    task_start_date: t.originalStartDate || t.task_start_date || t.dueDate || null,
    planned_date: t.dueDate || t.planned_date || t.originalStartDate || null,
    reminder_days_before: Number(t.reminderDaysBefore ?? t.reminder_days_before) || 1,
    priority: normalizePriority(t.priority),
  };
  if (t.status !== undefined) row.status = t.status;
  return row;
};

// Inserts generated occurrences and returns the inserted DB rows.
// `table` forces the target; when null, one-time tasks go to `delegation`
// and recurring ones to `checklist`.
export const insertTasksApi = async ({ tasks = [], table = null } = {}) => {
  const groups = { checklist: [], delegation: [] };
  (tasks || []).forEach((t) => {
    const target =
      table === "checklist" || table === "delegation"
        ? table
        : isOneTime(t.frequency)
          ? "delegation"
          : "checklist";
    groups[target].push(toTaskRow(t, target));
  });

  const inserted = [];
  for (const target of ["checklist", "delegation"]) {
    for (const rows of chunk(groups[target], 100)) {
      const { data, error } = await supabase.from(target).insert(rows).select();
      if (error) throw new Error(error.message || `Failed to insert ${target} tasks`);
      inserted.push(...(data || []));
    }
  }
  return inserted;
};
