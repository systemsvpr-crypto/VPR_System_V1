// Priority / urgency levels for checklist and delegation tasks. The DB column
// (checklist.priority, delegation.priority) is constrained to these four
// values and defaults to "Medium"; rows created before the column existed
// read as "Medium" too.

export const PRIORITY_LEVELS = ["Urgent", "High", "Medium", "Low"];
export const DEFAULT_PRIORITY = "Medium";

const RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

// Case-insensitive match onto a known level; anything else is the default.
export const normalizePriority = (value) => {
  const v = String(value || "").trim().toLowerCase();
  return PRIORITY_LEVELS.find((p) => p.toLowerCase() === v) || DEFAULT_PRIORITY;
};

export const priorityRank = (value) => RANK[normalizePriority(value)];

// Sort comparator: Urgent first, Low last.
export const comparePriority = (a, b) => priorityRank(a) - priorityRank(b);

export const isHighPriority = (value) => priorityRank(value) <= RANK.High;

export const PRIORITY_STYLES = {
  Urgent: "bg-red-100 text-red-700 border-red-300 font-bold",
  High: "bg-orange-100 text-orange-700 border-orange-300 font-bold",
  Medium: "bg-amber-100 text-amber-700 border-amber-300 font-medium",
  Low: "bg-slate-100 text-slate-600 border-slate-200 font-normal",
};
