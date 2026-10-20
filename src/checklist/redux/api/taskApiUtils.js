import {
  supabase,
  fetchAllRows as rawFetchAllRows,
  fetchAllRowsInChunks as rawFetchAllRowsInChunks,
} from "../../../supabase";

export const fetchAllRows = async (buildQuery) => {
  try {
    return await rawFetchAllRows(buildQuery);
  } catch (err) {
    console.warn("Checklist fetchAllRows warning (table may not exist or query failed):", err?.message || err);
    return [];
  }
};

export const fetchAllRowsInChunks = async (ids, buildQuery) => {
  try {
    return await rawFetchAllRowsInChunks(ids, buildQuery);
  } catch (err) {
    console.warn("Checklist fetchAllRowsInChunks warning:", err?.message || err);
    return [];
  }
};

// PostgREST caps a single response at 1000 rows, so a "page" bigger than that
// (QuickTask's export asks for 10000) has to be fetched as several ranges.
const MAX_ROWS_PER_REQUEST = 1000;

// Pages stamp completion/approval times as IST wall-clock with an explicit
// offset (see AllTasks.jsx) — keep the same shape so every writer agrees.
export const nowIST = () =>
  new Date(Date.now() + 330 * 60000).toISOString().replace("Z", "+05:30");

export const readLocal = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

export const currentUserName = () => readLocal("user-name");
export const currentRole = () => readLocal("role").toLowerCase();

// Plain users only ever see their own rows; every other role gets the full
// set and the pages narrow it by department/division client-side.
export const scopeToCurrentUser = (query, nameColumn = "name") => {
  const user = currentUserName();
  if (currentRole() === "user" && user) return query.eq(nameColumn, user);
  return query;
};

// PostgREST's `or=(...)` syntax treats , ( ) as delimiters — strip them from
// free-text search so a stray comma can't break the request.
export const sanitizeSearch = (term) =>
  String(term || "").replace(/[,()*%\\]/g, " ").trim();

// Rows [from, from + count) of a query, split into ≤1000-row requests.
// `buildQuery` must return a FRESH, un-awaited builder on every call.
export const fetchRowRange = async (buildQuery, from, count) => {
  let rows = [];
  let offset = from;
  const end = from + count;
  try {
    while (offset < end) {
      const size = Math.min(MAX_ROWS_PER_REQUEST, end - offset);
      const { data, error } = await buildQuery().range(offset, offset + size - 1);
      if (error) {
        console.warn("Checklist fetchRowRange warning:", error?.message || error);
        break;
      }
      rows = rows.concat(data || []);
      if (!data || data.length < size) break;
      offset += size;
    }
  } catch (err) {
    console.warn("Checklist fetchRowRange exception:", err?.message || err);
  }
  return rows;
};

export const chunk = (list, size = 150) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Selected rows arrive as row objects (QuickTask) or bare ids; checklist,
// delegation and ea_tasks keep id === task_id, so either key works.
export const idsOf = (items) =>
  [
    ...new Set(
      (Array.isArray(items) ? items : [items])
        .map((t) => (t && typeof t === "object" ? t.task_id ?? t.id : t))
        .filter((v) => v !== undefined && v !== null && v !== ""),
    ),
  ];

// Booleans from the assign forms become the "yes"/"no" text the pages read
// back (`require_attachment?.toUpperCase() === "YES"`).
export const toYesNo = (value, fallback = "no") => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value ? "yes" : "no";
  const v = String(value).trim().toLowerCase();
  return ["yes", "true", "1", "y"].includes(v) ? "yes" : "no";
};

// Null-safe, trimmed comparison used to match a task "series" (all
// occurrences sharing department/doer/description) in JS rather than with
// nested PostgREST or-filters.
export const sameText = (a, b) =>
  String(a ?? "").trim().replace(/\r\n/g, "\n") ===
  String(b ?? "").trim().replace(/\r\n/g, "\n");

// Local, zone-less "YYYY-MM-DDTHH:MM:SS" — planned_date/task_start_date on
// checklist & delegation are `timestamp` columns holding local wall-clock.
const pad = (n) => String(n).padStart(2, "0");
export const localDateString = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Applies QuickTask's dateFilter ("today" | "overdue" | "upcoming" | "all").
export const applyDateFilter = (query, dateFilter, column = "planned_date") => {
  const today = localDateString();
  if (dateFilter === "today")
    return query.gte(column, `${today}T00:00:00`).lte(column, `${today}T23:59:59`);
  if (dateFilter === "overdue") return query.lt(column, `${today}T00:00:00`);
  if (dateFilter === "upcoming") return query.gt(column, `${today}T23:59:59`);
  return query;
};

// Uploads proof files to a public bucket and returns their public URLs.
// Accepts File/Blob objects, `{ file }` wrappers, or SalesDataPage-style
// `{ name, type, previewUrl }` descriptors (the blob is re-read from the
// object URL). Failed uploads are skipped, mirroring AllTasks.uploadFiles.
export const uploadProofFiles = async (bucket, prefix, files) => {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
  const urls = [];
  for (const item of list) {
    let blob = null;
    let name = "file";
    let type;
    if (typeof Blob !== "undefined" && item instanceof Blob) {
      blob = item;
      name = item.name || name;
      type = item.type;
    } else if (item.file) {
      blob = item.file;
      name = item.file.name || item.name || name;
      type = item.file.type || item.type;
    } else if (item.previewUrl) {
      try {
        blob = await (await fetch(item.previewUrl)).blob();
      } catch (err) {
        console.error("Could not read staged file:", err);
      }
      name = item.name || name;
      type = item.type || blob?.type;
    }
    if (!blob) continue;
    const safeName = String(name).replace(/[^\w.-]+/g, "_");
    const path = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, type ? { contentType: type } : undefined);
    if (error) {
      console.error("Storage upload error:", error);
      continue;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
};
