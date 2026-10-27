import { useCallback, useEffect, useRef, useState } from "react";
import supabase from "../../../SupabaseClient";
import Papa from "papaparse";
import {
  X,
  MessageSquarePlus,
  Search,
  User,
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
} from "lucide-react";
import {
  extractTemplateVariables,
  parseTemplateBody,
} from "../utils/chatUtils";
import {
  fetchUsers,
  uploadWhatsappMedia,
  fetchBulkContacts,
  upsertBulkContacts,
  deleteBulkContacts,
  updateBulkContact,
} from "../services/whatsappApi";

const CATEGORY_COLOR = {
  MARKETING:
    "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900",
  UTILITY:
    "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900",
  AUTHENTICATION:
    "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900",
};

const TEMPLATE_CATEGORIES = ["ALL", "UTILITY", "MARKETING", "AUTHENTICATION"];

const HEADER_MEDIA_ICON = { IMAGE: Image, VIDEO: Video, DOCUMENT: FileText };
const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

// ─── Step indicator ────────────────────────────────────────────────────────
function StepDot({ step, current }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-200 ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-emerald-600 text-white ring-4 ring-emerald-500/20"
              : "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500"
        }`}
      >
        {done ? "✓" : step}
      </div>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────
/**
 * NewChatModal — 2-step wizard
 *
 * Step 1: Select / type a contact (public.users picker or manual phone entry)
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
export default function NewChatModal({
  templates,
  isSending,
  sendProgress,
  onClose,
  onSend,
}) {
  // ── Step state ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1 = contact, 2 = template

  // ── Contact step — server-side search ─────────────────────────────────
  const [contactMode, setContactMode] = useState("picker"); // 'picker' | 'manual' | 'bulk'
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false); // true after first fetch
  const [selectedUsers, setSelectedUsers] = useState([]); // [{ id, user_name, number }]
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [isNewContact, setIsNewContact] = useState(false);
  const [checkingContact, setCheckingContact] = useState(false);
  const debounceRef = useRef(null);

  // ── Bulk import (CSV) ───────────────────────────────────────────────────
  const [bulkContacts, setBulkContacts] = useState([]); // rows from whatsapp_bulk_contacts
  const [isLoadingBulkContacts, setIsLoadingBulkContacts] = useState(false);
  const [hasLoadedBulkContacts, setHasLoadedBulkContacts] = useState(false);
  const [selectedBulkContacts, setSelectedBulkContacts] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportSummary, setCsvImportSummary] = useState(null); // { imported, skipped }
  const [csvImportErrors, setCsvImportErrors] = useState([]);
  const bulkFileInputRef = useRef(null);

  // ── Inline Edit for Bulk Contacts ───────────────────────────────────────
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

  // Server-side search — fires on mount (empty query = all users with phones)
  // and whenever userSearch changes, debounced 300 ms.
  const runSearch = useCallback(async (query) => {
    console.log(
      "[NewChatModal] runSearch triggered, query:",
      JSON.stringify(query),
    );
    setIsSearching(true);
    try {
      const rows = await fetchUsers(query);
      console.log(
        "[NewChatModal] fetchUsers returned",
        rows.length,
        "row(s):",
        rows,
      );
      setSearchResults(rows);
      setHasSearched(true);
    } catch (err) {
      console.error("[NewChatModal] User search failed:", err);
      setSearchResults([]);
      setHasSearched(true); // show empty-state instead of staying on Loading
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Auto-load when picker mode mounts
  useEffect(() => {
    if (contactMode === "picker") {
      runSearch("");
    }
  }, [contactMode, runSearch]);

  // Debounced re-search on query change
  useEffect(() => {
    if (contactMode !== "picker") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(userSearch), 300);
    return () => clearTimeout(debounceRef.current);
  }, [userSearch, contactMode, runSearch]);

  // Load persisted bulk contacts the first time the Bulk Import tab is opened.
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

  const handleCancelEditBulkContact = () => {
    setEditingBulkContactId(null);
  };

  useEffect(() => {
    if (contactMode === "bulk" && !hasLoadedBulkContacts) {
      loadBulkContacts();
    }
  }, [contactMode, hasLoadedBulkContacts, loadBulkContacts]);

  // ── Template filtering (client-side — small list) ─────────────────────
  const filteredTemplates = templates.filter(
    (t) =>
      (templateCategoryFilter === "ALL" ||
        t.category === templateCategoryFilter) &&
      t.elementName.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  // ── Bulk contact filtering (client-side) ───────────────────────────────
  const filteredBulkContacts = bulkContacts.filter((c) => {
    if (!bulkSearch.trim()) return true;
    const q = bulkSearch.trim().toLowerCase();
    return (
      (c.display_name || "").toLowerCase().includes(q) ||
      (c.raw_phone_number || "").toLowerCase().includes(q)
    );
  });

  const allFilteredBulkSelected =
    filteredBulkContacts.length > 0 &&
    filteredBulkContacts.every((c) =>
      selectedBulkContacts.some((s) => s.id === c.id),
    );

  const variableTokens = selectedTemplate
    ? extractTemplateVariables(selectedTemplate.bodyText)
    : [];

  const previewText = selectedTemplate
    ? parseTemplateBody(
        selectedTemplate.bodyText,
        variableTokens.map((t) => variables[t] || ""),
      )
    : "";

  // Resolved contacts for the send call — an array so picker/bulk modes can
  // target multiple recipients at once; manual mode always yields at most one.
  const resolvedContacts =
    contactMode === "picker"
      ? selectedUsers.map((u) => ({
          phoneNumber: String(u.number),
          displayName: u.user_name,
        }))
      : contactMode === "bulk"
        ? selectedBulkContacts.map((c) => ({
            phoneNumber: c.phone_number || c.raw_phone_number,
            displayName: c.display_name || undefined,
          }))
        : manualPhone.trim()
          ? [
              {
                phoneNumber: manualPhone.trim(),
                displayName: manualName.trim() || undefined,
              },
            ]
          : [];

  // Highlight matched portion of a string
  const highlight = (text, query) => {
    if (!query || !text) return text != null ? String(text) : "";
    const str = String(text);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return str;
    return (
      <>
        {str.slice(0, idx)}
        <mark className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded px-0.5">
          {str.slice(idx, idx + query.length)}
        </mark>
        {str.slice(idx + query.length)}
      </>
    );
  };

  // Step 1 valid?
  const step1Valid =
    contactMode === "picker"
      ? selectedUsers.length > 0
      : contactMode === "bulk"
        ? selectedBulkContacts.length > 0
        : manualPhone.trim().length >= 7;

  const needsHeaderMedia =
    selectedTemplate &&
    MEDIA_HEADER_TYPES.includes(selectedTemplate.headerType);

  // Step 2 valid?
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
        const { data, error } = await supabase
          .from("whatsapp_contacts_metadata")
          .select("id")
          .eq("phone_number", cleanPhone)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setIsNewContact(true);
          const actTemplate = templates.find((t) => t.elementName === "message_initiation");
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
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
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

  // ── Bulk import handlers ─────────────────────────────────────────────
  const handleToggleBulkContact = (contact) => {
    setSelectedBulkContacts((prev) =>
      prev.some((c) => c.id === contact.id)
        ? prev.filter((c) => c.id !== contact.id)
        : [...prev, contact],
    );
  };

  const handleToggleSelectAllBulk = () => {
    setSelectedBulkContacts((prev) => {
      if (allFilteredBulkSelected) {
        const filteredIds = new Set(filteredBulkContacts.map((c) => c.id));
        return prev.filter((c) => !filteredIds.has(c.id));
      }
      const prevIds = new Set(prev.map((c) => c.id));
      return [
        ...prev,
        ...filteredBulkContacts.filter((c) => !prevIds.has(c.id)),
      ];
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
          const rawPhone = (
            row.phone_number ||
            row.Phone_Number ||
            row.PHONE_NUMBER ||
            ""
          )
            .toString()
            .trim();
          const digits = rawPhone.replace(/\D/g, "");
          if (digits.length < 7) {
            errors.push(`Row ${idx + 2}: invalid or missing phone number`);
            return;
          }
          validRows.push({
            raw_phone_number: rawPhone,
            display_name:
              (row.display_name || row.Display_Name || row.DISPLAY_NAME || "")
                .toString()
                .trim() || null,
            batch_label: file.name,
          });
        });

        try {
          if (validRows.length > 0) {
            await upsertBulkContacts(validRows);
            await loadBulkContacts();
          }
          setCsvImportSummary({
            imported: validRows.length,
            skipped: errors.length,
          });
          setCsvImportErrors(errors);
        } catch (err) {
          console.error("Failed to import bulk contacts:", err);
          setCsvImportErrors([
            err.message || "Failed to save imported contacts",
          ]);
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-800"
        style={{ animation: "fadeSlideUp 0.18s ease-out" }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
              <MessageSquarePlus size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                New Chat
              </h3>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">
                {step === 1
                  ? "Step 1 — Choose contact"
                  : "Step 2 — Select template"}
              </p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mr-2">
            <StepDot step={1} current={step} />
            <div className="h-px w-4 bg-gray-200 dark:bg-slate-700" />
            <StepDot step={2} current={step} />
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="max-h-[70vh] overflow-y-auto">
          {/* ─────────────── STEP 1 — CONTACT ──────────────────────── */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              {/* Mode tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleModeSwitch("picker")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition-all ${
                    contactMode === "picker"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-emerald-400"
                  }`}
                >
                  <User size={13} />
                  Existing User
                </button>
                <button
                  onClick={() => handleModeSwitch("manual")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition-all ${
                    contactMode === "manual"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-emerald-400"
                  }`}
                >
                  <Hash size={13} />
                  New Contact
                </button>
              </div>

              {/* ── Picker mode ── */}
              {contactMode === "picker" && (
                <div className="space-y-3">
                  {/* Search input */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Search Users
                    </label>
                    <div className="relative">
                      {isSearching ? (
                        <Loader2
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin"
                        />
                      ) : (
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                      )}
                      <input
                        autoFocus
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Type name or phone number…"
                        className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                      {userSearch && (
                        <button
                          onClick={() => setUserSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Always-visible inline results list */}
                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {isSearching && searchResults.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                        <Loader2
                          size={13}
                          className="animate-spin text-emerald-500"
                        />
                        Searching…
                      </div>
                    ) : !hasSearched ? (
                      <div className="py-6 text-center text-xs text-gray-400">
                        Loading…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="py-6 text-center space-y-1">
                        <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                          No users found
                          {userSearch ? ` for "${userSearch}"` : ""}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Try the New Contact tab instead.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
                        {searchResults.map((u) => {
                          const isSelected = selectedUsers.some(
                            (s) => s.id === u.id,
                          );
                          return (
                            <button
                              key={u.id}
                              onClick={() => handleToggleUser(u)}
                              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isSelected
                                  ? "bg-emerald-50 dark:bg-emerald-950/30"
                                  : "hover:bg-gray-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              <div
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                  isSelected
                                    ? "bg-emerald-600 border-emerald-600"
                                    : "border-gray-300 dark:border-slate-600"
                                }`}
                              >
                                {isSelected && (
                                  <span className="text-[9px] font-black text-white leading-none">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-[10px] font-black text-white shadow-sm">
                                {(u.user_name || "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-gray-900 dark:text-white">
                                  {highlight(u.user_name, userSearch)}
                                </p>
                                <p className="truncate text-[10px] text-gray-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone size={8} />
                                  {highlight(u.number, userSearch)}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected user chips */}
                  {selectedUsers.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
                        {selectedUsers.length} contact
                        {selectedUsers.length > 1 ? "s" : ""} selected
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1.5">
                        {selectedUsers.map((su) => (
                          <div
                            key={su.id}
                            className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2"
                          >
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-[9px] font-black text-white">
                              {(su.user_name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                {su.user_name}
                              </p>
                              <p className="truncate text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Phone size={9} />
                                {su.number}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveUser(su.id)}
                              className="rounded-full p-0.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
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

              {/* ── Manual mode ── */}
              {contactMode === "manual" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Phone Number <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="tel"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      Include country code (e.g. 91 for India). The number will
                      be normalised automatically.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Display Name{" "}
                      <span className="text-gray-300">(optional)</span>
                    </label>
                    <div className="relative">
                      <User
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="Contact's display name"
                        className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Bulk import mode ── */}
              {contactMode === "bulk" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadSampleCsv}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2 text-xs font-bold text-gray-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                    >
                      <Download size={13} />
                      Sample CSV
                    </button>
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                      {isImportingCsv ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />{" "}
                          Importing…
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
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    CSV columns: <code className="font-mono">phone_number</code>{" "}
                    (required, with country code) and{" "}
                    <code className="font-mono">display_name</code> (optional).
                  </p>

                  {csvImportSummary && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Imported {csvImportSummary.imported} contact
                      {csvImportSummary.imported === 1 ? "" : "s"}
                      {csvImportSummary.skipped > 0
                        ? `, skipped ${csvImportSummary.skipped}`
                        : ""}
                      .
                    </div>
                  )}
                  {csvImportErrors.length > 0 && (
                    <div className="max-h-24 overflow-y-auto rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 space-y-0.5">
                      {csvImportErrors.map((e, i) => (
                        <p
                          key={i}
                          className="text-[10px] text-red-600 dark:text-red-400"
                        >
                          {e}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      placeholder="Search imported contacts…"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {isLoadingBulkContacts ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                        <Loader2
                          size={13}
                          className="animate-spin text-emerald-500"
                        />
                        Loading…
                      </div>
                    ) : filteredBulkContacts.length === 0 ? (
                      <div className="py-6 text-center space-y-1">
                        <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                          No imported contacts
                          {bulkSearch ? ` for "${bulkSearch}"` : ""}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Import a CSV above to build your contact list.
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleToggleSelectAllBulk}
                          className="flex w-full items-center gap-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/60 px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 hover:text-emerald-600"
                        >
                          {allFilteredBulkSelected ? (
                            <CheckSquare size={13} />
                          ) : (
                            <Square size={13} />
                          )}
                          Select All ({filteredBulkContacts.length})
                        </button>
                        <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
                          {filteredBulkContacts.map((c) => {
                            const isSelected = selectedBulkContacts.some(
                              (s) => s.id === c.id,
                            );
                            const isEditing = editingBulkContactId === c.id;

                            if (isEditing) {
                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/50 dark:bg-slate-800/50"
                                >
                                  <div className="flex-1 space-y-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editBulkName}
                                      onChange={(e) =>
                                        setEditBulkName(e.target.value)
                                      }
                                      placeholder="Display Name (optional)"
                                      className="w-full rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <input
                                      type="text"
                                      value={editBulkPhone}
                                      onChange={(e) =>
                                        setEditBulkPhone(e.target.value)
                                      }
                                      placeholder="Phone Number (required)"
                                      className="w-full rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1 pl-2 border-l border-gray-200 dark:border-slate-700">
                                    <button
                                      onClick={() =>
                                        handleSaveBulkContact(c.id)
                                      }
                                      disabled={!editBulkPhone.trim()}
                                      className="rounded p-1 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                                      title="Save"
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      onClick={handleCancelEditBulkContact}
                                      className="rounded p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700"
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
                                className={`group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                  isSelected
                                    ? "bg-emerald-50 dark:bg-emerald-950/30"
                                    : "hover:bg-gray-50 dark:hover:bg-slate-800"
                                }`}
                              >
                                <div
                                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                    isSelected
                                      ? "bg-emerald-600 border-emerald-600"
                                      : "border-gray-300 dark:border-slate-600"
                                  }`}
                                >
                                  {isSelected && (
                                    <span className="text-[9px] font-black text-white leading-none">
                                      ✓
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold text-gray-900 dark:text-white">
                                    {c.display_name || "—"}
                                  </p>
                                  <p className="truncate text-[10px] text-gray-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                    <Phone size={8} />
                                    {c.raw_phone_number}
                                  </p>
                                </div>
                                <div className="flex items-center transition-all gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditBulkContact(c);
                                    }}
                                    className="rounded p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    title="Edit Contact"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleDeleteBulkContact(c.id);
                                    }}
                                    className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    title="Delete Contact"
                                  >
                                    <Trash2 size={14} />
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
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {selectedBulkContacts.length} contact
                      {selectedBulkContacts.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}

              {/* Info callout */}
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-2.5">
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  ⚡ <strong>Template required</strong> — Meta only allows
                  outbound messages to new contacts via pre-approved templates.
                  You'll choose one on the next step.
                </p>
              </div>
            </div>
          )}

          {/* ─────────────── STEP 2 — TEMPLATE ─────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              {isNewContact && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-xs dark:border-blue-900/50 dark:bg-blue-950/20 shadow-sm">
                  <p className="font-black text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    ⚡ New Contact Opt-In Needed
                  </p>
                  <p className="mt-1 text-gray-600 dark:text-slate-400 font-medium leading-relaxed">
                    This contact is new to our database. Meta policy requires sending a pre-approved template first. The introductory activation template (<strong>message_initiation</strong>) has been selected for you.
                  </p>
                </div>
              )}
              {selectedTemplate ? (
                // Variable fill view
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-gray-900 dark:text-white">
                        {selectedTemplate.elementName}
                      </p>
                      <span
                        className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                          CATEGORY_COLOR[selectedTemplate.category]
                        }`}
                      >
                        {selectedTemplate.category}
                      </span>
                    </div>
                    {!isNewContact && (
                      <button
                        onClick={() => setSelectedTemplate(null)}
                        className="flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-emerald-600 transition-colors"
                      >
                        <ChevronLeft size={13} />
                        Change
                      </button>
                    )}
                  </div>

                  {/* Live preview */}
                  <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 p-3.5 space-y-1.5">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Live Preview
                    </p>
                    {selectedTemplate.headerType === "TEXT" &&
                      selectedTemplate.headerText && (
                        <p className="text-sm font-black text-gray-800 dark:text-slate-200">
                          {selectedTemplate.headerText}
                        </p>
                      )}
                    {needsHeaderMedia && (
                      <>
                        {/* If media is already uploaded — show it in preview */}
                        {headerMediaUrl && selectedTemplate.headerType === "IMAGE" && (
                          <img
                            src={headerMediaUrl}
                            alt="header"
                            className="w-full max-h-44 object-cover rounded-lg mb-1"
                          />
                        )}
                        {headerMediaUrl && selectedTemplate.headerType === "VIDEO" && (
                          <div className="relative bg-black w-full rounded-lg overflow-hidden mb-1">
                            <video
                              src={headerMediaUrl}
                              className="w-full max-h-44 object-cover"
                              preload="metadata"
                              controls
                            />
                          </div>
                        )}
                        {headerMediaUrl && selectedTemplate.headerType === "DOCUMENT" && (
                          <div className="flex items-center gap-2.5 bg-red-50/60 dark:bg-red-950/20 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40 mb-1">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/90 text-white">
                              <FileText size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-gray-800 dark:text-slate-200">{headerFileName || "Document"}</p>
                              <p className="text-[10px] text-gray-400">PDF · Tap to open</p>
                            </div>
                          </div>
                        )}
                        {/* Placeholder when not yet uploaded */}
                        {!headerMediaUrl && (
                          <p className="flex items-center gap-1 text-xs font-bold text-gray-400 dark:text-slate-500">
                            {(() => {
                              const Icon =
                                HEADER_MEDIA_ICON[selectedTemplate.headerType];
                              return Icon ? <Icon size={12} /> : null;
                            })()}
                            {selectedTemplate.headerType} header — attach below
                          </p>
                        )}
                      </>
                    )}

                    <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {previewText}
                    </p>
                    {selectedTemplate.footerText && (
                      <p className="text-xs text-gray-400">
                        {selectedTemplate.footerText}
                      </p>
                    )}
                    {selectedTemplate.buttons?.length > 0 && (
                      <div className="mt-1.5 space-y-1 border-t border-gray-200 dark:border-slate-800 pt-1">
                        {selectedTemplate.buttons.map((btn, idx) => (
                          <p
                            key={idx}
                            className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400"
                          >
                            {btn.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Header media upload (required for IMAGE/VIDEO/DOCUMENT headers) */}
                  {needsHeaderMedia && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
                        Header {selectedTemplate.headerType.toLowerCase()}{" "}
                        <span className="text-red-400">*</span>
                      </label>
                      {headerMediaUrl ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5">
                          <Paperclip
                            size={13}
                            className="flex-shrink-0 text-emerald-600"
                          />
                          <span className="flex-1 truncate text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            {headerFileName}
                          </span>
                          <button
                            onClick={() => {
                              setHeaderMediaUrl(null);
                              setHeaderFileName(null);
                            }}
                            className="text-emerald-500 hover:text-emerald-700"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 py-3 text-xs font-bold text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                          {isUploadingHeader ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />{" "}
                              Uploading…
                            </>
                          ) : (
                            <>
                              <Paperclip size={14} /> Choose{" "}
                              {selectedTemplate.headerType.toLowerCase()} file
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
                          <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-gray-400">
                            Variable {token}
                          </label>
                          <input
                            value={variables[token] || ""}
                            onChange={(e) =>
                              setVariables((v) => ({
                                ...v,
                                [token]: e.target.value,
                              }))
                            }
                            placeholder={`Value for ${token}`}
                            className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      This template has no dynamic variables.
                    </p>
                  )}
                </div>
              ) : (
                // Template list view
                <div className="space-y-3">
                  {/* Category tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setTemplateCategoryFilter(cat)}
                        className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${
                          templateCategoryFilter === cat
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : cat === "ALL"
                              ? "bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-emerald-400"
                              : `${CATEGORY_COLOR[cat]} hover:opacity-80`
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates…"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    />
                  </div>

                  {filteredTemplates.length === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-400">
                      No approved templates found.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredTemplates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => handleSelectTemplate(tpl)}
                          className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3.5 text-left hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white truncate">
                              {HEADER_MEDIA_ICON[tpl.headerType] &&
                                (() => {
                                  const Icon =
                                    HEADER_MEDIA_ICON[tpl.headerType];
                                  return (
                                    <Icon
                                      size={13}
                                      className="flex-shrink-0 text-gray-400"
                                    />
                                  );
                                })()}
                              {tpl.elementName}
                            </span>
                            <span
                              className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide ${
                                CATEGORY_COLOR[tpl.category]
                              }`}
                            >
                              {tpl.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">
                            {tpl.bodyText}
                          </p>
                          {tpl.buttons?.length > 0 && (
                            <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              {tpl.buttons.length} button
                              {tpl.buttons.length > 1 ? "s" : ""}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 border-t border-gray-100 dark:border-slate-800 px-5 py-3.5">
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!step1Valid || checkingContact}
                onClick={handleNextStep}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {checkingContact ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Checking contact…
                  </>
                ) : (
                  "Next — Choose Template"
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                disabled={isSending}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <button
                disabled={!step2Valid || isSending}
                onClick={handleSend}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
              </button>
            </>
          )}
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
