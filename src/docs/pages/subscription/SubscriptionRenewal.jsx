import { useState, useMemo } from "react";
import { RotateCcw, CheckCircle2, History, RefreshCw, CalendarClock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { subscriptionsApi } from "../../services/docsApi";
import { formatCurrency, getDaysUntil, isOverdue, isExpiringSoon } from "../../utils/dateFormatter";
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
  FIELD_CLASS,
  TEXTAREA_CLASS,
  DetailGrid,
  Spinner,
} from "../../components/DocsUI";
import { formatDateDDMMYYYY, serialNo } from "./AllSubscriptions";

const PENDING_COLUMNS = [
  { label: "Action", className: "text-center" },
  "Subscription No.",
  "Division",
  "Subscriber",
  "Subscription",
  "Current Due Date",
  "Days Left",
  "Cost / Cycle",
  { label: "Status", className: "text-center" },
];

const HISTORY_COLUMNS = [
  "Subscription No.",
  "Division",
  "Subscriber",
  "Subscription",
  "Previous Due Date",
  "New Cycle Due Date",
  "Adjusted Cost",
  "Renewed By & Date",
  "Remarks",
];

export default function SubscriptionRenewal() {
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const [renewingSub, setRenewingSub] = useState(null);
  const [nextRenewalDate, setNextRenewalDate] = useState("");
  const [renewPrice, setRenewPrice] = useState("");
  const [renewRemarks, setRenewRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, loading, reload } = useDocsData(
    async () => {
      try {
        const [subs, history] = await Promise.all([subscriptionsApi.list(), subscriptionsApi.listRenewals()]);
        return { subscriptions: subs || [], renewalHistory: history || [] };
      } catch (err) {
        toast.error("Failed to load subscription renewals");
        throw err;
      }
    },
    { subscriptions: [], renewalHistory: [] }
  );
  const { subscriptions, renewalHistory } = data;

  const upcomingRenewals = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return subscriptions
      .filter((s) => s.status !== "Rejected")
      .filter((s) => isDivisionAllowed(s.division || s.companyName, allowedDivisions))
      .filter((s) => {
        const snText = s.sn ? `sn-${s.sn}` : "";
        return (
          !q ||
          s.subscriptionName?.toLowerCase().includes(q) ||
          s.serviceName?.toLowerCase().includes(q) ||
          s.subscriberName?.toLowerCase().includes(q) ||
          (s.division || s.companyName)?.toLowerCase().includes(q) ||
          s.frequency?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      })
      .sort((a, b) => {
        if (!a.renewalDate) return 1;
        if (!b.renewalDate) return -1;
        return new Date(a.renewalDate) - new Date(b.renewalDate);
      });
  }, [subscriptions, searchQuery, allowedDivisions]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return renewalHistory
      .filter((item) => isDivisionAllowed(item.division || item.companyName, allowedDivisions))
      .filter((item) => {
        const snText = item.subSn ? `sn-${item.subSn}` : item.sn ? `sn-${item.sn}` : "";
        return (
          !q ||
          item.subscriptionName?.toLowerCase().includes(q) ||
          (item.division || item.companyName)?.toLowerCase().includes(q) ||
          item.subscriberName?.toLowerCase().includes(q) ||
          item.renewedBy?.toLowerCase().includes(q) ||
          item.remarks?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [renewalHistory, searchQuery, allowedDivisions]);

  const pendingPaged = usePaged(upcomingRenewals);
  const historyPaged = usePaged(filteredHistory);

  const handleOpenRenewModal = (sub) => {
    setRenewingSub(sub);
    setRenewPrice(sub.price || "");
    if (sub.renewalDate) {
      const d = new Date(sub.renewalDate);
      if (sub.frequency === "Monthly") d.setMonth(d.getMonth() + 1);
      else if (sub.frequency === "Quarterly") d.setMonth(d.getMonth() + 3);
      else if (sub.frequency === "Half-Yearly") d.setMonth(d.getMonth() + 6);
      else d.setFullYear(d.getFullYear() + 1);
      setNextRenewalDate(d.toISOString().split("T")[0]);
    } else {
      setNextRenewalDate("");
    }
    setRenewRemarks("");
  };

  const handleConfirmRenewal = async (e) => {
    e.preventDefault();
    if (!renewingSub) return;
    if (!nextRenewalDate) {
      toast.error("Please provide next renewal date");
      return;
    }
    try {
      setSaving(true);
      await subscriptionsApi.recordRenewal(renewingSub.id, {
        nextRenewalDate,
        price: Number(renewPrice) || renewingSub.price,
        remarks: renewRemarks,
      });
      toast.success(`Subscription cycle renewed for "${renewingSub.subscriptionName}"!`);
      setRenewingSub(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to record renewal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={RotateCcw}
        title="Subscription Cycles & Renewals"
        description="Prevent service interruptions by tracking upcoming recurring license renewals"
        actions={
          <Button
            variant="outline"
            onClick={reload}
            className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            title="Refresh renewal desk"
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
            { id: "pending", label: "Upcoming Cycles", icon: CalendarClock, count: upcomingRenewals.length },
            { id: "history", label: "Renewal Log", icon: History, count: filteredHistory.length },
          ]}
        />
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={activeTab === "pending" ? "Search upcoming renewals..." : "Search renewal logs..."}
        />
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading renewal schedules..." />
      ) : activeTab === "pending" ? (
        <DataTable columns={PENDING_COLUMNS} minWidth="1050px" footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}>
          {pendingPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={PENDING_COLUMNS.length}
              icon={CheckCircle2}
              title="No upcoming renewals"
              message="All subscription renewals are currently up to date."
            />
          ) : (
            pendingPaged.rows.map((sub, index) => {
              const daysLeft = sub.renewalDate ? getDaysUntil(sub.renewalDate) : null;
              const overdue = sub.renewalDate ? isOverdue(sub.renewalDate) : false;
              const expiring = sub.renewalDate ? isExpiringSoon(sub.renewalDate, 30) : false;
              return (
                <tr key={sub.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} text-center`}>
                    <Button size="sm" onClick={() => handleOpenRenewModal(sub)} className="gap-1 text-xs h-7 px-2.5">
                      <RotateCcw size={13} />
                      Renew Cycle
                    </Button>
                  </td>
                  <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                    {serialNo(sub.sn, pendingPaged.paginationProps.startIndex - 1 + index)}
                  </td>
                  <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName || "-"}</td>
                  <td className={TD_CLASS}>{sub.subscriberName}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-800`}>{sub.subscriptionName}</td>
                  <td className={`${TD_CLASS} tabular-nums text-slate-800`}>{formatDateDDMMYYYY(sub.renewalDate)}</td>
                  <td className={`${TD_CLASS} tabular-nums font-semibold`}>
                    {daysLeft !== null ? (
                      <span className={overdue ? "text-red-600" : expiring ? "text-amber-600" : "text-emerald-600"}>
                        {overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft} days`}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={`${TD_CLASS} font-semibold text-slate-800 tabular-nums`}>
                    {formatCurrency(sub.price)} <span className="text-[10px] text-slate-400 font-normal">/{sub.frequency}</span>
                  </td>
                  <td className={`${TD_CLASS} text-center`}>
                    <Pill tone={overdue ? "red" : expiring ? "amber" : "emerald"}>
                      {overdue ? "Overdue" : expiring ? "Due Soon" : "Active"}
                    </Pill>
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      ) : (
        <DataTable columns={HISTORY_COLUMNS} minWidth="1100px" footer={<TablePagination paginationProps={historyPaged.paginationProps} />}>
          {historyPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={HISTORY_COLUMNS.length}
              icon={History}
              title="No subscription renewal logs recorded yet"
              message="Renewed cycles will appear here."
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
                <td className={`${TD_CLASS} tabular-nums text-slate-500`}>{formatDateDDMMYYYY(item.previousRenewalDate)}</td>
                <td className={`${TD_CLASS} tabular-nums font-semibold text-emerald-600`}>{formatDateDDMMYYYY(item.newRenewalDate)}</td>
                <td className={`${TD_CLASS} tabular-nums font-semibold text-slate-800`}>
                  {item.renewPrice ? formatCurrency(item.renewPrice) : "-"}
                </td>
                <td className={TD_CLASS}>
                  <div className="font-medium text-slate-800">{item.renewedBy}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{formatDateDDMMYYYY(item.renewedAt)}</div>
                </td>
                <td className={`${TD_CLASS} max-w-xs truncate text-slate-500`} title={item.remarks}>
                  {item.remarks || "-"}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      <DocsModal
        open={!!renewingSub}
        onClose={() => setRenewingSub(null)}
        icon={RotateCcw}
        title="Renew Subscription Cycle"
        description={renewingSub?.subscriptionName}
        onSubmit={handleConfirmRenewal}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenewingSub(null)}
              className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
              {saving ? <Spinner /> : <RotateCcw size={15} />}
              {saving ? "Updating..." : "Confirm Next Cycle"}
            </Button>
          </>
        }
      >
        {renewingSub && (
          <>
            <DetailGrid
              items={[
                ["Subscription", renewingSub.subscriptionName],
                ["Subscriber", renewingSub.subscriberName],
                ["Division", renewingSub.division || renewingSub.companyName || "-"],
                ["Current Expiry", formatDateDDMMYYYY(renewingSub.renewalDate)],
              ]}
            />
            <Field label="Next Cycle Due Date" required>
              <input
                type="date"
                value={nextRenewalDate}
                onChange={(e) => setNextRenewalDate(e.target.value)}
                required
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Renewed Cycle Price (₹)">
              <input
                type="number"
                value={renewPrice}
                onChange={(e) => setRenewPrice(e.target.value)}
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </Field>
            <Field label="Renewal Remarks / Notes">
              <textarea
                value={renewRemarks}
                onChange={(e) => setRenewRemarks(e.target.value)}
                rows={2}
                placeholder="e.g. Plan renewed with 10% annual vendor discount"
                className={TEXTAREA_CLASS}
              />
            </Field>
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
