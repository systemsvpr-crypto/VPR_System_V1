import { useState, useMemo } from "react";
import { Wallet, CheckCircle2, Clock, History, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { subscriptionsApi } from "../../services/docsApi";
import { formatCurrency } from "../../utils/dateFormatter";
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
  DocsModal,
  Field,
  FormGrid,
  FIELD_CLASS,
  TEXTAREA_CLASS,
  DetailGrid,
  Spinner,
} from "../../components/DocsUI";
import { formatDateDDMMYYYY, serialNo } from "./AllSubscriptions";

const PAYMENT_MODES = [
  "Corporate Credit Card",
  "Net Banking / NEFT",
  "RTGS",
  "UPI / Auto-Debit",
  "Cheque / DD",
  "Debit Card",
];

const PENDING_COLUMNS = [
  { label: "Action", className: "text-center" },
  "Subscription No.",
  "Division",
  "Subscriber",
  "Subscription",
  "Amount Due",
  "Billing Cycle",
  "Approved On",
];

const HISTORY_COLUMNS = [
  "Subscription No.",
  "Division",
  "Subscriber",
  "Subscription",
  "Amount Paid",
  "Billing Cycle",
  "Payment Mode",
  "Txn / UTR Reference",
  "Payment Date",
];

const todayIso = () => new Date().toISOString().split("T")[0];

const Tag = ({ children }) => (
  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{children}</span>
);

