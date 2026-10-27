import { useState, useEffect } from "react";
import Papa from "papaparse";
import {
  fetchApprovedTemplates,
  fetchPendingTemplates,
  fetchBulkContacts,
  upsertBulkContacts,
  updateBulkContact,
  deleteBulkContacts,
  createBroadcastSchedule,
  fetchBroadcastSchedules,
  deleteBroadcastSchedule,
  updateBroadcastScheduleStatus,
  updateBroadcastSchedule,
  triggerRecurringCron,
  syncTemplatesFromMeta,
  uploadWhatsappMedia,
  initiateNewChat,
  fetchLeadsClientsGrouped,
  fetchContacts,
} from "../services/whatsappApi";
import CreateTemplateView from "../components/CreateTemplateView";
import BulkContactPreviewModal from "../components/BulkContactPreviewModal";
import {
  Radio,
  Send,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Users,
  UserPlus,
  FileSpreadsheet,
  UploadCloud,
  Download,
  Search,
  Trash2,
  Pencil,
  CheckSquare,
  Square,
  FileText,
  Image as ImageIcon,
  Video,
  ChevronDown,
  X,
  Sparkles,
  CheckCheck,
  Loader2,
  FileStack,
  Info,
  Repeat,
  Play,
  Pause,
  RefreshCw,
  Sliders,
  Plus,
  Store,
  Truck,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { getInitials } from "../utils/chatUtils";
import { useWaToast } from "../utils/toast";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors";
const selectCls = `${inputCls} pr-7`;
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5";
const cardCls = "bg-white rounded-xl border border-slate-200/90 shadow-2xs";
const outlineBtnCls = "h-9 gap-1.5 px-3 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50";
const linkBtnCls = "text-[11px] font-semibold flex items-center gap-1 hover:underline cursor-pointer";

// Audience entries from VPR Customers / Vendors / Chat Contacts
// live only in page state — they are never bulk-contact rows.
const isAudienceContact = (id) => /^(lead|customer|vendor|chat)_/.test(String(id));

const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : null;

const CardHeader = ({ icon: Icon, title, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={15} className="text-primary shrink-0" />
      <h2 className="text-sm font-semibold text-slate-700 truncate">{title}</h2>
    </div>
    {action}
  </div>
);

const TimeSelect = ({ hour, minute, period, onHour, onMinute, onPeriod }) => (
  <div className="flex items-center gap-1.5">
    <select value={hour} onChange={(e) => onHour(e.target.value)} className={selectCls}>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
    <span className="font-semibold text-slate-400">:</span>
    <select value={minute} onChange={(e) => onMinute(e.target.value)} className={selectCls}>
      {MINUTES.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
    <select value={period} onChange={(e) => onPeriod(e.target.value)} className={selectCls}>
      <option value="AM">AM</option>
      <option value="PM">PM</option>
    </select>
  </div>
);

const pillBase = "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold whitespace-nowrap";

const ScheduleStatusPill = ({ status }) => {
  if (status === "paused")
    return (
      <span className={`${pillBase} bg-slate-100 text-slate-600 border-slate-200`}>
        <Pause size={10} /> Paused
      </span>
    );
  if (status === "completed")
    return <span className={`${pillBase} bg-blue-50 text-blue-700 border-blue-200`}>Completed</span>;
  if (status === "failed") return <span className={`${pillBase} bg-red-50 text-red-700 border-red-200`}>Failed</span>;
  return (
    <span className={`${pillBase} bg-emerald-50 text-emerald-700 border-emerald-200`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
    </span>
  );
};

const ScheduleTypePill = ({ isRecurring, frequency }) =>
  isRecurring ? (
    <span className={`${pillBase} bg-violet-50 text-violet-700 border-violet-200 uppercase`}>
      <Repeat size={10} /> {frequency || "Daily"}
    </span>
  ) : (
    <span className={`${pillBase} bg-amber-50 text-amber-700 border-amber-200 uppercase`}>One-time</span>
  );

const mediaTagFor = (headerType) => {
  if (headerType === "IMAGE") return " [IMAGE]";
  if (headerType === "VIDEO") return " [VIDEO]";
  if (headerType === "DOCUMENT") return " [DOCUMENT]";
  return " [Text]";
};

export default function BroadcastSchedulerPage() {
  const { showToast } = useWaToast();

  const [scheduleName, setScheduleName] = useState("");
  const [status, setStatus] = useState("onetime");
  const [statusOpen, setStatusOpen] = useState(false);
  const [action, setAction] = useState("send");

  const [scheduleDate, setScheduleDate] = useState("");
  const [hour, setHour] = useState("12");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState("AM");

  // Recurring campaign schedule states
  const [frequency, setFrequency] = useState("daily");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [startHour, setStartHour] = useState("09");
  const [startMinute, setStartMinute] = useState("00");
  const [startPeriod, setStartPeriod] = useState("AM");

  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [endHour, setEndHour] = useState("05");
  const [endMinute, setEndMinute] = useState("00");
  const [endPeriod, setEndPeriod] = useState("PM");

  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState([]);
  const [pendingTemplateId, setPendingTemplateId] = useState("");
  const [pendingTemplates, setPendingTemplates] = useState([]);
  const [, setTemplatesLoading] = useState(true);
  const [attachment, setAttachment] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [recipientMode, setRecipientMode] = useState("manual");
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [chatContacts, setChatContacts] = useState([]);
  const [convertedClients, setConvertedClients] = useState([]);
  const [unconvertedClients, setUnconvertedClients] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);

  // Bulk CSV Verification Preview Modal States
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [isImportingFromModal, setIsImportingFromModal] = useState(false);

  const handleSyncTemplates = async () => {
    setSyncingTemplates(true);
    try {
      const res = await syncTemplatesFromMeta();
      showToast(
        `Synced ${res?.saved ?? res?.updated ?? 0} template(s) from Meta (${res?.fetched ?? res?.count ?? 0} fetched)`,
        "success"
      );
      const [tplData, pendingData] = await Promise.all([
        fetchApprovedTemplates(),
        fetchPendingTemplates().catch(() => []),
      ]);
      setTemplates(tplData || []);
      setPendingTemplates(pendingData || []);
    } catch (err) {
      console.error("Failed to sync templates from Meta:", err);
      showToast(err.message || "Failed to sync templates from Meta", "error");
    } finally {
      setSyncingTemplates(false);
    }
  };

  // Campaign Management states
  const [activeTab, setActiveTab] = useState("create"); // 'create' | 'template' | 'manage'
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("all");

  // Edit Trigger Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editScheduleName, setEditScheduleName] = useState("");
  const [editSendType, setEditSendType] = useState("schedule"); // 'schedule' | 'recurring'
  const [editScheduleDate, setEditScheduleDate] = useState("");
  const [editHour, setEditHour] = useState("12");
  const [editMinute, setEditMinute] = useState("00");
  const [editPeriod, setEditPeriod] = useState("PM");
  const [editFrequency, setEditFrequency] = useState("daily");
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartHour, setEditStartHour] = useState("09");
  const [editStartMinute, setEditStartMinute] = useState("00");
  const [editStartPeriod, setEditStartPeriod] = useState("AM");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndHour, setEditEndHour] = useState("05");
  const [editEndMinute, setEditEndMinute] = useState("00");
  const [editEndPeriod, setEditEndPeriod] = useState("PM");
  const [editStatus, setEditStatus] = useState("active");
  const [isUpdatingTrigger, setIsUpdatingTrigger] = useState(false);

  const parseDateTimeToState = (dateObj) => {
    if (!dateObj || isNaN(dateObj.getTime())) {
      const now = new Date();
      return {
        dateStr: now.toISOString().slice(0, 10),
        hourStr: "12",
        minuteStr: "00",
        periodStr: "PM",
      };
    }
    const dateStr =
      dateObj.getFullYear() +
      "-" +
      String(dateObj.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dateObj.getDate()).padStart(2, "0");
    let rawH = dateObj.getHours();
    const periodStr = rawH >= 12 ? "PM" : "AM";
    let h12 = rawH % 12;
    if (h12 === 0) h12 = 12;
    const hourStr = String(h12).padStart(2, "0");
    const minuteStr = String(dateObj.getMinutes()).padStart(2, "0");
    return { dateStr, hourStr, minuteStr, periodStr };
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditScheduleName(item.schedule_name || "");
    const isRec = item.send_type === "recurring" || item.schedule_status === "recurring";
    setEditSendType(isRec ? "recurring" : "schedule");
    setEditFrequency(item.frequency || "daily");
    setEditStatus(item.status === "paused" ? "paused" : "active");

    const schedDateObj = item.next_run_at
      ? new Date(item.next_run_at)
      : item.send_date
      ? new Date(item.send_date)
      : new Date();
    const parsedSched = parseDateTimeToState(schedDateObj);
    setEditScheduleDate(parsedSched.dateStr);
    setEditHour(parsedSched.hourStr);
    setEditMinute(parsedSched.minuteStr);
    setEditPeriod(parsedSched.periodStr);

    const startObj = item.start_date
      ? new Date(item.start_date)
      : item.next_run_at
      ? new Date(item.next_run_at)
      : new Date();
    const parsedStart = parseDateTimeToState(startObj);
    setEditStartDate(parsedStart.dateStr);
    setEditStartHour(parsedStart.hourStr);
    setEditStartMinute(parsedStart.minuteStr);
    setEditStartPeriod(parsedStart.periodStr);

    const endObj = item.end_date ? new Date(item.end_date) : new Date(Date.now() + 7 * 86400000);
    const parsedEnd = parseDateTimeToState(endObj);
    setEditEndDate(parsedEnd.dateStr);
    setEditEndHour(parsedEnd.hourStr);
    setEditEndMinute(parsedEnd.minuteStr);
    setEditEndPeriod(parsedEnd.periodStr);

    setEditModalOpen(true);
  };

  const handleSaveEditedSchedule = async () => {
    if (!editingItem) return;
    if (!editScheduleName.trim()) {
      showToast("Please enter a Schedule Name", "warning");
      return;
    }

    let nextRunIso = null;
    let sendDateIso = null;
    let startDateIso = null;
    let endDateIso = null;

    if (editSendType === "schedule") {
      if (!editScheduleDate) {
        showToast("Please select a valid schedule date", "warning");
        return;
      }
      let h = parseInt(editHour, 10);
      if (editPeriod === "PM" && h < 12) h += 12;
      if (editPeriod === "AM" && h === 12) h = 0;
      const calcDate = new Date(`${editScheduleDate}T${String(h).padStart(2, "0")}:${editMinute}:00`);
      if (isNaN(calcDate.getTime())) {
        showToast("Invalid scheduled date or time selected", "warning");
        return;
      }
      sendDateIso = calcDate.toISOString();
      nextRunIso = calcDate.toISOString();
    } else {
      if (!editStartDate || !editEndDate) {
        showToast("Please select valid start and end dates", "warning");
        return;
      }
      let startH = parseInt(editStartHour, 10);
      if (editStartPeriod === "PM" && startH < 12) startH += 12;
      if (editStartPeriod === "AM" && startH === 12) startH = 0;
      const calcStart = new Date(`${editStartDate}T${String(startH).padStart(2, "0")}:${editStartMinute}:00`);

      let endH = parseInt(editEndHour, 10);
      if (editEndPeriod === "PM" && endH < 12) endH += 12;
      if (editEndPeriod === "AM" && endH === 12) endH = 0;
      const calcEnd = new Date(`${editEndDate}T${String(endH).padStart(2, "0")}:${editEndMinute}:00`);

      if (calcEnd <= calcStart) {
        showToast("End Date & Time must be after Start Date & Time", "warning");
        return;
      }
      startDateIso = calcStart.toISOString();
      endDateIso = calcEnd.toISOString();
      nextRunIso = calcStart.toISOString();
    }

    setIsUpdatingTrigger(true);
    try {
      const payload = {
        schedule_name: editScheduleName.trim(),
        send_type: editSendType,
        schedule_status: editSendType === "recurring" ? "recurring" : "onetime",
        status: editStatus,
        ...(editSendType === "schedule"
          ? {
              send_date: sendDateIso,
              next_run_at: nextRunIso,
              start_date: null,
              end_date: null,
              frequency: null,
            }
          : {
              send_date: null,
              next_run_at: nextRunIso,
              start_date: startDateIso,
              end_date: endDateIso,
              frequency: editFrequency,
            }),
      };

      await updateBroadcastSchedule(editingItem.id, payload);
      showToast(`Campaign trigger updated! Future broadcasts will run at the updated date/time.`, "success");
      setEditModalOpen(false);
      loadSchedules();
    } catch (err) {
      console.error("Failed to update broadcast trigger:", err);
      showToast(`Failed to update trigger: ${err.message}`, "error");
    } finally {
      setIsUpdatingTrigger(false);
    }
  };

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const data = await fetchBroadcastSchedules();
      setSchedules(data || []);
    } catch (err) {
      console.error("Failed to load broadcast schedules:", err);
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    const loadTemplatesAndContacts = async () => {
      setTemplatesLoading(true);
      setLeadsLoading(true);
      try {
        const [tplData, pendingData, contactData, leadsData, inboxContactsData] = await Promise.all([
          fetchApprovedTemplates(),
          fetchPendingTemplates().catch(() => []),
          fetchBulkContacts().catch(() => []),
          fetchLeadsClientsGrouped().catch((err) => {
            console.error("Failed to load VPR customer/vendor contacts:", err);
            return { converted: [], unconverted: [] };
          }),
          fetchContacts().catch((err) => {
            console.error("Failed to load chat contacts:", err);
            return [];
          }),
        ]);
        setTemplates(tplData || []);
        setPendingTemplates(pendingData || []);
        if (contactData && Array.isArray(contactData)) {
          setContacts(
            contactData.map((c) => ({
              id: c.id,
              name: c.display_name || "",
              phone: c.raw_phone_number || c.phone_number || "",
              batch_label: c.batch_label || "",
            }))
          );
        }
        if (inboxContactsData && Array.isArray(inboxContactsData)) {
          setChatContacts(
            inboxContactsData.map((c) => ({
              id: `chat_${c.id}`,
              name: c.display_name || "WhatsApp Contact",
              phone: c.raw_phone_number || c.phone_number || "",
              batch_label: "Chat History",
            }))
          );
        }
        if (leadsData) {
          setConvertedClients(leadsData.converted || []);
          setUnconvertedClients(leadsData.unconverted || []);
        }
        await loadSchedules();
        // Auto-check and trigger due campaigns on page load
        triggerRecurringCron()
          .then(() => loadSchedules())
          .catch(() => {});
      } catch (err) {
        console.error("Failed to load initial data for Broadcast Scheduler:", err);
        showToast("Error loading templates or contacts", "error");
      } finally {
        setTemplatesLoading(false);
        setLeadsLoading(false);
      }
    };

    loadTemplatesAndContacts();

    // Auto background poll every 30 seconds to automatically trigger due broadcasts as time passes
    const cronInterval = setInterval(() => {
      triggerRecurringCron()
        .then(() => loadSchedules())
        .catch(() => {});
    }, 30000);

    return () => clearInterval(cronInterval);
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleScheduleStatus = async (item) => {
    const newStatus = item.status === "paused" ? "active" : "paused";
    try {
      await updateBroadcastScheduleStatus(item.id, newStatus);
      showToast(`Campaign "${item.schedule_name}" ${newStatus === "active" ? "activated" : "paused"}`, "info");
      loadSchedules();
    } catch (err) {
      console.error("Failed to update status:", err);
      showToast(`Failed to update campaign status: ${err.message}`, "error");
    }
  };

  const handleRunRecurringCron = async () => {
    setRunningCron(true);
    try {
      const res = await triggerRecurringCron();
      const processed = res?.processedCount ?? res?.processed ?? 0;
      showToast(
        processed > 0
          ? `Dispatched ${processed} due campaign broadcast(s)!`
          : "Checked recurring schedules. No due campaigns at this time.",
        "success"
      );
      loadSchedules();
    } catch (err) {
      console.error("Failed to trigger recurring cron:", err);
      showToast(`Trigger failed: ${err.message}`, "error");
    } finally {
      setRunningCron(false);
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm("Are you sure you want to delete this campaign schedule?")) return;
    try {
      await deleteBroadcastSchedule(id);
      showToast("Campaign schedule deleted", "info");
      loadSchedules();
    } catch (err) {
      console.error("Failed to delete schedule:", err);
      showToast(`Failed to delete: ${err.message}`, "error");
    }
  };

  const selectedApprovedTemplate = templates.find((t) => t.id === templateId);
  const selectedPendingTemplate = pendingTemplates.find((t) => t.id === pendingTemplateId);
  const selectedTemplate = selectedApprovedTemplate || selectedPendingTemplate;
  const isPendingSelected = !selectedApprovedTemplate && !!selectedPendingTemplate;

  const allAudienceContacts = [...contacts, ...chatContacts, ...convertedClients, ...unconvertedClients];

  const currentModeContacts =
    recipientMode === "converted"
      ? convertedClients
      : recipientMode === "unconverted"
      ? unconvertedClients
      : recipientMode === "chats"
      ? chatContacts
      : contacts;

  const filteredContacts = currentModeContacts.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search) ||
      (c.companyName || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "pdf";
    setAttachment({
      file,
      url: URL.createObjectURL(file),
      type,
      name: file.name,
    });
  };

  const removeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.url);
    setAttachment(null);
  };

  const addContact = async () => {
    const name = nameInput.trim();
    const phone = phoneInput.trim();
    if (!name || !/^\d{10}$/.test(phone)) {
      showToast("Please enter a valid name and 10-digit phone number", "warning");
      return;
    }

    try {
      const saved = await upsertBulkContacts([
        { display_name: name, raw_phone_number: phone, batch_label: "Manual Entry" },
      ]);
      if (saved && saved[0]) {
        const newContact = {
          id: saved[0].id,
          name: saved[0].display_name || name,
          phone: saved[0].raw_phone_number || saved[0].phone_number || phone,
          batch_label: saved[0].batch_label || "Manual Entry",
        };
        setContacts((prev) => [newContact, ...prev.filter((c) => c.id !== newContact.id)]);
        setSelectedIds((prev) => (prev.includes(newContact.id) ? prev : [...prev, newContact.id]));
      }
      setNameInput("");
      setPhoneInput("");
      showToast("Contact saved successfully", "success");
    } catch (err) {
      console.error("Error saving contact:", err);
      showToast(`Error saving contact: ${err.message}`, "error");
    }
  };

  const handleDownloadSample = () => {
    const csvContent = Papa.unparse({
      fields: ["display_name", "phone_number"],
      data: [
        ["Rahul Sharma", "9876543210"],
        ["Priya Singh", "9123456789"],
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
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data || [];
        if (rows.length === 0) {
          showToast("No data found in uploaded CSV file", "warning");
          if (e.target) e.target.value = "";
          return;
        }

        // Map parsed rows for the Preview & Verification Modal
        const formattedRows = rows.map((row, idx) => {
          const name = (row.display_name || row.Display_Name || row.Name || row.name || row.DISPLAY_NAME || "")
            .toString()
            .trim();
          const rawPhone = (
            row.phone_number ||
            row.Phone_Number ||
            row.Phone ||
            row.phone ||
            row.raw_phone_number ||
            row.PHONE_NUMBER ||
            ""
          )
            .toString()
            .trim();

          return {
            name,
            rawPhone,
            rawRow: row,
            index: idx + 1,
          };
        });

        setCsvFileName(file.name);
        setCsvPreviewData(formattedRows);
        setCsvPreviewOpen(true);
        if (e.target) e.target.value = "";
      },
      error: (err) => {
        showToast(`Failed to parse file: ${err.message}`, "error");
        if (e.target) e.target.value = "";
      },
    });
  };

  const handleConfirmModalImport = async (validRowsToSave) => {
    if (!validRowsToSave || validRowsToSave.length === 0) {
      showToast("No valid contacts selected for import", "warning");
      return;
    }

    setIsImportingFromModal(true);
    try {
      const savedRows = await upsertBulkContacts(validRowsToSave);
      showToast(`Successfully saved ${savedRows.length} contact(s) to database!`, "success");

      const refreshed = await fetchBulkContacts();
      if (refreshed && Array.isArray(refreshed)) {
        setContacts(
          refreshed.map((c) => ({
            id: c.id,
            name: c.display_name || "",
            phone: c.raw_phone_number || c.phone_number || "",
            batch_label: c.batch_label || "",
          }))
        );
        const newIds = (savedRows || []).map((r) => r.id);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...newIds])));
      }
      setCsvPreviewOpen(false);
    } catch (err) {
      console.error("Failed to import bulk contacts:", err);
      showToast(`Failed to save contacts: ${err.message}`, "error");
    } finally {
      setIsImportingFromModal(false);
    }
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditPhone(c.phone);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id) => {
    const name = editName.trim();
    const phone = editPhone.trim();
    if (!name || !/^\d{10}$/.test(phone)) {
      showToast("Please enter a valid name and 10-digit phone number", "warning");
      return;
    }
    if (!isAudienceContact(id)) {
      try {
        await updateBulkContact(id, { display_name: name, raw_phone_number: phone });
        setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, name, phone } : c)));
        cancelEdit();
        showToast("Contact updated in database", "success");
      } catch (err) {
        console.error("Error updating contact:", err);
        showToast(`Error updating contact: ${err.message}`, "error");
      }
    } else {
      setConvertedClients((prev) => prev.map((c) => (c.id === id ? { ...c, name, phone } : c)));
      setUnconvertedClients((prev) => prev.map((c) => (c.id === id ? { ...c, name, phone } : c)));
      setChatContacts((prev) => prev.map((c) => (c.id === id ? { ...c, name, phone } : c)));
      cancelEdit();
      showToast("Contact updated for broadcast", "success");
    }
  };

  const deleteContact = async (id) => {
    if (!isAudienceContact(id)) {
      try {
        await deleteBulkContacts([id]).catch(() => {});
      } catch (err) {
        console.error("Error deleting contact from db:", err);
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } else {
      setConvertedClients((prev) => prev.filter((c) => c.id !== id));
      setUnconvertedClients((prev) => prev.filter((c) => c.id !== id));
      setChatContacts((prev) => prev.filter((c) => c.id !== id));
    }
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    if (editingId === id) cancelEdit();
    showToast("Contact removed", "info");
  };

  const deleteSelectedContacts = async () => {
    if (selectedIds.length === 0) return;
    const leadsIds = selectedIds.filter((id) => isAudienceContact(id));
    const bulkIds = selectedIds.filter((id) => !isAudienceContact(id));

    if (bulkIds.length > 0) {
      try {
        await deleteBulkContacts(bulkIds).catch(() => {});
      } catch (err) {
        console.error("Error deleting bulk contacts from db:", err);
      }
      setContacts((prev) => prev.filter((c) => !bulkIds.includes(c.id)));
    }
    if (leadsIds.length > 0) {
      setConvertedClients((prev) => prev.filter((c) => !leadsIds.includes(c.id)));
      setUnconvertedClients((prev) => prev.filter((c) => !leadsIds.includes(c.id)));
      setChatContacts((prev) => prev.filter((c) => !leadsIds.includes(c.id)));
    }
    const count = selectedIds.length;
    setSelectedIds([]);
    showToast(`Removed ${count} selected contact(s)`, "info");
  };

  const handleSubmitBroadcast = async () => {
    if (!scheduleName.trim()) {
      showToast("Please enter a Schedule Name", "warning");
      return;
    }
    if (!templateId) {
      if (pendingTemplateId) {
        showToast(
          "Selected template is awaiting Meta approval. Please choose an approved template to broadcast.",
          "warning"
        );
      } else {
        showToast("Please select an approved Template", "warning");
      }
      return;
    }
    if (selectedIds.length === 0) {
      showToast("Please select at least one recipient contact", "warning");
      return;
    }

    let calculatedSendDate = null;
    if (action === "schedule") {
      if (!scheduleDate) {
        showToast("Please select a date for scheduling", "warning");
        return;
      }
      let h = parseInt(hour, 10);
      if (period === "PM" && h < 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
      calculatedSendDate = new Date(`${scheduleDate}T${String(h).padStart(2, "0")}:${minute}:00`);
    } else if (action === "recurring") {
      if (!startDate || !endDate) {
        showToast("Please select both Start Date and End Date for recurring campaign", "warning");
        return;
      }
      let startH = parseInt(startHour, 10);
      if (startPeriod === "PM" && startH < 12) startH += 12;
      if (startPeriod === "AM" && startH === 12) startH = 0;
      const calcStart = new Date(`${startDate}T${String(startH).padStart(2, "0")}:${startMinute}:00`);

      let endH = parseInt(endHour, 10);
      if (endPeriod === "PM" && endH < 12) endH += 12;
      if (endPeriod === "AM" && endH === 12) endH = 0;
      const calcEnd = new Date(`${endDate}T${String(endH).padStart(2, "0")}:${endMinute}:00`);

      if (calcEnd <= calcStart) {
        showToast("End Date & Time must be after Start Date & Time", "warning");
        return;
      }
      calculatedSendDate = calcStart;
    }

    setIsSubmitting(true);
    try {
      let uploadedMediaUrl = null;
      let mimeType = null;

      if (attachment?.file) {
        setUploadingMedia(true);
        mimeType = attachment.file.type;
        // uploadWhatsappMedia returns a plain string URL directly
        uploadedMediaUrl = await uploadWhatsappMedia(attachment.file);
        setUploadingMedia(false);
      }

      const rawSelectedContacts = allAudienceContacts.filter((c) => selectedIds.includes(c.id));

      // Strictly deduplicate selected recipients by normalized 10-digit phone number
      // so no contact is ever sent duplicate messages in the same broadcast execution
      const uniqueRecipientMap = new Map();
      rawSelectedContacts.forEach((c) => {
        const raw = String(c.phone || "").trim();
        const digits = raw.replace(/\D/g, "");
        const key = digits.length >= 10 ? digits.slice(-10) : digits;
        if (key && !uniqueRecipientMap.has(key)) {
          uniqueRecipientMap.set(key, c);
        }
      });
      const selectedContacts = Array.from(uniqueRecipientMap.values());

      if (action === "send") {
        // Send template message immediately to all selected recipients
        let successCount = 0;
        let failCount = 0;

        for (const contact of selectedContacts) {
          try {
            await initiateNewChat({
              phoneNumber: contact.phone,
              displayName: contact.name,
              templateElementName: selectedTemplate.element_name,
              templateLanguage: selectedTemplate.language || "en",
              headerMediaUrl: uploadedMediaUrl,
              headerFileName: attachment?.name,
              mimeType: mimeType,
            });
            // Log schedule record as sent
            await createBroadcastSchedule({
              schedule_name: scheduleName.trim(),
              schedule_status: "sent",
              status: "completed",
              send_type: "send",
              send_date: new Date().toISOString(),
              last_run_at: new Date().toISOString(),
              run_count: 1,
              template_id: templateId,
              template_name: selectedTemplate?.element_name || null,
              template_element_name: selectedTemplate?.element_name || null,
              template_language: selectedTemplate?.language || "en",
              mime_type: mimeType,
              media_url: uploadedMediaUrl,
              contact_id:
                contact.id && contact.id.length > 20 && !isAudienceContact(contact.id) ? contact.id : null,
              contact_name: contact.name || null,
              contact_phone: contact.phone || null,
            }).catch(() => {});
            successCount++;
          } catch (err) {
            console.error(`Failed to send broadcast template to ${contact.phone}:`, err);
            failCount++;
          }
        }

        await loadSchedules();

        if (failCount === 0) {
          showToast(`Broadcast template sent successfully to all ${successCount} contact(s)!`, "success");
        } else {
          showToast(`Sent to ${successCount} contact(s), ${failCount} failed.`, "warning");
        }
      } else {
        // Schedule for future or recurring delivery
        const insertPromises = selectedContacts.map((contactObj) => {
          let endH = parseInt(endHour, 10);
          if (endPeriod === "PM" && endH < 12) endH += 12;
          if (endPeriod === "AM" && endH === 12) endH = 0;
          const calcEnd = endDate ? new Date(`${endDate}T${String(endH).padStart(2, "0")}:${endMinute}:00`) : null;

          return createBroadcastSchedule({
            schedule_name:
              action === "recurring" ? `${scheduleName.trim()} [${frequency.toUpperCase()}]` : scheduleName.trim(),
            schedule_status: status,
            send_type: action === "recurring" ? "schedule" : action,
            frequency: action === "recurring" ? frequency : null,
            start_date: action === "recurring" ? calculatedSendDate?.toISOString() : null,
            end_date: action === "recurring" ? calcEnd?.toISOString() : null,
            status: "active",
            next_run_at: calculatedSendDate ? calculatedSendDate.toISOString() : null,
            send_date: calculatedSendDate ? calculatedSendDate.toISOString() : null,
            template_id: templateId,
            mime_type: mimeType,
            media_url: uploadedMediaUrl,
            contact_id:
              contactObj.id && contactObj.id.length > 20 && !isAudienceContact(contactObj.id) ? contactObj.id : null,
            contact_name: contactObj.name || null,
            contact_phone: contactObj.phone || null,
            template_name: selectedTemplate?.element_name || null,
            template_element_name: selectedTemplate?.element_name || null,
            template_language: selectedTemplate?.language || "en",
          });
        });

        await Promise.all(insertPromises);
        showToast(
          action === "recurring"
            ? `Recurring campaign scheduled successfully for ${selectedContacts.length} contact(s)!`
            : `Broadcast schedule created successfully for ${selectedContacts.length} contact(s)!`,
          "success"
        );
        // Automatically run cron check immediately after scheduling
        triggerRecurringCron()
          .then(() => loadSchedules())
          .catch(() => loadSchedules());
      }

      // Reset form
      setScheduleName("");
      setTemplateId("");
      removeAttachment();
      setSelectedIds([]);
    } catch (err) {
      console.error("Failed to submit broadcast schedule:", err);
      showToast(`Failed to create schedule: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
      setUploadingMedia(false);
    }
  };

  // Recipient shown on a schedule row: the bulk-contact join, else the
  // contact snapshot stored on the schedule (customers / vendors).
  const scheduleRecipient = (item) => ({
    name: item.whatsapp_bulk_contacts?.display_name || item.whatsapp_bulk_contacts?.name || item.contact_name || "Recipient",
    phone:
      item.whatsapp_bulk_contacts?.raw_phone_number ||
      item.whatsapp_bulk_contacts?.phone_number ||
      item.whatsapp_bulk_contacts?.phone ||
      item.contact_phone ||
      "",
  });

  const pageTabs = [
    { id: "create", label: "Create Broadcast", icon: Plus },
    { id: "template", label: "Create Template", icon: FileText, count: pendingTemplates.length, countTone: "amber" },
    { id: "manage", label: "Manage Campaigns & Schedules", icon: Sliders, count: schedules.length },
  ];

  const recipientModes = [
    { id: "manual", label: "Single Contact Input", icon: UserPlus },
    { id: "csv", label: "CSV Import / Bulk Upload", icon: FileSpreadsheet },
    { id: "chats", label: "Chat Contacts", icon: MessageSquare, count: chatContacts.length },
    { id: "converted", label: "VPR Customers", icon: Store, count: convertedClients.length },
    { id: "unconverted", label: "VPR Vendors", icon: Truck, count: unconvertedClients.length },
  ];

  const renderAudienceGroup = (kind) => {
    const isCustomers = kind === "converted";
    const isVendors = kind === "unconverted";
    const list = isCustomers ? convertedClients : isVendors ? unconvertedClients : chatContacts;
    const setList = isCustomers ? setConvertedClients : isVendors ? setUnconvertedClients : setChatContacts;
    const label = isCustomers ? "VPR Customers" : isVendors ? "VPR Vendors" : "Chat Contacts";
    const Icon = isCustomers ? Store : isVendors ? Truck : MessageSquare;
    const selectedCount = list.filter((c) => selectedIds.includes(c.id)).length;
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={15} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-800">
                {label} ({list.length})
              </p>
              <span className={`${pillBase} bg-blue-50 text-blue-700 border-blue-200`}>{selectedCount} Selected</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isCustomers
                ? "Customers from Master with a valid 10-digit phone number."
                : isVendors
                ? "Vendors from Master with a valid 10-digit phone number."
                : "Active contacts from your WhatsApp Chat Inbox conversations."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const ids = list.map((c) => c.id);
              setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
            }}
            className="gap-1 h-8 px-3 text-xs"
          >
            <CheckSquare size={13} /> Select All ({list.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const idSet = new Set(list.map((c) => c.id));
              setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
            }}
            className="gap-1 h-8 px-3 text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            <Square size={12} /> Deselect
          </Button>
          {selectedCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const selectedGroupIds = list.filter((c) => selectedIds.includes(c.id)).map((c) => c.id);
                setList((prev) => prev.filter((c) => !selectedGroupIds.includes(c.id)));
                setSelectedIds((prev) => prev.filter((id) => !selectedGroupIds.includes(id)));
                showToast(`Removed ${selectedGroupIds.length} contact(s)`, "info");
              }}
              className="gap-1 h-8 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={12} /> Delete Selected
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderScheduleActions = (item, itemStatus, compact = false) => (
    <div className={`flex items-center gap-1.5 ${compact ? "" : "justify-end"}`}>
      {!compact && (
        <button
          type="button"
          onClick={() => handleOpenEditModal(item)}
          className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
          title="Edit Trigger & Schedule"
        >
          <Pencil size={15} />
        </button>
      )}
      {itemStatus !== "completed" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleToggleScheduleStatus(item)}
          className={`gap-1 h-7 px-2.5 text-[11px] ${
            itemStatus === "active"
              ? "text-amber-700 border-amber-200 hover:bg-amber-50"
              : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          }`}
        >
          {itemStatus === "active" ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Resume
            </>
          )}
        </Button>
      ) : (
        <span className="text-[10px] text-slate-400 font-medium mr-1">Finished</span>
      )}
      <button
        type="button"
        onClick={() => handleDeleteSchedule(item.id)}
        className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
        title="Delete Schedule"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/15">
            <Radio size={19} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-800 tracking-tight truncate">Broadcast Scheduler</h1>
              <span className={`${pillBase} bg-blue-50 text-blue-700 border-blue-200`}>WhatsApp Cloud API</span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Schedule bulk template broadcasts & media messages to targeted customer lists
            </p>
          </div>
        </div>

        {activeTab === "create" && (
          <Button
            type="button"
            onClick={handleSubmitBroadcast}
            disabled={isSubmitting || uploadingMedia}
            className="gap-2 px-4 font-medium text-xs h-9 shrink-0"
          >
            {isSubmitting || uploadingMedia ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Processing Broadcast...
              </>
            ) : action === "send" ? (
              <>
                <Send size={15} />
                Send Broadcast Now
              </>
            ) : (
              <>
                <CalendarIcon size={15} />
                Schedule Broadcast
              </>
            )}
          </Button>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-6 overflow-x-auto custom-scrollbar">
          {pageTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  active ? "text-primary border-b-2 border-primary translate-y-[1px]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tab.countTone === "amber"
                        ? "bg-amber-100 text-amber-700"
                        : active
                        ? "bg-primary/15 text-primary"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "manage" && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRunRecurringCron}
            disabled={runningCron}
            className={`${outlineBtnCls} mb-2 shrink-0`}
            title="Check and trigger recurring schedules due right now"
          >
            <RefreshCw size={13} className={runningCron ? "animate-spin" : ""} />
            {runningCron ? "Running..." : "Trigger Cron Now"}
          </Button>
        )}
      </div>

      {activeTab === "create" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT COLUMN: Controls & Audience */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* SECTION 1: Campaign Configuration */}
            <div className={cardCls}>
              <CardHeader icon={Clock} title="1. Campaign & Schedule Settings" />
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Campaign / Schedule Name</label>
                    <input
                      type="text"
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                      placeholder="e.g. Diwali Special Promo"
                      className={inputCls}
                    />
                  </div>

                  <div className="relative">
                    <label className={labelCls}>Schedule Type</label>
                    <button
                      type="button"
                      onClick={() => setStatusOpen((v) => !v)}
                      className={`${inputCls} flex items-center justify-between hover:bg-slate-50`}
                    >
                      <span className="font-medium flex items-center gap-1.5">
                        {status === "onetime" ? (
                          <>
                            <Send size={12} className="text-primary" /> One-time Dispatch
                          </>
                        ) : (
                          <>
                            <Repeat size={12} className="text-primary" /> Recurring Campaign
                          </>
                        )}
                      </span>
                      <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    {statusOpen && (
                      <div className="absolute mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg z-20 overflow-hidden py-1">
                        {[
                          { id: "onetime", label: "One-time Dispatch", desc: "Send once immediately or at scheduled time" },
                          { id: "recurring", label: "Recurring Campaign", desc: "Set repeating delivery cadence" },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setStatus(s.id);
                              setStatusOpen(false);
                              if (s.id === "recurring") {
                                setAction("recurring");
                              } else if (action === "recurring") {
                                setAction("send");
                              }
                            }}
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              status === s.id ? "bg-primary/5" : "hover:bg-slate-50"
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-800">{s.label}</p>
                            <p className="text-[10px] text-slate-500">{s.desc}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Mode Toggle */}
                <div>
                  <label className={labelCls}>Dispatch Action</label>
                  <div className={`grid gap-3 ${status === "recurring" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                    {(status === "onetime"
                      ? [
                          { key: "send", label: "Send Immediately", desc: "Dispatch template now", icon: Send },
                          { key: "schedule", label: "Schedule Later", desc: "Set future date & time", icon: CalendarIcon },
                        ]
                      : [
                          { key: "recurring", label: "Recurring Schedule", desc: "Repeat on active cadence", icon: Repeat },
                          { key: "send", label: "Send Immediately", desc: "Dispatch template now", icon: Send },
                          { key: "schedule", label: "Schedule Later", desc: "Set future date & time", icon: CalendarIcon },
                        ]
                    ).map((item) => {
                      const Icon = item.icon;
                      const isSelected = action === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setAction(item.key)}
                          className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-md shrink-0 ${
                              isSelected ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <Icon size={13} />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-slate-700"}`}>
                              {item.label}
                            </p>
                            <p className="text-[10px] text-slate-500">{item.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* One-time Schedule Date & Time */}
                {status === "onetime" && action === "schedule" && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
                    <div className="flex-1">
                      <label className={labelCls}>Target Date</label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="w-full sm:w-64">
                      <label className={labelCls}>Target Time</label>
                      <TimeSelect
                        hour={hour}
                        minute={minute}
                        period={period}
                        onHour={setHour}
                        onMinute={setMinute}
                        onPeriod={setPeriod}
                      />
                    </div>
                  </div>
                )}

                {/* Recurring Campaign Configuration */}
                {status === "recurring" && action === "recurring" && (
                  <div className="space-y-4 pt-3 border-t border-slate-100">
                    <div>
                      <label className={labelCls}>Frequency</label>
                      <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={selectCls}>
                        <option value="daily">Daily (Every 24 Hours)</option>
                        <option value="weekly">Weekly (Every 7 Days)</option>
                        <option value="monthly">Monthly (Every Month)</option>
                        <option value="hourly">Hourly (Every Hour)</option>
                      </select>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className={labelCls}>Start Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div className="w-full sm:w-64">
                        <label className={labelCls}>Start Time</label>
                        <TimeSelect
                          hour={startHour}
                          minute={startMinute}
                          period={startPeriod}
                          onHour={setStartHour}
                          onMinute={setStartMinute}
                          onPeriod={setStartPeriod}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className={labelCls}>End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div className="w-full sm:w-64">
                        <label className={labelCls}>End Time</label>
                        <TimeSelect
                          hour={endHour}
                          minute={endMinute}
                          period={endPeriod}
                          onHour={setEndHour}
                          onMinute={setEndMinute}
                          onPeriod={setEndPeriod}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: Recipients & Audience */}
            <div className={cardCls}>
              <CardHeader
                icon={Users}
                title={`2. Recipients & Audience (${selectedIds.length} Selected)`}
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ids = currentModeContacts.map((c) => c.id);
                        setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
                      }}
                      className={`${linkBtnCls} text-primary`}
                    >
                      <CheckSquare size={12} /> Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const currentIdSet = new Set(currentModeContacts.map((c) => c.id));
                        setSelectedIds((prev) => prev.filter((id) => !currentIdSet.has(id)));
                      }}
                      className={`${linkBtnCls} text-slate-500`}
                    >
                      <Square size={12} /> Clear
                    </button>
                    {selectedIds.length > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={deleteSelectedContacts}
                          className={`${linkBtnCls} text-red-600`}
                          title="Remove selected contacts from audience"
                        >
                          <Trash2 size={12} /> Delete Selected ({selectedIds.length})
                        </button>
                      </>
                    )}
                  </div>
                }
              />

              <div className="p-4 space-y-3">
                {/* Recipient Entry Mode Toggle */}
                <div className="flex flex-wrap items-center gap-1">
                  {recipientModes.map((m) => {
                    const Icon = m.icon;
                    const active = recipientMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRecipientMode(m.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                          active ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        }`}
                      >
                        <Icon size={14} />
                        {m.label}
                        {typeof m.count === "number" && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              active ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {m.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Mode 1: Manual Single Contact Add */}
                {recipientMode === "manual" && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Contact Name (e.g. Rahul Sharma)"
                      className={`flex-1 ${inputCls}`}
                    />
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Phone (e.g. 9876543210)"
                      className={`flex-1 ${inputCls}`}
                    />
                    <Button type="button" onClick={addContact} className="gap-1.5 px-4 font-medium text-xs h-9 shrink-0">
                      <UserPlus size={14} />
                      Add Contact
                    </Button>
                  </div>
                )}

                {/* Mode 2: CSV Import / Sample Download */}
                {recipientMode === "csv" && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <FileSpreadsheet size={18} className="text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700">Bulk Contact CSV Upload</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Upload CSV containing &quot;Name&quot; and &quot;Phone&quot; columns
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <Button type="button" variant="outline" onClick={handleDownloadSample} className={`${outlineBtnCls} flex-1 sm:flex-initial`}>
                        <Download size={13} /> Sample
                      </Button>
                      <label className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium cursor-pointer hover:bg-primary/90 transition-colors">
                        <UploadCloud size={14} /> Import CSV
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}

                {/* Mode 3 / 4 / 5: Chat Contacts / VPR Customers / Vendors */}
                {recipientMode === "chats" && renderAudienceGroup("chats")}
                {recipientMode === "converted" && renderAudienceGroup("converted")}
                {recipientMode === "unconverted" && renderAudienceGroup("unconverted")}

                {/* Search & Contacts Selector */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${
                        recipientMode === "converted"
                          ? "customers"
                          : recipientMode === "unconverted"
                          ? "vendors"
                          : recipientMode === "chats"
                          ? "chat contacts"
                          : "contacts"
                      } by name, company, or phone...`}
                      className={`${inputCls} pl-9`}
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {leadsLoading && (recipientMode === "converted" || recipientMode === "unconverted") ? (
                      <div className="p-4 flex items-center justify-center gap-2 text-xs text-primary">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Loading contacts from VPR Master...</span>
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        {recipientMode === "converted"
                          ? "No customers with a valid phone number found in Master."
                          : recipientMode === "unconverted"
                          ? "No vendors with a valid phone number found in Master."
                          : recipientMode === "chats"
                          ? "No chat inbox contacts found."
                          : "No contacts available. Add contacts above or import a CSV."}
                      </div>
                    ) : (
                      filteredContacts.map((contact) => {
                        const isChecked = selectedIds.includes(contact.id);
                        const isEditing = editingId === contact.id;

                        return (
                          <div
                            key={contact.id}
                            className={`flex items-center justify-between px-3 py-2 transition-colors text-xs ${
                              isChecked ? "bg-primary/5" : "hover:bg-slate-50/60"
                            }`}
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1 mr-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className={`${inputCls} h-8`}
                                  placeholder="Name"
                                />
                                <input
                                  type="text"
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  className={`${inputCls} h-8`}
                                  placeholder="Phone"
                                />
                                <button
                                  type="button"
                                  onClick={() => saveEdit(contact.id)}
                                  className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                                  title="Save"
                                >
                                  <CheckCheck size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0"
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSelect(contact.id)}
                                    className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer"
                                  />
                                  <div
                                    className={`h-7 w-7 rounded-full font-semibold text-[10px] flex items-center justify-center shrink-0 ${
                                      contact.isLead
                                        ? contact.isConverted
                                          ? "bg-primary/10 text-primary"
                                          : "bg-violet-50 text-violet-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {getInitials(contact.name || contact.companyName)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold text-slate-800 truncate">
                                        {contact.name || "Unnamed Contact"}
                                      </p>
                                      {contact.isLead && (
                                        <span
                                          className={`${pillBase} ${
                                            contact.isConverted
                                              ? "bg-blue-50 text-blue-700 border-blue-200"
                                              : "bg-violet-50 text-violet-700 border-violet-200"
                                          }`}
                                        >
                                          {contact.isConverted ? "Customer" : "Vendor"}
                                        </span>
                                      )}
                                      {!contact.isLead && contact.batch_label && (
                                        <span className={`${pillBase} bg-slate-100 text-slate-600 border-slate-200`}>
                                          {contact.batch_label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                      <span className="tabular-nums">{contact.phone}</span>
                                      {contact.companyName && contact.companyName !== contact.name && (
                                        <span className="text-slate-400 truncate">• {contact.companyName}</span>
                                      )}
                                      {contact.city && <span className="text-slate-400">• {contact.city}</span>}
                                    </div>
                                  </div>
                                </label>

                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEdit(contact)}
                                    className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                                    title="Edit Contact"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteContact(contact.id)}
                                    className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                    title="Delete Contact"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Template & Live Preview */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Template & Header Media */}
            <div className={cardCls}>
              <CardHeader
                icon={FileStack}
                title="3. Template & Header Media"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSyncTemplates}
                    disabled={syncingTemplates}
                    className="gap-1.5 h-7 px-2.5 text-[11px] text-slate-600 border-slate-200 hover:bg-slate-50"
                    title="Sync latest templates from Meta"
                  >
                    <RefreshCw size={12} className={syncingTemplates ? "animate-spin" : ""} />
                    {syncingTemplates ? "Syncing..." : "Sync Meta"}
                  </Button>
                }
              />
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Select Approved Message Template
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("template")}
                        className={`${linkBtnCls} text-primary`}
                      >
                        <Plus size={12} />
                        Create Template
                      </button>
                      {selectedTemplate &&
                        (isPendingSelected ? (
                          <span className={`${pillBase} bg-amber-50 text-amber-700 border-amber-200`}>
                            <Clock size={10} /> Pending Meta Review
                          </span>
                        ) : ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) ? (
                          <span className={`${pillBase} bg-emerald-50 text-emerald-700 border-emerald-200`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Media: {selectedTemplate.header_type}
                          </span>
                        ) : (
                          <span className={`${pillBase} bg-slate-100 text-slate-600 border-slate-200`}>
                            Text Only Template
                          </span>
                        ))}
                    </div>
                  </div>

                  <select
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      if (e.target.value) setPendingTemplateId("");
                    }}
                    className={selectCls}
                  >
                    <option value="">-- Choose WhatsApp Template --</option>
                    {["UTILITY", "MARKETING", "AUTHENTICATION"].map((cat) => {
                      const group = templates.filter((t) => t.category === cat);
                      if (!group.length) return null;
                      return (
                        <optgroup key={cat} label={`${cat} TEMPLATES`}>
                          {group.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.element_name} ({t.language || "en"}){mediaTagFor(t.header_type)}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                {/* Templates pending approval */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                      <Clock size={12} />
                      Messages Pending for Approval
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                        {pendingTemplates.length}
                      </span>
                    </span>
                    {pendingTemplates.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSyncTemplates}
                        disabled={syncingTemplates}
                        className={`${linkBtnCls} text-primary`}
                        title="Check with Meta if approval status has updated"
                      >
                        <RefreshCw size={10} className={syncingTemplates ? "animate-spin" : ""} />
                        Check Approval
                      </button>
                    )}
                  </div>

                  <select
                    value={pendingTemplateId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setPendingTemplateId(pid);
                      if (pid) setTemplateId("");
                    }}
                    className={`${selectCls} border-amber-200 bg-amber-50/50 text-amber-900 focus:ring-amber-500/20`}
                  >
                    <option value="">
                      {pendingTemplates.length > 0
                        ? `-- Select Pending Template (${pendingTemplates.length} awaiting review) --`
                        : "-- No Templates Pending Approval --"}
                    </option>
                    {pendingTemplates.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.element_name} ({pt.category} - {pt.language || "en"}){mediaTagFor(pt.header_type)} [PENDING
                        REVIEW]
                      </option>
                    ))}
                  </select>

                  {isPendingSelected && (
                    <div className="mt-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
                      <Info size={14} className="shrink-0 text-amber-600 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[11px]">
                          &quot;{selectedTemplate.element_name}&quot; is awaiting Meta review
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Outbound preview is active below. Once Meta approves this template, select it in the approved
                          dropdown above to broadcast.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Header Media Attachment */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Header Media Sample
                    </span>
                    {selectedTemplate && ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) ? (
                      <span className={`${pillBase} bg-amber-50 text-amber-700 border-amber-200`}>
                        Required — {selectedTemplate.header_type}
                      </span>
                    ) : (
                      <span className={`${pillBase} bg-slate-100 text-slate-500 border-slate-200`}>Optional</span>
                    )}
                  </div>
                  {!attachment ? (
                    <div className="flex gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 h-10 border border-dashed border-slate-300 hover:border-primary/50 rounded-lg bg-slate-50/50 text-xs text-slate-600 font-medium cursor-pointer hover:bg-primary/5 transition-colors">
                        <ImageIcon size={14} className="text-primary" />
                        Attach Image
                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </label>
                      <label className="flex-1 flex items-center justify-center gap-2 h-10 border border-dashed border-slate-300 hover:border-primary/50 rounded-lg bg-slate-50/50 text-xs text-slate-600 font-medium cursor-pointer hover:bg-primary/5 transition-colors">
                        <FileText size={14} className="text-red-500" />
                        Attach PDF
                        <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
                      {attachment.type === "image" && (
                        <img
                          src={attachment.url}
                          alt="attached sample"
                          className="w-full h-28 object-cover border-b border-slate-200"
                        />
                      )}
                      {attachment.type === "video" && (
                        <video src={attachment.url} className="w-full h-28 object-cover border-b border-slate-200" />
                      )}
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {attachment.type === "image" ? (
                            <ImageIcon size={13} className="text-primary shrink-0" />
                          ) : (
                            <FileText size={13} className="text-red-500 shrink-0" />
                          )}
                          <span className="text-[11px] font-medium text-slate-700 truncate">{attachment.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={removeAttachment}
                          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Remove attachment"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Live WhatsApp Preview */}
            <div className={cardCls}>
              <CardHeader
                icon={Sparkles}
                title="WhatsApp Live Preview"
                action={
                  <div className="flex items-center gap-2">
                    {isPendingSelected && (
                      <span className={`${pillBase} bg-amber-50 text-amber-700 border-amber-200`}>
                        <Clock size={10} /> Pending Meta Review
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">Outbound Preview</span>
                  </div>
                }
              />
              <div className="p-4">
                <div className="rounded-lg p-4 min-h-[260px] border border-slate-200 bg-[#efeae2] flex flex-col justify-end relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

                  {!selectedTemplate && !attachment ? (
                    <div className="relative flex flex-col items-center justify-center my-auto text-center p-4 text-slate-500">
                      <Info size={26} className="mb-1.5 opacity-50" />
                      <p className="text-xs font-medium">Select a template to generate the live WhatsApp preview</p>
                    </div>
                  ) : (
                    <div className="relative max-w-[88%] bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm text-xs text-slate-800 overflow-hidden my-2 self-end">
                      {isPendingSelected && (
                        <div className="bg-amber-50 text-amber-800 px-3 py-1.5 text-[10px] font-semibold border-b border-amber-200 flex items-center gap-1.5">
                          <Clock size={11} className="shrink-0 text-amber-600" />
                          Meta Approval Pending — Preview Only
                        </div>
                      )}

                      {attachment?.type === "image" && (
                        <img src={attachment.url} alt="header" className="w-full max-h-52 object-cover" />
                      )}
                      {attachment?.type === "video" && (
                        <video src={attachment.url} className="w-full max-h-52 object-cover" />
                      )}
                      {attachment?.type === "pdf" && (
                        <div className="flex items-center gap-3 bg-black/5 px-3 py-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800">{attachment.name}</p>
                            <p className="text-[10px] text-slate-500">PDF · Tap to open</p>
                          </div>
                        </div>
                      )}

                      {!attachment &&
                        selectedTemplate &&
                        ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) && (
                          <div className="flex flex-col items-center justify-center gap-1.5 bg-black/5 px-3 py-5">
                            {selectedTemplate.header_type === "IMAGE" && <ImageIcon size={24} className="text-slate-400" />}
                            {selectedTemplate.header_type === "VIDEO" && <Video size={24} className="text-slate-400" />}
                            {selectedTemplate.header_type === "DOCUMENT" && (
                              <FileText size={24} className="text-slate-400" />
                            )}
                            <p className="text-[10px] text-slate-500 font-medium">
                              {selectedTemplate.header_type} header — attach file above
                            </p>
                          </div>
                        )}

                      {selectedTemplate && (
                        <div className="px-3 py-2.5 space-y-1.5">
                          {selectedTemplate.header_type === "TEXT" && selectedTemplate.header_text && (
                            <p className="font-bold text-slate-900 text-xs leading-snug">{selectedTemplate.header_text}</p>
                          )}
                          <p className="whitespace-pre-line text-slate-800 leading-relaxed text-[12.5px]">
                            {selectedTemplate.body_text}
                          </p>
                          {selectedTemplate.footer_text && (
                            <p className="text-[10px] text-slate-500 pt-0.5">{selectedTemplate.footer_text}</p>
                          )}
                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 pt-1">
                            <span>10:30 AM</span>
                            <CheckCheck size={13} className="text-sky-500" />
                          </div>
                        </div>
                      )}

                      {selectedTemplate?.buttons?.length > 0 && (
                        <div className="border-t border-black/10 divide-y divide-black/5">
                          {selectedTemplate.buttons.map((btn, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-sky-600"
                            >
                              {btn.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "template" ? (
        <CreateTemplateView
          onTemplateCreated={async (newTpl) => {
            const [tplData, pendingData] = await Promise.all([
              fetchApprovedTemplates(),
              fetchPendingTemplates().catch(() => []),
            ]);
            setTemplates(tplData || []);
            setPendingTemplates(pendingData || []);
            if (newTpl && newTpl.status === "PENDING") {
              setPendingTemplateId(newTpl.id);
            }
          }}
          onSelectForBroadcast={(tid) => {
            setTemplateId(tid);
            setPendingTemplateId("");
            setActiveTab("create");
          }}
          showToast={showToast}
          onBackToBroadcast={() => setActiveTab("create")}
        />
      ) : (
        /* Campaign Management View */
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: "all", label: "All Campaigns", icon: Sliders },
                { id: "active", label: "Active", icon: Play },
                { id: "paused", label: "Paused", icon: Pause },
                { id: "completed", label: "Completed", icon: CheckCircle2 },
              ].map((f) => {
                const count =
                  f.id === "all" ? schedules.length : schedules.filter((s) => (s.status || "active") === f.id).length;
                const active = scheduleFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setScheduleFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 shrink-0 ${
                      active ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    <f.icon size={13} />
                    {f.label}
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        active ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={scheduleSearch}
                onChange={(e) => setScheduleSearch(e.target.value)}
                placeholder="Search campaigns..."
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {schedulesLoading && schedules.length === 0 ? (
            <div className={`${cardCls} flex flex-col items-center justify-center p-12`}>
              <Loader2 size={24} className="animate-spin text-primary mb-2" />
              <p className="text-xs text-slate-500">Loading campaign schedules...</p>
            </div>
          ) : (
            (() => {
              const term = scheduleSearch.toLowerCase();
              const filtered = schedules.filter((s) => {
                const statusMatch = scheduleFilter === "all" || (s.status || "active") === scheduleFilter;
                const recipient = scheduleRecipient(s);
                const searchMatch =
                  !scheduleSearch ||
                  (s.schedule_name || "").toLowerCase().includes(term) ||
                  (s.whatsapp_templates?.element_name || "").toLowerCase().includes(term) ||
                  recipient.name.toLowerCase().includes(term) ||
                  recipient.phone.includes(scheduleSearch);
                return statusMatch && searchMatch;
              });

              if (filtered.length === 0) {
                return (
                  <div className={`${cardCls} flex flex-col items-center justify-center p-12 text-center`}>
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                      <Radio size={26} className="text-slate-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-600">No campaign schedules found</h3>
                    <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                      {scheduleSearch || scheduleFilter !== "all"
                        ? "Try clearing your search filters"
                        : "Create your first recurring or scheduled broadcast campaign to manage it here"}
                    </p>
                    <Button type="button" onClick={() => setActiveTab("create")} className="gap-2 px-4 font-medium text-xs h-9">
                      <Plus size={15} /> Create New Campaign
                    </Button>
                  </div>
                );
              }

              return (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-blue-50 border-b border-slate-200">
                            {["Campaign & Template", "Recipient", "Next Scheduled Run", "Last Executed", "Status", "Actions"].map(
                              (h, i) => (
                                <th
                                  key={h}
                                  className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                                    i === 5 ? "text-right" : "text-left"
                                  }`}
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((item) => {
                            const itemStatus = item.status || "active";
                            const isRecurring = item.schedule_status === "recurring" || item.send_type === "recurring";
                            const nextRunStr = item.next_run_at || item.send_date;
                            const recipient = scheduleRecipient(item);

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-slate-800">{item.schedule_name}</span>
                                    <ScheduleTypePill isRecurring={isRecurring} frequency={item.frequency} />
                                  </div>
                                  <p className="text-[11px] text-slate-500">
                                    Template:{" "}
                                    <span className="font-medium text-slate-700">
                                      {item.whatsapp_templates?.element_name || item.template_element_name || "Custom"}
                                    </span>
                                  </p>
                                </td>
                                <td className="px-4 py-3 align-middle whitespace-nowrap">
                                  <p className="font-medium text-slate-800">{recipient.name}</p>
                                  <p className="text-[11px] text-slate-500 tabular-nums">{recipient.phone}</p>
                                </td>
                                <td className="px-4 py-3 align-middle whitespace-nowrap font-semibold text-primary tabular-nums">
                                  {formatDateTime(nextRunStr) || "—"}
                                </td>
                                <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-600 tabular-nums">
                                  {formatDateTime(item.last_run_at) || "Never"}
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  <ScheduleStatusPill status={itemStatus} />
                                </td>
                                <td className="px-4 py-3 align-middle">{renderScheduleActions(item, itemStatus)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile cards */}
                  <div className="block md:hidden space-y-3">
                    {filtered.map((item) => {
                      const itemStatus = item.status || "active";
                      const isRecurring = item.schedule_status === "recurring" || item.send_type === "recurring";
                      const nextRunStr = item.next_run_at || item.send_date;
                      const recipient = scheduleRecipient(item);

                      return (
                        <div key={item.id} className={`${cardCls} p-4 space-y-3`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-sm font-semibold text-slate-800 truncate">{item.schedule_name}</h3>
                                <ScheduleTypePill isRecurring={isRecurring} frequency={item.frequency} />
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Template:{" "}
                                <span className="font-medium text-slate-700">
                                  {item.whatsapp_templates?.element_name || item.template_element_name || "Custom"}
                                </span>
                              </p>
                            </div>
                            <ScheduleStatusPill status={itemStatus} />
                          </div>

                          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                            <span className="font-medium text-slate-700">{recipient.name}</span>
                            <span className="text-slate-500 tabular-nums">{recipient.phone}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="block text-[10px] uppercase font-semibold text-slate-400">Next Scheduled Run</span>
                              <span className="font-semibold text-primary">{formatDateTime(nextRunStr) || "—"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-semibold text-slate-400">Last Executed</span>
                              <span className="font-medium text-slate-700">{formatDateTime(item.last_run_at) || "Never"}</span>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(item)}
                              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-primary"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            {renderScheduleActions(item, itemStatus, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* EDIT CAMPAIGN TRIGGER MODAL */}
      <Modal open={editModalOpen && !!editingItem} onOpenChange={(o) => !o && setEditModalOpen(false)}>
        <ModalContent className="max-w-xl w-[calc(100%-2rem)]">
          <ModalHeader className="bg-slate-50/70 pr-12">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Pencil size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 truncate">Edit Broadcast Trigger & Schedule</h2>
              <p className="text-xs text-slate-500 truncate">Update future dispatch date, time, or frequency</p>
            </div>
          </ModalHeader>

          <ModalBody>
            <div>
              <label className={labelCls}>Schedule Name</label>
              <input
                type="text"
                value={editScheduleName}
                onChange={(e) => setEditScheduleName(e.target.value)}
                className={inputCls}
                placeholder="Campaign schedule title"
              />
            </div>

            <div>
              <label className={labelCls}>Schedule Type</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "schedule", label: "One-time Scheduled", icon: CalendarIcon },
                  { id: "recurring", label: "Recurring Schedule", icon: Repeat },
                ].map((opt) => {
                  const active = editSendType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditSendType(opt.id)}
                      className={`h-10 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                        active
                          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <opt.icon size={14} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {editSendType === "schedule" ? (
              <div className="p-3 rounded-lg bg-slate-50/60 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Scheduled Date</label>
                  <input
                    type="date"
                    value={editScheduleDate}
                    onChange={(e) => setEditScheduleDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Scheduled Time</label>
                  <TimeSelect
                    hour={editHour}
                    minute={editMinute}
                    period={editPeriod}
                    onHour={setEditHour}
                    onMinute={setEditMinute}
                    onPeriod={setEditPeriod}
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50/60 border border-slate-200 space-y-3">
                <div>
                  <label className={labelCls}>Repeat Frequency</label>
                  <select value={editFrequency} onChange={(e) => setEditFrequency(e.target.value)} className={selectCls}>
                    <option value="hourly">Hourly (Every 1 Hour)</option>
                    <option value="daily">Daily (Every 24 Hours)</option>
                    <option value="weekly">Weekly (Every 7 Days)</option>
                    <option value="monthly">Monthly (Every Month)</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Start Date</label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Start Time</label>
                    <TimeSelect
                      hour={editStartHour}
                      minute={editStartMinute}
                      period={editStartPeriod}
                      onHour={setEditStartHour}
                      onMinute={setEditStartMinute}
                      onPeriod={setEditStartPeriod}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>End Date</label>
                    <input
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>End Time</label>
                    <TimeSelect
                      hour={editEndHour}
                      minute={editEndMinute}
                      period={editEndPeriod}
                      onHour={setEditEndHour}
                      onMinute={setEditEndMinute}
                      onPeriod={setEditEndPeriod}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Campaign Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={selectCls}>
                <option value="active">Active (Scheduled to run)</option>
                <option value="paused">Paused (Temporarily hold execution)</option>
              </select>
            </div>
          </ModalBody>

          <ModalFooter className="bg-slate-50/40">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              disabled={isUpdatingTrigger}
              className="px-4 font-medium text-xs h-9 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEditedSchedule}
              disabled={isUpdatingTrigger}
              className="gap-2 px-4 font-medium text-xs h-9"
            >
              {isUpdatingTrigger ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving Changes...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Update Schedule & Trigger
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* CSV Contact Preview & Discrepancy Verification Modal */}
      <BulkContactPreviewModal
        isOpen={csvPreviewOpen}
        onClose={() => setCsvPreviewOpen(false)}
        fileName={csvFileName}
        parsedData={csvPreviewData}
        onConfirmImport={handleConfirmModalImport}
        isImporting={isImportingFromModal}
      />
    </div>
  );
}
