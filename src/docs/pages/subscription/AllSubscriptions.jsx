import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Plus, CheckCircle2, Clock, Wallet, Trash2, RefreshCw, XCircle, IndianRupee, Download } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { subscriptionsApi } from "../../services/docsApi";
import { formatCurrency } from "../../utils/dateFormatter";
import { getUserAllowedDivisions, isDivisionAllowed } from "../../utils/divisions";
import { docsPath } from "../../utils/access";
import {
  PageShell,
  PageHeader,
  Toolbar,
  SearchInput,
  FilterSelect,
  KpiGrid,
  KpiCard,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  useDocsData,
  LoadingState,
  IconAction,
  Pill,
  exportCsv,
} from "../../components/DocsUI";
import AddSubscriptionModal from "./AddSubscriptionModal";

export const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export const serialNo = (sn, index) => `SN-${String(sn || index + 1).padStart(3, "0")}`;

export const SubscriptionStatusPill = ({ status }) => {
  if (status === "Pending") return <Pill tone="amber" icon={Clock}>Pending Approval</Pill>;
  if (status === "Approved") return <Pill tone="blue" icon={Wallet}>Payment Due</Pill>;
  if (status === "Paid") return <Pill tone="emerald" icon={CheckCircle2}>Active &amp; Paid</Pill>;
  if (status === "Rejected") return <Pill tone="red" icon={XCircle}>Rejected</Pill>;
  return <Pill>{status || "—"}</Pill>;
};

const STAGE_LINK_CLASS =
  "inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors";

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending Approval" },
  { value: "Approved", label: "Approved (Payment Due)" },
  { value: "Paid", label: "Paid / Active" },
  { value: "Rejected", label: "Rejected" },
];

const COLUMNS = [
  { label: "Actions", className: "text-center" },
  "Serial No",
  "Division",
  "Subscriber",
  "Subscription",
  "Cost",
  "Billing Cycle",
  "Purpose",
  "Requested Date",
  "Renewal Date",
  { label: "Status", className: "text-center" },
];

