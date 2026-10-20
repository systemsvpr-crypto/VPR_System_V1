// Read-only data layer for the checklist module's Dashboard, its staff
// tables and the MIS report. It owns no tables — it reads checklist,
// delegation (and maintenance_tasks / repair_tasks when a page asks for those
// types), checklist_users and checklist_departments.
//
// The status buckets match what the pages display (Dashboard.jsx,
// TaskDetailsModal.jsx, StaticsCard.jsx), all keyed on planned_date — the
// occurrence's due date, a zone-less local wall-clock `timestamp`:
//   total ("Analyzed")    planned_date before tomorrow (everything up to today)
//   completed ("Done")    …and submitted (submission_date set / status yes; for
//                         delegation also status done or admin_done)
//   pending ("Due Today") planned_date today, not completed
//   overdue               planned_date before today, not completed
//
// Every query is scoped to the current user the way the pages expect:
// ADMINISTRATOR / admin see everything, HOD / div_admin only their allowed
// departments (+ divisions) from utils/roleUtils, everyone else only the rows
// whose doer is them (localStorage "user-name").
import supabase from "../../SupabaseClient";
import {
  isAdminOrSuperAdmin,
  getUserAllowedDepartments,
} from "../../utils/roleUtils";
import {
  fetchAllRows,
  fetchRowRange,
  currentRole,
  currentUserName,
  localDateString,
} from "./taskApiUtils";

// ─────────────────────────────────────────────────────────────────────────
// Table descriptions per dashboard type
// ─────────────────────────────────────────────────────────────────────────
const CHECKLIST_DONE = "submission_date.not.is.null,status.eq.yes";
const CHECKLIST_OPEN = "status.is.null,status.neq.yes";
const DELEGATION_DONE =
  "submission_date.not.is.null,status.in.(yes,done),admin_done.is.true";
const DELEGATION_OPEN = "status.is.null,status.not.in.(yes,done)";
const WORK_ORDER_DONE =
  "submission_date.not.is.null,status.ilike.yes,status.ilike.*done*,status.ilike.*completed*,status.ilike.*approved*";
const WORK_ORDER_OPEN =
  "status.is.null,and(status.not.ilike.yes,status.not.ilike.*done*,status.not.ilike.*completed*,status.not.ilike.*approved*)";

const TABLES = {
  checklist: {
    type: "checklist",
    table: "checklist",
    name: "name",
    givenBy: "given_by",
    zoned: false,
    doneOr: CHECKLIST_DONE,
    openOr: CHECKLIST_OPEN,
    statSelect: "id,name,department,planned_date,submission_date,status,admin_done",
  },
  delegation: {
    type: "delegation",
    table: "delegation",
    name: "name",
    givenBy: "given_by",
    zoned: false,
    doneOr: DELEGATION_DONE,
    openOr: DELEGATION_OPEN,
    openAdminDone: true,
    statSelect: "id,name,department,planned_date,submission_date,status,admin_done",
  },
  maintenance: {
    type: "maintenance",
    table: "maintenance_tasks",
    name: "name",
    givenBy: "given_by",
    zoned: false,
    doneOr: WORK_ORDER_DONE,
    openOr: WORK_ORDER_OPEN,
    statSelect: "id,name,department,planned_date,submission_date,status",
  },
  repair: {
    type: "repair",
    table: "repair_tasks",
    name: "assigned_person",
    givenBy: "filled_by",
    zoned: true, // planned_date is timestamptz here
    doneOr: WORK_ORDER_DONE,
    openOr: WORK_ORDER_OPEN,
    statSelect: "id,assigned_person,department,planned_date,submission_date,status",
  },
};

const tableFor = (dashboardType) =>
  TABLES[String(dashboardType || "").toLowerCase()] || TABLES.checklist;

// ─────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────
const isSet = (v) =>
  v !== undefined && v !== null && String(v).trim() !== "" && v !== "all";

const pad = (n) => String(n).padStart(2, "0");

// "+05:30"-style offset of the browser's zone, for timestamptz columns.
const localOffset = () => {
  const mins = -new Date().getTimezoneOffset();
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const addDays = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return localDateString(new Date(y, m - 1, d + days));
};

