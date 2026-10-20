// Entry point for /checklist/* inside VPR's Layout. Mounts the module's
// redux store and toast provider, links the VPR login to the module's
// employee identity (see session.js), and guards each sub-page with the
// VPR tab permission it belongs to (Settings → Users → Checklist).
//
// Pages are lazy-loaded: the module is large and most VPR users never
// open it, so it stays out of the main bundle.
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Provider } from "react-redux";
import useAuthStore from "../store/authStore";
import { PAGE_TABS } from "../constants";
import store from "./redux/store";
import { MagicToastProvider } from "./context/MagicToastContext";
import { canAccessChecklistPage } from "./utils/pagePermissionUtils";
import { syncChecklistSession, buildFallbackIdentity } from "./session";
import "./checklist.css";

const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const QuickTask = lazy(() => import("./pages/QuickTask"));
const AssignTask = lazy(() => import("./pages/admin/AssignTask"));
const ChecklistTask = lazy(() => import("./pages/admin/ChecklistTask"));
const MaintenanceTask = lazy(() => import("./pages/admin/MaintenanceTask"));
const RepairTask = lazy(() => import("./pages/admin/RepairTask"));
const Delegation = lazy(() => import("./pages/delegation"));
const AllTasks = lazy(() => import("./pages/admin/AllTasks"));
const CalendarPage = lazy(() => import("./pages/admin/CalendarPage"));
const HolidayListPage = lazy(() => import("./pages/admin/HolidayListPage"));
const WorkingDayCalendarPage = lazy(() => import("./pages/admin/WorkingDayCalendarPage"));
const AdminApprovalPage = lazy(() => import("./pages/admin/AdminApprovalPage"));
const Setting = lazy(() => import("./pages/Setting"));

// path (under /checklist) → page component + the VPR tab id that grants it.
// The task-creation forms reached from Assign Task share its permission.
const CHECKLIST_ROUTES = [
  { path: "admin", pageId: "checklist_dashboard", Component: AdminDashboard, loadingText: "Loading Dashboard..." },
  { path: "quick-task", pageId: "checklist_quick_task", Component: QuickTask, loadingText: "Loading Task Management..." },
  { path: "assign-task", pageId: "checklist_assign_task", Component: AssignTask, loadingText: "Loading Assign Task..." },
  { path: "checklist", pageId: "checklist_assign_task", Component: ChecklistTask, loadingText: "Loading Checklist Tasks..." },
  { path: "maintenance", pageId: "checklist_assign_task", Component: MaintenanceTask, loadingText: "Loading Maintenance Tasks..." },
  { path: "repair", pageId: "checklist_assign_task", Component: RepairTask, loadingText: "Loading Repair Tasks..." },
  { path: "delegation", pageId: "checklist_delegation", Component: Delegation, loadingText: "Loading Delegation..." },
  { path: "task", pageId: "checklist_task", Component: AllTasks, loadingText: "Loading Tasks..." },
  { path: "calendar", pageId: "checklist_calendar", Component: CalendarPage, loadingText: "Loading Calendar..." },
  { path: "holiday-list", pageId: "checklist_holiday", Component: HolidayListPage, loadingText: "Loading Holiday List..." },
  { path: "working-day-calendar", pageId: "checklist_working_day", Component: WorkingDayCalendarPage, loadingText: "Loading Working Day Calendar..." },
  { path: "admin-approval", pageId: "checklist_approval", Component: AdminApprovalPage, loadingText: "Loading Admin Approval..." },
  { path: "setting", pageId: "checklist_settings", Component: Setting, loadingText: "Loading Settings..." },
  { path: "settings", pageId: "checklist_settings", Component: Setting, loadingText: "Loading Settings..." },
];

const CHECKLIST_PAGE_LOADING_TEXTS = {
  admin: "Loading Dashboard...",
  "quick-task": "Loading Task Management...",
  "assign-task": "Loading Assign Task...",
  checklist: "Loading Checklist Tasks...",
  maintenance: "Loading Maintenance Tasks...",
  repair: "Loading Repair Tasks...",
  delegation: "Loading Delegation...",
  task: "Loading Tasks...",
  calendar: "Loading Calendar...",
  "holiday-list": "Loading Holiday List...",
  "working-day-calendar": "Loading Working Day Calendar...",
  "admin-approval": "Loading Admin Approval...",
  setting: "Loading Settings...",
  settings: "Loading Settings...",
};

const getChecklistLoadingText = (pathname) => {
  if (!pathname) return "Loading Checklist...";
  const sub = pathname.replace(/^\/checklist\/?/, "").split("/")[0];
  return CHECKLIST_PAGE_LOADING_TEXTS[sub] || "Loading Checklist...";
};

const Loader = ({ text = "Loading Checklist..." }) => (
  <div className="flex flex-1 flex-col items-center justify-center py-24">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3" />
    <p className="text-sm font-medium text-slate-500 tracking-wide animate-pulse">
      {text}
    </p>
  </div>
);

const NoAccess = () => (
  <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-slate-500">
    You don&apos;t have access to any Checklist pages. Ask an administrator to grant them in Settings → Users.
  </div>
);

const FirstAllowedPage = ({ user }) => {
  const first = PAGE_TABS.checklist.find((t) => canAccessChecklistPage(user, t.id));
  return first ? <Navigate to={`/checklist/${first.path}`} replace /> : <NoAccess />;
};

const Guarded = ({ user, pageId, children }) =>
  canAccessChecklistPage(user, pageId) ? children : <Navigate to="/checklist" replace />;

const ChecklistApp = () => {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const currentLoadingText = getChecklistLoadingText(location.pathname);
  const [session, setSession] = useState({ ready: false, error: null });

  // Re-link whenever the VPR login changes (user switch, role/permission
  // update pushed by the Sidebar's realtime listener).
  useEffect(() => {
    let cancelled = false;
    setSession({ ready: false, error: null });
    syncChecklistSession(user)
      .then(() => !cancelled && setSession({ ready: true, error: null }))
      .catch((err) => {
        console.warn("Checklist session sync warning, rendering UI with fallback:", err);
        if (user) buildFallbackIdentity(user);
        if (!cancelled) setSession({ ready: true, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.user_id, user?.role, user?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session.ready) return <Loader text={currentLoadingText} />;

  return (
    <Provider store={store}>
      <MagicToastProvider>
        <Suspense fallback={<Loader text={currentLoadingText} />}>
          <Routes>
            <Route index element={<FirstAllowedPage user={user} />} />
            {CHECKLIST_ROUTES.map(({ path, pageId, Component, loadingText }) => (
              <Route
                key={path}
                path={path}
                element={
                  <Guarded user={user} pageId={pageId}>
                    <Suspense fallback={<Loader text={loadingText || currentLoadingText} />}>
                      <Component />
                    </Suspense>
                  </Guarded>
                }
              />
            ))}
            <Route path="*" element={<Navigate to="/checklist" replace />} />
          </Routes>
        </Suspense>
      </MagicToastProvider>
    </Provider>
  );
};

export default ChecklistApp;
