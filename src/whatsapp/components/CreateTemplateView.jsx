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
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  fetchAllWhatsappTemplates,
  syncTemplatesFromMeta,
  uploadWhatsappMedia,
} from "../services/whatsappApi";
import { useWaToast } from "../utils/toast";

const CATEGORY_INFO = {
  UTILITY: {
    label: "Utility",
    desc: "Order updates, account alerts, receipts, appointments & reminders",
  },
  MARKETING: {
    label: "Marketing",
    desc: "Promotions, special offers, product announcements, discount codes",
  },
  AUTHENTICATION: {
    label: "Authentication",
    desc: "One-time passwords (OTP), login verification, account security",
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
  "w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5";
const cardCls = "bg-white rounded-xl border border-slate-200/90 shadow-2xs";
const segWrapCls = "flex items-center bg-slate-100 p-0.5 rounded-lg w-fit flex-wrap";
const segBtnCls = (active) =>
  `px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
    active ? "bg-white text-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
  }`;
const outlineBtnCls = "gap-1.5 h-8 px-3 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50";

const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
    <div className="flex items-center gap-2.5 min-w-0">
      {Icon && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={15} />
        </div>
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-800 truncate">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const StatusPill = ({ status }) => {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Approved
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
        <Clock size={10} />
        Pending Meta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 shrink-0">
      {status || "Draft"}
    </span>
  );
};

export default function CreateTemplateView({
  onTemplateCreated,
  onSelectForBroadcast,
  showToast: showToastProp,
  onBackToBroadcast,
}) {
  const { showToast: fallbackToast } = useWaToast();
  const showToast = showToastProp || fallbackToast;

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
    return Array.from(new Set(matches.map((m) => parseInt(m.replace(/\D/g, ""), 10))))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
  }, [bodyText]);

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

  // Only lowercase alphanumeric and underscores
  const handleNameChange = (val) => {
    setName(
      val
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
    );
  };

  // Insert next variable into body text at cursor
  const handleInsertVariable = () => {
    const nextVarNum = detectedVariables.length > 0 ? Math.max(...detectedVariables) + 1 : 1;
    const token = `{{${nextVarNum}}}`;

    const textarea = bodyTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? bodyText.length;
      const end = textarea.selectionEnd ?? bodyText.length;
      setBodyText(bodyText.substring(0, start) + token + bodyText.substring(end));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setBodyText((prev) => (prev ? `${prev} ${token}` : token));
    }
  };

  const handleFormatText = (prefix, suffix) => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = bodyText.substring(start, end) || "text";
    setBodyText(bodyText.substring(0, start) + `${prefix}${selected}${suffix}` + bodyText.substring(end));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

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
      e.target.value = "";
    }
  };

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

    for (const vNum of detectedVariables) {
      if (!variables[vNum] || !variables[vNum].trim()) {
        showToast(`Please provide a sample value for variable {{${vNum}}} for Meta review`, "warning");
        return;
      }
    }

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

      await loadTemplates();
      if (onTemplateCreated) onTemplateCreated(result.template);

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

      setActiveTab("directory");
    } catch (err) {
      console.error("Template creation failed:", err);
      showToast(err.message || "Failed to submit template to Meta", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (tpl) => {
    if (!window.confirm(`Are you sure you want to delete template "${tpl.element_name}"?`)) return;
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

  const renderedPreviewBody = useMemo(() => {
    let text =
      bodyText || "Your message body text will appear here. Include variables like {{1}} to personalize your broadcast.";
    detectedVariables.forEach((num) => {
      const val = variables[num]?.trim();
      text = text.split(`{{${num}}}`).join(val ? val : `{{${num}}}`);
    });
    return text;
  }, [bodyText, detectedVariables, variables]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      const matchFilter =
        templateFilter === "ALL" ||
        (templateFilter === "APPROVED" && t.status === "APPROVED") ||
        (templateFilter === "PENDING" && t.status === "PENDING") ||
        (templateFilter === "REJECTED" && t.status === "REJECTED");

      const q = templateSearch.toLowerCase();
      const matchSearch =
        !templateSearch ||
        t.element_name.toLowerCase().includes(q) ||
        (t.body_text || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q);

      return matchFilter && matchSearch;
    });
  }, [allTemplates, templateFilter, templateSearch]);

  const approvedCount = allTemplates.filter((t) => t.status === "APPROVED").length;
  const pendingCount = allTemplates.filter((t) => t.status === "PENDING").length;
  const allSamplesProvided =
    detectedVariables.length === 0 || detectedVariables.every((v) => variables[v] && variables[v].trim());

  return (
    <div className="space-y-4">
      {/* Top Banner & Sub-Tabs */}
      <div className={`${cardCls} p-4 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles size={16} />
            </span>
            <h1 className="text-sm font-semibold text-slate-800">WhatsApp Template Studio</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
              Meta Cloud API
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Create, test & submit official WhatsApp templates for broadcasts. All approved templates sync automatically
            with your scheduler.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleSyncMeta}
            disabled={syncingTemplates}
            className={outlineBtnCls}
            title="Fetch latest approved/pending templates from Meta"
          >
            <RefreshCw size={13} className={syncingTemplates ? "animate-spin text-primary" : ""} />
            {syncingTemplates ? "Syncing Meta..." : "Sync with Meta"}
          </Button>

          <div className={segWrapCls}>
            <button type="button" onClick={() => setActiveTab("editor")} className={segBtnCls(activeTab === "editor")}>
              <Plus size={13} />
              Create Template
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={segBtnCls(activeTab === "directory")}
            >
              <Layers size={13} />
              Manage Templates ({allTemplates.length})
            </button>
          </div>

          {onBackToBroadcast && (
            <Button type="button" variant="outline" onClick={onBackToBroadcast} className={outlineBtnCls}>
              <ArrowLeft size={13} />
              Back to Broadcast
            </Button>
          )}
        </div>
      </div>

      {activeTab === "editor" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT COLUMN: Template Form */}
          <div className="lg:col-span-7">
            <form onSubmit={handleSubmitTemplate} className="space-y-4">
              {/* SECTION 1: Basic Information */}
              <div className={cardCls}>
                <SectionHeader
                  icon={FileText}
                  title="1. Template Details"
                  subtitle="Technical name, category and language for Meta review"
                />
                <div className="p-4 space-y-4">
                  <div>
                    <label className={labelCls}>
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
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                      <span>Only lowercase letters, numbers, and underscores</span>
                      <span className="font-mono">{name.length}/512</span>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>
                      Category <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                        const isSelected = category === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            className={`p-3 rounded-lg border text-left transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-slate-800"}`}>
                                {info.label}
                              </span>
                              <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-primary" : "bg-slate-300"}`} />
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{info.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Language</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
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
              <div className={cardCls}>
                <SectionHeader
                  icon={Layers}
                  title="2. Header (Optional)"
                  subtitle="Add a title text, image banner, video or PDF document"
                />
                <div className="p-4 space-y-3">
                  <div className={segWrapCls}>
                    {[
                      { id: "NONE", label: "None" },
                      { id: "TEXT", label: "Text Title", icon: FileText },
                      { id: "IMAGE", label: "Image", icon: ImageIcon },
                      { id: "VIDEO", label: "Video", icon: VideoIcon },
                      { id: "DOCUMENT", label: "PDF Document", icon: FileText },
                    ].map((ht) => (
                      <button
                        key={ht.id}
                        type="button"
                        onClick={() => setHeaderType(ht.id)}
                        className={segBtnCls(headerType === ht.id)}
                      >
                        {ht.icon && <ht.icon size={12} />}
                        {ht.label}
                      </button>
                    ))}
                  </div>

                  {headerType === "TEXT" && (
                    <div className="space-y-3">
                      <div>
                        <label className={labelCls}>Header Text (max 60 chars)</label>
                        <input
                          type="text"
                          value={headerText}
                          onChange={(e) => setHeaderText(e.target.value.slice(0, 60))}
                          placeholder="e.g. Order Confirmation, Special Diwali Offer"
                          className={inputCls}
                        />
                        <div className="text-right text-[10px] text-slate-400 mt-1 font-mono">{headerText.length}/60</div>
                      </div>

                      {headerText.includes("{{1}}") && (
                        <div>
                          <label className={labelCls}>Header Variable Sample</label>
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

                  {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
                    <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">
                          Attach Sample {headerType} for Meta Review
                        </span>
                        {headerFileName && (
                          <span className="text-[10px] font-semibold text-emerald-700 truncate max-w-[160px]">
                            ✓ {headerFileName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <label
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-colors hover:bg-primary/90 ${
                            isUploadingMedia ? "opacity-60 pointer-events-none" : "cursor-pointer"
                          }`}
                        >
                          {isUploadingMedia ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Uploading Media...
                            </>
                          ) : (
                            <>
                              {headerType === "IMAGE" && <ImageIcon size={13} />}
                              {headerType === "VIDEO" && <VideoIcon size={13} />}
                              {headerType === "DOCUMENT" && <FileText size={13} />}
                              Upload Sample {headerType}
                            </>
                          )}
                          <input
                            type="file"
                            accept={
                              headerType === "IMAGE" ? "image/*" : headerType === "VIDEO" ? "video/*" : ".pdf,application/pdf"
                            }
                            onChange={handleHeaderMediaUpload}
                            className="hidden"
                            disabled={isUploadingMedia}
                          />
                        </label>
                        <span className="text-xs text-slate-400">or enter public URL</span>
                      </div>

                      <input
                        type="url"
                        value={headerMediaUrl.startsWith("data:") ? "" : headerMediaUrl}
                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                        placeholder={
                          headerMediaUrl.startsWith("data:")
                            ? `Uploaded: ${headerFileName}`
                            : `https://example.com/sample.${headerType === "DOCUMENT" ? "pdf" : "jpg"}`
                        }
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: Message Body & Variables */}
              <div className={cardCls}>
                <SectionHeader
                  icon={MessageSquare}
                  title={
                    <>
                      3. Message Body & Variables <span className="text-red-500">*</span>
                    </>
                  }
                  subtitle="Compose your broadcast text. Use {{1}}, {{2}} for personalized fields."
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleInsertVariable}
                      className="gap-1 h-8 px-2.5 text-xs font-medium text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 shrink-0"
                      title="Insert next variable at cursor"
                    >
                      <Plus size={12} />
                      Add Variable
                    </Button>
                  }
                />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                    <span className="text-slate-400 font-medium mr-1">Format:</span>
                    {[
                      ["*", "*", "Bold", "font-bold"],
                      ["_", "_", "Italic", "italic"],
                      ["~", "~", "Strike", "line-through"],
                      ["```", "```", "Code", "font-mono"],
                    ].map(([pre, suf, label, cls]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleFormatText(pre, suf)}
                        className={`px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 ${cls}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <textarea
                      ref={bodyTextareaRef}
                      rows={5}
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value.slice(0, 1024))}
                      placeholder={
                        "Hello {{1}},\n\nWe are pleased to notify you that your order {{2}} has been confirmed!\n\nThank you for choosing VPR Systems."
                      }
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 leading-relaxed"
                      required
                    />
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                      <span>
                        Detected {detectedVariables.length} variable{detectedVariables.length !== 1 ? "s" : ""}
                      </span>
                      <span className="font-mono">{bodyText.length}/1024</span>
                    </div>
                  </div>

                  {detectedVariables.length > 0 && (
                    <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Info size={14} className="text-primary" />
                        Meta Review Samples for Detected Variables
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Meta reviewers require realistic sample values for each placeholder variable so they can
                        understand your message context and approve it quickly.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {detectedVariables.map((vNum) => (
                          <div key={vNum}>
                            <label className={labelCls}>
                              Sample for &#123;&#123;{vNum}&#125;&#125; <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={variables[vNum] || ""}
                              onChange={(e) => setVariables((prev) => ({ ...prev, [vNum]: e.target.value }))}
                              placeholder={vNum === 1 ? "e.g. Rahul Sharma" : vNum === 2 ? "e.g. PO-8921" : "e.g. 25-Oct-2026"}
                              className={inputCls}
                              required
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: Footer (Optional) */}
              <div className={cardCls}>
                <SectionHeader
                  title="4. Footer Text (Optional)"
                  action={<span className="text-[10px] text-slate-400 font-mono">{footerText.length}/60</span>}
                />
                <div className="p-4">
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value.slice(0, 60))}
                    placeholder="e.g. VPR Systems · Reply STOP to opt out"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* SECTION 5: Interactive Buttons (Optional) */}
              <div className={cardCls}>
                <SectionHeader
                  title="5. Interactive Buttons (Optional)"
                  subtitle="Add up to 3 quick replies, website URLs, or phone call buttons"
                  action={
                    buttons.length < 3 && (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {[
                          ["QUICK_REPLY", "Quick Reply", MessageSquare],
                          ["URL", "URL Link", LinkIcon],
                          ["PHONE_NUMBER", "Phone", Phone],
                        ].map(([type, label, Icon]) => (
                          <Button
                            key={type}
                            type="button"
                            variant="outline"
                            onClick={() => handleAddButton(type)}
                            className="gap-1 h-7 px-2 text-[11px] font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
                          >
                            <Icon size={11} />
                            {label}
                          </Button>
                        ))}
                      </div>
                    )
                  }
                />
                <div className="p-4">
                  {buttons.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-2">
                      No buttons added. Click above to add quick replies, links or phone buttons.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {buttons.map((btn, idx) => (
                        <div key={btn.id || idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              {btn.type === "QUICK_REPLY" && <MessageSquare size={13} className="text-primary" />}
                              {btn.type === "URL" && <LinkIcon size={13} className="text-primary" />}
                              {btn.type === "PHONE_NUMBER" && <Phone size={13} className="text-primary" />}
                              Button #{idx + 1} ({btn.type.replace("_", " ")})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveButton(idx)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                              title="Remove Button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Button Label (max 25 chars)</label>
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
                                <label className={labelCls}>Website URL</label>
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
                                <label className={labelCls}>Phone Number (with country code)</label>
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
              </div>

              {/* Submission */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                <Button
                  type="submit"
                  disabled={isSubmitting || isUploadingMedia}
                  className="gap-2 px-5 font-medium text-xs h-9 w-full sm:w-auto shrink-0"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Submitting to Meta Cloud API...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Submit Template to Meta for Approval
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: WhatsApp Live Preview & Guidelines */}
          <div className="lg:col-span-5 space-y-4">
            <div className={`${cardCls} lg:sticky lg:top-0`}>
              <SectionHeader
                icon={MessageSquare}
                title="WhatsApp Live Preview"
                action={
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20">
                    {category}
                  </span>
                }
              />
              <div className="p-4">
                {/* WhatsApp bubble simulator (WhatsApp chat convention) */}
                <div className="rounded-xl p-4 min-h-[300px] border border-slate-200 bg-[#efeae2] flex flex-col justify-end relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

                  <div className="relative max-w-[92%] bg-white rounded-xl rounded-tl-xs shadow-sm text-xs text-slate-800 overflow-hidden border border-slate-100 my-2 self-start">
                    {headerType === "TEXT" && headerText && (
                      <div className="px-3 pt-2.5 font-bold text-slate-900 text-xs border-b border-slate-100 pb-1.5">
                        {headerText.includes("{{1}}") && headerSample ? headerText.replace("{{1}}", headerSample) : headerText}
                      </div>
                    )}

                    {headerType === "IMAGE" &&
                      (headerMediaUrl ? (
                        <img src={headerMediaUrl} alt="header preview" className="w-full max-h-48 object-cover" />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 bg-slate-100 text-slate-400">
                          <ImageIcon size={28} />
                          <span className="text-[10px] mt-1 font-medium">Image Header Sample</span>
                        </div>
                      ))}

                    {headerType === "VIDEO" &&
                      (headerMediaUrl ? (
                        <video src={headerMediaUrl} className="w-full max-h-48 object-cover bg-black" muted />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 bg-slate-100 text-slate-400">
                          <VideoIcon size={28} />
                          <span className="text-[10px] mt-1 font-medium">Video Header Sample</span>
                        </div>
                      ))}

                    {headerType === "DOCUMENT" && (
                      <div className="flex items-center gap-3 bg-slate-100 px-3 py-2.5 border-b border-slate-200/60">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">{headerFileName || "Document.pdf"}</p>
                          <p className="text-[10px] text-slate-400">PDF · Tap to open</p>
                        </div>
                      </div>
                    )}

                    <div className="px-3 py-2.5 space-y-1.5">
                      <p className="whitespace-pre-line text-slate-800 leading-relaxed text-[12.5px]">{renderedPreviewBody}</p>
                      {footerText && <p className="text-[10px] text-slate-400 pt-1">{footerText}</p>}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-1">
                        <span>11:45 AM</span>
                        <CheckCheck size={13} className="text-sky-500" />
                      </div>
                    </div>

                    {buttons.length > 0 && (
                      <div className="border-t border-slate-200/60 divide-y divide-slate-200/50">
                        {buttons.map((btn, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-sky-600"
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
            </div>

            {/* Meta Review Guidelines Checklist */}
            <div className={cardCls}>
              <SectionHeader icon={CheckCircle2} title="Meta Approval Checklist" />
              <div className="p-4 space-y-3">
                <div className="space-y-2 text-xs">
                  {[
                    [!!name && /^[a-z0-9_]+$/.test(name), "Valid name: lowercase, numbers and underscores only", false],
                    [!!bodyText.trim(), "Message body text is provided", false],
                    [
                      allSamplesProvided,
                      `Sample values provided for all variables (${detectedVariables.length})`,
                      true,
                    ],
                  ].map(([done, text, warn]) => (
                    <div key={text} className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      ) : warn ? (
                        <Info size={13} className="text-amber-500 shrink-0" />
                      ) : (
                        <span className="w-[13px] h-[13px] rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className={done ? "text-slate-700" : warn ? "text-amber-700" : "text-slate-400"}>{text}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span className="text-slate-700">
                      Category: <strong>{category}</strong>
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-700">Meta Approval Tips:</p>
                  <p>• Avoid excessive punctuation (e.g. &quot;FREE!!!&quot;) or spammy claims.</p>
                  <p>• Ensure variables start at &#123;&#123;1&#125;&#125; without skipping numbers.</p>
                  <p>• Templates are usually reviewed by Meta AI within seconds to minutes.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* DIRECTORY VIEW: Manage Existing Templates */
        <div className={cardCls}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
            <div className={segWrapCls}>
              {[
                { id: "ALL", label: "All", count: allTemplates.length },
                { id: "APPROVED", label: "Approved", count: approvedCount },
                { id: "PENDING", label: "Pending Approval", count: pendingCount },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTemplateFilter(f.id)}
                  className={segBtnCls(templateFilter === f.id)}
                >
                  {f.label}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      templateFilter === f.id ? "bg-primary/15 text-primary" : "bg-slate-200/70 text-slate-500"
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className={`${inputCls} pl-8 w-52`}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSyncMeta}
                disabled={syncingTemplates}
                className={`${outlineBtnCls} h-9`}
              >
                <RefreshCw size={13} className={syncingTemplates ? "animate-spin text-primary" : ""} />
                Sync
              </Button>
              <Button type="button" onClick={() => setActiveTab("editor")} className="gap-1.5 h-9 px-3 text-xs font-medium shrink-0">
                <Plus size={13} />
                New Template
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {templatesLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={22} className="animate-spin text-primary" />
                <p className="text-xs">Loading templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">No templates found matching your filters.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredTemplates.map((tpl) => {
                  const isApproved = tpl.status === "APPROVED";
                  const isPending = tpl.status === "PENDING";

                  return (
                    <div
                      key={tpl.id}
                      className="rounded-xl border border-slate-200/90 bg-white p-3.5 flex flex-col justify-between gap-3 shadow-2xs hover:border-primary/30 hover:shadow-xs transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-xs text-slate-800 truncate">{tpl.element_name}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10px]">
                              <span className="font-medium text-slate-400">{tpl.language || "en"}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-primary">{tpl.category}</span>
                              {tpl.header_type && tpl.header_type !== "NONE" && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-slate-500 font-mono">[{tpl.header_type}]</span>
                                </>
                              )}
                            </div>
                          </div>
                          <StatusPill status={tpl.status} />
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-line">
                          {tpl.body_text}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        {isApproved && onSelectForBroadcast ? (
                          <Button
                            type="button"
                            onClick={() => onSelectForBroadcast(tpl.id)}
                            className="gap-1 h-7 px-2.5 text-[11px] font-medium"
                          >
                            <Send size={11} />
                            Use in Broadcast
                          </Button>
                        ) : isPending ? (
                          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                            <Clock size={11} />
                            Awaiting Meta review
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Not ready for broadcast</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(tpl)}
                          className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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
        </div>
      )}
    </div>
  );
}
