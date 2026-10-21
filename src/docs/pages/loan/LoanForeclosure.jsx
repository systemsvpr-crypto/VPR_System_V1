import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, History, Plus, Send, ShieldCheck, RefreshCw } from "lucide-react";
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
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const OUTLINE_BTN = "px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50";

export default function LoanForeclosure() {
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' | 'settled'
  const [searchQuery, setSearchQuery] = useState("");

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [foreclosureReason, setForeclosureReason] = useState("");
  const [foreclosureRemarks, setForeclosureRemarks] = useState("");
  const [submittingReq, setSubmittingReq] = useState(false);

  const [settlingFc, setSettlingFc] = useState(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementRemarks, setSettlementRemarks] = useState("");
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const { data, loading, reload } = useDocsData(
    async () => {
      try {
        const [lns, fcs] = await Promise.all([loansApi.list(), loansApi.listForeclosures()]);
        return { loans: lns || [], foreclosures: fcs || [] };
      } catch (err) {
        toast.error("Failed to load loan foreclosures");
        throw err;
      }
    },
    { loans: [], foreclosures: [] }
  );
  const { loans, foreclosures } = data;

  const activeLoansForRequest = useMemo(
    () => loans.filter((l) => l.status === "Active" && l.foreclosureStatus !== "Requested"),
    [loans]
  );

  const getLoanDetails = (fc) => {
    const loan = loans.find((l) => l.id === fc.loanId);
    return {
      sn: loan?.sn || fc.sn,
      loanName: loan?.loanName || fc.loanName,
      bankName: loan?.bankName || fc.bankName,
      loanAmount: loan?.loanAmount || fc.loanAmount || fc.outstandingAmount,
      outstandingAmount: loan?.outstandingAmount !== undefined ? loan.outstandingAmount : fc.outstandingAmount,
      emiAmount: loan?.emiAmount || fc.emiAmount || 0,
      startDate: loan?.startDate || fc.startDate,
      endDate: loan?.endDate || loan?.maturityDate || fc.endDate,
      collateralDocument: loan?.collateralDocument || fc.collateralDocument || "-",
      remarks: fc.remarks || fc.reason || loan?.remarks || "-",
      fileName: loan?.fileName || fc.fileName || "",
    };
  };

  const pendingForeclosures = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return foreclosures
      .filter((f) => f.status !== "Settled")
      .filter((f) => {
        const details = getLoanDetails(f);
        const snText = details.sn ? `ln-${details.sn}` : "";
        return (
          !q ||
          details.loanName?.toLowerCase().includes(q) ||
          details.bankName?.toLowerCase().includes(q) ||
          details.collateralDocument?.toLowerCase().includes(q) ||
          details.remarks?.toLowerCase().includes(q) ||
          f.reason?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [foreclosures, loans, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const settledForeclosures = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return foreclosures
      .filter((f) => f.status === "Settled")
      .filter((f) => {
        const details = getLoanDetails(f);
        const snText = details.sn ? `ln-${details.sn}` : "";
        return (
          !q ||
          details.loanName?.toLowerCase().includes(q) ||
          details.bankName?.toLowerCase().includes(q) ||
          details.collateralDocument?.toLowerCase().includes(q) ||
          details.remarks?.toLowerCase().includes(q) ||
          f.settledRemarks?.toLowerCase().includes(q) ||
          snText.includes(q)
        );
      });
  }, [foreclosures, loans, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingPaged = usePaged(pendingForeclosures);
  const settledPaged = usePaged(settledForeclosures);

  const closeRequestModal = () => {
    setIsRequestModalOpen(false);
    setSelectedLoanId("");
    setForeclosureReason("");
    setForeclosureRemarks("");
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!selectedLoanId) {
      toast.error("Please select an active loan facility");
      return;
    }
    if (!foreclosureReason.trim()) {
      toast.error("Please provide reason for foreclosure");
      return;
    }
    try {
      setSubmittingReq(true);
      await loansApi.foreclosureRequest(selectedLoanId, {
        reason: foreclosureReason,
        remarks: foreclosureRemarks,
      });
      toast.success("Foreclosure request initiated successfully!");
      closeRequestModal();
      reload();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit foreclosure request");
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleOpenSettleModal = (fc) => {
    setSettlingFc(fc);
    setSettlementAmount(fc.outstandingAmount || "");
    setSettlementRemarks("");
  };

  const handleConfirmSettle = async (e) => {
    e.preventDefault();
    if (!settlingFc) return;
    try {
      setSubmittingSettle(true);
      await loansApi.foreclosureApproveOrSettle(settlingFc.id, {
        action: "settle",
        settlementAmount,
        remarks: settlementRemarks,
      });
      toast.success(`Loan "${settlingFc.loanName}" settled and marked Closed! Proceed to NOC collection.`);
      setSettlingFc(null);
      reload();
    } catch (err) {
      console.error(err);
      toast.error("Failed to settle foreclosure");
    } finally {
      setSubmittingSettle(false);
    }
  };

  const serialOf = (details, index) => `LN-${String(details.sn || index + 1).padStart(3, "0")}`;

  return (
    <PageShell>
      <PageHeader
        icon={AlertTriangle}
        title="Loan Foreclosure & Early Pre-Closure"
        description="Initiate early loan payoff requests, settle pending balances, and initiate NOC tracking"
        actions={
          <>
            <Button variant="outline" onClick={reload} className={`gap-2 ${OUTLINE_BTN} px-3`} title="Refresh list">
              <RefreshCw size={15} />
            </Button>
            <Button onClick={() => setIsRequestModalOpen(true)} className="gap-2 px-4 font-medium text-xs h-9">
              <Plus size={16} />
              Request Foreclosure
            </Button>
          </>
        }
      />

      <Toolbar>
        <SubTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "pending", label: "Pending Requests", icon: Clock, count: pendingForeclosures.length },
            { id: "settled", label: "Settled Archive", icon: History, count: settledForeclosures.length },
          ]}
        />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search foreclosure records..." />
      </Toolbar>

      {loading ? (
        <LoadingState text="Loading foreclosure queue..." />
      ) : activeTab === "pending" ? (
        <DataTable
          minWidth="1200px"
          columns={[
            { label: "Action", className: "text-center" },
            "Serial No.",
            "Loan Name",
            "Bank Name",
            "Amount",
            "EMI",
            "Loan Start Date",
            "Loan End Date",
            "Provided Document",
            "Remarks",
          ]}
          footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}
        >
          {pendingPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={10}
              icon={CheckCircle2}
              title="No pending foreclosure requests"
              message="All loan facilities are operating normally or already settled."
            />
          ) : (
            pendingPaged.rows.map((fc, index) => {
              const details = getLoanDetails(fc);
              return (
                <tr key={fc.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} text-center`}>
                    <Button size="sm" onClick={() => handleOpenSettleModal(fc)} className="gap-1.5 text-xs h-8 px-3">
                      <CheckCircle2 size={14} />
                      Settle &amp; Close
                    </Button>
                  </td>
                  <td className={`${TD_CLASS} font-semibold text-primary`}>
                    {serialOf(details, pendingPaged.paginationProps.startIndex - 1 + index)}
                  </td>
                  <td className={`${TD_CLASS} font-medium text-slate-800`}>
                    <div className="flex items-center gap-2">
                      {details.loanName}
                      {fc.status === "Approved" && <Pill tone="blue">Approved</Pill>}
                    </div>
                  </td>
                  <td className={TD_CLASS}>{details.bankName}</td>
                  <td className={`${TD_CLASS} tabular-nums`}>
                    <span className="font-semibold text-slate-900 block">{formatCurrency(details.loanAmount)}</span>
                    <span className="text-[10px] text-red-600 font-semibold block">
                      Bal: {formatCurrency(details.outstandingAmount)}
                    </span>
                  </td>
                  <td className={`${TD_CLASS} tabular-nums`}>{details.emiAmount ? formatCurrency(details.emiAmount) : "-"}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(details.startDate)}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(details.endDate)}</td>
                  <td className={`${TD_CLASS} max-w-[220px] truncate`} title={details.collateralDocument}>
                    {details.collateralDocument}
                  </td>
                  <td className={`${TD_CLASS} text-slate-500 max-w-[220px] truncate`} title={details.remarks}>
                    {details.remarks}
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      ) : (
        <DataTable
          minWidth="1250px"
          columns={[
            "Serial No.",
            "Loan Name",
            "Bank Name",
            "Sanctioned Amount",
            "Settlement Paid",
            "EMI",
            "Loan Start Date",
            "Loan End Date",
            "Settled Date",
            { label: "Status", className: "text-center" },
            "Remarks",
          ]}
          footer={<TablePagination paginationProps={settledPaged.paginationProps} />}
        >
          {settledPaged.rows.length === 0 ? (
            <EmptyRow
              colSpan={11}
              icon={History}
              title="No settled foreclosures in archive"
              message="Foreclosed facilities will appear here once settled."
            />
          ) : (
            settledPaged.rows.map((fc, index) => {
              const details = getLoanDetails(fc);
              return (
                <tr key={fc.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} font-semibold text-primary`}>
                    {serialOf(details, settledPaged.paginationProps.startIndex - 1 + index)}
                  </td>
                  <td className={`${TD_CLASS} font-medium text-slate-800`}>{details.loanName}</td>
                  <td className={TD_CLASS}>{details.bankName}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-900 tabular-nums`}>{formatCurrency(details.loanAmount)}</td>
                  <td className={`${TD_CLASS} font-semibold text-emerald-600 tabular-nums`}>
                    {formatCurrency(fc.settlementAmount || fc.outstandingAmount)}
                  </td>
                  <td className={`${TD_CLASS} tabular-nums`}>{details.emiAmount ? formatCurrency(details.emiAmount) : "-"}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(details.startDate)}</td>
                  <td className={TD_CLASS}>{formatDateDDMMYYYY(details.endDate)}</td>
                  <td className={`${TD_CLASS} text-slate-800`}>{formatDateDDMMYYYY(fc.settledDate)}</td>
                  <td className={`${TD_CLASS} text-center`}>
                    <Pill tone="emerald" icon={ShieldCheck}>
                      Fully Settled
                    </Pill>
                  </td>
                  <td className={`${TD_CLASS} text-slate-500 max-w-[220px] truncate`} title={fc.settledRemarks || details.remarks}>
                    {fc.settledRemarks || details.remarks}
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      )}

      <DocsModal
        open={isRequestModalOpen}
        onClose={closeRequestModal}
        icon={AlertTriangle}
        title="Request Early Loan Foreclosure"
        description="Raise a pre-closure request for an active facility"
        onSubmit={handleCreateRequest}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeRequestModal} className={OUTLINE_BTN}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingReq} className="gap-2 px-4 font-medium text-xs h-9">
              {submittingReq ? <Spinner /> : <Send size={14} />}
              {submittingReq ? "Submitting..." : "Submit Foreclosure Request"}
            </Button>
          </>
        }
      >
        <Field label="Select Active Loan Facility" required>
          <select value={selectedLoanId} onChange={(e) => setSelectedLoanId(e.target.value)} required className={FIELD_CLASS}>
            <option value="">-- Choose Loan Account --</option>
            {activeLoansForRequest.map((l) => (
              <option key={l.id} value={l.id}>
                {l.loanName} ({l.bankName} - Bal: {formatCurrency(l.outstandingAmount)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason for Early Foreclosure" required>
          <input
            type="text"
            value={foreclosureReason}
            onChange={(e) => setForeclosureReason(e.target.value)}
            placeholder="e.g. Asset sale proceeds / internal treasury prepayment"
            required
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Additional Notes">
          <textarea
            value={foreclosureRemarks}
            onChange={(e) => setForeclosureRemarks(e.target.value)}
            rows={2}
            placeholder="e.g. Awaiting final foreclosure calculation sheet from bank branch"
            className={TEXTAREA_CLASS}
          />
        </Field>
      </DocsModal>

      <DocsModal
        open={!!settlingFc}
        onClose={() => setSettlingFc(null)}
        icon={CheckCircle2}
        title="Settle & Close Loan Facility"
        description="Record full payoff and mark loan as closed"
        onSubmit={handleConfirmSettle}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSettlingFc(null)} className={OUTLINE_BTN}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingSettle} className="gap-2 px-4 font-medium text-xs h-9">
              {submittingSettle ? <Spinner /> : <CheckCircle2 size={14} />}
              {submittingSettle ? "Settling..." : "Confirm & Settle Loan"}
            </Button>
          </>
        }
      >
        {settlingFc && (
          <>
            <DetailGrid
              items={[
                ["Facility", settlingFc.loanName],
                ["Bank", settlingFc.bankName],
                ["Outstanding Balance", formatCurrency(settlingFc.outstandingAmount)],
                ["Reason", settlingFc.reason],
              ]}
            />
            <Field label="Final Settlement Amount Paid (₹)" required>
              <input
                type="number"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
                required
                min="0"
                className={`${FIELD_CLASS} tabular-nums`}
              />
            </Field>
            <Field label="Settlement Notes / UTR / Reference">
              <textarea
                value={settlementRemarks}
                onChange={(e) => setSettlementRemarks(e.target.value)}
                rows={2}
                placeholder="e.g. Paid in full via RTGS Ref #HDFC-991823. NOC requested from branch."
                className={TEXTAREA_CLASS}
              />
            </Field>
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
