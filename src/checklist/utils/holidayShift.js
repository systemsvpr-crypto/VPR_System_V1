
import supabase from "../SupabaseClient";

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDaysStr = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

// "2026-10-25T18:00:00" / "2026-10-25 18:00:00+00" → "18:00:00"
const timePart = (value) => {
  const m = String(value || "").match(/[T ](\d{2}:\d{2}(:\d{2})?)/);
  return m ? m[1] : "00:00:00";
};

// First date after `dateStr` that is a working day and not a holiday.
// Uses the Working Day Calendar when it covers the period; otherwise skips Sundays.
export const findNextWorkingDate = async (dateStr) => {
  const [{ data: holidayRows }, { data: workingRows }] = await Promise.all([
    supabase.from("holidays").select("holiday_date"),
    supabase
      .from("working_day_calender")
      .select("working_date")
      .gt("working_date", dateStr)
      .order("working_date", { ascending: true })
      .limit(60),
  ]);
  const holidaySet = new Set((holidayRows || []).map((h) => h.holiday_date));

  const fromCalendar = (workingRows || [])
    .map((w) => w.working_date)
    .find((d) => !holidaySet.has(d));
  if (fromCalendar) return fromCalendar;

  for (let i = 1; i <= 60; i++) {
    const candidate = addDaysStr(dateStr, i);
    const isSunday = new Date(`${candidate}T00:00:00`).getDay() === 0;
    if (!isSunday && !holidaySet.has(candidate)) return candidate;
  }
  return null;
};

// Tables holding pending occurrences. `shiftStart`: task_start_date is the
// occurrence's own date there (in `checklist` it is the series start, so it stays).
const TASK_TABLES = [
  { table: "checklist", shiftStart: false, dedupeSeries: true },
  { table: "delegation", shiftStart: true, dedupeSeries: false },
  { table: "maintenance_tasks", shiftStart: true, dedupeSeries: false },
];

const seriesKey = (r) =>
  [r.department, r.task_description, r.name].map((v) => String(v || "").trim()).join("|");

// Moves every pending task planned on `holidayDate` to the next working day.
// Completed tasks are left untouched. For recurring checklist series that
// already have an occurrence on the target day, the holiday occurrence is
// dropped instead of creating a duplicate.
export const shiftTasksOffHoliday = async (holidayDate) => {
  const targetDate = await findNextWorkingDate(holidayDate);
  if (!targetDate) throw new Error("No working day found within 60 days to shift tasks to.");

  const dayStart = `${holidayDate}T00:00:00`;
  const nextDayStart = `${addDaysStr(holidayDate, 1)}T00:00:00`;
  const summary = { targetDate, shifted: 0, merged: 0 };

  for (const { table, shiftStart, dedupeSeries } of TASK_TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("*")
      .is("submission_date", null)
      .gte("planned_date", dayStart)
      .lt("planned_date", nextDayStart);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!rows || rows.length === 0) continue;

    let existingOnTarget = new Set();
    if (dedupeSeries) {
      const { data: targetRows } = await supabase
        .from(table)
        .select("department, task_description, name")
        .gte("planned_date", `${targetDate}T00:00:00`)
        .lt("planned_date", `${addDaysStr(targetDate, 1)}T00:00:00`);
      existingOnTarget = new Set((targetRows || []).map(seriesKey));
    }

    for (const row of rows) {
      if (dedupeSeries && existingOnTarget.has(seriesKey(row))) {
        const { error: delError } = await supabase.from(table).delete().eq("id", row.id);
        if (delError) throw new Error(`${table}: ${delError.message}`);
        summary.merged++;
        continue;
      }

      const updates = { planned_date: `${targetDate}T${timePart(row.planned_date)}` };
      if (shiftStart && String(row.task_start_date || "").startsWith(holidayDate)) {
        updates.task_start_date = `${targetDate}T${timePart(row.task_start_date)}`;
      }
      const { error: updError } = await supabase.from(table).update(updates).eq("id", row.id);
      if (updError) throw new Error(`${table}: ${updError.message}`);
      summary.shifted++;
    }
  }
  return summary;
};
