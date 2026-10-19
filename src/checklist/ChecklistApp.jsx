// Entry point for /checklist/* inside VPR's Layout. Mounts the module's
// redux store and toast provider, links the VPR login to the module's
// employee identity (see session.js), and guards each sub-page with the
// VPR tab permission it belongs to (Settings → Users → Checklist).
//
// Pages are lazy-loaded: the module is large and most VPR users never
// open it, so it stays out of the main bundle.
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import useAuthStore from "../store/authStore";
import HoneycombLoader from "../components/HoneycombLoader";
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

// path (under /checklist) → page component + the VPR tab id that grants it.
// The task-creation forms reached from Assign Task share its permission.
const CHECKLIST_ROUTES = [
  { path: "admin", pageId: "checklist_dashboard", Component: AdminDashboard },
  { path: "quick-task", pageId: "checklist_quick_task", Component: QuickTask },
  { path: "assign-task", pageId: "checklist_assign_task", Component: AssignTask },
  { path: "checklist", pageId: "checklist_assign_task", Component: ChecklistTask },
  { path: "maintenance", pageId: "checklist_assign_task", Component: MaintenanceTask },
  { path: "repair", pageId: "checklist_assign_task", Component: RepairTask },
  { path: "delegation", pageId: "checklist_delegation", Component: Delegation },
  { path: "task", pageId: "checklist_task", Component: AllTasks },
  { path: "calendar", pageId: "checklist_calendar", Component: CalendarPage },
  { path: "holiday-list", pageId: "checklist_holiday", Component: HolidayListPage },
  { path: "working-day-calendar", pageId: "checklist_working_day", Component: WorkingDayCalendarPage },
  { path: "admin-approval", pageId: "checklist_approval", Component: AdminApprovalPage },
];

const Loader = () => (
  <div className="flex flex-1 items-center justify-center py-24">
    <HoneycombLoader />
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

  if (!session.ready) return <Loader />;

  return (
    <Provider store={store}>
      <MagicToastProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route index element={<FirstAllowedPage user={user} />} />
            {CHECKLIST_ROUTES.map(({ path, pageId, Component }) => (
              <Route
                key={path}
                path={path}
                element={
                  <Guarded user={user} pageId={pageId}>
                    <Component />
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
