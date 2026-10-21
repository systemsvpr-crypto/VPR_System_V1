import { useState, useEffect, useMemo } from "react";
import { Mail, Share2, FileText, Phone, RefreshCw, Send, MessageCircle, Link as LinkIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi, DOCS_DATA_CHANGED_EVENT } from "../../services/docsApi";
import { getUserAllowedDivisions, isDivisionAllowed } from "../../utils/divisions";
import { formatDateTime } from "../../utils/dateFormatter";
import {
  PageShell,
  PageHeader,
  Toolbar,
  SearchInput,
  FilterSelect,
  KpiCard,
  KpiGrid,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  LoadingState,
  Pill,
} from "../../components/DocsUI";

const SHARE_METHODS = [
  { value: "Email", label: "Email Delivery" },
  { value: "WhatsApp", label: "WhatsApp Share" },
  { value: "Direct Link", label: "Secure Link" },
  { value: "Physical Copy", label: "Physical Hard Copy" },
];

const METHOD_TONE = { Email: "blue", WhatsApp: "emerald" };

export default function SharedDocuments() {
  const [shares, setShares] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("All");

  const loadData = async () => {
    try {
      setLoading(true);
      const [sharesData, docsData] = await Promise.all([documentsApi.listShares(), documentsApi.list()]);
      setShares(sharesData || []);
      setDocuments(docsData || []);
    } catch (err) {
      console.error("Error loading shared documents log:", err);
      toast.error("Failed to load share history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleChange = () => loadData();
    window.addEventListener(DOCS_DATA_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(DOCS_DATA_CHANGED_EVENT, handleChange);
  }, []);

  const docMap = useMemo(() => {
    const map = {};
    documents.forEach((d) => {
      map[d.id] = d;
    });
    return map;
  }, [documents]);

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const filteredShares = useMemo(() => {
    return shares.filter((item) => {
      const parentDoc = docMap[item.documentId];
      if (parentDoc && !isDivisionAllowed(parentDoc.division || parentDoc.companyName, allowedDivisions)) {
        return false;
      }
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.documentName?.toLowerCase().includes(q) ||
        item.recipientName?.toLowerCase().includes(q) ||
        item.recipientEmail?.toLowerCase().includes(q) ||
        item.subject?.toLowerCase().includes(q) ||
        item.message?.toLowerCase().includes(q) ||
        item.purpose?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q) ||
        item.sharedBy?.toLowerCase().includes(q) ||
        item.shareNo?.toLowerCase().includes(q);
      const matchesMethod = selectedMethod === "All" || item.shareMethod === selectedMethod;
      return matchesSearch && matchesMethod;
    });
  }, [shares, docMap, searchQuery, selectedMethod, allowedDivisions]);

  const methodCounts = useMemo(
    () => ({
      total: filteredShares.length,
      email: filteredShares.filter((s) => s.shareMethod === "Email").length,
      whatsapp: filteredShares.filter((s) => s.shareMethod === "WhatsApp").length,
      link: filteredShares.filter((s) => s.shareMethod === "Direct Link").length,
    }),
    [filteredShares]
  );

  const paged = usePaged(filteredShares);

  return (
    <PageShell>
      <PageHeader
        icon={Share2}
        title="Shared Documents"
        description="Audit trail of internal & external document transmissions and access"
        actions={
          <Button
            variant="outline"
            onClick={loadData}
            title="Refresh log"
            className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        }
      />

      <KpiGrid>
        <KpiCard icon={Send} label="Total Shares" value={methodCounts.total} tone="slate" />
        <KpiCard icon={Mail} label="Via Email" value={methodCounts.email} tone="blue" />
        <KpiCard icon={MessageCircle} label="Via WhatsApp" value={methodCounts.whatsapp} tone="emerald" />
        <KpiCard icon={LinkIcon} label="Direct Links" value={methodCounts.link} tone="violet" />
      </KpiGrid>

      <Toolbar>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by recipient, document, purpose..."
          className="sm:w-72 lg:w-80"
        />
        <FilterSelect
          value={selectedMethod === "All" ? "" : selectedMethod}
          onChange={(v) => setSelectedMethod(v || "All")}
          options={SHARE_METHODS}
          allLabel="All Share Methods"
        />
      </Toolbar>

      {loading && shares.length === 0 ? (
        <LoadingState text="Loading transmission records..." />
      ) : (
        <DataTable
          columns={[
            "Share No.",
            "Serial No",
            "Document",
            "Recipient Details",
            { label: "Method", className: "text-center" },
            "Subject / Message",
            "Shared By & Time",
          ]}
          footer={<TablePagination paginationProps={paged.paginationProps} />}
        >
          {filteredShares.length === 0 ? (
            <EmptyRow
              colSpan={7}
              icon={Mail}
              title="No share logs found"
              message="Documents shared from the Document Vault will appear here."
            />
          ) : (
            paged.rows.map((item, index) => {
              const rowIndex = (paged.page - 1) * 15 + index;
              const matchingDoc = docMap[item.documentId];
              const docSn = item.docSn || matchingDoc?.sn;
              const docSerialNo = docSn ? `SN-${String(docSn).padStart(3, "0")}` : "SN-001";
              const shareNo = item.shareNo || `SH-${String(item.sn || rowIndex + 1).padStart(3, "0")}`;
              const displaySubject = item.subject || item.purpose;
              const displayMessage = item.message || item.notes;

              return (
                <tr key={item.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} font-semibold text-primary`}>{shareNo}</td>
                  <td className={`${TD_CLASS} font-medium text-slate-700`}>{docSerialNo}</td>
                  <td className={TD_CLASS}>
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-primary shrink-0" />
                      <span className="font-medium text-slate-800">{item.documentName}</span>
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="font-medium text-slate-800 block">{item.recipientName}</span>
                    {item.recipientEmail && (
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Mail size={11} className="text-slate-400" />
                        {item.recipientEmail}
                      </span>
                    )}
                    {item.recipientPhone && (
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Phone size={11} className="text-slate-400" />
                        {item.recipientPhone}
                      </span>
                    )}
                  </td>
                  <td className={`${TD_CLASS} text-center`}>
                    <Pill tone={METHOD_TONE[item.shareMethod] || "violet"}>{item.shareMethod}</Pill>
                  </td>
                  <td className={`${TD_CLASS} whitespace-normal`}>
                    <div className="max-w-xs">
                      {displaySubject && <span className="font-medium text-slate-800 block">{displaySubject}</span>}
                      {displayMessage && <span className="text-[11px] text-slate-500 italic block">{displayMessage}</span>}
                      {!displaySubject && !displayMessage && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="font-medium text-slate-800 block">{item.sharedBy || "Admin User"}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums">{formatDateTime(item.sharedAt)}</span>
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      )}
    </PageShell>
  );
}
