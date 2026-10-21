// Data access for the checklist module's Settings screens (Setting.jsx,
// GlobalSettings.jsx) and the master lists the task forms read from them:
//
// - checklist_users — the module's own employee table. It is NOT VPR's
//   `users` table and nothing here ever touches that one; VPR logins are
//   linked to an employee row through checklist_users.vpr_user_id by the
//   lead's bridge. createUser/updateUser/deleteUser only manage employees.
// - checklist_departments — one row per (department, parent division) pair;
//   Setting.jsx consolidates rows sharing a department name into one entry.
// - assign_from — the "Assign From" (given-by) list. Its column is `name`
//   (BulkImportModal reads it that way); Setting.jsx works in terms of
//   `given_by`, so rows are handed out with both keys.
// - checklist_custom_dropdowns — machine rows (machine_name / part_name /
//   machine_area / image_url) plus plain category/value rows (e.g. "Sound
//   Test", "Temperature", "Task Priority"). The pages consume a flattened
//   list of { id, category, value, parent, image_url } items, and Setting.jsx
//   groups a machine's parts/areas by sharing the row id — so every item
//   produced from one machine row carries that row's id.
import supabase from "../../SupabaseClient";
import { fetchAllRows } from "./taskApiUtils";

const USERS_TABLE = "checklist_users";
const DEPARTMENTS_TABLE = "checklist_departments";
const ASSIGN_FROM_TABLE = "assign_from";
const DROPDOWNS_TABLE = "checklist_custom_dropdowns";

const PROFILE_BUCKET = "checklist-profile-images";
const PART_BUCKET = "checklist-part-images";

// Category labels the pages filter the flattened dropdown list by.
const MACHINE_NAME = "Machine Name";
const PART_NAME = "Part Name";
const MACHINE_AREA = "Machine Area";
const MACHINE_ROW_CATEGORY = "Machine";

// Every employee column except `password` — the module never logs anyone in
// (VPR does), so there is no reason to ship stored passwords to the browser.
const USER_COLUMNS = [
  "id",
  "user_name",
  "email_id",
  "number",
  "role",
  "status",
  "department",
  "user_access",
  "page_access",
  "Designation",
  "reported_by",
  "day_off",
  "leave_date",
  "leave_end_date",
  "remark",
  "profile_image",
  "can_self_assign",
  "employee_id",
  "location",
  "vpr_user_id",
  "created_at",
].join(", ");

const blankToNull = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "")
    ? null
    : v;

const trimOrNull = (v) => (typeof v === "string" ? blankToNull(v.trim()) : blankToNull(v));

// ---------------------------------------------------------------------------
// Employees (checklist_users)
// ---------------------------------------------------------------------------

// The Settings forms submit two shapes: createUser gets the raw form state
// ({ username, email, phone, ... }) while updateUser gets DB-named keys
// ({ user_name, email_id, number, ... }). Normalise either one into a row,
// only including keys the caller actually supplied so an update never blanks
// a column it didn't mean to touch. An empty password is dropped (the edit
// form leaves it blank to mean "keep the current one").
const toUserRow = (input = {}) => {
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const row = {};

  if (has("user_name") || has("username")) {
    row.user_name = trimOrNull(has("user_name") && input.user_name !== undefined ? input.user_name : input.username);
  }
  if (has("email_id") || has("email")) {
    row.email_id = trimOrNull(has("email_id") ? input.email_id : input.email);
  }
  if (has("number") || has("phone")) {
    const n = has("number") ? input.number : input.phone;
    row.number = n === undefined || n === null ? null : trimOrNull(String(n));
  }
  if (has("password") && typeof input.password === "string" && input.password.trim() !== "") {
    row.password = input.password;
  }

  // Free-text columns: blank → null.
  [
    "department",
    "user_access",
    "page_access",
    "Designation",
    "reported_by",
    "day_off",
    "remark",
    "profile_image",
    "employee_id",
    "location",
    "leave_date",
    "leave_end_date",
  ].forEach((k) => {
    if (has(k)) row[k] = blankToNull(input[k]);
  });

  // Columns with table defaults: omit when blank so the default applies on insert.
  if (has("role") && blankToNull(input.role) !== null) row.role = input.role;
  if (has("status") && blankToNull(input.status) !== null) row.status = input.status;
  if (has("can_self_assign")) {
    row.can_self_assign = input.can_self_assign === true || input.can_self_assign === "true";
  }
  if (has("vpr_user_id")) row.vpr_user_id = blankToNull(input.vpr_user_id);

  return row;
};

