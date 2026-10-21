import { useMemo, useState } from "react";
import { ShieldCheck, CheckCircle2, Clock, History, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { loansApi } from "../../services/docsApi";
import { formatCurrency } from "../../utils/dateFormatter";
import {
  PageShell,
  PageHeader,
  SubTabs,
  Toolbar,
  SearchInput,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  LoadingState,
  Pill,
  DocsModal,
  Field,
  FIELD_CLASS,
  TEXTAREA_CLASS,
  DetailGrid,
  Spinner,
  useDocsData,
} from "../../components/DocsUI";

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const todayStr = () => new Date().toISOString().split("T")[0];
const serialOf = (loan, index) => `LN-${String(loan.sn || index + 1).padStart(3, "0")}`;
const OUTLINE_BTN = "px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50";

export default function LoanNOC() {
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' | 'collected'
  const [searchQuery, setSearchQuery] = useState("");

  const [collectingLoan, setCollectingLoan] = useState(null);
  const [nocNumber, setNocNumber] = useState("");
  const [nocDate, setNocDate] = useState(todayStr());
  const [nocRemarks, setNocRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: loans, loading, reload } = useDocsData(async () => {
    try {
      return (await loansApi.list()) || [];
    } catch (err) {
      toast.error("Failed to load NOC records");
      throw err;
    }
  }, []);

  const pendingNocList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return loans
      .filter((l) => l.collectNocStatus !== "Yes")
      .filter((l) => {
        const snText = l.sn ? `ln-${l.sn}` : "";
        return (
          !q ||
          l.loanName?.toLowerCase().includes(q) ||
          l.bankName?.toLowerCase().includes(q) ||
          l.collateralDocument?.toLowerCase().includes(q) ||
          l.remarks?.toLowerCase().includes(q) ||
          l.accountNumber?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [loans, searchQuery]);

  const collectedNocList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return loans
      .filter((l) => l.collectNocStatus === "Yes")
      .filter((l) => {
        const snText = l.sn ? `ln-${l.sn}` : "";
        return (
          !q ||
          l.loanName?.toLowerCase().includes(q) ||
          l.bankName?.toLowerCase().includes(q) ||
          l.nocNumber?.toLowerCase().includes(q) ||
          l.collateralDocument?.toLowerCase().includes(q) ||
          l.nocRemarks?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [loans, searchQuery]);

  const pendingPaged = usePaged(pendingNocList);
  const collectedPaged = usePaged(collectedNocList);

  const handleOpenCollectModal = (loan) => {
    setCollectingLoan(loan);
    setNocNumber("");
    setNocDate(todayStr());
    setNocRemarks("");
  };

  const handleConfirmCollect = async (e) => {
    e.preventDefault();
    if (!collectingLoan) return;
    if (!nocNumber.trim()) {
      toast.error("Please enter the Bank NOC certificate / reference number");
      return;
    }
    try {
      setSaving(true);
      await loansApi.collectNoc(collectingLoan.id, { nocNumber, nocDate, remarks: nocRemarks });
      toast.success(`NOC recorded for "${collectingLoan.loanName}"! Loan charge satisfied.`);
      setCollectingLoan(null);
      reload();
    } catch (err) {
      console.error(err);
      toast.error("Failed to record NOC");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={ShieldCheck}
        title="Bank NOC & Charge Satisfaction Desk"
        description="Track collection of No Objection Certificates and removal of bank hypothecation / ROC charges"
        actions={
          <Button variant="outline" onClick={reload} className={`gap-2 ${OUTLINE_BTN} px-3`} title="Refresh desk">
            <RefreshCw size={15} />
          </Button>
        }
      />

      <Toolbar>
        <SubTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "pending", label: "Awaiting NOC", icon: Clock, count: pendingNocList.length },
            { id: "collected", label: "Collected NOC Archive", icon: History, count: collectedNocList.length },
          ]}
        />
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={activeTab === "pending" ? "Search loans awaiting NOC..." : "Search collected NOCs by bank, ref..."}
        />
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading NOC checklist..." />
      ) : activeTab === "pending" ? (
        <DataTable
          minWidth="1100px"
          columns={[
            { label: "Action", className: "text-center" },
            "Serial No.",
            "Loan Name",
            "Lending Bank",
            "Loan Amount",
            "Loan Start Date",
            "Loan End Date",
            "Closure Request Date",
            { label: "Document Status", className: "text-center" },
          ]}
          footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}
        >
          {pendingPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={9}
              icon={CheckCircle2}
              title="All loan facilities have NOC certificates collected"
              message="All satisfied charges have been archived."
            />
          ) : (
            pendingPaged.rows.map((loan, index) => {
              const closureDate =
                loan.foreclosureStatus === "Settled" || loan.status === "Closed"
                  ? loan.updatedAt || loan.startDate
                  : loan.foreclosureStatus === "Requested"
                  ? loan.updatedAt
                  : "-";
              return (
                <tr key={loan.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} text-center`}>
                    <Button size="sm" onClick={() => handleOpenCollectModal(loan)} className="gap-1.5 text-xs h-8 px-3">
                      <ShieldCheck size={14} />
                      Collect NOC
                    </Button>
                  </td>
                  <td className={`${TD_CLASS} font-semibold text-primary`}>
                    {serialOf(loan, pendingPaged.paginationProps.startIndex - 1 + index)}
                  </td>
                  <td className={`${TD_CLASS} font-medium text-slate-800`}>{loan.loanName}</td>
                  <td className={TD_CLASS}>{loan.bankName}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-900 tabular-nums`}>{formatCurrency(loan.loanAmount)}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.startDate)}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.endDate || loan.maturityDate)}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(closureDate)}</td>
                  <td className={`${TD_CLASS} text-center`}>
                    <Pill tone="amber" icon={Clock}>
                      NOC Pending
                    </Pill>
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      ) : (
        <DataTable
          minWidth="1200px"
          columns={[
            "Serial No.",
            "Loan Name",
            "Lending Bank",
            "Loan Start Date",
            "Loan End Date",
            "NOC Certificate No.",
            "Collection Date",
            { label: "Document Status", className: "text-center" },
            "Recorded By",
            "Remarks",
          ]}
          footer={<TablePagination paginationProps={collectedPaged.paginationProps} />}
        >
          {collectedPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={10}
              icon={History}
              title="No collected NOCs in archive"
              message="Discharged loans with confirmed NOC certificates will appear here."
            />
          ) : (
            collectedPaged.rows.map((loan, index) => (
              <tr key={loan.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} font-semibold text-primary`}>
                  {serialOf(loan, collectedPaged.paginationProps.startIndex - 1 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{loan.loanName}</td>
                <td className={TD_CLASS}>{loan.bankName}</td>
                <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.startDate)}</td>
                <td className={TD_CLASS}>{formatDateDDMMYYYY(loan.endDate || loan.maturityDate)}</td>
                <td className={`${TD_CLASS} font-semibold text-primary`}>{loan.nocNumber || "-"}</td>
                <td className={`${TD_CLASS} text-slate-800`}>{formatDateDDMMYYYY(loan.nocDate)}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <Pill tone="emerald" icon={CheckCircle2}>
                    NOC Received &amp; Cleared
                  </Pill>
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-700`}>{loan.nocCollectedBy || "Admin"}</td>
                <td className={`${TD_CLASS} text-slate-500 max-w-[220px] truncate`} title={loan.nocRemarks}>
                  {loan.nocRemarks || "Charge satisfied"}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      <DocsModal
        open={!!collectingLoan}
        onClose={() => setCollectingLoan(null)}
        icon={ShieldCheck}
        title="Record Bank NOC Clearance"
        description={collectingLoan?.loanName}
        onSubmit={handleConfirmCollect}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCollectingLoan(null)} className={OUTLINE_BTN}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
              {saving ? <Spinner /> : <ShieldCheck size={14} />}
              {saving ? "Recording..." : "Save NOC Record"}
            </Button>
          </>
        }
      >
        {collectingLoan && (
          <>
            <DetailGrid
              items={[
                ["Bank / Inst.", collectingLoan.bankName],
                ["Loan Amount", formatCurrency(collectingLoan.loanAmount)],
                ["Loan Start Date", formatDateDDMMYYYY(collectingLoan.startDate)],
                ["Loan End Date", formatDateDDMMYYYY(collectingLoan.endDate || collectingLoan.maturityDate)],
              ]}
            />
            <Field label="Bank NOC Certificate / Reference Number" required>
              <input
                type="text"
                value={nocNumber}
                onChange={(e) => setNocNumber(e.target.value)}
                placeholder="e.g. NOC/HDFC/2026/88129"
                required
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="NOC Issue / Receipt Date" required>
              <input type="date" value={nocDate} onChange={(e) => setNocDate(e.target.value)} required className={FIELD_CLASS} />
            </Field>
            <Field label="ROC Satisfaction & Handover Remarks">
              <textarea
                value={nocRemarks}
                onChange={(e) => setNocRemarks(e.target.value)}
                rows={2}
                placeholder="e.g. Original property deeds retrieved from bank branch. ROC Form CHG-4 filed."
                className={TEXTAREA_CLASS}
              />
            </Field>
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
