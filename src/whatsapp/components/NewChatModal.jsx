import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  X,
  MessageSquarePlus,
  Search,
  User,
  Users,
  Phone,
  ChevronLeft,
  Send,
  Loader2,
  Hash,
  Image,
  Video,
  FileText,
  Paperclip,
  Upload,
  Download,
  CheckSquare,
  Square,
  Trash2,
  Pencil,
  Check,
  Info,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractTemplateVariables, parseTemplateBody } from "../utils/chatUtils";
import {
  fetchUsers,
  fetchContacts,
  uploadWhatsappMedia,
  fetchBulkContacts,
  upsertBulkContacts,
  deleteBulkContacts,
  updateBulkContact,
} from "../services/whatsappApi";

const CATEGORY_COLOR = {
  MARKETING: "bg-violet-50 text-violet-700 border-violet-200",
  UTILITY: "bg-blue-50 text-blue-700 border-blue-200",
  AUTHENTICATION: "bg-amber-50 text-amber-700 border-amber-200",
};

const TEMPLATE_CATEGORIES = ["ALL", "UTILITY", "MARKETING", "AUTHENTICATION"];

const HEADER_MEDIA_ICON = { IMAGE: Image, VIDEO: Video, DOCUMENT: FileText };
const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

const INPUT_CLS =
  "w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40";
const LABEL_CLS = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

const CheckBox = ({ checked }) => (
  <div
    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
      checked ? "bg-primary border-primary" : "border-slate-300 bg-white"
    }`}
  >
    {checked && <Check size={10} strokeWidth={3.5} className="text-white" />}
  </div>
);

// ─── Step indicator ────────────────────────────────────────────────────────
function StepDot({ step, current }) {
  const done = current > step;
  const active = current === step;
  return (
    <div
      className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200 ${
        done
          ? "bg-primary text-primary-foreground"
          : active
            ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
            : "bg-slate-100 text-slate-400"
      }`}
    >
      {done ? <Check size={12} strokeWidth={3} /> : step}
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────
/**
 * NewChatModal — 2-step wizard
 *
 * Step 1: Select / type a contact (VPR users picker, manual phone entry or
 *         imported bulk contacts)
 * Step 2: Pick an approved template and fill in variable values
 *
 * Props:
 *  templates    – array of { id, elementName, category, language, bodyText,
 *                 headerType, headerText, footerText, buttons }
 *  isSending    – boolean controlled by parent
 *  sendProgress – optional { done, total } shown on the Send button during
 *                 multi-contact (bulk) sends
 *  onClose()    – close the modal without sending
 *  onSend({ contacts, templateElementName, templateLanguage, variables, headerMediaUrl, headerFileName })
 */
