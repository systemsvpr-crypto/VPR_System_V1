import { useState, useMemo } from "react";
import { CheckCircle2, XCircle, Clock, RefreshCw, History } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import useAuthStore from "../../../store/authStore";
import { subscriptionsApi } from "../../services/docsApi";
import { formatCurrency, formatDateTime } from "../../utils/dateFormatter";
import { getUserAllowedDivisions, isDivisionAllowed } from "../../utils/divisions";
import {
  PageShell,
  PageHeader,
  Toolbar,
  SubTabs,
  SearchInput,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  useDocsData,
  LoadingState,
  Pill,
  DocsModal,
  Field,
  TEXTAREA_CLASS,
  DetailGrid,
  Spinner,
} from "../../components/DocsUI";
import { formatDateDDMMYYYY, serialNo } from "./AllSubscriptions";

const PENDING_COLUMNS = [
  { label: "Review Actions", className: "text-center" },
  "Serial No",
  "Division",
  "Subscriber",
  "Subscription",
  "Cost",
  "Billing Cycle",
  "Purpose",
  "Request Date",
];

const HISTORY_COLUMNS = [
  "Serial No",
  "Division",
  "Subscriber",
  "Subscription",
  "Cost",
  "Billing Cycle",
  "Decision Status",
  "Authorized By & Date",
  "Remarks",
];

const FrequencyTag = ({ value }) => (
  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{value}</span>
);

