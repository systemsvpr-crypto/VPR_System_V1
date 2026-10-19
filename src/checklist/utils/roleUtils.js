// Role helpers for the checklist module. Roles are the module's own
// (ADMINISTRATOR | admin | HOD | div_admin | user), resolved at session
// start by ChecklistModule from the VPR role + the checklist_users row and
// mirrored into localStorage, which is where these read defaults from.
//
// Department/division helpers return [] for "no restriction" — every
// caller treats an empty list as "show all".

const SUPER_ROLES = ["ADMINISTRATOR", "SUPER_ADMIN", "SUPERADMIN", "SUPER ADMIN"];

const norm = (v) => String(v ?? "").trim();

const splitList = (raw) =>
  norm(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const storedRole = () => {
  try {
    return localStorage.getItem("role") || "";
  } catch {
    return "";
  }
};

const storedValue = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

// eslint-disable-next-line no-unused-vars
export const isAdministrator = (role = storedRole(), _username) =>
  SUPER_ROLES.includes(norm(role).toUpperCase());

export const isAdminOrSuperAdmin = (role = storedRole(), username) =>
  isAdministrator(role, username) || norm(role).toLowerCase() === "admin";

const isScopedRole = (role) => {
  const r = norm(role).toLowerCase();
  return r === "hod" || r === "div_admin";
};

// Departments an HOD / division admin may see. Admins and plain users get
// [] (admins see everything; users are already filtered to their own tasks).
export const getUserAllowedDepartments = (opts = {}) => {
  const role = opts.role ?? storedRole();
  if (isAdminOrSuperAdmin(role) || !isScopedRole(role)) return [];
  const list = splitList(storedValue("user_access"));
  return list.length > 0 ? list : splitList(storedValue("department"));
};

export const getUserAllowedDivisions = (opts = {}) => {
  const role = opts.role ?? storedRole();
  if (isAdminOrSuperAdmin(role)) return [];
  return splitList(storedValue("division"));
};

// A row with no division, or a user with no division restriction, passes.
export const isDivisionAllowed = (division, allowedDivisions) => {
  if (!allowedDivisions || allowedDivisions.length === 0) return true;
  if (!norm(division)) return true;
  const d = norm(division).toLowerCase();
  return allowedDivisions.some((a) => norm(a).toLowerCase() === d);
};