// Local midnight of a YYYY-MM-DD day, in the column's literal format.
const dayStart = (cfg, ymd) =>
  `${ymd}T00:00:00${cfg.zoned ? localOffset() : ""}`;

const toYmd = (value) => {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? "" : localDateString(d);
};

const minYmd = (a, b) => (a <= b ? a : b);

// Applies all collected `or` groups as ONE `or` param — several groups are
// AND-ed through a nested and(or(…),or(…)) so no param is ever repeated.
const applyOrGroups = (query, groups) => {
  if (groups.length === 0) return query;
  if (groups.length === 1) return query.or(groups[0]);
  return query.or(`and(${groups.map((g) => `or(${g})`).join(",")})`);
};

const roleInfo = () => {
  const role = currentRole();
  const user = currentUserName();
  const isAdmin = isAdminOrSuperAdmin(role, user);
  const scoped = role === "hod" || role === "div_admin";
  return { role, user, isAdmin, scoped };
};

// ─────────────────────────────────────────────────────────────────────────
// Core task query builder (returns a FRESH builder every call)
// ─────────────────────────────────────────────────────────────────────────
// opts:
//   select, count            — column list / head-only exact count
//   staff, department, division, assignFrom — page filters ("all" = none)
//   gte, lt                  — YYYY-MM-DD day bounds on planned_date
//                              (gte = from that day's start, lt = before it)
//   bucket                   — "completed" | "open" | undefined
//   order                    — "asc" | "desc" | undefined
const buildTaskQuery = (cfg, opts = {}) => {
  let q = supabase
    .from(cfg.table)
    .select(
      opts.select || "*",
      opts.count ? { count: "exact", head: true } : undefined,
    );
  const ors = [];

  // Current-user scope
  const { user, isAdmin, scoped } = roleInfo();
  if (!isAdmin) {
    if (scoped) {
      const depts = getUserAllowedDepartments();
      if (depts.length > 0) q = q.in("department", depts);
    } else {
      q = q.eq(cfg.name, user || "");
    }
  }

  // Page filters
  if (isSet(opts.staff)) q = q.eq(cfg.name, opts.staff);
  if (isSet(opts.department)) q = q.eq("department", opts.department);
  if (isSet(opts.assignFrom)) q = q.eq(cfg.givenBy, opts.assignFrom);

  // Date window on planned_date
  if (opts.gte) q = q.gte("planned_date", dayStart(cfg, opts.gte));
  if (opts.lt) q = q.lt("planned_date", dayStart(cfg, opts.lt));

  // Status bucket
  if (opts.bucket === "completed") {
    ors.push(cfg.doneOr);
  } else if (opts.bucket === "open") {
    q = q.is("submission_date", null);
    ors.push(cfg.openOr);
    if (cfg.openAdminDone) q = q.not("admin_done", "is", true);
  }

  q = applyOrGroups(q, ors);

  if (opts.order) {
    q = q
      .order("planned_date", { ascending: opts.order === "asc", nullsFirst: false })
      .order("id", { ascending: opts.order === "asc" });
  }
  return q;
};

