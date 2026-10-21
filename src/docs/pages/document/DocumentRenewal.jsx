import { useState, useEffect, useMemo } from "react";
import { RotateCcw, FileText, RefreshCw, Paperclip, CheckCircle2, Eye, Clock, History } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi, DOCS_DATA_CHANGED_EVENT, uploadDocFile } from "../../services/docsApi";
import { openFileAttachment } from "../../utils/fileDownloader";
import { getDaysUntil } from "../../utils/dateFormatter";
import { getUserAllowedDivisions, isDivisionAllowed } from "../../utils/divisions";
import {
  PageShell,
  PageHeader,
  SubTabs,
  Toolbar,
  SearchInput,
  FilterSelect,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  LoadingState,
  Pill,
  DaysLeftPill,
  DocsModal,
  Field,
  FIELD_CLASS,
  DetailGrid,
  FileDropzone,
  Spinner,
} from "../../components/DocsUI";

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
};

// "PDF (.pdf)" -> "PDF"
const cleanDocType = (typeStr) => (typeStr ? typeStr.split(" ")[0].toUpperCase() : "PDF");

const serial = (sn, index) => `SN-${String(sn || index + 1).padStart(3, "0")}`;

const ViewButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-semibold text-[11px] hover:underline"
  >
    <Eye size={13} />
    View
  </button>
);