export default function SubscriptionPayment() {
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const [payingSub, setPayingSub] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState("Corporate Credit Card");
  const [transactionRef, setTransactionRef] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, loading, reload } = useDocsData(
    async () => {
      try {
        const [subs, history] = await Promise.all([subscriptionsApi.list(), subscriptionsApi.listPayments()]);
        return { subscriptions: subs || [], paymentHistory: history || [] };
      } catch (err) {
        toast.error("Failed to load payments");
        throw err;
      }
    },
    { subscriptions: [], paymentHistory: [] }
  );
  const { subscriptions, paymentHistory } = data;

  const pendingPayments = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return subscriptions
      .filter((s) => s.status === "Approved")
      .filter((s) => {
        const subDiv = s.division || s.companyName || "";
        if (!isDivisionAllowed(subDiv, allowedDivisions)) return false;
        const snText = s.sn ? `sn-${s.sn}` : "";
        return (
          !q ||
          s.subscriptionName?.toLowerCase().includes(q) ||
          s.serviceName?.toLowerCase().includes(q) ||
          s.subscriberName?.toLowerCase().includes(q) ||
          subDiv.toLowerCase().includes(q) ||
          s.frequency?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [subscriptions, searchQuery, allowedDivisions]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return paymentHistory.filter((item) => {
      const itemDiv = item.division || item.companyName || "";
      if (!isDivisionAllowed(itemDiv, allowedDivisions)) return false;
      const snText = item.subSn ? `sn-${item.subSn}` : item.sn ? `sn-${item.sn}` : "";
      return (
        !q ||
        item.subscriptionName?.toLowerCase().includes(q) ||
        itemDiv.toLowerCase().includes(q) ||
        item.subscriberName?.toLowerCase().includes(q) ||
        item.transactionRef?.toLowerCase().includes(q) ||
        item.paymentMode?.toLowerCase().includes(q) ||
        item.recordedBy?.toLowerCase().includes(q) ||
        snText.includes(q)
      );
    });
  }, [paymentHistory, searchQuery, allowedDivisions]);

  const pendingPaged = usePaged(pendingPayments);
  const historyPaged = usePaged(filteredHistory);

  const handleOpenPayModal = (sub) => {
    setPayingSub(sub);
    setPaymentAmount(sub.price || "");
    setPaymentDate(todayIso());
    setPaymentMode("Corporate Credit Card");
    setTransactionRef("");
    setPaymentRemarks("");
  };

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    if (!payingSub) return;
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    try {
      setSaving(true);
      await subscriptionsApi.pay(payingSub.id, {
        amountPaid: Number(paymentAmount),
        paymentDate,
        paymentMode,
        transactionRef,
        remarks: paymentRemarks,
      });
      toast.success(`Payment of ${formatCurrency(paymentAmount)} recorded for "${payingSub.subscriptionName}"!`);
      setPayingSub(null);
    } catch (err) {
      console.error("Error recording payment:", err);
      toast.error("Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={Wallet}
        title="Subscription Payment Desk"
        description="Disburse approved software invoices, capture UTR references, and log expenditure"
        actions={
          <Button
            variant="outline"
            onClick={reload}
            className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            title="Refresh payment desk"
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
            { id: "pending", label: "Awaiting Payment", icon: Clock, count: pendingPayments.length },
            { id: "history", label: "Payment Log", icon: History, count: filteredHistory.length },
          ]}
        />
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={activeTab === "pending" ? "Search approved services..." : "Search payment logs by service, UTR..."}
        />
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading payment queue..." />
      ) : activeTab === "pending" ? (
        <DataTable columns={PENDING_COLUMNS} minWidth="950px" footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}>
          {pendingPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={PENDING_COLUMNS.length}
              icon={CheckCircle2}
              title="No pending approved payments"
              message="All approved subscription invoices have been settled."
            />
          ) : (
            pendingPaged.rows.map((sub, index) => (
              <tr key={sub.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center`}>
                  <Button size="sm" onClick={() => handleOpenPayModal(sub)} className="gap-1 text-xs h-7 px-2.5">
                    <Wallet size={13} />
                    Record Payment
                  </Button>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                  {serialNo(sub.sn, pendingPaged.paginationProps.startIndex - 1 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName}</td>
                <td className={TD_CLASS}>{sub.subscriberName}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-800`}>{sub.subscriptionName}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-800 tabular-nums`}>{formatCurrency(sub.price)}</td>
                <td className={TD_CLASS}>
                  <Tag>{sub.frequency}</Tag>
                </td>
                <td className={TD_CLASS}>
                  <span className="tabular-nums">{formatDateDDMMYYYY(sub.approvedAt || sub.updatedAt || sub.requestedDate)}</span>
                  {sub.approvedBy && <span className="block text-[10px] text-slate-400">by {sub.approvedBy}</span>}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      ) : (
        <DataTable columns={HISTORY_COLUMNS} minWidth="1050px" footer={<TablePagination paginationProps={historyPaged.paginationProps} />}>
          {historyPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={HISTORY_COLUMNS.length}
              icon={History}
              title="No payment transactions recorded yet"
              message="Transactions will appear here after recording payments."
            />
          ) : (
            historyPaged.rows.map((item) => (
              <tr key={item.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                  {item.subSn || item.sn ? serialNo(item.subSn || item.sn, 0) : "-"}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{item.division || item.companyName || "-"}</td>
                <td className={TD_CLASS}>{item.subscriberName || "-"}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-800`}>{item.subscriptionName}</td>
                <td className={`${TD_CLASS} font-semibold text-emerald-600 tabular-nums`}>{formatCurrency(item.amountPaid)}</td>
                <td className={TD_CLASS}>
                  <Tag>{item.frequency || "Monthly"}</Tag>
                </td>
                <td className={TD_CLASS}>
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600">
                    {item.paymentMode}
                  </span>
                </td>
                <td className={`${TD_CLASS} tabular-nums text-slate-500`}>{item.transactionRef || "-"}</td>
                <td className={`${TD_CLASS} tabular-nums text-slate-800`}>{formatDateDDMMYYYY(item.paymentDate)}</td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      <DocsModal
        open={!!payingSub}
        onClose={() => setPayingSub(null)}
        icon={Wallet}
        title="Record Subscription Payment"
        description={payingSub?.subscriptionName}
        onSubmit={handleConfirmPayment}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayingSub(null)}
              className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
              {saving ? <Spinner /> : <Wallet size={15} />}
              {saving ? "Recording..." : "Record Payment"}
            </Button>
          </>
        }
      >
        {payingSub && (
          <>
            <DetailGrid
              items={[
                ["Subscription", payingSub.subscriptionName],
                ["Subscriber", payingSub.subscriberName],
                ["Division", payingSub.division || payingSub.companyName || "-"],
                ["Approved Cost", `${formatCurrency(payingSub.price)} (${payingSub.frequency})`],
              ]}
            />
            <FormGrid>
              <Field label="Amount Paid (₹)" required>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  min="1"
                  className={`${FIELD_CLASS} tabular-nums`}
                />
              </Field>
              <Field label="Payment Date" required>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className={FIELD_CLASS}
                />
              </Field>
            </FormGrid>
            <Field label="Payment Mode" required>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={FIELD_CLASS}>
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transaction / UTR Reference">
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. TXN-HDFC-991823 / UTR-001928"
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Payment Remarks">
              <textarea
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                rows={2}
                placeholder="e.g. Auto-debited from primary operating account"
                className={TEXTAREA_CLASS}
              />
            </Field>
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