const friendlyUserError = (error) => {
  if (error?.code === "23505") {
    return "A user with this username already exists. Please choose a different username.";
  }
  return error?.message || "Database error";
};

export const fetchUsersApi = async () =>
  fetchAllRows(() =>
    supabase
      .from(USERS_TABLE)
      .select(USER_COLUMNS)
      .order("user_name", { ascending: true })
      .order("id", { ascending: true }),
  );

export const createUserApi = async (newUser) => {
  const row = toUserRow(newUser);
  if (!row.user_name) throw new Error("Username is required.");

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .insert([row])
    .select(USER_COLUMNS)
    .single();
  if (error) throw new Error(friendlyUserError(error));
  return data;
};

export const updateUserApi = async ({ id, updatedUser }) => {
  if (id === undefined || id === null) throw new Error("Missing user id.");
  const row = toUserRow(updatedUser);
  if (Object.prototype.hasOwnProperty.call(row, "user_name") && !row.user_name) {
    throw new Error("Username is required.");
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .update(row)
    .eq("id", id)
    .select(USER_COLUMNS)
    .single();
  if (error) throw new Error(friendlyUserError(error));
  return data;
};

export const deleteUserApi = async (id) => {
  const { error } = await supabase.from(USERS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return id;
};

const fileExt = (file) => {
  const fromName = (file?.name || "").split(".").pop();
  if (fromName && fromName !== file?.name) return fromName.toLowerCase();
  const fromType = (file?.type || "").split("/").pop();
  return (fromType || "jpg").toLowerCase();
};

const uploadPublicFile = async (bucket, path, file) => {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file?.type || undefined,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

// Returns the public URL of the uploaded profile picture. A timestamp keeps
// each upload at a fresh path so browsers don't keep showing a cached old one.
export const uploadProfileImageApi = async ({ file, userId }) => {
  if (!file) throw new Error("No file selected.");
  const owner = String(userId || "unassigned").replace(/[^a-zA-Z0-9_-]/g, "_");
  return uploadPublicFile(PROFILE_BUCKET, `${owner}/${Date.now()}.${fileExt(file)}`, file);
};

// Returns the public URL of an uploaded machine-part photo (Setting.jsx awaits
// the URL string directly).
export const uploadPartImageApi = async (file) => {
  if (!file) throw new Error("No file selected.");
  const rand = Math.random().toString(36).slice(2, 8);
  return uploadPublicFile(PART_BUCKET, `parts/${Date.now()}-${rand}.${fileExt(file)}`, file);
};

// ---------------------------------------------------------------------------
// Departments (checklist_departments)
// ---------------------------------------------------------------------------

export const fetchDepartmentsApi = async () => {
  return fetchAllRows(() =>
    supabase
      .from(DEPARTMENTS_TABLE)
      .select("id, department, given_by, created_at")
      .order("department", { ascending: true })
      .order("id", { ascending: true }),
  );
};

// Distinct name list for callers that only want names.
export const fetchDepartmentsOnlyApi = async () => {
  const rows = await fetchDepartmentsApi();
  const names = [
    ...new Set(rows.map((r) => (r.department || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return { rows, names };
};

// { department, given_by } → one row. An existing department of the same
// name throws an error to notify the user.
export const createDepartmentApi = async ({ department, given_by }) => {
  const name = (department || "").trim();
  if (!name) throw new Error("Department name is required.");

  const { data: existing, error: exErr } = await supabase
    .from(DEPARTMENTS_TABLE)
    .select("id")
    .ilike("department", name)
    .limit(1);
  if (exErr) throw new Error(exErr.message);
  if (existing && existing.length > 0) {
    throw new Error(`Department "${name}" already exists.`);
  }

  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .insert([{ department: name, given_by: blankToNull(given_by) }])
    .select("id, department, given_by, created_at");
  if (error) throw new Error(error.message);
  return data || [];
};

export const updateDepartmentApi = async ({ id, department, given_by }) => {
  const name = (department || "").trim();
  if (!name) throw new Error("Department name is required.");

  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .update({
      department: name,
      ...(given_by !== undefined && { given_by: blankToNull(given_by) }),
    })
    .eq("id", id)
    .select("id, department, given_by, created_at");
  if (error) throw new Error(error.message);
  return data?.[0] || { id, department: name, given_by };
};

export const deleteDepartmentApi = async (id) => {
  const { error } = await supabase.from(DEPARTMENTS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return id;
};

// ---------------------------------------------------------------------------
// Assign From (assign_from)
// ---------------------------------------------------------------------------

const toGivenByItem = (row) => ({ ...row, given_by: row.name });

export const fetchGivenByApi = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from(ASSIGN_FROM_TABLE)
      .select("id, name, created_at")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows.map(toGivenByItem);
};

// Idempotent: the department forms call this "best effort" every save, so an
// existing name (case-insensitive) is returned instead of inserted again.
export const createAssignFromApi = async ({ given_by, name }) => {
  const value = ((given_by ?? name) || "").trim();
  if (!value) throw new Error("Assign From name is required.");

  const { data: existing, error: exErr } = await supabase
    .from(ASSIGN_FROM_TABLE)
    .select("id, name, created_at")
    .ilike("name", value)
    .limit(1);
  if (exErr) throw new Error(exErr.message);
  if (existing && existing.length > 0) {
    return { item: toGivenByItem(existing[0]), created: false };
  }

  const { data, error } = await supabase
    .from(ASSIGN_FROM_TABLE)
    .insert([{ name: value }])
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);
  return { item: toGivenByItem(data), created: true };
};

export const updateAssignFromApi = async ({ id, given_by, name }) => {
  const value = ((given_by ?? name) || "").trim();
  if (!value) throw new Error("Assign From name is required.");
  const { data, error } = await supabase
    .from(ASSIGN_FROM_TABLE)
    .update({ name: value })
    .eq("id", id)
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toGivenByItem(data);
};

export const deleteAssignFromApi = async (id) => {
  const { error } = await supabase.from(ASSIGN_FROM_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return id;
};

// ---------------------------------------------------------------------------
// Custom dropdowns / machines (checklist_custom_dropdowns)
// ---------------------------------------------------------------------------

// One stored row → the flattened items the pages read.
export const flattenDropdownRow = (row) => {
  if (!row) return [];
  const machine = (row.machine_name || "").trim();
  if (machine) {
    const items = [
      { id: row.id, category: MACHINE_NAME, value: machine, parent: null, image_url: null },
    ];
    const part = (row.part_name || "").trim();
    if (part) {
      items.push({
        id: row.id,
        category: PART_NAME,
        value: part,
        parent: machine,
        image_url: row.image_url || null,
      });
    }
    const area = (row.machine_area || "").trim();
    if (area) {
      items.push({ id: row.id, category: MACHINE_AREA, value: area, parent: machine, image_url: null });
    }
    return items;
  }
  if (row.category && row.value !== null && row.value !== undefined && row.value !== "") {
    return [
      {
        id: row.id,
        category: row.category,
        value: row.value,
        parent: row.parent || null,
        image_url: row.image_url || null,
      },
    ];
  }
  return [];
};

export const fetchCustomDropdownsApi = async () => {
  const rows = await fetchAllRows(() =>
    supabase
      .from(DROPDOWNS_TABLE)
      .select("*")
      .order("id", { ascending: true }),
  );
  return rows.flatMap(flattenDropdownRow);
};

// entries: [{ machine_name, part_name, machine_area, image_url? }]
export const createMachineEntriesApi = async (entries) => {
  const rows = (Array.isArray(entries) ? entries : [entries])
    .filter((e) => e && (e.machine_name || "").trim())
    .map((e) => ({
      category: MACHINE_ROW_CATEGORY,
      machine_name: e.machine_name.trim(),
      part_name: trimOrNull(e.part_name),
      machine_area: trimOrNull(e.machine_area),
      image_url: blankToNull(e.image_url),
    }));
  if (rows.length === 0) throw new Error("Machine Name is required.");

  const { data, error } = await supabase.from(DROPDOWNS_TABLE).insert(rows).select("*");
  if (error) throw new Error(error.message);
  return data || [];
};

// { id, category, value, image_url? } — `category` says which field of the
// stored row the flattened item came from.
export const updateCustomDropdownApi = async ({ id, category, value, image_url }) => {
  const patch = {};
  if (category === MACHINE_NAME) patch.machine_name = trimOrNull(value);
  else if (category === PART_NAME) patch.part_name = trimOrNull(value);
  else if (category === MACHINE_AREA) patch.machine_area = trimOrNull(value);
  else {
    if (category) patch.category = category;
    patch.value = value;
  }
  if (image_url !== undefined) patch.image_url = blankToNull(image_url);

  const { data, error } = await supabase
    .from(DROPDOWNS_TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteCustomDropdownApi = async (id) => {
  const { error } = await supabase.from(DROPDOWNS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return id;
};
