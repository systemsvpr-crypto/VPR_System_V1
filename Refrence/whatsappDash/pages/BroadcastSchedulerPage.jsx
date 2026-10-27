import { useState, useEffect } from "react";
import Papa from "papaparse";
import AdminLayout from "../../checklist/components/layout/AdminLayout";
import { useMagicToast } from "../../../context/MagicToastContext";
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
} from "../services/whatsappApi";
import CreateTemplateView from "../components/CreateTemplateView";
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
} from "lucide-react";
import { getInitials } from "../utils/chatUtils";
import BulkContactPreviewModal from "../components/BulkContactPreviewModal";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const inputCls =
  "w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all";
const btnSecondaryCls =
  "px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer";

export default function BroadcastSchedulerPage() {
  const { showToast } = useMagicToast();

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

  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
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

    const endObj = item.end_date
      ? new Date(item.end_date)
      : new Date(Date.now() + 7 * 86400000);
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
      showToast(
        `Campaign trigger updated! Future broadcasts will run at the updated date/time.`,
        "success"
      );
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
        const [tplData, pendingData, contactData, leadsData] = await Promise.all([
          fetchApprovedTemplates(),
          fetchPendingTemplates().catch(() => []),
          fetchBulkContacts().catch(() => []),
          fetchLeadsClientsGrouped().catch((err) => {
            console.error("Failed to load leads client contacts:", err);
            return { converted: [], unconverted: [] };
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
        if (leadsData) {
          setConvertedClients(leadsData.converted || []);
          setUnconvertedClients(leadsData.unconverted || []);
        }
        await loadSchedules();
        // Auto-check and trigger due campaigns on page load
        triggerRecurringCron().then(() => loadSchedules()).catch(() => {});
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
      triggerRecurringCron().then(() => loadSchedules()).catch(() => {});
    }, 30000);

    return () => clearInterval(cronInterval);
  }, [showToast]);

  const handleToggleScheduleStatus = async (item) => {
    const newStatus = item.status === "paused" ? "active" : "paused";
    try {
      await updateBroadcastScheduleStatus(item.id, newStatus);
      showToast(
        `Campaign "${item.schedule_name}" ${newStatus === "active" ? "activated ▶️" : "paused ⏸️"}`,
        "info"
      );
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
      showToast(
        res.processedCount > 0
          ? `Dispatched ${res.processedCount} due campaign broadcast(s)!`
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

  const allAudienceContacts = [
    ...contacts,
    ...convertedClients,
    ...unconvertedClients,
  ];

  const currentModeContacts =
    recipientMode === "converted"
      ? convertedClients
      : recipientMode === "unconverted"
      ? unconvertedClients
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
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : "pdf";
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
          const name = (
            row.display_name ||
            row.Display_Name ||
            row.Name ||
            row.name ||
            row.DISPLAY_NAME ||
            ""
          ).toString().trim();
          const rawPhone = (
            row.phone_number ||
            row.Phone_Number ||
            row.Phone ||
            row.phone ||
            row.raw_phone_number ||
            row.PHONE_NUMBER ||
            ""
          ).toString().trim();

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
    const isLeadContact = String(id).startsWith("lead_");
    if (!isLeadContact) {
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
      setConvertedClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, phone } : c))
      );
      setUnconvertedClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, phone } : c))
      );
      cancelEdit();
      showToast("Contact updated for broadcast", "success");
    }
  };

  const deleteContact = async (id) => {
    const isLeadContact = String(id).startsWith("lead_");
    if (!isLeadContact) {
      try {
        await deleteBulkContacts([id]).catch(() => {});
      } catch (err) {
        console.error("Error deleting contact from db:", err);
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } else {
      setConvertedClients((prev) => prev.filter((c) => c.id !== id));
      setUnconvertedClients((prev) => prev.filter((c) => c.id !== id));
    }
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    if (editingId === id) cancelEdit();
    showToast("Contact removed", "info");
  };

  const deleteSelectedContacts = async () => {
    if (selectedIds.length === 0) return;
    const leadsIds = selectedIds.filter((id) => String(id).startsWith("lead_"));
    const bulkIds = selectedIds.filter((id) => !String(id).startsWith("lead_"));

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
        showToast("Selected template is awaiting Meta approval. Please choose an approved template to broadcast.", "warning");
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
              schedule_status: status,
              send_type: "send",
              send_date: new Date().toISOString(),
              template_id: templateId,
              mime_type: mimeType,
              media_url: uploadedMediaUrl,
              contact_id: contact.id && contact.id.length > 20 && !contact.id.startsWith("lead_") ? contact.id : null,
              contact_name: contact.name || null,
              contact_phone: contact.phone || null,
            }).catch(() => {});
            successCount++;
          } catch (err) {
            console.error(`Failed to send broadcast template to ${contact.phone}:`, err);
            failCount++;
          }
        }

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
            schedule_name: action === "recurring" ? `${scheduleName.trim()} [${frequency.toUpperCase()}]` : scheduleName.trim(),
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
            contact_id: contactObj.id && contactObj.id.length > 20 && !contactObj.id.startsWith("lead_") ? contactObj.id : null,
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
        triggerRecurringCron().then(() => loadSchedules()).catch(() => loadSchedules());
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

  return (
    <AdminLayout>
      <div className="flex flex-col w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Top Bar Banner / Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                  <Radio size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                      Broadcast Scheduler
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-200 dark:border-emerald-900">
                      WhatsApp Cloud API
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                    Schedule bulk template broadcasts & media messages to targeted customer lists
                  </p>
                </div>
              </div>

              {activeTab === "create" && (
                <button
                  type="button"
                  onClick={handleSubmitBroadcast}
                  disabled={isSubmitting || uploadingMedia}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {isSubmitting || uploadingMedia ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Processing Broadcast...</span>
                    </>
                  ) : action === "send" ? (
                    <>
                      <Send size={16} />
                      <span>Send Broadcast Now</span>
                    </>
                  ) : (
                    <>
                      <CalendarIcon size={16} />
                      <span>Schedule Broadcast</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("create")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "create"
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Plus size={14} />
                  Create Broadcast
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("template")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "template"
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <FileText size={14} />
                  Create Template
                  {pendingTemplates.length > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeTab === "template"
                          ? "bg-white/20 text-white"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                      }`}
                    >
                      {pendingTemplates.length} ⏳
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("manage")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "manage"
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Sliders size={14} />
                  Manage Campaigns & Schedules
                  {schedules.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === "manage" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"}`}>
                      {schedules.length}
                    </span>
                  )}
                </button>
              </div>

              {activeTab === "manage" && (
                <button
                  type="button"
                  onClick={handleRunRecurringCron}
                  disabled={runningCron}
                  className="flex items-center gap-2 px-3.5 py-2 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 cursor-pointer active:scale-95 transition-all"
                  title="Check and trigger recurring schedules due right now"
                >
                  <RefreshCw size={13} className={runningCron ? "animate-spin" : ""} />
                  <span>{runningCron ? "Running..." : "Trigger Cron Now"}</span>
                </button>
              )}
            </div>

            {activeTab === "create" ? (
              /* Grid Layout: 2 Columns on desktop */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT COLUMN: Controls & Audience (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">

                  {/* SECTION 1: Campaign Configuration */}
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                        <Clock size={16} />
                      </div>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        1. Campaign & Schedule Settings
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                          Campaign / Schedule Name
                        </label>
                        <input
                          type="text"
                          value={scheduleName}
                          onChange={(e) => setScheduleName(e.target.value)}
                          placeholder="e.g. Diwali Special Promo"
                          className={inputCls}
                        />
                      </div>

                      <div className="relative">
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                          Schedule Type
                        </label>
                        <button
                          type="button"
                          onClick={() => setStatusOpen((v) => !v)}
                          className="w-full flex items-center justify-between border border-gray-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-900 transition-colors"
                        >
                          <span className="font-semibold text-xs">
                            {status === "onetime" ? "⚡ One-time Dispatch" : "🔄 Recurring Campaign"}
                          </span>
                          <ChevronDown size={14} className="text-gray-400" />
                        </button>
                        {statusOpen && (
                          <div className="absolute mt-1.5 w-full border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xl z-20 overflow-hidden py-1">
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
                                className="w-full text-left px-3.5 py-2 hover:bg-emerald-50/60 dark:hover:bg-slate-800 transition-colors"
                              >
                                <p className="text-xs font-bold text-gray-900 dark:text-white">{s.label}</p>
                                <p className="text-[10px] text-gray-500 dark:text-slate-400">{s.desc}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delivery Mode Toggle */}
                    <div className="pt-2">
                      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-2">
                        Dispatch Action
                      </label>
                      <div className={`grid gap-3 ${status === "recurring" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                        {status === "onetime" ? (
                          <>
                            {[
                              { key: "send", label: "Send Immediately", desc: "Dispatch template now", icon: Send },
                              { key: "schedule", label: "Schedule Later", desc: "Set future date & time", icon: CalendarIcon },
                            ].map((item) => {
                              const Icon = item.icon;
                              const isSelected = action === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => setAction(item.key)}
                                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                                      : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-955/40 hover:bg-gray-100 dark:hover:bg-slate-900"
                                  }`}
                                >
                                  <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-slate-800 text-gray-500 dark:text-slate-400"}`}>
                                    <Icon size={14} />
                                  </div>
                                  <div>
                                    <p className={`text-xs font-bold ${isSelected ? "text-emerald-900 dark:text-emerald-300" : "text-gray-800 dark:text-slate-200"}`}>
                                      {item.label}
                                    </p>
                                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                      {item.desc}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        ) : (
                          <>
                            {[
                              { key: "recurring", label: "Recurring Schedule", desc: "Repeat on active cadence", icon: Repeat },
                              { key: "send", label: "Send Immediately", desc: "Dispatch template now", icon: Send },
                              { key: "schedule", label: "Schedule Later", desc: "Set future date & time", icon: CalendarIcon },
                            ].map((item) => {
                              const Icon = item.icon;
                              const isSelected = action === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => setAction(item.key)}
                                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                                      : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-955/40 hover:bg-gray-100 dark:hover:bg-slate-900"
                                  }`}
                                >
                                  <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-slate-800 text-gray-500 dark:text-slate-400"}`}>
                                    <Icon size={14} />
                                  </div>
                                  <div>
                                    <p className={`text-xs font-bold ${isSelected ? "text-emerald-900 dark:text-emerald-300" : "text-gray-800 dark:text-slate-200"}`}>
                                      {item.label}
                                    </p>
                                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                      {item.desc}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </div>

                    {/* One-time Schedule Date & Time */}
                    {status === "onetime" && action === "schedule" && (
                      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Target Date</label>
                          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className={inputCls} />
                        </div>
                        <div className="w-full sm:w-64">
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Target Time</label>
                          <div className="flex gap-1.5">
                            <select value={hour} onChange={(e) => setHour(e.target.value)} className={inputCls}>
                              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <select value={minute} onChange={(e) => setMinute(e.target.value)} className={inputCls}>
                              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls}>
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Recurring Campaign Configuration: Frequency, Start Date/Time & End Date/Time */}
                    {status === "recurring" && action === "recurring" && (
                      <div className="space-y-4 pt-3 border-t border-gray-100 dark:border-slate-800">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                            Frequency
                          </label>
                          <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            className={inputCls}
                          >
                            <option value="daily">🔄 Daily (Every 24 Hours)</option>
                            <option value="weekly">📅 Weekly (Every 7 Days)</option>
                            <option value="monthly">🗓️ Monthly (Every Month)</option>
                            <option value="hourly">⏱️ Hourly (Every Hour)</option>
                          </select>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                              Start Date
                            </label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                          <div className="w-full sm:w-64">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                              Start Time
                            </label>
                            <div className="flex gap-1.5">
                              <select value={startHour} onChange={(e) => setStartHour(e.target.value)} className={inputCls}>
                                {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <select value={startMinute} onChange={(e) => setStartMinute(e.target.value)} className={inputCls}>
                                {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <select value={startPeriod} onChange={(e) => setStartPeriod(e.target.value)} className={inputCls}>
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                              End Date
                            </label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                          <div className="w-full sm:w-64">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                              End Time
                            </label>
                            <div className="flex gap-1.5">
                              <select value={endHour} onChange={(e) => setEndHour(e.target.value)} className={inputCls}>
                                {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <select value={endMinute} onChange={(e) => setEndMinute(e.target.value)} className={inputCls}>
                                {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <select value={endPeriod} onChange={(e) => setEndPeriod(e.target.value)} className={inputCls}>
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECTION 2: Recipients & Audience */}
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                          <Users size={16} />
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                          2. Recipients & Audience ({selectedIds.length} Selected)
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const ids = currentModeContacts.map((c) => c.id);
                            setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
                          }}
                          className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <CheckSquare size={12} /> Select All
                        </button>
                        <span className="text-gray-300 dark:text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentIdSet = new Set(currentModeContacts.map((c) => c.id));
                            setSelectedIds((prev) => prev.filter((id) => !currentIdSet.has(id)));
                          }}
                          className="text-[11px] font-bold text-gray-500 dark:text-slate-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Square size={12} /> Clear
                        </button>
                        {selectedIds.length > 0 && (
                          <>
                            <span className="text-gray-300 dark:text-slate-700">|</span>
                            <button
                              type="button"
                              onClick={deleteSelectedContacts}
                              className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                              title="Remove selected contacts from audience"
                            >
                              <Trash2 size={12} /> Delete Selected ({selectedIds.length})
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Recipient Entry Mode Toggle */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                      {[
                        { id: "manual", label: "Single Contact Input", icon: UserPlus },
                        { id: "csv", label: "CSV Import / Bulk Upload", icon: FileSpreadsheet },
                        {
                          id: "converted",
                          label: "Converted Clients",
                          icon: CheckCircle2,
                          count: convertedClients.length,
                          color: "emerald",
                        },
                        {
                          id: "unconverted",
                          label: "Unconverted Clients",
                          icon: Clock,
                          count: unconvertedClients.length,
                          color: "amber",
                        },
                      ].map((m) => {
                        const Icon = m.icon;
                        const active = recipientMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setRecipientMode(m.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              active
                                ? m.id === "converted"
                                  ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs"
                                  : m.id === "unconverted"
                                  ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-xs"
                                  : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs"
                                : "bg-gray-50 dark:bg-slate-955 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent"
                            }`}
                          >
                            <Icon size={13} />
                            <span>{m.label}</span>
                            {typeof m.count === "number" && (
                              <span
                                className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  active
                                    ? m.id === "converted"
                                      ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                                      : "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                                    : "bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
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
                      <div className="flex flex-col sm:flex-row gap-2.5">
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
                        <button
                          type="button"
                          onClick={addContact}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <UserPlus size={14} />
                          Add Contact
                        </button>
                      </div>
                    )}

                    {/* Mode 2: CSV Import / Sample Download */}
                    {recipientMode === "csv" && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 p-3.5 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 dark:text-slate-200">
                            Bulk Contact CSV Upload
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                            Upload CSV containing &quot;Name&quot; and &quot;Phone&quot; columns
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={handleDownloadSample}
                            className="flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-100 cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Download size={12} /> Sample
                          </button>
                          <label className="flex-1 sm:flex-initial px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer flex items-center justify-center gap-1 shadow-xs">
                            <UploadCloud size={13} /> Import CSV
                            <input
                              type="file"
                              accept=".csv"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Mode 3: Converted Clients Direct Selection */}
                    {recipientMode === "converted" && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30">
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                            <CheckCircle2 size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-gray-900 dark:text-white">
                                Converted Clients ({convertedClients.length})
                              </p>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200">
                                {convertedClients.filter((c) => selectedIds.includes(c.id)).length} Selected
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                              Clients with confirmed orders, quotations, and active converted status from Leads System.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const ids = convertedClients.map((c) => c.id);
                              setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
                            }}
                            className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer flex items-center gap-1 shadow-xs transition-all"
                          >
                            <CheckSquare size={13} />
                            Select All Converted ({convertedClients.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const idSet = new Set(convertedClients.map((c) => c.id));
                              setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
                            }}
                            className="px-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-100 cursor-pointer flex items-center gap-1"
                          >
                            <Square size={12} />
                            Deselect
                          </button>
                          {convertedClients.some((c) => selectedIds.includes(c.id)) && (
                            <button
                              type="button"
                              onClick={() => {
                                const selectedConv = convertedClients.filter((c) => selectedIds.includes(c.id)).map((c) => c.id);
                                setConvertedClients((prev) => prev.filter((c) => !selectedConv.includes(c.id)));
                                setSelectedIds((prev) => prev.filter((id) => !selectedConv.includes(id)));
                                showToast(`Removed ${selectedConv.length} converted client(s)`, "info");
                              }}
                              className="px-3 py-1.5 text-xs font-bold border border-red-200 dark:border-red-900/60 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer flex items-center gap-1 transition-all"
                            >
                              <Trash2 size={12} />
                              Delete Selected
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mode 4: Unconverted Clients Direct Selection */}
                    {recipientMode === "unconverted" && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30">
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                            <Clock size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-gray-900 dark:text-white">
                                Unconverted Clients ({unconvertedClients.length})
                              </p>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200">
                                {unconvertedClients.filter((c) => selectedIds.includes(c.id)).length} Selected
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                              Prospects with open inquiries, pending follow-ups, or proposals from Leads System.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const ids = unconvertedClients.map((c) => c.id);
                              setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
                            }}
                            className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer flex items-center gap-1 shadow-xs transition-all"
                          >
                            <CheckSquare size={13} />
                            Select All Unconverted ({unconvertedClients.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const idSet = new Set(unconvertedClients.map((c) => c.id));
                              setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
                            }}
                            className="px-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-100 cursor-pointer flex items-center gap-1"
                          >
                            <Square size={12} />
                            Deselect
                          </button>
                          {unconvertedClients.some((c) => selectedIds.includes(c.id)) && (
                            <button
                              type="button"
                              onClick={() => {
                                const selectedUnconv = unconvertedClients.filter((c) => selectedIds.includes(c.id)).map((c) => c.id);
                                setUnconvertedClients((prev) => prev.filter((c) => !selectedUnconv.includes(c.id)));
                                setSelectedIds((prev) => prev.filter((id) => !selectedUnconv.includes(id)));
                                showToast(`Removed ${selectedUnconv.length} unconverted client(s)`, "info");
                              }}
                              className="px-3 py-1.5 text-xs font-bold border border-red-200 dark:border-red-900/60 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer flex items-center gap-1 transition-all"
                            >
                              <Trash2 size={12} />
                              Delete Selected
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Search & Contacts Selector Table */}
                    <div className="space-y-2 pt-1">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={`Search ${recipientMode === "converted" ? "converted clients" : recipientMode === "unconverted" ? "unconverted clients" : "contacts"} by name, company, or phone...`}
                          className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-800 rounded-xl text-xs bg-gray-50 dark:bg-slate-955 text-gray-900 dark:text-white focus:outline-hidden"
                        />
                      </div>

                      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800/60">
                        {leadsLoading && (recipientMode === "converted" || recipientMode === "unconverted") ? (
                          <div className="p-4 flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Loading client contacts from Leads System...</span>
                          </div>
                        ) : filteredContacts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            {recipientMode === "converted"
                              ? "No converted client contacts found in Leads System."
                              : recipientMode === "unconverted"
                              ? "No unconverted client contacts found in Leads System."
                              : "No contacts available. Add contacts above or import a CSV."}
                          </div>
                        ) : (
                          filteredContacts.map((contact) => {
                            const isChecked = selectedIds.includes(contact.id);
                            const isEditing = editingId === contact.id;

                            return (
                              <div
                                key={contact.id}
                                className={`flex items-center justify-between px-3.5 py-2.5 transition-colors text-xs ${
                                  isChecked
                                    ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                                    : "hover:bg-gray-50 dark:hover:bg-slate-855/40"
                                }`}
                              >
                                {isEditing ? (
                                  <div className="flex items-center gap-2 flex-1 mr-2">
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className={`py-1 px-2 text-xs ${inputCls}`}
                                      placeholder="Name"
                                    />
                                    <input
                                      type="text"
                                      value={editPhone}
                                      onChange={(e) => setEditPhone(e.target.value)}
                                      className={`py-1 px-2 text-xs ${inputCls}`}
                                      placeholder="Phone"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => saveEdit(contact.id)}
                                      className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 shrink-0 cursor-pointer"
                                      title="Save"
                                    >
                                      <CheckCheck size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="p-1 rounded bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-300 shrink-0 cursor-pointer"
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
                                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      <div
                                        className={`h-7 w-7 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 ${
                                          contact.isLead
                                            ? contact.isConverted
                                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                                              : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                                            : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                                        }`}
                                      >
                                        {getInitials(contact.name || contact.companyName)}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <p className="font-bold text-gray-800 dark:text-slate-200 truncate">
                                            {contact.name || "Unnamed Contact"}
                                          </p>
                                          {contact.isLead && (
                                            <span
                                              className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                                contact.isConverted
                                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900"
                                                  : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900"
                                              }`}
                                            >
                                              {contact.isConverted ? "Converted" : "Unconverted"}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-slate-400 font-mono">
                                          <span>{contact.phone}</span>
                                          {contact.companyName && contact.companyName !== contact.name && (
                                            <span className="text-gray-400 dark:text-slate-500 font-sans truncate">
                                              • {contact.companyName}
                                            </span>
                                          )}
                                          {contact.city && (
                                            <span className="text-gray-400 dark:text-slate-500 font-sans">
                                              • {contact.city}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </label>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => startEdit(contact)}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                        title="Edit Contact"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteContact(contact.id)}
                                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
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

                {/* RIGHT COLUMN: WhatsApp Live Preview (5 Cols) */}
                <div className="lg:col-span-5 space-y-6">

                  {/* Attachment Controls */}
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                          <FileStack size={16} />
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                          3. Template & Header Media
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncTemplates}
                        disabled={syncingTemplates}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Sync latest templates from Meta"
                      >
                        <RefreshCw size={12} className={syncingTemplates ? "animate-spin" : ""} />
                        <span>{syncingTemplates ? "Syncing..." : "Sync Meta"}</span>
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                          Select Approved Message Template
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab("template")}
                            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Plus size={12} />
                            <span>Create Template</span>
                          </button>
                          {selectedTemplate && (
                            isPendingSelected ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                                <Clock size={10} className="animate-spin text-amber-600" />
                                Pending Meta Review
                              </span>
                            ) : ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Media Active: {selectedTemplate.header_type}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                                💬 Text Only Template
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      <select
                        value={templateId}
                        onChange={(e) => {
                          setTemplateId(e.target.value);
                          if (e.target.value) setPendingTemplateId("");
                        }}
                        className={inputCls}
                      >
                        <option value="">-- Choose WhatsApp Template --</option>
                        {["UTILITY", "MARKETING", "AUTHENTICATION"].map((cat) => {
                          const group = templates.filter((t) => t.category === cat);
                          if (!group.length) return null;
                          return (
                            <optgroup key={cat} label={`── ${cat} TEMPLATES ──`}>
                              {group.map((t) => {
                                let mediaTag = " 💬 [Text]";
                                if (t.header_type === "IMAGE") mediaTag = " 🖼️ [IMAGE]";
                                else if (t.header_type === "VIDEO") mediaTag = " 🎥 [VIDEO]";
                                else if (t.header_type === "DOCUMENT") mediaTag = " 📄 [DOCUMENT]";

                                return (
                                  <option key={t.id} value={t.id}>
                                    {t.element_name} ({t.language || "en"}){mediaTag}
                                  </option>
                                );
                              })}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>

                    {/* Messages Pending for Approval Dropdown */}
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <Clock size={12} className="text-amber-500 animate-pulse" />
                          <span>Messages Pending for Approval</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            {pendingTemplates.length}
                          </span>
                        </label>
                        {pendingTemplates.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSyncTemplates}
                            disabled={syncingTemplates}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
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
                        className="w-full rounded-xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all cursor-pointer"
                      >
                        <option value="">
                          {pendingTemplates.length > 0
                            ? `-- Select Pending Template (${pendingTemplates.length} awaiting review) --`
                            : "-- No Templates Pending Approval --"}
                        </option>
                        {pendingTemplates.map((pt) => {
                          let mediaTag = " 💬 [Text]";
                          if (pt.header_type === "IMAGE") mediaTag = " 🖼️ [IMAGE]";
                          else if (pt.header_type === "VIDEO") mediaTag = " 🎥 [VIDEO]";
                          else if (pt.header_type === "DOCUMENT") mediaTag = " 📄 [DOCUMENT]";

                          return (
                            <option key={pt.id} value={pt.id}>
                              ⏳ {pt.element_name} ({pt.category} - {pt.language || "en"}){mediaTag} [PENDING REVIEW]
                            </option>
                          );
                        })}
                      </select>

                      {isPendingSelected && (
                        <div className="mt-2 p-2.5 rounded-xl border border-amber-300/70 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2 animate-fade-in">
                          <Info size={14} className="shrink-0 text-amber-600 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[11px]">
                              &quot;{selectedTemplate.element_name}&quot; is awaiting Meta review
                            </p>
                            <p className="text-[10.5px] text-amber-700 dark:text-amber-400/90 mt-0.5">
                              Outbound preview is active on the right. Once Meta approves this template, select it in the approved dropdown above to broadcast.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Header Media Attachment — shows required badge when template needs media */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                          Header Media Sample
                        </label>
                        {selectedTemplate && ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Required — {selectedTemplate.header_type}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500">
                            Optional
                          </span>
                        )}
                      </div>
                      {!attachment ? (
                        <div className="flex gap-2">
                          <label className="flex-1 flex items-center justify-center gap-2 p-2.5 border border-dashed border-gray-300 dark:border-slate-800 hover:border-emerald-500 rounded-xl bg-gray-50/50 dark:bg-slate-955 text-xs text-gray-600 dark:text-slate-400 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-900 transition-colors">
                            <ImageIcon size={14} className="text-emerald-600" />
                            <span>Attach Image</span>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                          </label>
                          <label className="flex-1 flex items-center justify-center gap-2 p-2.5 border border-dashed border-gray-300 dark:border-slate-800 hover:border-emerald-500 rounded-xl bg-gray-50/50 dark:bg-slate-955 text-xs text-gray-600 dark:text-slate-400 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-900 transition-colors">
                            <FileText size={14} className="text-red-500" />
                            <span>Attach PDF</span>
                            <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                          </label>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-955 overflow-hidden">
                          {attachment.type === "image" && (
                            <img src={attachment.url} alt="attached sample" className="w-full h-28 object-cover border-b border-gray-200 dark:border-slate-800" />
                          )}
                          {attachment.type === "video" && (
                            <video src={attachment.url} className="w-full h-28 object-cover border-b border-gray-200 dark:border-slate-800" />
                          )}
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {attachment.type === "image" ? (
                                <ImageIcon size={13} className="text-emerald-600 shrink-0" />
                              ) : (
                                <FileText size={13} className="text-red-500 shrink-0" />
                              )}
                              <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-300 truncate">
                                {attachment.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={removeAttachment}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live WhatsApp Preview Box */}
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-emerald-600" />
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                          WhatsApp Live Preview
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPendingSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                            <Clock size={10} className="animate-spin text-amber-600" />
                            Pending Meta Review
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                          Outbound Preview
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 min-h-[260px] border border-gray-200 dark:border-slate-800 bg-[#efeae2] dark:bg-[#0b141a] flex flex-col justify-end relative overflow-hidden transition-colors">
                      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] dark:bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

                      {!selectedTemplate && !attachment ? (
                        <div className="flex flex-col items-center justify-center my-auto text-center p-4 text-gray-400 dark:text-slate-600">
                          <Info size={28} className="mb-1.5 opacity-50" />
                          <p className="text-xs font-semibold">Select a template above to generate live WhatsApp preview</p>
                        </div>
                      ) : (
                        <div className="relative max-w-[88%] bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-xs shadow-md text-xs text-gray-800 dark:text-slate-100 overflow-hidden border border-gray-100 dark:border-slate-800/80 my-2 self-start animate-fade-in">
                          {isPendingSelected && (
                            <div className="bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-3 py-1.5 text-[10px] font-bold border-b border-amber-200 dark:border-amber-900/60 flex items-center gap-1.5">
                              <Clock size={11} className="shrink-0 text-amber-600 animate-spin" />
                              <span>Meta Approval Pending — Preview Only</span>
                            </div>
                          )}

                          {attachment?.type === "image" && (
                            <img src={attachment.url} alt="header image" className="w-full max-h-52 object-cover" />
                          )}
                          {attachment?.type === "pdf" && (
                            <div className="flex items-center gap-3 bg-gray-100 dark:bg-slate-800/90 px-3.5 py-3 border-b border-gray-200/60 dark:border-slate-700/60">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/90 text-white">
                                <FileText size={16} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-gray-800 dark:text-slate-200">{attachment.name}</p>
                                <p className="text-[10px] text-gray-400 dark:text-slate-500">PDF · Tap to open</p>
                              </div>
                            </div>
                          )}

                          {!attachment && selectedTemplate && ["IMAGE", "VIDEO", "DOCUMENT"].includes(selectedTemplate.header_type) && (
                            <div className="flex flex-col items-center justify-center gap-1.5 bg-gray-100/80 dark:bg-slate-800/60 px-3.5 py-5 border-b border-gray-200/60 dark:border-slate-700/60">
                              {selectedTemplate.header_type === "IMAGE" && <ImageIcon size={24} className="text-gray-400" />}
                              {selectedTemplate.header_type === "VIDEO" && <ChevronDown size={24} className="text-gray-400" />}
                              {selectedTemplate.header_type === "DOCUMENT" && <FileText size={24} className="text-gray-400" />}
                              <p className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold">
                                {selectedTemplate.header_type} header — attach file above
                              </p>
                            </div>
                          )}

                          {selectedTemplate && (
                            <div className="px-3.5 py-3 space-y-1.5">
                              {selectedTemplate.header_type === "TEXT" && selectedTemplate.header_text && (
                                <p className="font-black text-gray-900 dark:text-white text-xs leading-snug">
                                  {selectedTemplate.header_text}
                                </p>
                              )}
                              <p className="whitespace-pre-line text-gray-800 dark:text-slate-200 leading-relaxed text-[12.5px]">
                                {selectedTemplate.body_text}
                              </p>
                              {selectedTemplate.footer_text && (
                                <p className="text-[10px] text-gray-400 dark:text-slate-400 pt-0.5">
                                  {selectedTemplate.footer_text}
                                </p>
                              )}
                              <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 dark:text-slate-500 pt-1">
                                <span>10:30 AM</span>
                                <CheckCheck size={13} className="text-emerald-500" />
                              </div>
                            </div>
                          )}

                          {selectedTemplate?.buttons?.length > 0 && (
                            <div className="border-t border-gray-200/60 dark:border-slate-700/60 divide-y divide-gray-200/40 dark:divide-slate-700/40">
                              {selectedTemplate.buttons.map((btn, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-sky-600 dark:text-sky-400"
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
              <div className="space-y-6">
                {/* Search & Filter Controls Header */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                    {[
                      { id: "all", label: "All Campaigns" },
                      { id: "active", label: "▶️ Active (Running)" },
                      { id: "paused", label: "⏸️ Paused" },
                      { id: "completed", label: "✅ Completed" },
                    ].map((f) => {
                      const count = f.id === "all" ? schedules.length : schedules.filter((s) => (s.status || "active") === f.id).length;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setScheduleFilter(f.id)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                            scheduleFilter === f.id
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {f.label} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={scheduleSearch}
                      onChange={(e) => setScheduleSearch(e.target.value)}
                      placeholder="Search campaigns..."
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-200 dark:border-slate-800 rounded-xl text-xs bg-gray-50 dark:bg-slate-955 text-gray-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Schedules Cards Grid */}
                {schedulesLoading ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl">
                    <Loader2 size={24} className="animate-spin text-emerald-600 mb-2" />
                    <p className="text-xs font-semibold text-gray-500">Loading campaign schedules...</p>
                  </div>
                ) : (() => {
                  const filtered = schedules.filter((s) => {
                    const statusMatch = scheduleFilter === "all" || (s.status || "active") === scheduleFilter;
                    const searchMatch = !scheduleSearch || 
                      (s.schedule_name || "").toLowerCase().includes(scheduleSearch.toLowerCase()) ||
                      (s.whatsapp_templates?.element_name || "").toLowerCase().includes(scheduleSearch.toLowerCase()) ||
                      (s.whatsapp_bulk_contacts?.display_name || s.whatsapp_bulk_contacts?.name || "").toLowerCase().includes(scheduleSearch.toLowerCase()) ||
                      (s.whatsapp_bulk_contacts?.raw_phone_number || s.whatsapp_bulk_contacts?.phone_number || s.whatsapp_bulk_contacts?.phone || "").includes(scheduleSearch);
                    return statusMatch && searchMatch;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl text-center">
                        <Info size={32} className="text-gray-400 mb-2" />
                        <h3 className="text-sm font-bold text-gray-800 dark:text-slate-200">No campaign schedules found</h3>
                        <p className="text-xs text-gray-500 max-w-sm mt-1 mb-4">
                          {scheduleSearch || scheduleFilter !== "all" 
                            ? "Try clearing your search filters" 
                            : "Create your first recurring or scheduled broadcast campaign to manage it here"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab("create")}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          + Create New Campaign
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* DESKTOP TABLE VIEW (md: and above) */}
                      <div className="hidden md:block bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50/80 dark:bg-slate-955 border-b border-gray-200 dark:border-slate-800 text-[11px] font-black uppercase text-gray-500 dark:text-slate-400 tracking-wider">
                                <th className="py-3.5 px-4">Campaign & Template</th>
                                <th className="py-3.5 px-4">Recipient</th>
                                <th className="py-3.5 px-4">Next Scheduled Run</th>
                                <th className="py-3.5 px-4">Last Executed</th>
                                <th className="py-3.5 px-4">Status</th>
                                <th className="py-3.5 px-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800/80 text-xs">
                              {filtered.map((item) => {
                                const itemStatus = item.status || "active";
                                const isRecurring = item.schedule_status === "recurring" || item.send_type === "recurring";
                                const nextRunStr = item.next_run_at || item.send_date;
                                const contactName = item.whatsapp_bulk_contacts?.display_name || item.whatsapp_bulk_contacts?.name || "Recipient";
                                const contactPhone = item.whatsapp_bulk_contacts?.raw_phone_number || item.whatsapp_bulk_contacts?.phone_number || item.whatsapp_bulk_contacts?.phone || "";

                                return (
                                  <tr
                                    key={item.id}
                                    className="hover:bg-gray-50/80 dark:hover:bg-slate-850/50 transition-colors"
                                  >
                                    {/* Campaign & Template */}
                                    <td className="py-3.5 px-4 align-middle">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <span className="font-extrabold text-gray-900 dark:text-white text-xs">
                                          {item.schedule_name}
                                        </span>
                                        {isRecurring ? (
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                            🔄 {item.frequency || "Daily"}
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                            ⚡ One-time
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                        Template: <span className="font-semibold text-gray-700 dark:text-slate-300">{item.whatsapp_templates?.element_name || "Custom"}</span>
                                      </p>
                                    </td>

                                    {/* Recipient */}
                                    <td className="py-3.5 px-4 align-middle">
                                      <p className="font-bold text-gray-800 dark:text-slate-200 text-xs">
                                        {contactName}
                                      </p>
                                      <p className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
                                        {contactPhone}
                                      </p>
                                    </td>

                                    {/* Next Scheduled Run */}
                                    <td className="py-3.5 px-4 align-middle">
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                        {nextRunStr ? new Date(nextRunStr).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                                      </span>
                                    </td>

                                    {/* Last Executed */}
                                    <td className="py-3.5 px-4 align-middle text-gray-600 dark:text-slate-400 text-xs">
                                      {item.last_run_at ? new Date(item.last_run_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "Never"}
                                    </td>

                                    {/* Status */}
                                    <td className="py-3.5 px-4 align-middle">
                                      {itemStatus === "active" && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase border border-emerald-200 dark:border-emerald-800">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                          Active
                                        </span>
                                      )}
                                      {itemStatus === "paused" && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase border border-amber-200 dark:border-amber-800">
                                          <Pause size={10} />
                                          Paused
                                        </span>
                                      )}
                                      {itemStatus === "completed" && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-[10px] font-black uppercase border border-gray-200 dark:border-slate-700">
                                          Completed
                                        </span>
                                      )}
                                    </td>

                                    {/* Actions */}
                                    <td className="py-3.5 px-4 align-middle text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        {/* Edit Trigger Button */}
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditModal(item)}
                                          className="p-1.5 rounded-xl text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                                          title="Edit Trigger & Schedule"
                                        >
                                          <Pencil size={15} />
                                        </button>

                                        {itemStatus !== "completed" ? (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleScheduleStatus(item)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                              itemStatus === "active"
                                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                                                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                                            }`}
                                          >
                                            {itemStatus === "active" ? (
                                              <>
                                                <Pause size={13} />
                                                <span>Pause ⏸️</span>
                                              </>
                                            ) : (
                                              <>
                                                <Play size={13} />
                                                <span>Resume ▶️</span>
                                              </>
                                            )}
                                          </button>
                                        ) : (
                                          <span className="text-[10px] text-gray-400 font-medium mr-2">Finished</span>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSchedule(item.id)}
                                          className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                                          title="Delete Schedule"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* MOBILE / TABLET CARDS VIEW (block md:hidden) */}
                      <div className="block md:hidden space-y-4">
                        {filtered.map((item) => {
                          const itemStatus = item.status || "active";
                          const isRecurring = item.schedule_status === "recurring" || item.send_type === "recurring";
                          const nextRunStr = item.next_run_at || item.send_date;
                          const contactName = item.whatsapp_bulk_contacts?.display_name || item.whatsapp_bulk_contacts?.name || "Recipient";
                          const contactPhone = item.whatsapp_bulk_contacts?.raw_phone_number || item.whatsapp_bulk_contacts?.phone_number || item.whatsapp_bulk_contacts?.phone || "";

                          return (
                            <div
                              key={item.id}
                              className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 hover:border-emerald-500/40 transition-all flex flex-col justify-between"
                            >
                              <div className="space-y-3">
                                {/* Header & Status */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <h3 className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
                                        {item.schedule_name}
                                      </h3>
                                      {isRecurring ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                          🔄 {item.frequency || "Daily"}
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                          ⚡ One-time
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
                                      Template: <span className="font-bold text-gray-800 dark:text-slate-200">{item.whatsapp_templates?.element_name || "Custom"}</span>
                                    </p>
                                  </div>

                                  {/* Status Pill */}
                                  <div className="shrink-0">
                                    {itemStatus === "active" && (
                                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Active
                                      </span>
                                    )}
                                    {itemStatus === "paused" && (
                                      <span className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                                        <Pause size={10} />
                                        Paused
                                      </span>
                                    )}
                                    {itemStatus === "completed" && (
                                      <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-[10px] font-black uppercase border border-gray-200 dark:border-slate-700">
                                        Completed
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Recipient Details */}
                                <div className="bg-gray-50 dark:bg-slate-955 rounded-xl p-3 text-xs">
                                  <div className="flex items-center justify-between text-gray-700 dark:text-slate-300">
                                    <span className="font-bold">{contactName}</span>
                                    <span className="font-mono text-gray-500">{contactPhone}</span>
                                  </div>
                                </div>

                                {/* Schedule Timings */}
                                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 dark:text-slate-400">
                                  <div>
                                    <span className="block text-[10px] uppercase font-bold text-gray-400">Next Scheduled Run</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                      {nextRunStr ? new Date(nextRunStr).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] uppercase font-bold text-gray-400">Last Executed</span>
                                    <span className="font-semibold text-gray-700 dark:text-slate-300">
                                      {item.last_run_at ? new Date(item.last_run_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "Never"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Controls */}
                              <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                {/* Dynamic Pause / Play Toggle Button */}
                                {itemStatus !== "completed" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleScheduleStatus(item)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                      itemStatus === "active"
                                        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                                        : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                                    }`}
                                  >
                                    {itemStatus === "active" ? (
                                      <>
                                        <Pause size={13} />
                                        <span>Pause ⏸️</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play size={13} />
                                        <span>Resume ▶️</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-gray-400 font-medium">Finished</span>
                                )}

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSchedule(item.id)}
                                  className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                                  title="Delete Schedule"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* EDIT CAMPAIGN TRIGGER MODAL */}
      {editModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-xl w-full space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    Edit Broadcast Trigger & Schedule
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                    Update future dispatch date, time, or frequency
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content */}
            <div className="space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-extrabold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Schedule Name
                </label>
                <input
                  type="text"
                  value={editScheduleName}
                  onChange={(e) => setEditScheduleName(e.target.value)}
                  className={inputCls}
                  placeholder="Campaign schedule title"
                />
              </div>

              {/* Schedule Type Selection */}
              <div>
                <label className="block text-xs font-extrabold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Schedule Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditSendType("schedule")}
                    className={`p-3 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      editSendType === "schedule"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs"
                        : "bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300"
                    }`}
                  >
                    <CalendarIcon size={14} />
                    <span>One-time Scheduled</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditSendType("recurring")}
                    className={`p-3 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      editSendType === "recurring"
                        ? "bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs"
                        : "bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300"
                    }`}
                  >
                    <Repeat size={14} />
                    <span>Recurring Schedule</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Schedule Fields */}
              {editSendType === "schedule" ? (
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-955 border border-gray-200 dark:border-slate-800 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        value={editScheduleDate}
                        onChange={(e) => setEditScheduleDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        Scheduled Time
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={editHour}
                          onChange={(e) => setEditHour(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="font-extrabold text-gray-400">:</span>
                        <select
                          value={editMinute}
                          onChange={(e) => setEditMinute(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {MINUTES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={editPeriod}
                          onChange={(e) => setEditPeriod(e.target.value)}
                          className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-extrabold text-gray-800 dark:text-slate-200"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-purple-50/40 dark:bg-purple-955/20 border border-purple-200/60 dark:border-purple-900/40 space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-200 mb-1">
                      Repeat Frequency
                    </label>
                    <select
                      value={editFrequency}
                      onChange={(e) => setEditFrequency(e.target.value)}
                      className={inputCls}
                    >
                      <option value="hourly">Hourly (Every 1 Hour)</option>
                      <option value="daily">Daily (Every 24 Hours)</option>
                      <option value="weekly">Weekly (Every 7 Days)</option>
                      <option value="monthly">Monthly (Every Month)</option>
                    </select>
                  </div>

                  {/* Start Date & Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        Start Time
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={editStartHour}
                          onChange={(e) => setEditStartHour(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="font-extrabold text-gray-400">:</span>
                        <select
                          value={editStartMinute}
                          onChange={(e) => setEditStartMinute(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {MINUTES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={editStartPeriod}
                          onChange={(e) => setEditStartPeriod(e.target.value)}
                          className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-extrabold text-gray-800 dark:text-slate-200"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* End Date & Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-400 mb-1">
                        End Time
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={editEndHour}
                          onChange={(e) => setEditEndHour(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="font-extrabold text-gray-400">:</span>
                        <select
                          value={editEndMinute}
                          onChange={(e) => setEditEndMinute(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-bold text-gray-800 dark:text-slate-200"
                        >
                          {MINUTES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={editEndPeriod}
                          onChange={(e) => setEditEndPeriod(e.target.value)}
                          className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-extrabold text-gray-800 dark:text-slate-200"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign Status */}
              <div>
                <label className="block text-xs font-extrabold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Campaign Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className={inputCls}
                >
                  <option value="active">Active (Scheduled to run)</option>
                  <option value="paused">Paused (Temporarily hold execution)</option>
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className={btnSecondaryCls}
                disabled={isUpdatingTrigger}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedSchedule}
                disabled={isUpdatingTrigger}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingTrigger ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Update Schedule & Trigger</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Contact Preview & Discrepancy Verification Modal */}
      <BulkContactPreviewModal
        isOpen={csvPreviewOpen}
        onClose={() => setCsvPreviewOpen(false)}
        fileName={csvFileName}
        parsedData={csvPreviewData}
        onConfirmImport={handleConfirmModalImport}
        isImporting={isImportingFromModal}
      />
    </AdminLayout>
  );
}

