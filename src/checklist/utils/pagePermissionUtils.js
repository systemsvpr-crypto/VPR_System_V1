// Page-level permissions for checklist pages come from VPR's own access
// model — the "Checklist" page and its sub-pages in Settings → Users
// (users.page_access / users.tab_access.checklist) — so admins grant
// checklist access in the same place as every other VPR module.
//
// VPR has no read-only tier: a granted page is fully writable, a missing
// one is hidden by the sidebar and blocked by ChecklistLayout.
import useAuthStore from "../../store/authStore";
import { PAGE_TABS } from "../../constants";

export const READ_ONLY_TOOLTIP = "You have view-only access to this page";

export const CHECKLIST_PAGE_IDS = PAGE_TABS.checklist.map((t) => t.id);

// Legacy ids some pages still ask for, mapped onto the VPR tab that covers them.
const PAGE_ID_ALIASES = {
  settings_users: "checklist_settings",
};

const isVprAdmin = (user) => String(user?.role || "").toUpperCase().includes("ADMIN");

export const canAccessChecklistPage = (user, pageId) => {
  if (!user) return false;
  if (!pageId || pageId === "__none__") return true;
  if (isVprAdmin(user)) return true;
  if (!user.page_access?.includes("checklist")) return false;
  const id = PAGE_ID_ALIASES[pageId] || pageId;
  return (user.tab_access?.checklist || []).includes(id);
};

export const usePagePermission = (pageId) => {
  const user = useAuthStore((s) => s.user);
  const allowed = canAccessChecklistPage(user, pageId);
  return {
    canRead: allowed,
    canWrite: allowed,
    isReadOnly: false,
    accessLevel: allowed ? "write" : "none",
  };
};

// Accepts "all", an array, a JSON array string or a comma list.
export const getReadablePageIds = (raw) => {
  if (!raw) return [];
  if (raw === "all") return [...CHECKLIST_PAGE_IDS];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
};

export const setStoredPageAccess = (value) => {
  try {
    const v = Array.isArray(value) ? value.join(",") : String(value ?? "");
    localStorage.setItem("page_access", v);
  } catch {
    // storage unavailable — permissions are re-derived from VPR on next load
  }
};