export default function DocumentRenewal() {
  const [activeTab, setActiveTab] = useState("pending");
  const [documents, setDocuments] = useState([]);
  const [renewalHistory, setRenewalHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDivision, setSelectedDivision] = useState("All");

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const [renewingDoc, setRenewingDoc] = useState(null);
  const [renewNextPeriod, setRenewNextPeriod] = useState(true);
  const [nextRenewalDate, setNextRenewalDate] = useState("");
  const [newDocumentFiles, setNewDocumentFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const [previewDoc, setPreviewDoc] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docs, history] = await Promise.all([documentsApi.list(), documentsApi.listRenewals()]);
      setDocuments(docs || []);
      setRenewalHistory(history || []);
    } catch (err) {
      console.error("Error loading renewals:", err);
      toast.error("Failed to load renewal records");
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

  const categories = useMemo(() => {
    const set = new Set(documents.map((d) => d.category).filter(Boolean));
    return Array.from(set);
  }, [documents]);

  const divisions = useMemo(() => {
    const allDivs = [
      ...documents.map((d) => d.division || d.companyName),
      ...renewalHistory.map((d) => d.division || d.companyName),
    ].filter(Boolean);
    return Array.from(new Set(allDivs.filter((div) => isDivisionAllowed(div, allowedDivisions))));
  }, [documents, renewalHistory, allowedDivisions]);

  const renewableDocs = useMemo(() => {
    return documents
      .filter((d) => d.needsRenewal === "Yes")
      .filter((d) => {
        const docDiv = d.division || d.companyName || "";
        if (allowedDivisions && allowedDivisions.length > 0 && !isDivisionAllowed(docDiv, allowedDivisions)) {
          return false;
        }
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          !q ||
          d.documentName?.toLowerCase().includes(q) ||
          d.personName?.toLowerCase().includes(q) ||
          docDiv.toLowerCase().includes(q) ||
          d.documentType?.toLowerCase().includes(q) ||
          d.category?.toLowerCase().includes(q);
        const matchesCat = selectedCategory === "All" || d.category === selectedCategory;
        const matchesDiv = selectedDivision === "All" || docDiv === selectedDivision;
        return matchesSearch && matchesCat && matchesDiv;
      })
      .sort((a, b) => {
        if (!a.renewalDate) return 1;
        if (!b.renewalDate) return -1;
        return new Date(a.renewalDate) - new Date(b.renewalDate);
      });
  }, [documents, searchQuery, selectedCategory, selectedDivision, allowedDivisions]);

  const filteredHistory = useMemo(() => {
    return renewalHistory.filter((item) => {
      const itemDiv = item.division || item.companyName || "";
      if (allowedDivisions && allowedDivisions.length > 0 && !isDivisionAllowed(itemDiv, allowedDivisions)) {
        return false;
      }
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.documentName?.toLowerCase().includes(q) ||
        item.personName?.toLowerCase().includes(q) ||
        itemDiv.toLowerCase().includes(q) ||
        item.receiptNumber?.toLowerCase().includes(q) ||
        item.renewedBy?.toLowerCase().includes(q);
      const matchesCat = selectedCategory === "All" || item.category === selectedCategory;
      const matchesDiv = selectedDivision === "All" || itemDiv === selectedDivision;
      return matchesSearch && matchesCat && matchesDiv;
    });
  }, [renewalHistory, searchQuery, selectedCategory, selectedDivision, allowedDivisions]);

  const pendingPaged = usePaged(renewableDocs);
  const historyPaged = usePaged(filteredHistory);

  const handleOpenRenewModal = (doc) => {
    setRenewingDoc(doc);
    setRenewNextPeriod(true);
    // Suggest one year after the current renewal date (or today).
    const d = doc.renewalDate ? new Date(doc.renewalDate) : new Date();
    d.setFullYear(d.getFullYear() + 1);
    setNextRenewalDate(d.toISOString().split("T")[0]);
    setNewDocumentFiles([]);
  };

  const handleConfirmRenewal = async (e) => {
    e.preventDefault();
    if (renewNextPeriod && !nextRenewalDate) {
      toast.error("Please enter the next renewal date");
      return;
    }
    try {
      setSaving(true);
      const newFile = newDocumentFiles[0];
      const fileAttachment = newFile ? await uploadDocFile(newFile, "renewals") : null;

      await documentsApi.recordRenewal(renewingDoc.id, {
        newRenewalDate: renewNextPeriod ? nextRenewalDate : null,
        needsRenewal: renewNextPeriod ? "Yes" : "No",
        renewNextPeriod,
        fileName: fileAttachment ? fileAttachment.name : undefined,
        fileUrl: fileAttachment?.url || "",
        attachments: fileAttachment ? [fileAttachment] : undefined,
      });
      toast.success(`Renewal recorded for "${renewingDoc.documentName}"!`);
      setRenewingDoc(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to record renewal");
    } finally {
      setSaving(false);
    }
  };

  const handleViewFile = (fileOrAtt, doc = previewDoc) => {
    openFileAttachment(fileOrAtt, doc);
  };

  return (
    <PageShell>
      <PageHeader
        icon={RotateCcw}
        title="Document Renewal"
        description="Manage upcoming and historical document renewals"
        actions={
          <Button
            variant="outline"
            onClick={loadData}
            title="Refresh list"
            className="gap-2 px-3 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        }
      />

      <Toolbar>
        <SubTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "pending", label: "Pending", icon: Clock, count: renewableDocs.length },
            { id: "history", label: "History", icon: History, count: filteredHistory.length },
          ]}
        />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search documents..." />
        <FilterSelect
          value={selectedCategory === "All" ? "" : selectedCategory}
          onChange={(v) => setSelectedCategory(v || "All")}
          options={categories}
          allLabel="All Categories"
        />
        <FilterSelect
          value={selectedDivision === "All" ? "" : selectedDivision}
          onChange={(v) => setSelectedDivision(v || "All")}
          options={divisions}
          allLabel="All Divisions"
        />
      </Toolbar>

      {loading && documents.length === 0 && renewalHistory.length === 0 ? (
        <LoadingState text={activeTab === "pending" ? "Loading pending renewals..." : "Loading renewal history..."} />
      ) : activeTab === "pending" ? (
        <DataTable
          columns={[
            { label: "Action", className: "text-center" },
            "Serial No",
            "Document Name",
            "Document Type",
            "Category",
            "Name",
            "Entry Date",
            "Renewal",
            { label: "File", className: "text-center" },
          ]}
          footer={<TablePagination paginationProps={pendingPaged.paginationProps} />}
        >
          {renewableDocs.length === 0 ? (
            <EmptyRow
              colSpan={9}
              icon={CheckCircle2}
              title="No documents currently pending renewal"
              message="All tracked document lifecycles are up to date."
            />
          ) : (
            pendingPaged.rows.map((doc, index) => (
              <tr key={doc.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center`}>
                  <Button size="sm" onClick={() => handleOpenRenewModal(doc)} className="gap-1.5 text-xs h-7 px-3">
                    <RotateCcw size={12} />
                    Renewal
                  </Button>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary`}>
                  {serial(doc.sn, (pendingPaged.page - 1) * 15 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{doc.documentName}</td>
                <td className={TD_CLASS}>{cleanDocType(doc.documentType)}</td>
                <td className={TD_CLASS}>
                  <Pill tone="blue">{doc.category || "Company"}</Pill>
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800 uppercase`}>
                  {doc.personName || doc.division || doc.companyName || "-"}
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDateDDMMYYYY(doc.issueDate || doc.createdAt)}</td>
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-600 tabular-nums">{formatDateDDMMYYYY(doc.renewalDate)}</span>
                    {doc.renewalDate && <DaysLeftPill days={getDaysUntil(doc.renewalDate)} />}
                  </div>
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <ViewButton onClick={() => setPreviewDoc(doc)} />
                </td>
              </tr>
            ))
          )}
        </DataTable>
      ) : (
        <DataTable
          columns={[
            "Serial No",
            "Document Name",
            "Document Type",
            "Category",
            "Name",
            "Previous Expiry",
            "New Expiry Date",
            "Renewed By & Date",
            { label: "File", className: "text-center" },
          ]}
          footer={<TablePagination paginationProps={historyPaged.paginationProps} />}
        >
          {filteredHistory.length === 0 ? (
            <EmptyRow colSpan={9} icon={FileText} title="No renewal history recorded yet" />
          ) : (
            historyPaged.rows.map((item, index) => (
              <tr key={item.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} font-semibold text-primary`}>
                  {serial(item.sn, (historyPaged.page - 1) * 15 + index)}
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{item.documentName}</td>
                <td className={TD_CLASS}>{cleanDocType(item.documentType)}</td>
                <td className={TD_CLASS}>
                  <Pill tone="blue">{item.category || "Company"}</Pill>
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-800 uppercase`}>
                  {item.personName || item.division || item.companyName || "-"}
                </td>
                <td className={`${TD_CLASS} tabular-nums text-slate-500`}>{formatDateDDMMYYYY(item.previousRenewalDate)}</td>
                <td className={`${TD_CLASS} tabular-nums font-semibold text-emerald-600`}>
                  {item.newRenewalDate ? formatDateDDMMYYYY(item.newRenewalDate) : <Pill tone="slate">Tracking stopped</Pill>}
                </td>
                <td className={TD_CLASS}>
                  <span className="font-medium text-slate-800 block">{item.renewedBy}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">{formatDateDDMMYYYY(item.renewedAt)}</span>
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  {item.fileName ? (
                    <ViewButton
                      onClick={() => handleViewFile(item.attachments?.[0] || item.fileName, item)}
                    />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      )}

      {/* Process Document Renewal */}
      <DocsModal
        open={!!renewingDoc}
        onClose={() => setRenewingDoc(null)}
        icon={RotateCcw}
        title="Process Document Renewal"
        description="Extend lifecycle and attach revised agreement"
        onSubmit={handleConfirmRenewal}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenewingDoc(null)}
              className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 px-4 font-medium text-xs h-9">
              {saving && <Spinner />}
              {saving ? "Saving..." : "Save Renewal"}
            </Button>
          </>
        }
      >
        {renewingDoc && (
          <>
            <DetailGrid
              items={[
                ["Document", renewingDoc.documentName],
                ["Serial No", serial(renewingDoc.sn, 0)],
                ["Name", (renewingDoc.personName || renewingDoc.division || renewingDoc.companyName || "-").toUpperCase()],
                ["Current Renewal", formatDateDDMMYYYY(renewingDoc.renewalDate)],
              ]}
            />

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Renew Next Period?</p>
                <p className="text-[11px] text-slate-500">Keep tracking future expiry date</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={renewNextPeriod}
                onClick={() => setRenewNextPeriod(!renewNextPeriod)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  renewNextPeriod ? "bg-primary" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    renewNextPeriod ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {renewNextPeriod && (
              <Field label="Next Renewal Date" required>
                <input
                  type="date"
                  value={nextRenewalDate}
                  onChange={(e) => setNextRenewalDate(e.target.value)}
                  required
                  className={FIELD_CLASS}
                />
              </Field>
            )}

            <Field label="New Document File">
              <FileDropzone files={newDocumentFiles} onChange={setNewDocumentFiles} multiple={false} />
            </Field>
          </>
        )}
      </DocsModal>

      {/* Attachments preview */}
      <DocsModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        icon={FileText}
        title={previewDoc?.documentName || "Document"}
        description={previewDoc ? `${previewDoc.category || "-"} • ${previewDoc.documentType || "-"}` : ""}
        size="sm"
        footer={
          <Button
            variant="outline"
            onClick={() => setPreviewDoc(null)}
            className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            Close
          </Button>
        }
      >
        {previewDoc && (
          <>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Attached Files &amp; Documents</p>
            {previewDoc.attachments && previewDoc.attachments.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {previewDoc.attachments.map((att, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{att.name}</p>
                        {att.size > 0 && <p className="text-[10px] text-slate-400">{(att.size / 1024).toFixed(1)} KB</p>}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleViewFile(att, previewDoc)} className="gap-1 text-[11px] h-7 px-2.5 shrink-0">
                      <Eye size={12} />
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            ) : previewDoc.fileName ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-primary shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate">{previewDoc.fileName}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleViewFile(previewDoc.fileName, previewDoc)}
                  className="gap-1 text-[11px] h-7 px-2.5 shrink-0"
                >
                  <Eye size={12} />
                  View
                </Button>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-lg">
                <FileText size={22} className="mx-auto mb-1 text-slate-300" />
                <p className="text-xs font-medium">No files attached to this document</p>
              </div>
            )}

            <DetailGrid
              items={[
                ["Owner / Name", (previewDoc.personName || previewDoc.companyName || "-").toUpperCase()],
                ["Renewal Date", formatDateDDMMYYYY(previewDoc.renewalDate)],
              ]}
            />
          </>
        )}
      </DocsModal>
    </PageShell>
  );
}