export default function AllSubscriptions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedFrequency, setSelectedFrequency] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const { data: subscriptions, loading, reload } = useDocsData(async () => {
    try {
      return (await subscriptionsApi.list()) || [];
    } catch (err) {
      toast.error("Failed to load subscriptions");
      throw err;
    }
  }, []);

  const handleDelete = async (sub) => {
    if (!window.confirm(`Are you sure you want to delete subscription "${sub.subscriptionName}"?`)) return;
    try {
      await subscriptionsApi.remove(sub.id);
      toast.success("Subscription deleted successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete subscription");
    }
  };

  const divisions = useMemo(() => {
    const set = new Set(
      subscriptions
        .map((s) => s.division || s.companyName)
        .filter(Boolean)
        .filter((div) => isDivisionAllowed(div, allowedDivisions))
    );
    return Array.from(set);
  }, [subscriptions, allowedDivisions]);

  const visibleSubscriptions = useMemo(
    () => subscriptions.filter((s) => isDivisionAllowed(s.division || s.companyName || "", allowedDivisions)),
    [subscriptions, allowedDivisions]
  );

  const filteredSubscriptions = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return visibleSubscriptions.filter((sub) => {
      const subDiv = sub.division || sub.companyName || "";
      const matchesSearch =
        !q ||
        sub.subscriptionName?.toLowerCase().includes(q) ||
        sub.serviceName?.toLowerCase().includes(q) ||
        sub.subscriberName?.toLowerCase().includes(q) ||
        subDiv.toLowerCase().includes(q) ||
        sub.purpose?.toLowerCase().includes(q);
      const matchesStatus = !selectedStatus || sub.status === selectedStatus;
      const matchesFreq = !selectedFrequency || sub.frequency === selectedFrequency;
      const matchesDiv = !selectedDivision || subDiv === selectedDivision;
      return matchesSearch && matchesStatus && matchesFreq && matchesDiv;
    });
  }, [visibleSubscriptions, searchQuery, selectedStatus, selectedFrequency, selectedDivision]);

  const stats = useMemo(() => {
    const list = visibleSubscriptions;
    return {
      totalSpend: list.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
      pending: list.filter((s) => s.status === "Pending").length,
      paid: list.filter((s) => s.status === "Paid").length,
      approved: list.filter((s) => s.status === "Approved").length,
      total: list.length,
    };
  }, [visibleSubscriptions]);

  const { rows, paginationProps } = usePaged(filteredSubscriptions);

  const handleExport = () =>
    exportCsv(
      [
        ["Serial No", "Division", "Subscriber", "Subscription", "Service", "Cost", "Billing Cycle", "Purpose", "Requested Date", "Renewal Date", "Status"],
        ...filteredSubscriptions.map((s, i) => [
          serialNo(s.sn, i),
          s.division || s.companyName,
          s.subscriberName,
          s.subscriptionName,
          s.serviceName,
          s.price,
          s.frequency,
          s.purpose,
          formatDateDDMMYYYY(s.requestedDate || s.createdAt),
          formatDateDDMMYYYY(s.renewalDate),
          s.status,
        ]),
      ],
      "subscriptions"
    );

  return (
    <PageShell>
      <PageHeader
        icon={CreditCard}
        title="Subscriptions & Recurring Services"
        description="Track software licenses, cloud computing charges, and periodic vendor commitments"
        actions={
          <>
            <Button
              variant="outline"
              onClick={reload}
              className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
              title="Refresh list"
            >
              <RefreshCw size={15} />
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 px-4 font-medium text-xs h-9">
              <Plus size={16} />
              Add Subscription
            </Button>
          </>
        }
      />

      <KpiGrid>
        <KpiCard icon={IndianRupee} label="Total Spend" value={formatCurrency(stats.totalSpend)} hint={`${stats.total} subscriptions`} tone="violet" />
        <KpiCard icon={Clock} label="Pending Approval" value={`${stats.pending} Requests`} tone="amber" />
        <KpiCard icon={Wallet} label="Approved & Due" value={stats.approved} tone="blue" />
        <KpiCard icon={CheckCircle2} label="Active & Paid" value={`${stats.paid} Active`} tone="emerald" />
      </KpiGrid>

      <Toolbar>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search subscription, dept, purpose..." />
        <FilterSelect value={selectedStatus} onChange={setSelectedStatus} options={STATUS_OPTIONS} allLabel="All Statuses" />
        <FilterSelect
          value={selectedFrequency}
          onChange={setSelectedFrequency}
          options={["Monthly", "Quarterly", "Half-Yearly", "Yearly"]}
          allLabel="All Billing Cycles"
        />
        <FilterSelect value={selectedDivision} onChange={setSelectedDivision} options={divisions} allLabel="All Divisions" />
        {filteredSubscriptions.length > 0 && (
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            <Download size={15} />
            Export
          </Button>
        )}
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading subscriptions..." />
      ) : (
        <DataTable columns={COLUMNS} minWidth="1150px" footer={<TablePagination paginationProps={paginationProps} />}>
          {rows.length === 0 ? (
            <EmptyRow
              colSpan={COLUMNS.length}
              icon={CreditCard}
              title="No subscriptions found"
              message='Click "Add Subscription" to register a new recurring service or software license.'
            />
          ) : (
            rows.map((sub, index) => (
              <tr key={sub.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center`}>
                  <div className="flex items-center justify-center gap-1.5">
                    {sub.status === "Pending" && (
                      <Link
                        to={docsPath("docs_subscription_approval")}
                        className={`${STAGE_LINK_CLASS} bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100`}
                      >
                        Approve
                      </Link>
                    )}
                    {sub.status === "Approved" && (
                      <Link
                        to={docsPath("docs_subscription_payment")}
                        className={`${STAGE_LINK_CLASS} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}
                      >
                        Pay
                      </Link>
                    )}
                    {sub.status === "Paid" && (
                      <Link
                        to={docsPath("docs_subscription_renewal")}
                        className={`${STAGE_LINK_CLASS} bg-primary/5 text-primary border-primary/20 hover:bg-primary/10`}
                      >
                        Renew
                      </Link>
                    )}
                    <IconAction icon={Trash2} title="Delete Subscription" tone="danger" onClick={() => handleDelete(sub)} />
                  </div>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary tabular-nums`}>
                  {serialNo(sub.sn, (paginationProps.startIndex || 1) - 1 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName}</td>
                <td className={TD_CLASS}>{sub.subscriberName}</td>
                <td className={TD_CLASS}>
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">{sub.subscriptionName}</span>
                    {sub.serviceName && <span className="text-[11px] text-slate-400">{sub.serviceName}</span>}
                  </div>
                </td>
                <td className={`${TD_CLASS} font-semibold text-slate-800 tabular-nums`}>{formatCurrency(sub.price)}</td>
                <td className={TD_CLASS}>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">
                    {sub.frequency}
                  </span>
                </td>
                <td className={`${TD_CLASS} max-w-xs truncate text-slate-500`} title={sub.purpose}>
                  {sub.purpose || "-"}
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDateDDMMYYYY(sub.requestedDate || sub.createdAt)}</td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDateDDMMYYYY(sub.renewalDate)}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <SubscriptionStatusPill status={sub.status} />
                </td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      <AddSubscriptionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onCreated={reload} />
    </PageShell>
  );
}
