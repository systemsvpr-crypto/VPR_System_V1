// Entry point for /whatsapp/* inside VPR's Layout. Guards each page with the
// VPR tab permission it belongs to (Settings → Users → WhatsApp) and
// lazy-loads pages so the module stays out of the main bundle.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import useAuthStore from "../store/authStore";
import { PAGE_TABS } from "../constants";

const WHATSAPP_TABS = PAGE_TABS.whatsapp;

const PAGE_COMPONENTS = {
  whatsapp_inbox: lazy(() => import("./pages/ChatInboxPage")),
  whatsapp_scheduler: lazy(() => import("./pages/BroadcastSchedulerPage")),
};

const isVprAdmin = (user) => String(user?.role || "").toUpperCase().includes("ADMIN");

export const canAccessWhatsappPage = (user, pageId) => {
  if (!user) return false;
  if (isVprAdmin(user)) return true;
  if (!user.page_access?.includes("whatsapp")) return false;
  return (user.tab_access?.whatsapp || []).includes(pageId);
};

const Loader = ({ text }) => (
  <div className="flex flex-1 flex-col items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3" />
    <p className="text-sm text-slate-400">{text}</p>
  </div>
);

const FirstAllowedPage = ({ user }) => {
  const first = WHATSAPP_TABS.find((t) => canAccessWhatsappPage(user, t.id));
  return first ? (
    <Navigate to={`/whatsapp/${first.path}`} replace />
  ) : (
    <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-slate-500">
      You don&apos;t have access to any WhatsApp pages. Ask an administrator to grant them in Settings → Users.
    </div>
  );
};

const WhatsAppApp = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <Suspense fallback={<Loader text="Loading WhatsApp..." />}>
      <Routes>
        <Route index element={<FirstAllowedPage user={user} />} />
        {WHATSAPP_TABS.map(({ id, path, label }) => {
          const Page = PAGE_COMPONENTS[id];
          return (
            <Route
              key={id}
              path={path}
              element={
                canAccessWhatsappPage(user, id) ? (
                  <Suspense fallback={<Loader text={`Loading ${label}...`} />}>
                    <Page />
                  </Suspense>
                ) : (
                  <Navigate to="/whatsapp" replace />
                )
              }
            />
          );
        })}
        <Route path="*" element={<Navigate to="/whatsapp" replace />} />
      </Routes>
    </Suspense>
  );
};

export default WhatsAppApp;
