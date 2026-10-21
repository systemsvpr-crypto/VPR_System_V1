import { useState, useMemo, useEffect } from "react";
import { FileText, Plus, Mail, Edit2, Trash2, Eye, RefreshCw, Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi } from "../../services/docsApi";
import { openFileAttachment } from "../../utils/fileDownloader";
import { getUserAllowedDivisions, isDivisionAllowed } from "../../utils/divisions";
import {
  PageShell,
  PageHeader,
  Toolbar,
  SearchInput,
  FilterSelect,
  DataTable,
  TR_CLASS,
  TD_CLASS,
  EmptyRow,
  TablePagination,
  usePaged,
  useDocsData,
  IconAction,
  Pill,
  DocsModal,
  EmptyState,
  DetailGrid,
  Spinner,
} from "../../components/DocsUI";
import AddDocumentModal from "./AddDocumentModal";
import EditDocumentModal from "./EditDocumentModal";
import ShareModal from "./ShareModal";

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// "PDF (.pdf)" -> "PDF"
const cleanDocType = (typeStr) => (typeStr ? typeStr.split(" ")[0].toUpperCase() : "PDF");

const RENEWAL_FILTERS = [
  { value: "ExpiringSoon", label: "Expiring Soon (≤ 30 Days)" },
  { value: "Overdue", label: "Overdue for Renewal" },
  { value: "NeedsRenewal", label: "Requires Renewal" },
  { value: "Permanent", label: "Permanent / No Renewal" },
];

const OUTLINE_BTN = "px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50";

