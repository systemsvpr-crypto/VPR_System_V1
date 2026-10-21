// Docs access follows VPR's own model: the "Docs & Subscriptions" page and its
// sub-pages in Settings → Users (users.page_access / users.tab_access.docs).
// Admins see everything; a granted page is fully writable.
import { PAGE_TABS } from "../../constants";

export const DOCS_TABS = PAGE_TABS.docs;

const isVprAdmin = (user) => String(user?.role || "").toUpperCase().includes("ADMIN");

export const canAccessDocsPage = (user, pageId) => {
  if (!user) return false;
  if (isVprAdmin(user)) return true;
  if (!user.page_access?.includes("docs")) return false;
  return (user.tab_access?.docs || []).includes(pageId);
};

// Absolute route of a Docs sub-page by its tab id, e.g. docsPath("docs_loan_noc").
export const docsPath = (pageId) => {
  const tab = DOCS_TABS.find((t) => t.id === pageId);
  return tab ? `/docs/${tab.path}` : "/docs";
};
