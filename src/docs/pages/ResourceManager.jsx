import { useState, useMemo } from "react";
import {
  FileText,
  CreditCard,
  Plus,
  Layers,
  Trash2,
  Edit2,
  Share2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Paperclip,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { documentsApi, subscriptionsApi } from "../services/docsApi";
import { getUserAllowedDivisions, isDivisionAllowed } from "../utils/divisions";
import { formatDate, formatCurrency, isExpiringSoon, isOverdue } from "../utils/dateFormatter";
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
  IconAction,
  Pill,
  StatusPill,
  useDocsData,
} from "../components/DocsUI";
import AddDocumentModal from "./document/AddDocumentModal";
import EditDocumentModal from "./document/EditDocumentModal";
import ShareModal from "./document/ShareModal";
import AddSubscriptionModal from "./subscription/AddSubscriptionModal";

const FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"];
const BASE_CATEGORIES = ["Company", "Director", "Personal"];

export default function ResourceManager() {
  const [activeTab, setActiveTab] = useState("subscriptions"); // 'documents' | 'subscriptions'

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocCategory, setSelectedDocCategory] = useState("All");
  const [selectedSubFrequency, setSelectedSubFrequency] = useState("All");

  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [sharingDoc, setSharingDoc] = useState(null);
  const [isAddSubModalOpen, setIsAddSubModalOpen] = useState(false);

  const { data, loading, reload: loadData } = useDocsData(
    async () => {
      const [documents, subscriptions] = await Promise.all([documentsApi.list(), subscriptionsApi.list()]);
      return { documents: documents || [], subscriptions: subscriptions || [] };
    },
    { documents: [], subscriptions: [] }
  );
  const { documents, subscriptions } = data;

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);

  // Reference shipped a fixed Company/Director/Personal list; include any
  // category actually in use so the filter covers every record.
  const docCategories = useMemo(
    () => Array.from(new Set([...BASE_CATEGORIES, ...documents.map((d) => d.category).filter(Boolean)])),
    [documents]
  );

  const filteredSubscriptions = useMemo(() => {
    return subscriptions
      .filter((sub) => isDivisionAllowed(sub.division || sub.companyName, allowedDivisions))
      .filter((sub) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          !q ||
          sub.subscriptionName?.toLowerCase().includes(q) ||
          sub.serviceName?.toLowerCase().includes(q) ||
          sub.subscriberName?.toLowerCase().includes(q) ||
          (sub.division || sub.companyName)?.toLowerCase().includes(q) ||
          sub.purpose?.toLowerCase().includes(q);
        const matchesFreq = selectedSubFrequency === "All" || sub.frequency === selectedSubFrequency;
        return matchesSearch && matchesFreq;
      });
  }, [subscriptions, searchQuery, selectedSubFrequency, allowedDivisions]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((doc) => isDivisionAllowed(doc.division || doc.companyName, allowedDivisions))
      .filter((doc) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          !q ||
          doc.documentName?.toLowerCase().includes(q) ||
          doc.personName?.toLowerCase().includes(q) ||
          doc.documentType?.toLowerCase().includes(q) ||
          doc.category?.toLowerCase().includes(q) ||
          (doc.division || doc.companyName)?.toLowerCase().includes(q) ||
          doc.fileName?.toLowerCase().includes(q) ||
          doc.remarks?.toLowerCase().includes(q);
        const matchesCategory = selectedDocCategory === "All" || doc.category === selectedDocCategory;
        return matchesSearch && matchesCategory;
      });
  }, [documents, searchQuery, selectedDocCategory, allowedDivisions]);

  const subPage = usePaged(filteredSubscriptions);
  const docPage = usePaged(filteredDocuments);

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete document "${doc.documentName}"?`)) return;
    try {
      await documentsApi.remove(doc.id);
      toast.success("Document deleted successfully");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete document");
    }
  };

  const isSubs = activeTab === "subscriptions";

  return (
    <PageShell>
      <PageHeader
        icon={Layers}
        title="Resource Manager"
        description={
          isSubs
            ? "Track software, services, and cloud recurring costs"
            : "Securely store, organize, and monitor statutory certificates, licenses, and contracts"
        }
      />

      <SubTabs
        active={activeTab}
        onChange={(id) => {
          setActiveTab(id);
          setSearchQuery("");
        }}
        tabs={[
          { id: "documents", label: "Documents Management", icon: FileText, count: filteredDocuments.length },
          { id: "subscriptions", label: "Subscriptions Management", icon: CreditCard, count: filteredSubscriptions.length },
        ]}
      />

      <Toolbar>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={isSubs ? "Search subscriptions..." : "Search documents..."}
        />
        {isSubs ? (
          <FilterSelect
            value={selectedSubFrequency}
            onChange={setSelectedSubFrequency}
            allLabel={null}
            options={[{ value: "All", label: "All Frequencies" }, ...FREQUENCIES]}
          />
        ) : (
          <FilterSelect
            value={selectedDocCategory}
            onChange={setSelectedDocCategory}
            allLabel={null}
            options={[{ value: "All", label: "All Categories" }, ...docCategories]}
          />
        )}
        <div className="flex-1" />
        <Button
          onClick={() => (isSubs ? setIsAddSubModalOpen(true) : setIsAddDocModalOpen(true))}
          className="gap-2 px-4 font-medium text-xs h-9 shrink-0"
        >
          <Plus size={16} />
          {isSubs ? "Add Subscription" : "Add Document"}
        </Button>
      </Toolbar>

      {loading ? (
        <LoadingState text={isSubs ? "Loading subscriptions..." : "Loading documents..."} />
      ) : isSubs ? (
        <DataTable
          columns={[
            { label: "S.No", className: "text-center w-12" },
            "Requested Date",
            "Division",
            "Subscriber",
            "Subscription",
            "Price",
            "Frequency",
            "Purpose",
            "Start Date",
            "End Date",
            { label: "Status", className: "text-center" },
          ]}
          footer={<TablePagination paginationProps={subPage.paginationProps} />}
        >
          {subPage.rows.length === 0 ? (
            <EmptyRow colSpan={11} icon={CreditCard} title="No subscriptions found" message="Try a different search or frequency." />
          ) : (
            subPage.rows.map((sub, index) => (
              <tr key={sub.id} className={TR_CLASS}>
                <td className={`${TD_CLASS} text-center text-slate-400 tabular-nums`}>
                  {subPage.paginationProps.startIndex + index}
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDate(sub.requestedDate || sub.createdAt)}</td>
                <td className={`${TD_CLASS} font-medium text-slate-800`}>{sub.division || sub.companyName || "-"}</td>
                <td className={TD_CLASS}>{sub.subscriberName}</td>
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-primary shrink-0" />
                    <span className="font-semibold text-slate-800">{sub.subscriptionName}</span>
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
                <td className={`${TD_CLASS} tabular-nums`}>{formatDate(sub.requestedDate || sub.createdAt)}</td>
                <td className={`${TD_CLASS} tabular-nums`}>{formatDate(sub.renewalDate)}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <StatusPill status={sub.status} />
                </td>
              </tr>
            ))
          )}
        </DataTable>
      ) : (
        <DataTable
          columns={[
            { label: "S.No", className: "text-center w-12" },
            "Document Name",
            "Document Type",
            "Category",
            "Division",
            "Renewal / Expiry",
            "Attachment",
            { label: "Status", className: "text-center" },
            { label: "Actions", className: "text-right" },
          ]}
          footer={<TablePagination paginationProps={docPage.paginationProps} />}
        >
          {docPage.rows.length === 0 ? (
            <EmptyRow colSpan={9} icon={FileText} title="No documents found" message="Try a different search or category." />
          ) : (
            docPage.rows.map((doc, index) => {
              const hasRenewal = doc.needsRenewal === "Yes" && doc.renewalDate;
              const overdue = hasRenewal ? isOverdue(doc.renewalDate) : false;
              const expiring = hasRenewal ? isExpiringSoon(doc.renewalDate, 30) : false;

              return (
                <tr key={doc.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} text-center text-slate-400 tabular-nums`}>
                    {docPage.paginationProps.startIndex + index}
                  </td>
                  <td className={TD_CLASS}>
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-primary shrink-0" />
                      <span className="font-semibold text-slate-800">{doc.documentName}</span>
                    </div>
                  </td>
                  <td className={TD_CLASS}>{doc.documentType}</td>
                  <td className={TD_CLASS}>
                    <Pill tone="slate">{doc.category}</Pill>
                  </td>
                  <td className={TD_CLASS}>
                    <div className="font-medium text-slate-800">{doc.division || doc.companyName || "-"}</div>
                    {doc.personName && <span className="text-[11px] text-slate-400 block">{doc.personName}</span>}
                  </td>
                  <td className={`${TD_CLASS} tabular-nums`}>{hasRenewal ? formatDate(doc.renewalDate) : "Permanent"}</td>
                  <td className={TD_CLASS}>
                    {doc.attachments && doc.attachments.length > 1 ? (
                      <span title={doc.attachments.map((a) => a.name).join("\n")}>
                        <Pill tone="blue" icon={Paperclip}>
                          {doc.attachments.length} files
                        </Pill>
                      </span>
                    ) : doc.fileName ? (
                      <div className="flex items-center gap-1 text-[11px] text-primary font-medium">
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate max-w-[130px]" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">No file</span>
                    )}
                  </td>
                  <td className={`${TD_CLASS} text-center`}>
                    {!hasRenewal ? (
                      <Pill tone="slate">Permanent</Pill>
                    ) : overdue ? (
                      <Pill tone="red" icon={AlertTriangle}>
                        Overdue
                      </Pill>
                    ) : expiring ? (
                      <Pill tone="amber" icon={Clock}>
                        Expiring Soon
                      </Pill>
                    ) : (
                      <Pill tone="emerald" icon={CheckCircle2}>
                        Active
                      </Pill>
                    )}
                  </td>
                  <td className={`${TD_CLASS} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <IconAction icon={Share2} title="Share document" onClick={() => setSharingDoc(doc)} />
                      <IconAction icon={Edit2} title="Edit document" onClick={() => setEditingDoc(doc)} />
                      <IconAction icon={Trash2} title="Delete document" tone="danger" onClick={() => handleDeleteDocument(doc)} />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      )}

      <AddDocumentModal isOpen={isAddDocModalOpen} onClose={() => setIsAddDocModalOpen(false)} onCreated={loadData} />
      <EditDocumentModal
        isOpen={Boolean(editingDoc)}
        document={editingDoc}
        onClose={() => setEditingDoc(null)}
        onUpdated={loadData}
      />
      <ShareModal isOpen={Boolean(sharingDoc)} document={sharingDoc} onClose={() => setSharingDoc(null)} onShared={loadData} />
      <AddSubscriptionModal isOpen={isAddSubModalOpen} onClose={() => setIsAddSubModalOpen(false)} onCreated={loadData} />
    </PageShell>
  );
}
