// Bridges a VPR login into the checklist module's own identity.
//
// The module keeps its employees in `checklist_users` (assignees, HODs,
// departments, leave, reporting lines) and never touches VPR's `users`
// table. A VPR user is linked to their employee row through
// checklist_users.vpr_user_id: found by that id, else by matching name
// (an employee an admin already created in checklist Settings), else a
// new row is created on their first visit.
//
// The pages read the current user from localStorage keys ("user-name",
// "role", ...) — this writes them before any checklist page renders.
import supabase from "./SupabaseClient";

// VPR admins administer the module too; everyone else gets the role an
// admin set on their employee row (user / HOD / div_admin).
export const resolveChecklistRole = (vprUser, row) => {
  const vprRole = String(vprUser?.role || "").toUpperCase();
  if (vprRole === "SUPER ADMIN" || vprRole === "SUPER_ADMIN" || vprRole === "SUPERADMIN") return "ADMINISTRATOR";
  if (vprRole.includes("ADMIN")) return "admin";
  return row?.role || "user";
};

const findEmployeeRow = async (vprUser) => {
  try {
    const { data: linked, error } = await supabase
      .from("checklist_users")
      .select("*")
      .eq("vpr_user_id", vprUser.user_id)
      .maybeSingle();
    if (error) {
      console.warn("Checklist findEmployeeRow warning:", error?.message || error);
      return null;
    }
    if (linked) return linked;

    const name = String(vprUser.full_name || vprUser.Name || "").trim();
    if (!name) return null;
    const { data: byName, error: nameErr } = await supabase
      .from("checklist_users")
      .select("*")
      .ilike("user_name", name)
      .is("vpr_user_id", null)
      .limit(1)
      .maybeSingle();
    if (nameErr) {
      console.warn("Checklist findEmployeeRow byName warning:", nameErr?.message || nameErr);
      return null;
    }
    if (!byName) return null;

    const { data: claimed, error: claimErr } = await supabase
      .from("checklist_users")
      .update({ vpr_user_id: vprUser.user_id })
      .eq("id", byName.id)
      .select("*")
      .single();
    if (claimErr) {
      console.warn("Checklist findEmployeeRow claim warning:", claimErr?.message || claimErr);
      return byName;
    }
    return claimed;
  } catch (err) {
    console.warn("Checklist findEmployeeRow exception:", err?.message || err);
    return null;
  }
};

const insertEmployee = (vprUser, userName) =>
  supabase
    .from("checklist_users")
    .insert({
      vpr_user_id: vprUser.user_id,
      user_name: userName,
      email_id: vprUser.email || null,
      number: vprUser.phone_number || null,
      Designation: vprUser.designation || null,
      profile_image: vprUser.profile_picture || null,
      role: "user",
      status: "active",
    })
    .select("*")
    .single();

// Employee names are unique (case-insensitive) because tasks reference the
// doer by name; a second VPR login with the same full name gets its
// username appended instead of failing.
const createEmployeeRow = async (vprUser) => {
  try {
    const name = String(vprUser.full_name || vprUser.username || "User").trim();
    let { data, error } = await insertEmployee(vprUser, name);
    if (error?.code === "23505" && vprUser.username) {
      ({ data, error } = await insertEmployee(vprUser, `${name} (${vprUser.username})`));
    }
    if (error) {
      console.warn("Checklist createEmployeeRow warning:", error?.message || error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("Checklist createEmployeeRow exception:", err?.message || err);
    return null;
  }
};

const writeIdentity = (row, role) => {
  // Required identity keys for checklist
  if (row.user_name) localStorage.setItem("user-name", String(row.user_name));
  if (role) localStorage.setItem("role", String(role));
  if (row.id) localStorage.setItem("user-id", String(row.id));

  // Only store permissions / filters if they have actual non-empty values
  const optionalKeys = {
    department: row.department,
    division: row.division,
    user_access: row.user_access,
    page_access: row.page_access,
    profile_image: row.profile_image,
    designation: row.Designation,
  };

  Object.entries(optionalKeys).forEach(([k, v]) => {
    if (v && String(v).trim() !== "" && String(v) !== "null" && String(v) !== "undefined") {
      localStorage.setItem(k, String(v).trim());
    } else {
      localStorage.removeItem(k);
    }
  });

  // Purge sensitive credentials, contact info, and internal flags from localStorage
  localStorage.removeItem("email_id");
  localStorage.removeItem("phone");
  localStorage.removeItem("contact");
  localStorage.removeItem("can_self_assign");
  localStorage.removeItem("password");
  localStorage.removeItem("password_hash");
  localStorage.removeItem("token");

  sessionStorage.setItem("username", row.user_name);
  sessionStorage.setItem("role", role);
};

export const buildFallbackIdentity = (vprUser) => {
  const name = String(
    vprUser?.full_name || vprUser?.username || vprUser?.Name || "Admin"
  ).trim();
  const fallbackRow = {
    id: vprUser?.user_id || "vpr-temp-user",
    vpr_user_id: vprUser?.user_id || null,
    user_name: name || "Admin",
    email_id: vprUser?.email || null,
    number: vprUser?.phone_number || null,
    Designation: vprUser?.designation || null,
    profile_image: vprUser?.profile_picture || null,
    department: "",
    division: "",
    user_access: "",
    page_access: "",
    can_self_assign: true,
    status: "active",
    role: resolveChecklistRole(vprUser, null),
  };
  const role = resolveChecklistRole(vprUser, fallbackRow);
  writeIdentity(fallbackRow, role);
  return { row: fallbackRow, role, isFallback: true };
};

export const syncChecklistSession = async (vprUser) => {
  if (!vprUser) {
    return buildFallbackIdentity(vprUser);
  }
  try {
    const row =
      (await findEmployeeRow(vprUser)) || (await createEmployeeRow(vprUser));
    if (row) {
      if (String(row.status || "active").toLowerCase() !== "active") {
        console.warn("Checklist employee profile inactive:", row);
      }
      const role = resolveChecklistRole(vprUser, row);
      writeIdentity(row, role);
      return { row, role, isFallback: false };
    }
  } catch (err) {
    console.warn("Checklist session sync warning (falling back to user session):", err?.message || err);
  }

  // Gracefully fallback to VPR user identity so the full UI structure always renders
  return buildFallbackIdentity(vprUser);
};
