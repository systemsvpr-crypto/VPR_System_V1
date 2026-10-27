import { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  Phone,
  Sparkles,
  RefreshCw,
  Send,
  Info,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  Loader2,
  Layers,
  ArrowLeft,
} from "lucide-react";
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  fetchAllWhatsappTemplates,
  syncTemplatesFromMeta,
  uploadWhatsappMedia,
} from "../services/whatsappApi";

const CATEGORY_INFO = {
  UTILITY: {
    label: "Utility",
    desc: "Order updates, account alerts, receipts, appointments & reminders",
    color: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    badge: "bg-blue-500",
  },
  MARKETING: {
    label: "Marketing",
    desc: "Promotions, special offers, product announcements, discount codes",
    color: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    badge: "bg-purple-500",
  },
  AUTHENTICATION: {
    label: "Authentication",
    desc: "One-time passwords (OTP), login verification, account security",
    color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    badge: "bg-amber-500",
  },
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi (हिंदी)" },
  { code: "es", label: "Spanish (Español)" },
  { code: "fr", label: "French (Français)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "ar", label: "Arabic (العربية)" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "gu", label: "Gujarati (ગુજરાતી)" },
  { code: "mr", label: "Marathi (मराठी)" },
];

const inputCls =
  "w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all";

export default function CreateTemplateView({
  onTemplateCreated,
  onSelectForBroadcast,
  showToast,
  onBackToBroadcast,
}) {
  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("en");

  // Header State
  const [headerType, setHeaderType] = useState("NONE"); // 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  const [headerText, setHeaderText] = useState("");
  const [headerSample, setHeaderSample] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerFileName, setHeaderFileName] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Body & Variables State
  const [bodyText, setBodyText] = useState("");
  const [variables, setVariables] = useState({});
  const bodyTextareaRef = useRef(null);

  // Footer State
  const [footerText, setFooterText] = useState("");

  // Buttons State (Up to 3 buttons)
  const [buttons, setButtons] = useState([]);

  // Submission & List States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allTemplates, setAllTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("ALL");
  const [templateSearch, setTemplateSearch] = useState("");
  const [activeTab, setActiveTab] = useState("editor"); // 'editor' | 'directory'

  // Extract variables: {{1}}, {{2}}, ...
  const detectedVariables = useMemo(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    // Unique list of token indices
    const unique = Array.from(new Set(matches.map((m) => parseInt(m.replace(/\D/g, ""), 10))))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return unique;
  }, [bodyText]);

  // Load existing templates
  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const data = await fetchAllWhatsappTemplates();
      setAllTemplates(data || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Sync templates from Meta
  const handleSyncMeta = async () => {
    setSyncingTemplates(true);
    try {
      const res = await syncTemplatesFromMeta();
      showToast(
        `Meta Sync complete! (${res?.saved ?? res?.updated ?? 0} updated, ${res?.fetched ?? res?.count ?? 0} total fetched)`,
        "success"
      );
      await loadTemplates();
      if (onTemplateCreated) onTemplateCreated();
    } catch (err) {
      console.error("Failed to sync templates:", err);
      showToast(err.message || "Failed to sync templates from Meta", "error");
    } finally {
      setSyncingTemplates(false);
    }
  };

  // Name sanitize helper
  const handleNameChange = (val) => {
    // Only lowercase alphanumeric and underscores
    const sanitized = val
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    setName(sanitized);
  };

  // Insert next variable into body text at cursor
  const handleInsertVariable = () => {
    const nextVarNum = detectedVariables.length > 0 ? Math.max(...detectedVariables) + 1 : 1;
    const token = `{{${nextVarNum}}}`;

    const textarea = bodyTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? bodyText.length;
      const end = textarea.selectionEnd ?? bodyText.length;
      const newText = bodyText.substring(0, start) + token + bodyText.substring(end);
      setBodyText(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setBodyText((prev) => (prev ? `${prev} ${token}` : token));
    }
  };

  // Formatting helpers
  const handleFormatText = (prefix, suffix) => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = bodyText.substring(start, end) || "text";
    const wrapped = `${prefix}${selected}${suffix}`;
    const newText = bodyText.substring(0, start) + wrapped + bodyText.substring(end);
    setBodyText(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  // Header media upload
  const handleHeaderMediaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const publicUrl = await uploadWhatsappMedia(file, "whatsapp_header");
      setHeaderMediaUrl(publicUrl);
      setHeaderFileName(file.name);
      showToast("Header media attached successfully", "success");
    } catch (err) {
      console.error("Failed to upload header media:", err);
      showToast("Failed to upload media: " + err.message, "error");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  // Add Interactive Button
  const handleAddButton = (type = "QUICK_REPLY") => {
    if (buttons.length >= 3) {
      showToast("WhatsApp allows a maximum of 3 buttons per template.", "warning");
      return;
    }
    setButtons((prev) => [
      ...prev,
      {
        id: Date.now(),
        type,
        text: type === "QUICK_REPLY" ? "Confirm" : type === "URL" ? "Visit Website" : "Call Support",
        url: type === "URL" ? "https://example.com" : "",
        sampleUrl: "",
        phoneNumber: type === "PHONE_NUMBER" ? "+91" : "",
      },
    ]);
  };

  const handleUpdateButton = (index, field, value) => {
    setButtons((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveButton = (index) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  // Form Submission
  const handleSubmitTemplate = async (e) => {
    if (e) e.preventDefault();

    if (!name.trim()) {
      showToast("Template Name is required (e.g. order_notification)", "error");
      return;
    }
    if (name.length > 512) {
      showToast("Template name cannot exceed 512 characters", "error");
      return;
    }
    if (!bodyText.trim()) {
      showToast("Message Body Text is required", "error");
      return;
    }

    // Check variable sample completeness
    for (const vNum of detectedVariables) {
      if (!variables[vNum] || !variables[vNum].trim()) {
        showToast(
          `Please provide a sample value for variable {{${vNum}}} for Meta review`,
          "warning"
        );
        return;
      }
    }

    // Format sample array in order
    const orderedVariableSamples = detectedVariables.map((n) => variables[n]?.trim() || `Value ${n}`);

    setIsSubmitting(true);
    try {
      const payload = {
        name,
        category,
        language,
        headerType,
        headerText: headerType === "TEXT" ? headerText : null,
        headerSample: headerType === "TEXT" ? headerSample : null,
        headerMediaUrl: ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) ? headerMediaUrl : null,
        bodyText,
        variables: orderedVariableSamples,
        footerText: footerText.trim() || null,
        buttons: buttons.map((b) => ({
          type: b.type,
          text: b.text,
          url: b.type === "URL" ? b.url : null,
          sampleUrl: b.type === "URL" ? b.sampleUrl : null,
          phoneNumber: b.type === "PHONE_NUMBER" ? b.phoneNumber : null,
        })),
      };

      const result = await createWhatsappTemplate(payload);

      showToast(
        result.isStaged
          ? `Template "${name}" saved! (Status: PENDING Meta approval)`
          : `Template "${name}" submitted to Meta! Status: ${result.status || "PENDING"}`,
        "success"
      );

      // Refresh list
      await loadTemplates();
      if (onTemplateCreated) {
        onTemplateCreated(result.template);
      }

      // Reset form
      setName("");
      setBodyText("");
      setVariables({});
      setHeaderType("NONE");
      setHeaderText("");
      setHeaderSample("");
      setHeaderMediaUrl("");
      setHeaderFileName("");
      setFooterText("");
      setButtons([]);

      // Switch to directory to see it
      setActiveTab("directory");
    } catch (err) {
      console.error("Template creation failed:", err);
      showToast(err.message || "Failed to submit template to Meta", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Template
  const handleDelete = async (tpl) => {
    if (!window.confirm(`Are you sure you want to delete template "${tpl.element_name}"?`)) {
      return;
    }
    try {
      await deleteWhatsappTemplate(tpl.id, tpl.element_name);
      showToast(`Template "${tpl.element_name}" deleted`, "info");
      await loadTemplates();
      if (onTemplateCreated) onTemplateCreated();
    } catch (err) {
      console.error("Delete failed:", err);
      showToast(err.message || "Failed to delete template", "error");
    }
  };

  // Preview body with samples or raw tokens
  const renderedPreviewBody = useMemo(() => {
    let text = bodyText || "Your message body text will appear here. Include variables like {{1}} to personalize your broadcast.";
    detectedVariables.forEach((num) => {
      const val = variables[num]?.trim();
      const replacement = val ? val : `{{${num}}}`;
      text = text.split(`{{${num}}}`).join(replacement);
    });
    return text;
  }, [bodyText, detectedVariables, variables]);

  // Filter existing templates
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      const matchFilter =
        templateFilter === "ALL" ||
        (templateFilter === "APPROVED" && t.status === "APPROVED") ||
        (templateFilter === "PENDING" && t.status === "PENDING") ||
        (templateFilter === "REJECTED" && t.status === "REJECTED");

      const matchSearch =
        !templateSearch ||
        t.element_name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        (t.body_text || "").toLowerCase().includes(templateSearch.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(templateSearch.toLowerCase());

      return matchFilter && matchSearch;
    });
  }, [allTemplates, templateFilter, templateSearch]);

  const approvedCount = allTemplates.filter((t) => t.status === "APPROVED").length;
  const pendingCount = allTemplates.filter((t) => t.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Sub-Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Sparkles size={18} />
            </span>
            <h1 className="text-base font-black text-gray-900 dark:text-white">
              WhatsApp Template Studio
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Meta Cloud API
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Create, test & submit official WhatsApp templates for broadcasts. All approved templates sync automatically with your scheduler.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleSyncMeta}
            disabled={syncingTemplates}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Fetch latest approved/pending templates from Meta"
          >
            <RefreshCw size={13} className={syncingTemplates ? "animate-spin text-emerald-600" : ""} />
            <span>{syncingTemplates ? "Syncing Meta..." : "Sync with Meta"}</span>
          </button>

          <div className="flex items-center bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "editor"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Plus size={13} />
              <span>Create Template</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "directory"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Layers size={13} />
              <span>Manage Templates ({allTemplates.length})</span>
            </button>
          </div>

          {onBackToBroadcast && (
            <button
              type="button"
              onClick={onBackToBroadcast}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Back to Broadcast</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === "editor" ? (
        /* TWO COLUMN LAYOUT: Form (7 cols) + WhatsApp Live Preview & Checklist (5 cols) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Template Form */}
          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleSubmitTemplate} className="space-y-6">
              {/* SECTION 1: Basic Information */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      1. Template Details
                    </h2>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Technical name, category and language for Meta review
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Template Name */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                      Template Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. order_delivery_update, summer_discount_2026"
                      className={inputCls}
                      required
                    />
                    <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400 dark:text-slate-500">
                      <span>Only lowercase letters, numbers, and underscores</span>
                      <span className="font-mono">{name ? `${name.length}/512` : "0/512"}</span>
                    </div>
                  </div>

                  {/* Category Selection */}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                        const isSelected = category === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-xs ring-1 ring-emerald-500"
                                : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-955 hover:bg-gray-100 dark:hover:bg-slate-900"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-gray-900 dark:text-white">
                                {info.label}
                              </span>
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? "bg-emerald-600" : "bg-gray-300 dark:bg-slate-700"
                                }`}
                              />
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {info.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                      Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={inputCls}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Header Configuration */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      2. Header (Optional)
                    </h2>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Add a title text, image banner, video or PDF document
                    </p>
                  </div>
                </div>

                {/* Header Type Selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { id: "NONE", label: "None" },
                    { id: "TEXT", label: "Text Title" },
                    { id: "IMAGE", label: "Image 🖼️" },
                    { id: "VIDEO", label: "Video 🎥" },
                    { id: "DOCUMENT", label: "PDF Document 📄" },
                  ].map((ht) => (
                    <button
                      key={ht.id}
                      type="button"
                      onClick={() => setHeaderType(ht.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        headerType === ht.id
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-955 text-gray-700 dark:text-slate-300 hover:bg-gray-100"
                      }`}
                    >
                      {ht.label}
                    </button>
                  ))}
                </div>

                {/* Text Header Input */}
                {headerType === "TEXT" && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                        Header Text (max 60 chars)
                      </label>
                      <input
                        type="text"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value.slice(0, 60))}
                        placeholder="e.g. Order Confirmation, Special Diwali Offer"
                        className={inputCls}
                      />
                      <div className="text-right text-[10px] text-gray-400 mt-1">
                        {headerText.length}/60
                      </div>
                    </div>

                    {headerText.includes("{{1}}") && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                          Header Variable Sample
                        </label>
                        <input
                          type="text"
                          value={headerSample}
                          onChange={(e) => setHeaderSample(e.target.value)}
                          placeholder="e.g. Acme Corp"
                          className={inputCls}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Media Header Input */}
                {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
                  <div className="p-3.5 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-800 dark:text-slate-200">
                        Attach Sample {headerType} for Meta Review
                      </span>
                      {headerFileName && (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[150px]">
                          ✓ {headerFileName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-xs">
                        {isUploadingMedia ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>Uploading Media...</span>
                          </>
                        ) : (
                          <>
                            {headerType === "IMAGE" && <ImageIcon size={13} />}
                            {headerType === "VIDEO" && <VideoIcon size={13} />}
                            {headerType === "DOCUMENT" && <FileText size={13} />}
                            <span>Upload Sample {headerType}</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept={
                            headerType === "IMAGE"
                              ? "image/*"
                              : headerType === "VIDEO"
                              ? "video/*"
                              : ".pdf,application/pdf"
                          }
                          onChange={handleHeaderMediaUpload}
                          className="hidden"
                          disabled={isUploadingMedia}
                        />
                      </label>

                      <span className="text-xs text-gray-400">or enter public URL</span>
                    </div>

                    <input
                      type="url"
                      value={headerMediaUrl}
                      onChange={(e) => setHeaderMediaUrl(e.target.value)}
                      placeholder={`https://example.com/sample.${headerType === "DOCUMENT" ? "pdf" : "jpg"}`}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {/* SECTION 3: Message Body & Variables */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        3. Message Body & Variables <span className="text-red-500">*</span>
                      </h2>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Compose your broadcast text. Use &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125; for personalized fields.
                      </p>
                    </div>
                  </div>

                  {/* Quick Format & Variable Helpers */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleInsertVariable}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
                      title="Insert next variable at cursor"
                    >
                      <Plus size={12} />
                      <span>Add Variable</span>
                    </button>
                  </div>
                </div>

                {/* Text Formatting Toolbar */}
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2 text-[11px]">
                  <span className="text-gray-400 dark:text-slate-500 font-semibold">Format:</span>
                  <button
                    type="button"
                    onClick={() => handleFormatText("*", "*")}
                    className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 font-bold hover:bg-gray-200 cursor-pointer"
                  >
                    *Bold*
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatText("_", "_")}
                    className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 italic hover:bg-gray-200 cursor-pointer"
                  >
                    _Italic_
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatText("~", "~")}
                    className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 line-through hover:bg-gray-200 cursor-pointer"
                  >
                    ~Strike~
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatText("```", "```")}
                    className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 font-mono hover:bg-gray-200 cursor-pointer"
                  >
                    ```Code```
                  </button>
                </div>

                {/* Textarea */}
                <div>
                  <textarea
                    ref={bodyTextareaRef}
                    rows={5}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value.slice(0, 1024))}
                    placeholder="Hello {{1}},\n\nWe are pleased to notify you that your order {{2}} has been confirmed!\n\nThank you for choosing NuTech Pipes."
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 p-3.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-sans leading-relaxed"
                    required
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                    <span>
                      Detected {detectedVariables.length} variable{detectedVariables.length !== 1 ? "s" : ""}
                    </span>
                    <span className="font-mono">{bodyText.length}/1024</span>
                  </div>
                </div>

                {/* Variable Sample Values (Required by Meta for approval) */}
                {detectedVariables.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                      <Info size={14} className="text-emerald-600" />
                      <span>Meta Review Samples for Detected Variables</span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-slate-400">
                      Meta reviewers require realistic sample values for each placeholder variable so they can understand your message context and approve it quickly.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {detectedVariables.map((vNum) => (
                        <div key={vNum}>
                          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                            Sample for &#123;&#123;{vNum}&#125;&#125; <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={variables[vNum] || ""}
                            onChange={(e) =>
                              setVariables((prev) => ({ ...prev, [vNum]: e.target.value }))
                            }
                            placeholder={
                              vNum === 1
                                ? "e.g. Rahul Sharma"
                                : vNum === 2
                                ? "e.g. PO-8921"
                                : "e.g. 25-Oct-2026"
                            }
                            className={inputCls}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4: Footer (Optional) */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    4. Footer Text (Optional)
                  </h2>
                  <span className="text-[10px] text-gray-400">{footerText.length}/60</span>
                </div>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value.slice(0, 60))}
                  placeholder="e.g. NuTech Pipes · Reply STOP to opt out"
                  className={inputCls}
                />
              </div>

              {/* SECTION 5: Interactive Buttons (Optional) */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      5. Interactive Buttons (Optional)
                    </h2>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Add up to 3 quick replies, website URLs, or phone call buttons
                    </p>
                  </div>

                  {buttons.length < 3 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddButton("QUICK_REPLY")}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                      >
                        + Quick Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddButton("URL")}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                      >
                        + URL Link
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddButton("PHONE_NUMBER")}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                      >
                        + Phone
                      </button>
                    </div>
                  )}
                </div>

                {buttons.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">
                    No buttons added. Click above to add quick replies, links or phone buttons.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {buttons.map((btn, idx) => (
                      <div
                        key={btn.id || idx}
                        className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-955 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                            {btn.type === "QUICK_REPLY" && <MessageSquare size={13} className="text-emerald-500" />}
                            {btn.type === "URL" && <LinkIcon size={13} className="text-blue-500" />}
                            {btn.type === "PHONE_NUMBER" && <Phone size={13} className="text-purple-500" />}
                            <span>Button #{idx + 1} ({btn.type.replace("_", " ")})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveButton(idx)}
                            className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            title="Remove Button"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                              Button Label (max 25 chars)
                            </label>
                            <input
                              type="text"
                              value={btn.text}
                              onChange={(e) => handleUpdateButton(idx, "text", e.target.value.slice(0, 25))}
                              placeholder="e.g. View Order, Call Us"
                              className={inputCls}
                              required
                            />
                          </div>

                          {btn.type === "URL" && (
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                                Website URL
                              </label>
                              <input
                                type="url"
                                value={btn.url}
                                onChange={(e) => handleUpdateButton(idx, "url", e.target.value)}
                                placeholder="https://example.com/order"
                                className={inputCls}
                                required
                              />
                            </div>
                          )}

                          {btn.type === "PHONE_NUMBER" && (
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                                Phone Number (with country code)
                              </label>
                              <input
                                type="tel"
                                value={btn.phoneNumber}
                                onChange={(e) => handleUpdateButton(idx, "phoneNumber", e.target.value)}
                                placeholder="+919876543210"
                                className={inputCls}
                                required
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submission Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingMedia}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Submitting to Meta Cloud API...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Submit Template to Meta for Approval</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: WhatsApp Live Preview & Guidelines */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live WhatsApp Preview */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                    <MessageSquare size={16} />
                  </div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    WhatsApp Live Preview
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {category}
                </span>
              </div>

              {/* WhatsApp Bubble Simulator */}
              <div className="rounded-2xl p-4 min-h-[300px] border border-gray-200 dark:border-slate-800 bg-[#efeae2] dark:bg-[#0b141a] flex flex-col justify-end relative overflow-hidden transition-colors">
                <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] dark:bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

                <div className="relative max-w-[92%] bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-xs shadow-md text-xs text-gray-800 dark:text-slate-100 overflow-hidden border border-gray-100 dark:border-slate-800/80 my-2 self-start animate-fade-in">
                  {/* Header Preview */}
                  {headerType === "TEXT" && headerText && (
                    <div className="px-3.5 pt-3 font-black text-gray-900 dark:text-white text-xs border-b border-gray-100 dark:border-slate-700/60 pb-1.5">
                      {headerText.includes("{{1}}") && headerSample
                        ? headerText.replace("{{1}}", headerSample)
                        : headerText}
                    </div>
                  )}

                  {headerType === "IMAGE" && (
                    headerMediaUrl ? (
                      <img src={headerMediaUrl} alt="header preview" className="w-full max-h-48 object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 bg-gray-100 dark:bg-slate-800 text-gray-400">
                        <ImageIcon size={28} />
                        <span className="text-[10px] mt-1 font-semibold">Image Header Sample</span>
                      </div>
                    )
                  )}

                  {headerType === "DOCUMENT" && (
                    <div className="flex items-center gap-3 bg-gray-100 dark:bg-slate-800/90 px-3.5 py-3 border-b border-gray-200/60 dark:border-slate-700/60">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/90 text-white">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-gray-800 dark:text-slate-200">
                          {headerFileName || "Document.pdf"}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500">PDF · Tap to open</p>
                      </div>
                    </div>
                  )}

                  {/* Body Text */}
                  <div className="px-3.5 py-3 space-y-1.5">
                    <p className="whitespace-pre-line text-gray-800 dark:text-slate-200 leading-relaxed text-[12.5px]">
                      {renderedPreviewBody}
                    </p>

                    {footerText && (
                      <p className="text-[10px] text-gray-400 dark:text-slate-400 pt-1">
                        {footerText}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 dark:text-slate-500 pt-1">
                      <span>11:45 AM</span>
                      <CheckCheck size={13} className="text-emerald-500" />
                    </div>
                  </div>

                  {/* Buttons */}
                  {buttons.length > 0 && (
                    <div className="border-t border-gray-200/60 dark:border-slate-700/60 divide-y divide-gray-200/40 dark:divide-slate-700/40">
                      {buttons.map((btn, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-sky-600 dark:text-sky-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          {btn.type === "URL" && <ExternalLink size={11} />}
                          {btn.type === "PHONE_NUMBER" && <Phone size={11} />}
                          <span>{btn.text || "Button"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Meta Review Guidelines Checklist */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Meta Approval Checklist
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  {name && /^[a-z0-9_]+$/.test(name) ? (
                    <span className="text-emerald-600 font-bold">✓</span>
                  ) : (
                    <span className="text-gray-400">○</span>
                  )}
                  <span className={name ? "text-gray-800 dark:text-slate-200" : "text-gray-400"}>
                    Valid name: lowercase, numbers and underscores only
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {bodyText.trim() ? (
                    <span className="text-emerald-600 font-bold">✓</span>
                  ) : (
                    <span className="text-gray-400">○</span>
                  )}
                  <span className={bodyText.trim() ? "text-gray-800 dark:text-slate-200" : "text-gray-400"}>
                    Message body text is provided
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {detectedVariables.length === 0 ||
                  detectedVariables.every((v) => variables[v] && variables[v].trim()) ? (
                    <span className="text-emerald-600 font-bold">✓</span>
                  ) : (
                    <span className="text-amber-500 font-bold">!</span>
                  )}
                  <span
                    className={
                      detectedVariables.length === 0 ||
                      detectedVariables.every((v) => variables[v] && variables[v].trim())
                        ? "text-gray-800 dark:text-slate-200"
                        : "text-amber-600 dark:text-amber-400"
                    }
                  >
                    Sample values provided for all variables ({detectedVariables.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span className="text-gray-800 dark:text-slate-200">
                    Category: <strong>{category}</strong>
                  </span>
                </div>
              </div>

              <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-955 border border-gray-100 dark:border-slate-800/80 text-[11px] text-gray-500 dark:text-slate-400 space-y-1">
                <p className="font-bold text-gray-700 dark:text-slate-300">💡 Meta Approval Tips:</p>
                <p>• Avoid excessive punctuation (e.g. &quot;FREE!!!&quot;) or spammy claims.</p>
                <p>• Ensure variables start at &#123;&#123;1&#125;&#125; without skipping numbers.</p>
                <p>• Templates are usually reviewed by Meta AI within seconds to minutes.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* DIRECTORY VIEW: Manage Existing Templates */
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-5">
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: "ALL", label: `All (${allTemplates.length})` },
                { id: "APPROVED", label: `Approved (${approvedCount}) 🟢` },
                { id: "PENDING", label: `Pending Approval (${pendingCount}) ⏳` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTemplateFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    templateFilter === f.id
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-955 text-gray-700 dark:text-slate-300 hover:bg-gray-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-800 text-xs bg-gray-50 dark:bg-slate-955 text-gray-900 dark:text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer shrink-0"
              >
                <Plus size={13} />
                <span>New Template</span>
              </button>
            </div>
          </div>

          {/* Template Cards Grid */}
          {templatesLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 size={24} className="animate-spin text-emerald-600" />
              <p className="text-xs">Loading templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              No templates found matching your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl) => {
                const isApproved = tpl.status === "APPROVED";
                const isPending = tpl.status === "PENDING";

                return (
                  <div
                    key={tpl.id}
                    className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-955 p-4 flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-800 transition-all shadow-xs space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                            {tpl.element_name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-gray-400">
                              {tpl.language || "en"}
                            </span>
                            <span className="text-gray-300 dark:text-slate-700">·</span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              {tpl.category}
                            </span>
                            {tpl.header_type && tpl.header_type !== "NONE" && (
                              <>
                                <span className="text-gray-300 dark:text-slate-700">·</span>
                                <span className="text-[10px] text-gray-500 font-mono">
                                  [{tpl.header_type}]
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        {isApproved ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Approved
                          </span>
                        ) : isPending ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0 flex items-center gap-1">
                            <Clock size={10} className="animate-spin" />
                            Pending Meta
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border border-red-300 shrink-0">
                            {tpl.status || "Draft"}
                          </span>
                        )}
                      </div>

                      {/* Snippet */}
                      <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-3 leading-relaxed whitespace-pre-line">
                        {tpl.body_text}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      {isApproved && onSelectForBroadcast ? (
                        <button
                          type="button"
                          onClick={() => onSelectForBroadcast(tpl.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer shadow-xs"
                        >
                          <Send size={11} />
                          <span>Use in Broadcast</span>
                        </button>
                      ) : isPending ? (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <Clock size={11} />
                          Awaiting Meta review
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Not ready for broadcast</span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(tpl)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Delete Template"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