export default function AllDocuments() {
  const { data: documents, loading, error, reload } = useDocsData(() => documentsApi.list(), []);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [selectedRenewalFilter, setSelectedRenewalFilter] = useState("");

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  const [selectedIds, setSelectedIds] = useState([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [sharingDoc, setSharingDoc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const loadDocuments = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  useEffect(() => {
    if (error) toast.error("Failed to load documents", { id: "docs-load-error" });
  }, [error]);

  const handleDelete = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete "${doc.documentName}"?`)) return;
    try {
      await documentsApi.remove(doc.id);
      setSelectedIds((prev) => prev.filter((id) => id !== doc.id));
      toast.success("Document deleted successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete document");
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(documents.map((d) => d.category).filter(Boolean))),
    [documents]
  );

  const divisions = useMemo(
    () =>
      Array.from(
        new Set(
          documents
            .map((d) => d.division || d.companyName)
            .filter(Boolean)
            .filter((div) => isDivisionAllowed(div, allowedDivisions))
        )
      ),
    [documents, allowedDivisions]
  );

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const docDiv = doc.division || doc.companyName || "";
      if (allowedDivisions && allowedDivisions.length > 0 && !isDivisionAllowed(docDiv, allowedDivisions)) {
        return false;
      }

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        doc.documentName?.toLowerCase().includes(q) ||
        doc.personName?.toLowerCase().includes(q) ||
        doc.documentType?.toLowerCase().includes(q) ||
        doc.category?.toLowerCase().includes(q) ||
        docDiv.toLowerCase().includes(q) ||
        doc.fileName?.toLowerCase().includes(q) ||
        doc.remarks?.toLowerCase().includes(q);

      const matchesCategory = !selectedCategory || doc.category === selectedCategory;
      const matchesDivision = !selectedDivision || docDiv === selectedDivision;

      let matchesRenewal = true;
      if (selectedRenewalFilter === "NeedsRenewal") {
        matchesRenewal = doc.needsRenewal === "Yes";
      } else if (selectedRenewalFilter === "Permanent") {
        matchesRenewal = doc.needsRenewal !== "Yes";
      } else if (selectedRenewalFilter === "ExpiringSoon") {
        if (doc.needsRenewal === "Yes" && doc.renewalDate) {
          const diffDays = Math.ceil((new Date(doc.renewalDate) - new Date()) / (1000 * 60 * 60 * 24));
          matchesRenewal = diffDays >= 0 && diffDays <= 30;
        } else {
          matchesRenewal = false;
        }
      } else if (selectedRenewalFilter === "Overdue") {
        matchesRenewal = doc.needsRenewal === "Yes" && !!doc.renewalDate && new Date(doc.renewalDate) < new Date();
      }

      return matchesSearch && matchesCategory && matchesDivision && matchesRenewal;
    });
  }, [documents, searchQuery, selectedCategory, selectedDivision, selectedRenewalFilter, allowedDivisions]);

  const { rows, paginationProps } = usePaged(filteredDocuments, 15);

  const isAllSelected =
    filteredDocuments.length > 0 && filteredDocuments.every((doc) => selectedIds.includes(doc.id));

  const handleToggleSelectAll = () => {
    setSelectedIds(isAllSelected ? [] : filteredDocuments.map((d) => d.id));
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleViewFile = (fileOrAtt, doc = previewDoc) => {
    openFileAttachment(fileOrAtt, doc);
  };

  const columns = [
    {
      label: (
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={handleToggleSelectAll}
          className="accent-primary cursor-pointer"
          aria-label="Select all documents"
        />
      ),
      className: "w-10 text-center",
    },
    { label: "Share", className: "text-center w-14" },
    { label: "Action", className: "text-center w-20" },
    "Serial No",
    "Document Name",
    "Document Type",
    "Category",
    "Division",
    "Name",
    { label: "Renewal", className: "text-center" },
    "Renewal Date",
    { label: "File", className: "text-center" },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={FileText}
        title="Document Vault"
        description="Manage compliance contracts, licenses & certificates"
        actions={
          <>
            {selectedIds.length > 0 && <Pill tone="blue">{selectedIds.length} selected</Pill>}
            <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 px-4 font-medium text-xs h-9">
              <Plus size={16} />
              Add Document
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search documents..." />
        <FilterSelect
          value={selectedCategory}
          onChange={setSelectedCategory}
          options={categories}
          allLabel="All Categories"
        />
        <FilterSelect
          value={selectedDivision}
          onChange={setSelectedDivision}
          options={divisions}
          allLabel="All Divisions"
        />
        <FilterSelect
          value={selectedRenewalFilter}
          onChange={setSelectedRenewalFilter}
          options={RENEWAL_FILTERS}
          allLabel="All Renewal Statuses"
        />
        <Button
          variant="outline"
          onClick={loadDocuments}
          className="h-9 w-9 p-0 text-slate-600 border-slate-200 hover:bg-slate-50 shrink-0"
          title="Refresh list"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        </Button>
      </Toolbar>

      <DataTable columns={columns} minWidth="1100px" footer={<TablePagination paginationProps={paginationProps} />}>
        {loading ? (
          <tr>
            <td colSpan={12} className="py-12">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Spinner className="border-primary" />
                Loading document vault...
              </div>
            </td>
          </tr>
        ) : filteredDocuments.length === 0 ? (
          <EmptyRow
            colSpan={12}
            icon={FileText}
            title="No documents found"
            message='Try adjusting your filters or click "Add Document" to register one.'
          />
        ) : (
          rows.map((doc) => {
            const serialNo = `SN-${String(doc.sn || documents.indexOf(doc) + 1).padStart(3, "0")}`;
            const isSelected = selectedIds.includes(doc.id);
            const isRenewal = doc.needsRenewal === "Yes";

            return (
              <tr key={doc.id} className={`${TR_CLASS} ${isSelected ? "bg-primary/5" : ""}`}>
                <td className={`${TD_CLASS} text-center`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelect(doc.id)}
                    className="accent-primary cursor-pointer"
                    aria-label={`Select ${doc.documentName}`}
                  />
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <IconAction icon={Mail} title="Share Document (Email / WhatsApp)" onClick={() => setSharingDoc(doc)} />
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <div className="flex items-center justify-center gap-1">
                    <IconAction icon={Edit2} title="Edit Document" onClick={() => setEditingDoc(doc)} />
                    <IconAction icon={Trash2} title="Delete Document" tone="danger" onClick={() => handleDelete(doc)} />
                  </div>
                </td>
                <td className={`${TD_CLASS} font-semibold text-primary`}>{serialNo}</td>
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800">{doc.documentName}</span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">
                    {cleanDocType(doc.documentType)}
                  </span>
                </td>
                <td className={TD_CLASS}>
                  <Pill tone="blue">{doc.category || "Company"}</Pill>
                </td>
                <td className={`${TD_CLASS} font-medium text-slate-700`}>{doc.division || doc.companyName || "-"}</td>
                <td className={TD_CLASS}>{doc.personName || "-"}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <Pill tone={isRenewal ? "amber" : "slate"}>{isRenewal ? "Yes" : "No"}</Pill>
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>
                  {isRenewal && doc.renewalDate ? formatDateDDMMYYYY(doc.renewalDate) : "-"}
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs"
                  >
                    <Eye size={14} />
                    View
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      <DocsModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        icon={FileText}
        title={previewDoc?.documentName || "Document"}
        description={previewDoc ? `${previewDoc.category} • ${previewDoc.documentType}` : ""}
        size="sm"
        footer={
          <Button variant="outline" onClick={() => setPreviewDoc(null)} className={OUTLINE_BTN}>
            Close
          </Button>
        }
      >
        {previewDoc && (
          <>
            <p className="text-xs font-semibold text-slate-700">Attached Files &amp; Documents</p>
            {previewDoc.attachments && previewDoc.attachments.length > 0 ? (
              <div className="space-y-2">
                {previewDoc.attachments.map((att, i) => (
                  <AttachmentRow
                    key={i}
                    name={att.name}
                    size={att.size}
                    onView={() => handleViewFile(att, previewDoc)}
                  />
                ))}
              </div>
            ) : previewDoc.fileName ? (
              <AttachmentRow
                name={previewDoc.fileName}
                onView={() => handleViewFile(previewDoc.fileName, previewDoc)}
              />
            ) : (
              <div className="py-6 border border-dashed border-slate-200 rounded-lg">
                <EmptyState icon={FileText} title="No files attached to this document" />
              </div>
            )}

            <DetailGrid
              items={[
                ["Division", previewDoc.division || previewDoc.companyName || "-"],
                ["Name / Person", previewDoc.personName || "-"],
                [
                  "Renewal Status",
                  previewDoc.needsRenewal === "Yes"
                    ? `Yes (${formatDateDDMMYYYY(previewDoc.renewalDate)})`
                    : "Permanent (No)",
                ],
              ]}
            />
          </>
        )}
      </DocsModal>

      <AddDocumentModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onCreated={reload} />
      <EditDocumentModal
        isOpen={!!editingDoc}
        document={editingDoc}
        onClose={() => setEditingDoc(null)}
        onUpdated={reload}
      />
      <ShareModal isOpen={!!sharingDoc} document={sharingDoc} onClose={() => setSharingDoc(null)} onShared={reload} />
    </PageShell>
  );
}

const AttachmentRow = ({ name, size, onView }) => (
  <div className="flex items-center justify-between gap-2 p-2.5 border border-slate-200 rounded-lg bg-slate-50/60">
    <div className="flex items-center gap-2 min-w-0">
      <Paperclip size={14} className="text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-800 truncate">{name}</p>
        {size ? <p className="text-[10px] text-slate-400">{(size / 1024).toFixed(1)} KB</p> : null}
      </div>
    </div>
    <Button size="sm" onClick={onView} className="gap-1 h-7 px-2.5 text-[11px] shrink-0">
      <Eye size={12} />
      View
    </Button>
  </div>
);
