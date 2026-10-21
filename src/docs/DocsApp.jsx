// Entry point for /docs/* inside VPR's Layout. Guards each sub-page with the
// VPR tab permission it belongs to (Settings → Users → Docs & Subscriptions)
// and lazy-loads pages so the module stays out of the main bundle.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import useAuthStore from "../store/authStore";
import { DOCS_TABS, canAccessDocsPage } from "./utils/access";
import { LoadingState } from "./components/DocsUI";

const PAGE_COMPONENTS = {
  docs_dashboard: lazy(() => import("./pages/Dashboard")),
  docs_resource_manager: lazy(() => import("./pages/ResourceManager")),
  docs_all_documents: lazy(() => import("./pages/document/AllDocuments")),
  docs_document_renewal: lazy(() => import("./pages/document/DocumentRenewal")),
  docs_shared_documents: lazy(() => import("./pages/document/SharedDocuments")),
  docs_all_subscriptions: lazy(() => import("./pages/subscription/AllSubscriptions")),
  docs_subscription_approval: lazy(() => import("./pages/subscription/SubscriptionApproval")),
  docs_subscription_payment: lazy(() => import("./pages/subscription/SubscriptionPayment")),
  docs_subscription_renewal: lazy(() => import("./pages/subscription/SubscriptionRenewal")),
  docs_all_loans: lazy(() => import("./pages/loan/AllLoans")),
  docs_loan_foreclosure: lazy(() => import("./pages/loan/LoanForeclosure")),
  docs_loan_noc: lazy(() => import("./pages/loan/LoanNOC")),
};

const NoAccess = () => (
  <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-slate-500">
    You don&apos;t have access to any Docs &amp; Subscriptions pages. Ask an administrator to grant them in Settings → Users.
  </div>
);

const FirstAllowedPage = ({ user }) => {
  const first = DOCS_TABS.find((t) => canAccessDocsPage(user, t.id));
  return first ? <Navigate to={`/docs/${first.path}`} replace /> : <NoAccess />;
};

const DocsApp = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <Suspense fallback={<LoadingState text="Loading Docs & Subscriptions..." />}>
      <Routes>
        <Route index element={<FirstAllowedPage user={user} />} />
        {DOCS_TABS.map(({ id, path, label }) => {
          const Page = PAGE_COMPONENTS[id];
          return (
            <Route
              key={id}
              path={path}
              element={
                canAccessDocsPage(user, id) ? (
                  <Suspense fallback={<LoadingState text={`Loading ${label}...`} />}>
                    <Page />
                  </Suspense>
                ) : (
                  <Navigate to="/docs" replace />
                )
              }
            />
          );
        })}
        <Route path="*" element={<Navigate to="/docs" replace />} />
      </Routes>
    </Suspense>
  );
};

export default DocsApp;