const countTasks = async (cfg, opts) => {
  try {
    const { count, error } = await buildTaskQuery(cfg, { ...opts, count: true });
    if (error) {
      console.warn("countTasks query warning:", error?.message || error);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn("countTasks exception:", err?.message || err);
    return 0;
  }
};

// Window + bucket for each Dashboard statistic (see header comment).
const bucketWindow = (bucket) => {
  const today = localDateString();
  const tomorrow = addDays(today, 1);
  switch (bucket) {
    case "completed":
      return { lt: tomorrow, bucket: "completed" };
    case "pending":
      return { gte: today, lt: tomorrow, bucket: "open" };
    case "overdue":
      return { lt: today, bucket: "open" };
    case "total":
    default:
      return { lt: tomorrow };
  }
};

// Count for one Dashboard card. Used by the dashboard slice thunks.
// filters: { dashboardType, staffFilter, departmentFilter, divisionFilter,
//            assignFromFilter }
export const countDashboardTasksApi = async (bucket, filters = {}) => {
  const cfg = tableFor(filters.dashboardType);
  return countTasks(cfg, {
    staff: filters.staffFilter,
    department: filters.departmentFilter,
    division: filters.divisionFilter,
    assignFrom: filters.assignFromFilter,
    ...bucketWindow(bucket),
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Task lists (Dashboard.jsx, TaskNavigationTab.jsx)
// ─────────────────────────────────────────────────────────────────────────
// taskView: "recent" (due today, any state) | "upcoming" (due after today,
// not completed, earliest first) | "overdue" (due before today, not
// completed) | anything else = every occurrence due up to today.
const viewWindow = (taskView) => {
  const today = localDateString();
  const tomorrow = addDays(today, 1);
  switch (taskView) {
    case "recent":
      return { gte: today, lt: tomorrow, order: "asc" };
    case "upcoming":
      return { gte: tomorrow, bucket: "open", order: "asc" };
    case "overdue":
      return { lt: today, bucket: "open", order: "desc" };
    default:
      return { lt: tomorrow, order: "desc" };
  }
};

// Optional explicit YYYY-MM-DD bounds narrow (never widen) the view window.
const narrowWindow = (win, startDate, endDate) => {
  const out = { ...win };
  const s = toYmd(startDate);
  const e = toYmd(endDate);
  if (s && (!out.gte || s > out.gte)) out.gte = s;
  if (e) {
    const endExclusive = addDays(e, 1);
    if (!out.lt || endExclusive < out.lt) out.lt = endExclusive;
  }
  return out;
};

/**
 * Raw task rows for the dashboard (select *), one page at a time.
 * fetchDashboardDataApi(dashboardType, staffFilter, page, limit, taskView,
 *   departmentFilter, startDate, endDate, assignFromFilter, divisionFilter)
 * → Array of rows.
 */
export const fetchDashboardDataApi = async (
  dashboardType = "checklist",
  staffFilter = "all",
  page = 1,
  limit = 50,
  taskView = "recent",
  departmentFilter = "all",
  startDate = null,
  endDate = null,
  assignFromFilter = "all",
  divisionFilter = "all",
) => {
  const cfg = tableFor(dashboardType);
  const size = Math.max(1, Number(limit) || 50);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;
  const win = narrowWindow(viewWindow(taskView), startDate, endDate);
  return fetchRowRange(
    () =>
      buildTaskQuery(cfg, {
        staff: staffFilter,
        department: departmentFilter,
        division: divisionFilter,
        assignFrom: assignFromFilter,
        ...win,
      }),
    from,
    size,
  );
};

/**
 * Number of rows fetchDashboardDataApi would return across all pages.
 * getDashboardDataCount(dashboardType, staffFilter, taskView,
 *   departmentFilter, assignFromFilter, divisionFilter) → number
 */
export const getDashboardDataCount = async (
  dashboardType = "checklist",
  staffFilter = "all",
  taskView = "recent",
  departmentFilter = "all",
  assignFromFilter = "all",
  divisionFilter = "all",
) => {
  const cfg = tableFor(dashboardType);
  const { order, ...win } = viewWindow(taskView);
  return countTasks(cfg, {
    staff: staffFilter,
    department: departmentFilter,
    division: divisionFilter,
    assignFrom: assignFromFilter,
    ...win,
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Date-range filter (Dashboard header's "Date Range", checklist only)
// ─────────────────────────────────────────────────────────────────────────
const rangeWindow = (startDate, endDate, statusFilter) => {
  const today = localDateString();
  const tomorrow = addDays(today, 1);
  const start = toYmd(startDate);
  const endExclusive = toYmd(endDate) ? addDays(toYmd(endDate), 1) : tomorrow;
  const win = { gte: start || undefined, lt: endExclusive };
  switch (statusFilter) {
    case "completed":
      return { ...win, lt: minYmd(endExclusive, tomorrow), bucket: "completed" };
    case "pending":
      return {
        gte: start && start > today ? start : today,
        lt: minYmd(endExclusive, tomorrow),
        bucket: "open",
      };
    case "overdue":
      return { ...win, lt: minYmd(endExclusive, today), bucket: "open" };
    default:
      return win;
  }
};

/**
 * Checklist rows whose planned_date falls in [startDate, endDate] (inclusive
 * YYYY-MM-DD days), earliest first.
 * fetchChecklistDataByDateRangeApi(startDate, endDate, staffFilter,
 *   departmentFilter, page, limit, statusFilter, assignFromFilter) → rows
 * statusFilter: "all" | "completed" | "pending" | "overdue".
 */
export const fetchChecklistDataByDateRangeApi = async (
  startDate,
  endDate,
  staffFilter = "all",
  departmentFilter = "all",
  page = 1,
  limit = 1000,
  statusFilter = "all",
  assignFromFilter = "all",
) => {
  const cfg = TABLES.checklist;
  const size = Math.max(1, Number(limit) || 1000);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;
  const win = rangeWindow(startDate, endDate, statusFilter);
  if (win.gte && win.lt && win.gte >= win.lt) return [];
  return fetchRowRange(
    () =>
      buildTaskQuery(cfg, {
        staff: staffFilter,
        department: departmentFilter,
        assignFrom: assignFromFilter,
        ...win,
        order: "asc",
      }),
    from,
    size,
  );
};

/**
 * Card figures for a checklist date range, counted up to today like the
 * un-filtered cards.
 * getChecklistDateRangeStatsApi(startDate, endDate, staffFilter,
 *   departmentFilter, assignFromFilter)
 * → { totalTasks, completedTasks, pendingTasks, overdueTasks, completionRate }
 */
export const getChecklistDateRangeStatsApi = async (
  startDate,
  endDate,
  staffFilter = "all",
  departmentFilter = "all",
  assignFromFilter = "all",
) => {
  const cfg = TABLES.checklist;
  const base = {
    staff: staffFilter,
    department: departmentFilter,
    assignFrom: assignFromFilter,
  };
  const today = localDateString();
  const tomorrow = addDays(today, 1);
  const start = toYmd(startDate);
  const endExclusive = minYmd(
    toYmd(endDate) ? addDays(toYmd(endDate), 1) : tomorrow,
    tomorrow,
  );

  const empty = {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    completionRate: 0,
  };
  if (start && start >= endExclusive) return empty;

  const count = (win) => {
    if (win.gte && win.lt && win.gte >= win.lt) return Promise.resolve(0);
    return countTasks(cfg, { ...base, ...win });
  };

  const [totalTasks, completedTasks, pendingTasks, overdueTasks] =
    await Promise.all([
      count({ gte: start || undefined, lt: endExclusive }),
      count({ gte: start || undefined, lt: endExclusive, bucket: "completed" }),
      count({
        gte: start && start > today ? start : today,
        lt: endExclusive,
        bucket: "open",
      }),
      count({
        gte: start || undefined,
        lt: minYmd(endExclusive, today),
        bucket: "open",
      }),
    ]);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate:
      totalTasks > 0
        ? Number(((completedTasks / totalTasks) * 100).toFixed(1))
        : 0,
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Users / departments
// ─────────────────────────────────────────────────────────────────────────
const isActiveUser = (u) =>
  u && u.user_name && String(u.status || "").toLowerCase() !== "inactive";

const fetchActiveUsers = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from("checklist_users")
      .select("*")
      .order("user_name", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows.filter(isActiveUser);
};

/**
 * Active checklist_users, optionally in one department. Admin-type roles
 * count everyone; HOD / div_admin their allowed departments; users count 1.
 * getTotalUsersCountApi(departmentFilter?) → number
 */
export const getTotalUsersCountApi = async (departmentFilter = "all") => {
  try {
    const { user, isAdmin, scoped } = roleInfo();
    let q = supabase
      .from("checklist_users")
      .select("id", { count: "exact", head: true })
      .not("status", "ilike", "inactive");

    if (isSet(departmentFilter)) q = q.eq("department", departmentFilter);
    if (!isAdmin) {
      if (scoped) {
        const depts = getUserAllowedDepartments();
        if (depts.length > 0) q = q.in("department", depts);
      } else {
        q = q.eq("user_name", user || "");
      }
    }

    const { count, error } = await q;
    if (error) {
      console.warn("getTotalUsersCountApi warning:", error?.message || error);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn("getTotalUsersCountApi exception:", err?.message || err);
    return 0;
  }
};

/**
 * Departments for the Dashboard filter.
 * Active own godowns only (VPR locations); transporter rows are excluded.
 * getUniqueDepartmentsApi() → [{ name, id, given_by }]
 */
export const getUniqueDepartmentsApi = async () => {
  const seen = new Set();
  const out = [];

  try {
    const { data: godowns, error } = await supabase
      .from("godowns")
      .select("godown_id, name, is_active, godown_type")
      .order("name", { ascending: true });
    if (!error && Array.isArray(godowns)) {
      for (const g of godowns) {
        if (g.is_active === false) continue;
        if ((g.godown_type || "Own") !== "Own") continue;
        const name = String(g.name || "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, id: g.godown_id, given_by: null });
      }
    }
  } catch (err) {
    console.warn("getUniqueDepartmentsApi godowns warning:", err?.message || err);
  }

  // 2. Also include any custom entries from checklist_departments as fallback
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from("checklist_departments")
        .select("id,department,given_by")
        .order("department", { ascending: true }),
    );
    for (const r of rows || []) {
      const name = String(r.department || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, id: r.id, given_by: r.given_by || null });
    }
  } catch (_) {}

  // 3. Also include departments assigned to users as fallback
  try {
    const users = await fetchActiveUsers();
    for (const u of users) {
      const depts = userDepartments(u);
      for (const d of depts) {
        const name = String(d || "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, given_by: null });
      }
    }
  } catch (_) {}

  return out.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Active staff names (checklist_users.user_name), in `department` when given,
 * otherwise everyone the current user may see.
 * getStaffNamesByDepartmentApi(department | null) → string[]
 */
export const getStaffNamesByDepartmentApi = async (department = null) => {
  const { user, isAdmin, scoped } = roleInfo();
  let users = await fetchActiveUsers();

  if (isSet(department)) {
    const d = String(department).trim().toLowerCase();
    users = users.filter(
      (u) => String(u.department || "").trim().toLowerCase() === d,
    );
  } else if (!isAdmin) {
    if (scoped) {
      const depts = getUserAllowedDepartments().map((x) => x.toLowerCase());
      if (depts.length > 0)
        users = users.filter((u) =>
          depts.includes(String(u.department || "").trim().toLowerCase()),
        );
    } else {
      users = users.filter((u) => u.user_name === user);
    }
  }

  return [...new Set(users.map((u) => u.user_name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Staff performance (StaffTaskTable.jsx, MisReport.jsx)
// ─────────────────────────────────────────────────────────────────────────
const isRowCompleted = (cfg, row) => {
  const status = String(row.status || "").toLowerCase();
  if (row.submission_date) return true;
  if (cfg.type === "checklist") return status === "yes";
  if (cfg.type === "delegation")
    return status === "yes" || status === "done" || row.admin_done === true;
  return (
    status === "yes" ||
    status.includes("done") ||
    status.includes("completed") ||
    status.includes("approved")
  );
};

// "YYYY-MM" → planned_date window for the full month; no month = all up to today.
const monthWindow = (selectedMonth) => {
  const tomorrow = addDays(localDateString(), 1);
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(selectedMonth || "").trim());
  if (!m) return { lt: tomorrow };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const first = `${y}-${pad(mo)}-01`;
  const next = localDateString(new Date(y, mo, 1));
  return { gte: first, lt: next };
};

const slug = (s) =>
  String(s || "unassigned").trim().toLowerCase().replace(/\s+/g, "-");

// Short-lived memo so paging through the staff table (and the matching
// count call) re-uses one aggregation instead of re-reading every row.
const STAFF_CACHE_TTL_MS = 30000;
const staffCache = new Map();

const aggregateStaff = async ({
  dashboardType,
  staffFilter,
  departmentFilter,
  selectedMonth,
  assignFromFilter,
  sortBy,
}) => {
  const cfg = tableFor(dashboardType);
  const { role, user, isAdmin, scoped } = roleInfo();
  const key = JSON.stringify([
    cfg.type,
    staffFilter,
    departmentFilter,
    selectedMonth,
    assignFromFilter,
    sortBy,
    role,
    user,
    localDateString(),
  ]);
  const hit = staffCache.get(key);
  if (hit && Date.now() - hit.at < STAFF_CACHE_TTL_MS) return hit.promise;

  const promise = (async () => {
    const win = monthWindow(selectedMonth);
    const [rows, users] = await Promise.all([
      fetchAllRows(() =>
        buildTaskQuery(cfg, {
          select: cfg.statSelect,
          staff: staffFilter,
          department: departmentFilter,
          assignFrom: assignFromFilter,
          ...win,
        }).order("id", { ascending: true }),
      ),
      fetchActiveUsers(),
    ]);

    const userByName = new Map(
      users.map((u) => [String(u.user_name).trim().toLowerCase(), u]),
    );

    // Determine which active users are visible for the current role and filters
    let visibleUsers = [...users];

    if (isSet(staffFilter)) {
      const sf = String(staffFilter).trim().toLowerCase();
      visibleUsers = visibleUsers.filter(
        (u) => String(u.user_name || "").trim().toLowerCase() === sf,
      );
    }

    if (isSet(departmentFilter)) {
      const df = String(departmentFilter).trim().toLowerCase();
      visibleUsers = visibleUsers.filter(
        (u) => String(u.department || "").trim().toLowerCase() === df,
      );
    }

    if (!isAdmin) {
      if (scoped) {
        const depts = getUserAllowedDepartments().map((x) => x.toLowerCase());
        if (depts.length > 0) {
          visibleUsers = visibleUsers.filter((u) =>
            depts.includes(String(u.department || "").trim().toLowerCase()),
          );
        }
      } else {
        const un = String(user || "").trim().toLowerCase();
        visibleUsers = visibleUsers.filter(
          (u) => String(u.user_name || "").trim().toLowerCase() === un,
        );
      }
    }

    // Ensure the logged-in regular user is represented even if absent from active checklist_users
    if (!isAdmin && !scoped && visibleUsers.length === 0 && user) {
      visibleUsers.push({
        id: "current-user",
        user_name: user,
        department: "",
      });
    }

    const byName = new Map();

    for (const u of visibleUsers) {
      const k = String(u.user_name || "").trim().toLowerCase();
      if (!k) continue;
      byName.set(k, {
        user: u,
        name: u.user_name,
        taskDepartment: u.department || "",
        total: 0,
        completed: 0,
        onTime: 0,
        overdue: 0,
        dueToday: 0,
        upcoming: 0,
      });
    }

    for (const row of rows) {
      const name = String(row[cfg.name] || "").trim();
      if (!name) continue;
      const k = name.toLowerCase();
      if (!byName.has(k)) {
        if (!isAdmin && !scoped && k !== String(user || "").trim().toLowerCase()) {
          continue;
        }
        if (scoped) {
          const depts = getUserAllowedDepartments().map((x) => x.toLowerCase());
          const rowDept = String(row.department || "").trim().toLowerCase();
          if (depts.length > 0 && !depts.includes(rowDept)) {
            continue;
          }
        }
        if (isSet(staffFilter) && k !== String(staffFilter).trim().toLowerCase()) {
          continue;
        }
        if (
          isSet(departmentFilter) &&
          String(row.department || "").trim().toLowerCase() !==
            String(departmentFilter).trim().toLowerCase()
        ) {
          continue;
        }
        const u = userByName.get(k);
        byName.set(k, {
          user: u,
          name: u?.user_name || name,
          taskDepartment: row.department || u?.department || "",
          total: 0,
          completed: 0,
          onTime: 0,
          overdue: 0,
          dueToday: 0,
          upcoming: 0,
        });
      }
      const s = byName.get(k);
      s.total++;
      if (row.department && !s.taskDepartment) {
        s.taskDepartment = row.department;
      }
      const planned = toYmd(row.planned_date);
      if (isRowCompleted(cfg, row)) {
        s.completed++;
        const submittedAt = row.submission_date
          ? new Date(row.submission_date)
          : null;
        const submitted =
          submittedAt && !isNaN(submittedAt) ? localDateString(submittedAt) : "";
        if (submitted && planned && submitted <= planned) {
          s.onTime++;
        } else if (!submitted && planned && planned >= localDateString()) {
          s.onTime++;
        }
      } else if (planned && planned < localDateString()) {
        s.overdue++;
      } else if (planned && planned === localDateString()) {
        s.dueToday++;
      } else {
        s.upcoming++;
      }
    }

    let list = Array.from(byName.values());
    if (isSet(assignFromFilter)) {
      list = list.filter((s) => s.total > 0);
    }

    const resultList = list.map((s) => {
      const pending = Math.max(0, s.total - s.completed);
      const score = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      const u = s.user;
      return {
        id: `${slug(s.name)}-${u?.id ?? "na"}`,
        user_id: u?.id ?? null,
        name: s.name,
        email: u?.email_id || "",
        department: s.taskDepartment || u?.department || "-",
        division: u?.division || null,
        designation: u?.Designation || u?.designation || null,
        profile_image: u?.profile_image || null,
        // StaffTaskTable.jsx field names
        total_tasks: s.total,
        total_completed_tasks: s.completed,
        total_pending_tasks: pending,
        total_upcoming_tasks: s.upcoming,
        total_overdue_tasks: s.overdue,
        total_due_today_tasks: s.dueToday,
        total_done_on_time: s.onTime,
        completion_score: score,
        on_time_score:
          s.total > 0 ? Math.round((s.onTime / s.total) * 100) : 0,
        // MisReport.jsx field names
        totalTasks: s.total,
        completedTasks: s.completed,
        pendingTasks: pending,
        overdueTasks: s.overdue,
        progress: score,
      };
    });

    if (sortBy === "name") {
      resultList.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      resultList.sort(
        (a, b) =>
          b.completion_score - a.completion_score ||
          b.total_tasks - a.total_tasks ||
          a.name.localeCompare(b.name),
      );
    }
    return resultList;
  })();

  staffCache.set(key, { at: Date.now(), promise });
  promise.catch(() => staffCache.delete(key));
  return promise;
};

// Two call shapes exist:
//   StaffTaskTable: (type, staff, department, page, limit, month, assignFrom)
//   MisReport:      (type, staff, page, limit)        — page is a number
const normalizeStaffArgs = (args) => {
  const [dashboardType, staffFilter, third, ...rest] = args;
  if (typeof third === "number") {
    const [limit] = rest;
    return {
      dashboardType,
      staffFilter,
      departmentFilter: "all",
      page: third,
      limit,
      selectedMonth: "",
      assignFromFilter: "all",
      sortBy: "name", // keeps checklist & delegation pages aligned for merging
    };
  }
  const [page, limit, selectedMonth, assignFromFilter] = rest;
  return {
    dashboardType,
    staffFilter,
    departmentFilter: third,
    page,
    limit,
    selectedMonth,
    assignFromFilter,
    sortBy: "score",
  };
};

/**
 * Per-staff task summary for one task type, best performers first (the MIS
 * report's short form sorts by name).
 * fetchStaffTasksDataApi(dashboardType, staffFilter, departmentFilter, page,
 *   limit, selectedMonth "YYYY-MM", assignFromFilter)
 * fetchStaffTasksDataApi(dashboardType, staffFilter, page, limit)
 * → [{ id, name, email, department, profile_image, total_tasks,
 *      total_completed_tasks, total_done_on_time, completion_score,
 *      totalTasks, completedTasks, pendingTasks, progress, … }]
 */
export const fetchStaffTasksDataApi = async (...args) => {
  const opts = normalizeStaffArgs(args);
  const list = await aggregateStaff(opts);
  const size = Math.max(1, Number(opts.limit) || 50);
  const from = (Math.max(1, Number(opts.page) || 1) - 1) * size;
  return list.slice(from, from + size);
};

/**
 * Number of staff with at least one task for the same filters.
 * getStaffTasksCountApi(dashboardType, staffFilter, departmentFilter,
 *   selectedMonth, assignFromFilter) — or (dashboardType, staffFilter).
 */
export const getStaffTasksCountApi = async (...args) => {
  const [
    dashboardType = "checklist",
    staffFilter = "all",
    departmentFilter = "all",
    selectedMonth = "",
    assignFromFilter = "all",
  ] = args;
  const list = await aggregateStaff({
    dashboardType,
    staffFilter,
    departmentFilter,
    selectedMonth,
    assignFromFilter,
    // same cache key as the matching fetchStaffTasksDataApi call shape
    sortBy: args.length <= 2 ? "name" : "score",
  });
  return list.length;
};