export default function SubscriptionApproval() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const [actionTarget, setActionTarget] = useState(null); // { sub, action: 'Approve' | 'Reject' }
  const [actionRemarks, setActionRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: subscriptions, loading, reload } = useDocsData(async () => {
    try {
      return (await subscriptionsApi.list()) || [];
    } catch (err) {
      toast.error("Failed to load approval queue");
      throw err;
    }
  }, []);

  const matches = (s) => {
    const subDiv = s.division || s.companyName || "";
    if (!isDivisionAllowed(subDiv, allowedDivisions)) return false;
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      s.subscriptionName?.toLowerCase().includes(q) ||
      s.serviceName?.toLowerCase().includes(q) ||
      s.subscriberName?.toLowerCase().includes(q) ||
      subDiv.toLowerCase().includes(q) ||
      s.purpose?.toLowerCase().includes(q)
    );
  };

  const pendingList = useMemo(
    () => subscriptions.filter((s) => s.status === "Pending").filter(matches),
    [subscriptions, searchQuery, allowedDivisions] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const historyList = useMemo(
    () => subscriptions.filter((s) => s.status !== "Pending").filter(matches),
    [subscriptions, searchQuery, allowedDivisions] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pendingPaged = usePaged(pendingList);
  const historyPaged = usePaged(historyList);

  const handleOpenActionModal = (sub, action) => {
    setActionTarget({ sub, action });
    setActionRemarks("");
  };

  const handleConfirmAction = async (e) => {
    e.preventDefault();
    if (!actionTarget) return;
    const isApprove = actionTarget.action === "Approve";
    if (!isApprove && !actionRemarks.trim()) {
      toast.error("Please enter a reason for rejection");
      return;
    }
    try {
      setSubmitting(true);
      await subscriptionsApi.approve(actionTarget.sub.id, {
        status: isApprove ? "Approved" : "Rejected",
        approvedBy: user?.full_name || "Management",
        remarks: actionRemarks,
      });
      toast.success(`Subscription "${actionTarget.sub.subscriptionName}" has been ${isApprove ? "Approved" : "Rejected"}!`);
      setActionTarget(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to process approval action");
    } finally {
      setSubmitting(false);
    }
  };

  const isApprove = actionTarget?.action === "Approve";

  return (
    <PageShell>
      <PageHeader
        icon={CheckCircle2}
        title="Subscription Approval Desk"
        description="Review and authorize SaaS license requests, renewals, and budget commitments"
        actions={
          <Button
            variant="outline"
            onClick={reload}
            className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            title="Refresh queue"
          >
            <RefreshCw size={15} />
          </Button>
        }
      />

      <Toolbar>
        <SubTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "pending", label: "Pending Requests", icon: Clock, count: pendingList.length },
            { id: "history", label: "Decision History", icon: History, count: historyList.length },
          ]}
        />
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={activeTab === "pending" ? "Search pending approval requests..." : "Search approval decision history..."}
        />
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading pending approvals..." />
      ) : activeTab === "pending" ? (
        <DataTable columns={PENDING_COLUMNS} minWidth="1050px" footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}>
          {pendingPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={PENDING_COLUMNS.length}
              icon={CheckCircle2}
              title="No pending subscription requests"
              message="All new software & service subscriptions have been processed."
            />
          ) : (
            pendingPaged.rows.map((sub, index) => (
              <tr key={sub.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center`}>
                  <div className="flex items-center justify-center gap-1.5">
                    <Button size="sm" onClick={() => handleOpenActionModal(sub, "Approve")} className="gap-1 text-xs h-7 px-2.5">
                      <CheckCircle2 size={13} />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenActionModal(sub, "Reject")}
                      className="gap-1 text-xs h-7 px-2.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <XCircle size={13} />
                      Reject
                    </Button>
                  </div>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                  {serialNo(sub.sn, pendingPaged.paginationProps.startIndex - 1 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName}</td>
                <td className={TD_CLASS}>{sub.subscriberName}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-800`}>{sub.subscriptionName}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-800 tabular-nums`}>{formatCurrency(sub.price)}</td>
                <td className={TD_CLASS}>
                  <FrequencyTag value={sub.frequency} />
                </td>
                <td className={`${TD_CLASS} max-w-xs truncate text-slate-500`} title={sub.purpose}>
                  {sub.purpose || "-"}
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDateDDMMYYYY(sub.requestedDate || sub.createdAt)}</td>
              </tr>
            ))
          )}
        </DataTable>
      ) : (
        <DataTable columns={HISTORY_COLUMNS} minWidth="1050px" footer={<TablePagination paginationProps={historyPaged.paginationProps} />}>
          {historyPaged.rows.length === 0 ? (
            <EmptyRow colSpan={HISTORY_COLUMNS.length} icon={History} title="No decision history logged yet" />
          ) : (
            historyPaged.rows.map((sub, index) => {
              const approved = sub.status === "Approved" || sub.status === "Paid";
              return (
                <tr key={sub.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                    {serialNo(sub.sn, historyPaged.paginationProps.startIndex - 1 + index)}
                  </td>
                  <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName}</td>
                  <td className={TD_CLASS}>{sub.subscriberName}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-800`}>{sub.subscriptionName}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-800 tabular-nums`}>{formatCurrency(sub.price)}</td>
                  <td className={TD_CLASS}>
                    <FrequencyTag value={sub.frequency} />
                  </td>
                  <td className={TD_CLASS}>
                    <Pill tone={approved ? "emerald" : "red"} icon={approved ? CheckCircle2 : XCircle}>
                      {sub.status}
                    </Pill>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="font-medium text-slate-800 block">{sub.approvedBy || "Admin"}</span>
                    {sub.approvedAt && <span className="text-[10px] text-slate-400">{formatDateTime(sub.approvedAt)}</span>}
                  </td>
                  <td className={`${TD_CLASS} max-w-xs truncate text-slate-500`} title={sub.approvalRemarks}>
                    {sub.approvalRemarks || "-"}
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      )}

      <DocsModal
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        size="sm"
        icon={isApprove ? CheckCircle2 : XCircle}
        title={isApprove ? "Approve Subscription" : "Reject Subscription"}
        description={
          actionTarget
            ? `${actionTarget.sub.subscriptionName} (${formatCurrency(actionTarget.sub.price)} / ${actionTarget.sub.frequency})`
            : ""
        }
        onSubmit={handleConfirmAction}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActionTarget(null)}
              className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={`gap-2 px-4 font-medium text-xs h-9 ${isApprove ? "" : "bg-red-600 text-white hover:bg-red-700"}`}
            >
              {submitting ? <Spinner /> : isApprove ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {submitting ? "Processing..." : isApprove ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </>
        }
      >
        {actionTarget && (
          <>
            <DetailGrid
              items={[
                ["Subscriber Dept", actionTarget.sub.subscriberName],
                ["Division", actionTarget.sub.division || actionTarget.sub.companyName],
              ]}
            />
            {actionTarget.sub.purpose && (
              <p className="text-[11px] text-slate-500 italic">&ldquo;{actionTarget.sub.purpose}&rdquo;</p>
            )}
            <Field
              label={isApprove ? "Approval Notes / Budget Code" : "Reason for Rejection"}
              required={!isApprove}
            >
              <textarea
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                rows={2}
                required={!isApprove}
                placeholder={
                  isApprove
                    ? "e.g. Approved under IT operational budget 2026-27"
                    : "e.g. Budget exceeded / Duplicate tool exists in company"
                }
                className={TEXTAREA_CLASS}
              />
            </Field>
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
