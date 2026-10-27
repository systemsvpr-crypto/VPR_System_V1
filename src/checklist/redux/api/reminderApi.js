// Daily to-do reminders: what each doer still has open today across
// checklist + delegation (for the To-Do strip), and the trigger for the
// WhatsApp send, which runs server-side in the checklist-daily-reminder edge
// function (also run every working morning by pg_cron) — keep the counting
// rules below in step with it.
//
// "Open today" follows the live task list (AllTasks.jsx) so the counts match
// what the doer sees there: pending occurrences planned in the last 90 days up
// to the end of today, plus extended tasks (shown as "Today" whatever their new
// date). Occurrences on a holiday are skipped, and duplicates of the same task
// on the same day count once.
import supabase from "../../SupabaseClient";
import { fetchAllRows, localDateString } from "./taskApiUtils";
import { isHighPriority, normalizePriority } from "../../utils/taskPriority";

const TABLES = ["checklist", "delegation"];
const OVERDUE_WINDOW_DAYS = 90;
const OPEN_FILTER = "submission_date.is.null,status.in.(extend,extended)";

const fetchOpenRows = (table, { from, to, userName }) =>
  fetchAllRows(() => {
    let q = supabase
      .from(table)
      .select("id, name, task_description, planned_date, status, priority")
      .or(OPEN_FILTER)
      .gte("planned_date", from)
      .order("id", { ascending: true });
    if (userName) q = q.eq("name", userName);
    return q;
  }).then((rows) =>
    rows.filter((r) => {
      const s = String(r.status || "").toLowerCase();
      return s === "extend" || s === "extended" || r.planned_date <= to;
    }),
  );

// { userName? } → [{ userName, overdue, today, urgent, high, total }] sorted
// by most open work first. Without userName, every doer with open work.
export const fetchDailyToDoSummaryApi = async ({ userName } = {}) => {
  const today = localDateString();
  const past = new Date();
  past.setDate(past.getDate() - OVERDUE_WINDOW_DAYS);
  const range = {
    from: `${localDateString(past)}T00:00:00`,
    to: `${today}T23:59:59`,
    userName,
  };

  const [holidayRows, ...tableRows] = await Promise.all([
    fetchAllRows(() => supabase.from("holidays").select("holiday_date")),
    ...TABLES.map((t) => fetchOpenRows(t, range)),
  ]);
  const holidays = new Set(
    holidayRows.map((h) => String(h.holiday_date || "").split("T")[0]),
  );

  const byUser = new Map();
  const seen = new Set();
  tableRows.flat().forEach((row) => {
    const name = String(row.name || "").trim();
    const day = String(row.planned_date || "").split("T")[0];
    if (!name || !day || holidays.has(day)) return;

    const key = `${row.task_description || ""}::${name}::${day}`;
    if (seen.has(key)) return;
    seen.add(key);

    const entry =
      byUser.get(name) ||
      { userName: name, overdue: 0, today: 0, urgent: 0, high: 0, total: 0 };
    if (day < today) entry.overdue += 1;
    else entry.today += 1;
    const priority = normalizePriority(row.priority);
    if (priority === "Urgent") entry.urgent += 1;
    else if (isHighPriority(priority)) entry.high += 1;
    entry.total += 1;
    byUser.set(name, entry);
  });

  return [...byUser.values()].sort(
    (a, b) => b.total - a.total || a.userName.localeCompare(b.userName),
  );
};

// Runs today's WhatsApp reminder now. Users already reminded today are
// skipped server-side. → { date, skippedReason?, sent, failed, alreadySent,
// noPhone, total }
export const sendDailyRemindersApi = async () => {
  const { data, error } = await supabase.functions.invoke("checklist-daily-reminder", {
    body: {},
  });
  if (error) throw new Error(error.message || "Failed to send reminders");
  if (!data?.success) throw new Error(data?.error || "Failed to send reminders");
  return data;
};
