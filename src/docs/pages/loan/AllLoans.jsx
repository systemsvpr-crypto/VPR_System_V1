import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Coins,
  Plus,
  CheckCircle2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  FileText,
  IndianRupee,
  Wallet,
  Download,
  Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { loansApi } from "../../services/docsApi";
import { openFileAttachment } from "../../utils/fileDownloader";
import { formatCurrency } from "../../utils/dateFormatter";
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
  LoadingState,
  IconAction,
  Pill,
  useDocsData,
  exportCsv,
} from "../../components/DocsUI";
import AddLoanModal from "./AddLoanModal";

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const serialOf = (loan, index) => `LN-${String(loan.sn || index + 1).padStart(3, "0")}`;

const LINK_CHIP =
  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors";

export default function AllLoans() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBank, setSelectedBank] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { data: loans, loading, reload } = useDocsData(async () => {
    try {
      return (await loansApi.list()) || [];
    } catch (err) {
      toast.error("Failed to load loan portfolio");
      throw err;
    }
  }, []);

  const handleDelete = async (loan) => {
    if (!window.confirm(`Are you sure you want to delete loan "${loan.loanName}"?`)) return;
    try {
      await loansApi.remove(loan.id);
      toast.success("Loan facility deleted successfully");
      reload();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete loan");
    }
  };

  const banks = useMemo(() => Array.from(new Set(loans.map((l) => l.bankName).filter(Boolean))), [loans]);

  const filteredLoans = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return loans.filter((loan) => {
      const snText = loan.sn ? `ln-${loan.sn}` : "";
      const matchesSearch =
        !q ||
        loan.loanName?.toLowerCase().includes(q) ||
        loan.bankName?.toLowerCase().includes(q) ||
        loan.collateralDocument?.toLowerCase().includes(q) ||
        loan.remarks?.toLowerCase().includes(q) ||
        loan.fileName?.toLowerCase().includes(q) ||
        loan.accountNumber?.toLowerCase().includes(q) ||
        snText.includes(q);
      const matchesStatus = selectedStatus === "All" || loan.status === selectedStatus;
      const matchesBank = selectedBank === "All" || loan.bankName === selectedBank;
      return matchesSearch && matchesStatus && matchesBank;
    });
  }, [loans, searchQuery, selectedStatus, selectedBank]);

  const stats = useMemo(() => {
    const active = loans.filter((l) => l.status === "Active");
    return {
      activeCount: active.length,
      closedCount: loans.length - active.length,
      totalOutstanding: active.reduce((sum, l) => sum + (Number(l.outstandingAmount) || 0), 0),
      totalMonthlyEmi: active.reduce((sum, l) => sum + (Number(l.emiAmount) || 0), 0),
    };
  }, [loans]);

  const { rows, paginationProps } = usePaged(filteredLoans);

  const handleExport = () =>
    exportCsv(
      [
        ["Serial No", "Loan Name", "Bank", "Amount", "EMI", "Outstanding", "Start Date", "End Date", "Collateral", "File", "Remarks", "Status"],
        ...filteredLoans.map((l, i) => [
          serialOf(l, i),
          l.loanName,
          l.bankName,
          l.loanAmount,
          l.emiAmount,
          l.outstandingAmount,
          formatDateDDMMYYYY(l.startDate),
          formatDateDDMMYYYY(l.endDate || l.maturityDate),
          l.collateralDocument,
          l.fileName,
          l.remarks,
          l.status,
        ]),
      ],
      "loans"
    );

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Commercial Loans & Liabilities"
        description="Track active corporate term loans, machinery financing, EMIs, and NOC closures"
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
              Add Bank Loan
            </Button>
          </>
        }
      />

      <KpiGrid>
        <KpiCard icon={IndianRupee} tone="red" label="Total Outstanding Debt" value={formatCurrency(stats.totalOutstanding)} />
        <KpiCard icon={Wallet} tone="blue" label="Monthly EMI Outflow" value={formatCurrency(stats.totalMonthlyEmi)} />
        <KpiCard icon={CheckCircle2} tone="emerald" label="Active Facilities" value={`${stats.activeCount} Active`} />
        <KpiCard icon={ShieldCheck} tone="slate" label="Closed Loans" value={`${stats.closedCount} Settled`} />
      </KpiGrid>

      <Toolbar>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search loan name, bank, collateral..." />
        <FilterSelect
          value={selectedStatus === "All" ? "" : selectedStatus}
          onChange={(v) => setSelectedStatus(v || "All")}
          allLabel="All Loan Statuses"
          options={[
            { value: "Active", label: "Active Facilities" },
            { value: "Closed", label: "Closed / Settled" },
          ]}
        />
        <FilterSelect
          value={selectedBank === "All" ? "" : selectedBank}
          onChange={(v) => setSelectedBank(v || "All")}
          allLabel="All Banks"
          options={banks}
        />
        {filteredLoans.length > 0 && (
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
        <LoadingState text="Loading loan accounts..." />
      ) : (
        <DataTable
          minWidth="1300px"
          columns={[
            { label: "Actions", className: "text-center" },
            "Serial No.",
            "Loan Name",
            "Bank Name",
            "Amount",
            "EMI",
            "Loan Start Date",
            "Loan End Date",
            "Collateral Document",
            { label: "File", className: "text-center" },
            "Remarks",
            { label: "Status", className: "text-center" },
          ]}
          footer={<TablePagination paginationProps={paginationProps} />}
        >
          {rows.length === 0 ? (
            <EmptyRow
              colSpan={12}
              icon={Coins}
              title="No commercial loans found"
              message='Click "Add Bank Loan" to record bank borrowings and asset loans.'
            />
          ) : (
            rows.map((loan, index) => (
              <tr key={loan.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center`}>
                  <div className="flex items-center justify-center gap-1.5">
                    {loan.status === "Active" ? (
                      <Link
                        to={docsPath("docs_loan_foreclosure")}
                        className={`${LINK_CHIP} bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100`}
                        title="Request Loan Foreclosure"
                      >
                        <AlertTriangle size={12} />
                        Foreclose
                      </Link>
                    ) : (
                      <span
                        className={`${LINK_CHIP} bg-slate-50 text-slate-400 border-slate-200 font-medium`}
                        title="Loan already closed"
                      >
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        Settled
                      </span>
                    )}
                    <Link
                      to={docsPath("docs_loan_noc")}
                      className={`${LINK_CHIP} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}
                      title="View NOC Document Status"
                    >
                      <ShieldCheck size={12} />
                      NOC
                    </Link>
                    <IconAction icon={Trash2} tone="danger" title="Delete Loan Facility" onClick={() => handleDelete(loan)} />
                  </div>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary`}>{serialOf(loan, paginationProps.startIndex - 1 + index)}</td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{loan.loanName}</td>
                <td className={TD_CLASS}>{loan.bankName}</td>
                <td className={`${TD_CLASS} font-semibold text-slate-900 tabular-nums`}>{formatCurrency(loan.loanAmount)}</td>
                <td className={`${TD_CLASS} tabular-nums`}>{loan.emiAmount ? formatCurrency(loan.emiAmount) : "-"}</td>
                <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.startDate)}</td>
                <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.endDate || loan.maturityDate)}</td>
                <td className={`${TD_CLASS} max-w-[220px] truncate`} title={loan.collateralDocument}>
                  {loan.collateralDocument || "-"}
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  {loan.fileName || loan.fileUrl || (loan.attachments && loan.attachments.length > 0) ? (
                    <button
                      type="button"
                      onClick={() => openFileAttachment(loan.attachments?.[0] || loan.fileUrl || loan.fileName, loan)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
                      title={loan.fileName ? `View ${loan.fileName}` : "View Attached Document"}
                    >
                      <Eye size={13} />
                      <span>View</span>
                    </button>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className={`${TD_CLASS} text-slate-500 max-w-[220px] truncate`} title={loan.remarks}>
                  {loan.remarks || "-"}
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <Pill tone={loan.status === "Active" ? "emerald" : "slate"} icon={loan.status === "Active" ? CheckCircle2 : ShieldCheck}>
                    {loan.status}
                  </Pill>
                </td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      <AddLoanModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onCreated={reload} />
    </PageShell>
  );
}