export default function NewChatModal({ templates, isSending, sendProgress, onClose, onSend }) {
  // ── Step state ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1 = contact, 2 = template

  // ── Contact step — search ─────────────────────────────────────────────
  const [contactMode, setContactMode] = useState("picker"); // 'picker' | 'manual' | 'bulk'
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]); // [{ id, user_name, number }]
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [isNewContact, setIsNewContact] = useState(false);
  const [checkingContact, setCheckingContact] = useState(false);
  const debounceRef = useRef(null);

  // ── Bulk import (CSV) ───────────────────────────────────────────────────
  const [bulkContacts, setBulkContacts] = useState([]);
  const [isLoadingBulkContacts, setIsLoadingBulkContacts] = useState(false);
  const [hasLoadedBulkContacts, setHasLoadedBulkContacts] = useState(false);
  const [selectedBulkContacts, setSelectedBulkContacts] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportSummary, setCsvImportSummary] = useState(null); // { imported, skipped }
  const [csvImportErrors, setCsvImportErrors] = useState([]);
  const bulkFileInputRef = useRef(null);

  // ── Inline edit for bulk contacts ───────────────────────────────────────
  const [editingBulkContactId, setEditingBulkContactId] = useState(null);
  const [editBulkName, setEditBulkName] = useState("");
  const [editBulkPhone, setEditBulkPhone] = useState("");

  // ── Template step ─────────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("ALL");
  const [headerMediaUrl, setHeaderMediaUrl] = useState(null);
  const [headerFileName, setHeaderFileName] = useState(null);
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);

  // Search — fires on mount (empty query = all users with phones) and on
  // every userSearch change, debounced 300 ms.
  const runSearch = useCallback(async (query) => {
    setIsSearching(true);
    try {
      const rows = await fetchUsers(query);
      setSearchResults(rows);
      setHasSearched(true);
    } catch (err) {
      console.error("[NewChatModal] User search failed:", err);
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (contactMode === "picker") runSearch("");
  }, [contactMode, runSearch]);

  useEffect(() => {
    if (contactMode !== "picker") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(userSearch), 300);
    return () => clearTimeout(debounceRef.current);
  }, [userSearch, contactMode, runSearch]);

  // Persisted bulk contacts load the first time the Bulk Import tab opens.
  const loadBulkContacts = useCallback(async () => {
    setIsLoadingBulkContacts(true);
    try {
      const rows = await fetchBulkContacts();
      setBulkContacts(rows);
    } catch (err) {
      console.error("Failed to load bulk contacts:", err);
      setBulkContacts([]);
    } finally {
      setHasLoadedBulkContacts(true);
      setIsLoadingBulkContacts(false);
    }
  }, []);

  const handleDeleteBulkContact = async (id) => {
    try {
      await deleteBulkContacts([id]);
      await loadBulkContacts();
      setSelectedBulkContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete contact:", err);
    }
  };

  const handleEditBulkContact = (c) => {
    setEditingBulkContactId(c.id);
    setEditBulkName(c.display_name || "");
    setEditBulkPhone(c.raw_phone_number || "");
  };

  const handleSaveBulkContact = async (id) => {
    try {
      if (!editBulkPhone.trim()) return;
      await updateBulkContact(id, {
        display_name: editBulkName.trim() || null,
        raw_phone_number: editBulkPhone.trim(),
      });
      await loadBulkContacts();
      setEditingBulkContactId(null);
    } catch (err) {
      console.error("Failed to update contact:", err);
    }
  };

  const handleCancelEditBulkContact = () => setEditingBulkContactId(null);

  useEffect(() => {
    if (contactMode === "bulk" && !hasLoadedBulkContacts) loadBulkContacts();
  }, [contactMode, hasLoadedBulkContacts, loadBulkContacts]);

  // ── Template filtering (client-side — small list) ─────────────────────
  const filteredTemplates = templates.filter(
    (t) =>
      (templateCategoryFilter === "ALL" || t.category === templateCategoryFilter) &&
      t.elementName.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const filteredBulkContacts = bulkContacts.filter((c) => {
    if (!bulkSearch.trim()) return true;
    const q = bulkSearch.trim().toLowerCase();
    return (c.display_name || "").toLowerCase().includes(q) || (c.raw_phone_number || "").toLowerCase().includes(q);
  });

  const allFilteredBulkSelected =
    filteredBulkContacts.length > 0 &&
    filteredBulkContacts.every((c) => selectedBulkContacts.some((s) => s.id === c.id));

  const variableTokens = selectedTemplate ? extractTemplateVariables(selectedTemplate.bodyText) : [];

  const previewText = selectedTemplate
    ? parseTemplateBody(
        selectedTemplate.bodyText,
        variableTokens.map((t) => variables[t] || "")
      )
    : "";

  // Recipients for the send call — picker/bulk can target several at once.
  const resolvedContacts =
    contactMode === "picker"
      ? selectedUsers.map((u) => ({ phoneNumber: String(u.number), displayName: u.user_name }))
      : contactMode === "bulk"
        ? selectedBulkContacts.map((c) => ({
            phoneNumber: c.phone_number || c.raw_phone_number,
            displayName: c.display_name || undefined,
          }))
        : manualPhone.trim()
          ? [{ phoneNumber: manualPhone.trim(), displayName: manualName.trim() || undefined }]
          : [];

  const highlight = (text, query) => {
    if (!query || !text) return text != null ? String(text) : "";
    const str = String(text);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return str;
    return (
      <>
        {str.slice(0, idx)}
        <mark className="bg-primary/15 text-primary rounded px-0.5">{str.slice(idx, idx + query.length)}</mark>
        {str.slice(idx + query.length)}
      </>
    );
  };

  const step1Valid =
    contactMode === "picker"
      ? selectedUsers.length > 0
      : contactMode === "bulk"
        ? selectedBulkContacts.length > 0
        : manualPhone.trim().length >= 7;

  const needsHeaderMedia = selectedTemplate && MEDIA_HEADER_TYPES.includes(selectedTemplate.headerType);

  const step2Valid =
    selectedTemplate !== null &&
    variableTokens.every((t) => variables[t] && variables[t].trim()) &&
    (!needsHeaderMedia || !!headerMediaUrl);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleNextStep = async () => {
    if (!step1Valid || checkingContact) return;

    if (contactMode === "manual" && manualPhone.trim()) {
      setCheckingContact(true);
      try {
        const cleanPhone = manualPhone.trim().replace(/\D/g, "").slice(-10);
        const known = (await fetchContacts()).some((c) => c.phone_number === cleanPhone);

        if (!known) {
          setIsNewContact(true);
          const actTemplate =
            templates.find((t) => t.elementName === "hello_world") ||
            templates.find((t) => t.status === "APPROVED");
          if (actTemplate) {
            setSelectedTemplate(actTemplate);
            setVariables({});
            setHeaderMediaUrl(null);
            setHeaderFileName(null);
          }
        } else {
          setIsNewContact(false);
        }
      } catch (err) {
        console.error("Error checking contact:", err);
      } finally {
        setCheckingContact(false);
      }
    } else {
      setIsNewContact(false);
    }
    setStep(2);
  };

  const handleToggleUser = (user) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
    );
  };

  const handleRemoveUser = (userId) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleModeSwitch = (mode) => {
    setContactMode(mode);
    setSelectedUsers([]);
    setUserSearch("");
    setSearchResults([]);
    setHasSearched(false);
    setManualPhone("");
    setManualName("");
    setSelectedBulkContacts([]);
    setBulkSearch("");
    setCsvImportSummary(null);
    setCsvImportErrors([]);
  };

  const handleToggleBulkContact = (contact) => {
    setSelectedBulkContacts((prev) =>
      prev.some((c) => c.id === contact.id) ? prev.filter((c) => c.id !== contact.id) : [...prev, contact]
    );
  };

  const handleToggleSelectAllBulk = () => {
    setSelectedBulkContacts((prev) => {
      if (allFilteredBulkSelected) {
        const filteredIds = new Set(filteredBulkContacts.map((c) => c.id));
        return prev.filter((c) => !filteredIds.has(c.id));
      }
      const prevIds = new Set(prev.map((c) => c.id));
      return [...prev, ...filteredBulkContacts.filter((c) => !prevIds.has(c.id))];
    });
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = Papa.unparse({
      fields: ["phone_number", "display_name"],
      data: [
        ["+91 98765 43210", "Ramesh Kumar"],
        ["+91 87654 32109", "Priya Singh"],
      ],
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "whatsapp_bulk_contacts_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBulkFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingCsv(true);
    setCsvImportSummary(null);
    setCsvImportErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const validRows = [];
        const errors = [];

        results.data.forEach((row, idx) => {
          const rawPhone = (row.phone_number || row.Phone_Number || row.PHONE_NUMBER || "").toString().trim();
          const digits = rawPhone.replace(/\D/g, "");
          if (digits.length < 7) {
            errors.push(`Row ${idx + 2}: invalid or missing phone number`);
            return;
          }
          validRows.push({
            raw_phone_number: rawPhone,
            display_name: (row.display_name || row.Display_Name || row.DISPLAY_NAME || "").toString().trim() || null,
            batch_label: file.name,
          });
        });

        try {
          if (validRows.length > 0) {
            await upsertBulkContacts(validRows);
            await loadBulkContacts();
          }
          setCsvImportSummary({ imported: validRows.length, skipped: errors.length });
          setCsvImportErrors(errors);
        } catch (err) {
          console.error("Failed to import bulk contacts:", err);
          setCsvImportErrors([err.message || "Failed to save imported contacts"]);
        } finally {
          setIsImportingCsv(false);
          if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
        }
      },
      error: (err) => {
        setIsImportingCsv(false);
        setCsvImportErrors([`Failed to parse CSV: ${err.message}`]);
      },
    });
  };

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    setVariables({});
    setTemplateSearch("");
    setHeaderMediaUrl(null);
    setHeaderFileName(null);
  };

  const handleHeaderFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingHeader(true);
    try {
      const publicUrl = await uploadWhatsappMedia(file, "whatsapp_header");
      setHeaderMediaUrl(publicUrl);
      setHeaderFileName(file.name);
    } catch (err) {
      console.error("Failed to upload header media:", err);
    } finally {
      setIsUploadingHeader(false);
    }
  };

  const handleSend = () => {
    if (!step1Valid || !step2Valid || isSending) return;
    onSend({
      contacts: resolvedContacts,
      templateElementName: selectedTemplate.elementName,
      templateLanguage: selectedTemplate.language,
      variables: variableTokens.map((t) => variables[t]),
      headerMediaUrl: headerMediaUrl || undefined,
      headerFileName: headerFileName || undefined,
    });
  };

  const SearchIcon = ({ loading }) =>
    loading ? (
      <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary animate-spin" />
    ) : (
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl border border-slate-200 flex flex-col max-h-[90vh]"
        style={{ animation: "waFadeSlideUp 0.18s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquarePlus size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 leading-tight">New Chat</h3>
              <p className="text-xs text-slate-500">
                {step === 1 ? "Step 1 — Choose contact" : "Step 2 — Select template"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <StepDot step={1} current={step} />
              <div className="h-px w-4 bg-slate-200" />
              <StepDot step={2} current={step} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* ─────────────── STEP 1 — CONTACT ──────────────────────── */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {[
                  { id: "picker", label: "VPR Users", icon: User },
                  { id: "manual", label: "New Contact", icon: Hash },
                  { id: "bulk", label: "Bulk Import", icon: Users },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeSwitch(m.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${
                      contactMode === m.id ? "bg-white text-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <m.icon size={13} />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Picker mode */}
              {contactMode === "picker" && (
                <div className="space-y-3">
                  <div>
                    <label className={LABEL_CLS}>Search VPR Users</label>
                    <div className="relative">
                      <SearchIcon loading={isSearching} />
                      <input
                        autoFocus
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Type name or phone number…"
                        className={`${INPUT_CLS} pl-9 pr-8`}
                      />
                      {userSearch && (
                        <button
                          type="button"
                          onClick={() => setUserSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    {isSearching && searchResults.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                        <Loader2 size={13} className="animate-spin text-primary" />
                        Searching…
                      </div>
                    ) : !hasSearched ? (
                      <div className="py-6 text-center text-xs text-slate-400">Loading…</div>
                    ) : searchResults.length === 0 ? (
                      <div className="py-6 text-center space-y-1">
                        <p className="text-xs font-medium text-slate-600">
                          No VPR users with a phone number found{userSearch ? ` for "${userSearch}"` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400">Try the New Contact tab instead.</p>
                      </div>
                    ) : (
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                        {searchResults.map((u) => {
                          const isSelected = selectedUsers.some((s) => s.id === u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleToggleUser(u)}
                              className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                                isSelected ? "bg-primary/5" : "hover:bg-slate-50"
                              }`}
                            >
                              <CheckBox checked={isSelected} />
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                {(u.user_name || "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-800">
                                  {highlight(u.user_name, userSearch)}
                                </p>
                                <p className="truncate text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone size={9} />
                                  {highlight(u.number, userSearch)}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedUsers.length > 0 && (
                    <div className="space-y-1.5">
                      <p className={LABEL_CLS.replace("mb-1.5 ", "")}>
                        {selectedUsers.length} contact{selectedUsers.length > 1 ? "s" : ""} selected
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1.5">
                        {selectedUsers.map((su) => (
                          <div
                            key={su.id}
                            className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                              {(su.user_name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-800">{su.user_name}</p>
                              <p className="truncate text-[11px] text-slate-500 flex items-center gap-1">
                                <Phone size={9} />
                                {su.number}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveUser(su.id)}
                              className="rounded-full p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual mode */}
              {contactMode === "manual" && (
                <div className="space-y-3">
                  <div>
                    <label className={LABEL_CLS}>
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className={`${INPUT_CLS} pl-9`}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Include country code (e.g. 91 for India). The number will be normalised automatically.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>
                      Display Name <span className="text-slate-400 normal-case font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="Contact's display name"
                        className={`${INPUT_CLS} pl-9`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk import mode */}
              {contactMode === "bulk" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadSampleCsv}
                      className="flex-1 gap-1.5 h-9 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
                    >
                      <Download size={13} />
                      Sample CSV
                    </Button>
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg h-9 bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                      {isImportingCsv ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Importing…
                        </>
                      ) : (
                        <>
                          <Upload size={13} /> Import CSV
                        </>
                      )}
                      <input
                        ref={bulkFileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        disabled={isImportingCsv}
                        onChange={handleBulkFileChange}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    CSV columns: <code className="font-mono text-slate-600">phone_number</code> (required, with country
                    code) and <code className="font-mono text-slate-600">display_name</code> (optional).
                  </p>

                  {csvImportSummary && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
                      Imported {csvImportSummary.imported} contact{csvImportSummary.imported === 1 ? "" : "s"}
                      {csvImportSummary.skipped > 0 ? `, skipped ${csvImportSummary.skipped}` : ""}.
                    </div>
                  )}
                  {csvImportErrors.length > 0 && (
                    <div className="max-h-24 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-0.5">
                      {csvImportErrors.map((e, i) => (
                        <p key={i} className="text-[11px] text-red-600">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      placeholder="Search imported contacts…"
                      className={`${INPUT_CLS} pl-9`}
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    {isLoadingBulkContacts ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                        <Loader2 size={13} className="animate-spin text-primary" />
                        Loading…
                      </div>
                    ) : filteredBulkContacts.length === 0 ? (
                      <div className="py-6 text-center space-y-1">
                        <p className="text-xs font-medium text-slate-600">
                          No imported contacts{bulkSearch ? ` for "${bulkSearch}"` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400">Import a CSV above to build your contact list.</p>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleToggleSelectAllBulk}
                          className="flex w-full items-center gap-2 border-b border-slate-100 bg-blue-50 px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-primary"
                        >
                          {allFilteredBulkSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                          Select All ({filteredBulkContacts.length})
                        </button>
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {filteredBulkContacts.map((c) => {
                            const isSelected = selectedBulkContacts.some((s) => s.id === c.id);
                            const isEditing = editingBulkContactId === c.id;

                            if (isEditing) {
                              return (
                                <div key={c.id} className="flex items-center gap-2 px-3.5 py-2 bg-slate-50/60">
                                  <div className="flex-1 space-y-1.5">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editBulkName}
                                      onChange={(e) => setEditBulkName(e.target.value)}
                                      placeholder="Display Name (optional)"
                                      className={`${INPUT_CLS} h-7`}
                                    />
                                    <input
                                      type="text"
                                      value={editBulkPhone}
                                      onChange={(e) => setEditBulkPhone(e.target.value)}
                                      placeholder="Phone Number (required)"
                                      className={`${INPUT_CLS} h-7`}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1 pl-2 border-l border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveBulkContact(c.id)}
                                      disabled={!editBulkPhone.trim()}
                                      className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                                      title="Save"
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditBulkContact}
                                      className="rounded p-1 text-slate-500 hover:bg-slate-200"
                                      title="Cancel"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={c.id}
                                onClick={() => handleToggleBulkContact(c)}
                                className={`group flex w-full cursor-pointer items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                                  isSelected ? "bg-primary/5" : "hover:bg-slate-50"
                                }`}
                              >
                                <CheckBox checked={isSelected} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-slate-800">{c.display_name || "—"}</p>
                                  <p className="truncate text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <Phone size={9} />
                                    {c.raw_phone_number}
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditBulkContact(c);
                                    }}
                                    className="rounded p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5"
                                    title="Edit Contact"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleDeleteBulkContact(c.id);
                                    }}
                                    className="rounded p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                    title="Delete Contact"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {selectedBulkContacts.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {selectedBulkContacts.length} contact{selectedBulkContacts.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Zap size={13} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <strong>Template required</strong> — Meta only allows outbound messages to new contacts via
                  pre-approved templates. You&apos;ll choose one on the next step.
                </p>
              </div>
            </div>
          )}

          {/* ─────────────── STEP 2 — TEMPLATE ─────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              {isNewContact && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs">
                  <Info size={14} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-700">New Contact Opt-In Needed</p>
                    <p className="mt-0.5 text-slate-600 leading-relaxed">
                      This contact is new to our database. Meta policy requires sending a pre-approved template first.
                      The introductory template (<strong>hello_world</strong>) has been selected for
                      you when available.
                    </p>
                  </div>
                </div>
              )}

              {selectedTemplate ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{selectedTemplate.elementName}</p>
                      <span
                        className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                          CATEGORY_COLOR[selectedTemplate.category] || "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {selectedTemplate.category}
                      </span>
                    </div>
                    {!isNewContact && (
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate(null)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-primary transition-colors"
                      >
                        <ChevronLeft size={13} />
                        Change
                      </button>
                    )}
                  </div>

                  {/* Live preview (WhatsApp bubble) */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className={LABEL_CLS}>Live Preview</p>
                    <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-2xs space-y-1.5">
                      {selectedTemplate.headerType === "TEXT" && selectedTemplate.headerText && (
                        <p className="text-sm font-semibold text-slate-800">{selectedTemplate.headerText}</p>
                      )}
                      {needsHeaderMedia && (
                        <>
                          {headerMediaUrl && selectedTemplate.headerType === "IMAGE" && (
                            <img src={headerMediaUrl} alt="header" className="w-full max-h-44 object-cover rounded-md" />
                          )}
                          {headerMediaUrl && selectedTemplate.headerType === "VIDEO" && (
                            <div className="relative bg-black w-full rounded-md overflow-hidden">
                              <video src={headerMediaUrl} className="w-full max-h-44 object-cover" preload="metadata" controls />
                            </div>
                          )}
                          {headerMediaUrl && selectedTemplate.headerType === "DOCUMENT" && (
                            <div className="flex items-center gap-2.5 bg-white/70 px-2.5 py-2 rounded-md border border-slate-200">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
                                <FileText size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-800">{headerFileName || "Document"}</p>
                                <p className="text-[10px] text-slate-500">PDF · Tap to open</p>
                              </div>
                            </div>
                          )}
                          {!headerMediaUrl && (
                            <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                              {(() => {
                                const Icon = HEADER_MEDIA_ICON[selectedTemplate.headerType];
                                return Icon ? <Icon size={12} /> : null;
                              })()}
                              {selectedTemplate.headerType} header — attach below
                            </p>
                          )}
                        </>
                      )}
                      <p className="text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed">{previewText}</p>
                      {selectedTemplate.footerText && (
                        <p className="text-[11px] text-slate-500">{selectedTemplate.footerText}</p>
                      )}
                    </div>
                    {selectedTemplate.buttons?.length > 0 && (
                      <div className="ml-auto max-w-[92%] mt-1 space-y-1">
                        {selectedTemplate.buttons.map((btn, idx) => (
                          <p
                            key={idx}
                            className="rounded-md bg-white py-1.5 text-center text-xs font-medium text-sky-600 shadow-2xs"
                          >
                            {btn.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Header media upload */}
                  {needsHeaderMedia && (
                    <div>
                      <label className={LABEL_CLS}>
                        Header {selectedTemplate.headerType.toLowerCase()} <span className="text-red-500">*</span>
                      </label>
                      {headerMediaUrl ? (
                        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                          <Paperclip size={13} className="shrink-0 text-primary" />
                          <span className="flex-1 truncate text-xs font-medium text-slate-700">{headerFileName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMediaUrl(null);
                              setHeaderFileName(null);
                            }}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 py-3 text-xs font-medium text-slate-500 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors">
                          {isUploadingHeader ? (
                            <>
                              <Loader2 size={14} className="animate-spin" /> Uploading…
                            </>
                          ) : (
                            <>
                              <Paperclip size={14} /> Choose {selectedTemplate.headerType.toLowerCase()} file
                            </>
                          )}
                          <input
                            type="file"
                            accept={
                              selectedTemplate.headerType === "IMAGE"
                                ? "image/*"
                                : selectedTemplate.headerType === "VIDEO"
                                  ? "video/*"
                                  : undefined
                            }
                            className="hidden"
                            disabled={isUploadingHeader}
                            onChange={handleHeaderFileChange}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {/* Variable inputs */}
                  {variableTokens.length > 0 ? (
                    <div className="space-y-3">
                      {variableTokens.map((token) => (
                        <div key={token}>
                          <label className={LABEL_CLS.replace("mb-1.5", "mb-1")}>Variable {token}</label>
                          <input
                            value={variables[token] || ""}
                            onChange={(e) => setVariables((v) => ({ ...v, [token]: e.target.value }))}
                            placeholder={`Value for ${token}`}
                            className={INPUT_CLS}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">This template has no dynamic variables.</p>
                  )}
                </div>
              ) : (
                // Template list view
                <div className="space-y-3">
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTemplateCategoryFilter(cat)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                          templateCategoryFilter === cat
                            ? "bg-primary text-primary-foreground border-primary"
                            : cat === "ALL"
                              ? "bg-white text-slate-500 border-slate-200 hover:border-primary/40"
                              : `${CATEGORY_COLOR[cat]} hover:opacity-80`
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates…"
                      className={`${INPUT_CLS} pl-9`}
                    />
                  </div>

                  {filteredTemplates.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">No approved templates found.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredTemplates.map((tpl) => {
                        const Icon = HEADER_MEDIA_ICON[tpl.headerType];
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => handleSelectTemplate(tpl)}
                            className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 truncate">
                                {Icon && <Icon size={13} className="shrink-0 text-slate-400" />}
                                {tpl.elementName}
                              </span>
                              <span
                                className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-semibold uppercase tracking-wide ${
                                  CATEGORY_COLOR[tpl.category] || "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {tpl.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{tpl.bodyText}</p>
                            {tpl.buttons?.length > 0 && (
                              <p className="mt-1 text-[10px] font-semibold text-primary">
                                {tpl.buttons.length} button{tpl.buttons.length > 1 ? "s" : ""}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 shrink-0">
          {step === 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 h-9 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!step1Valid || checkingContact}
                onClick={handleNextStep}
                className="flex-1 gap-2 h-9 text-xs font-medium"
              >
                {checkingContact ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Checking contact…
                  </>
                ) : (
                  "Next — Choose Template"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isSending}
                className="gap-1.5 h-9 px-4 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                <ChevronLeft size={14} />
                Back
              </Button>
              <Button
                type="button"
                disabled={!step2Valid || isSending}
                onClick={handleSend}
                className="flex-1 gap-2 h-9 text-xs font-medium"
              >
                {isSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {sendProgress && sendProgress.total > 1
                      ? `Sending ${sendProgress.done}/${sendProgress.total}…`
                      : "Sending…"}
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Send Template
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes waFadeSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
