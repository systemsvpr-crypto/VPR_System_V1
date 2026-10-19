"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import AdminLayout from "../../components/layout/ChecklistLayout";
import supabase from "../../SupabaseClient";
import { isAdministrator, isAdminOrSuperAdmin, getUserAllowedDepartments } from "../../utils/roleUtils";
import {
  Search,
  Upload,
  CheckCircle2,
  X,
  History,
  ArrowLeft,
  Edit,
  Save,
  Loader2,
  Camera,
  Users,
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  ExternalLink,
} from "lucide-react";
import TaskManagementTabs from "../../components/TaskManagementTabs";
import { customDropdownDetails } from "../../redux/slice/settingSlice";
import { updateRepairData } from "../../redux/api/repairApi";
import {
  sendTaskExtensionNotification,
  sendUrgentTaskNotification,
} from "../../services/whatsappService";
import AudioPlayer from "../../components/AudioPlayer";
import { getImageLocationMeta, compressImageFile } from "../../utils/imageLocation";
import { bakeLocationWatermark } from "../../utils/bakeLocationWatermark";
import PhotoLocationOverlay from "../../components/PhotoLocationOverlay";
import { useMagicToast } from "../../context/MagicToastContext";
import RenderDescription from "../../components/RenderDescription";
import LocationPermissionModal from "../../components/LocationPermissionModal";
import WebCameraModal from "../../components/WebCameraModal";
import { usePagePermission, READ_ONLY_TOOLTIP } from "../../utils/pagePermissionUtils";
import ReadOnlyBanner from "../../components/ReadOnlyBanner";

const getFilePreviewUrl = (file) => {
  if (!file) return null;
  if (typeof file === "string") return file;
  if (!file._previewUrl) {
    file._previewUrl = URL.createObjectURL(file);
  }
  return file._previewUrl;
};

const isAudioUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("http") &&
    (url.includes("audio-recordings") ||
      url.includes("voice-notes") ||
      url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i))
  );
};

const getFileType = (url) => {
  if (!url) return "image";
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  if (cleanUrl.endsWith(".pdf")) return "pdf";
  const excelExtensions = [".xls", ".xlsx", ".csv", ".xlsm", ".xlsb", ".ods"];
  if (excelExtensions.some((ext) => cleanUrl.endsWith(ext))) return "excel";
  const wordExtensions = [".doc", ".docx", ".odt", ".rtf", ".txt"];
  if (wordExtensions.some((ext) => cleanUrl.endsWith(ext))) return "word";
  const imageExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".bmp",
    ".ico",
    ".tiff",
    ".tif",
  ];
  if (imageExtensions.some((ext) => cleanUrl.endsWith(ext))) return "image";
  return "document";
};

const AllTasks = () => {
  const dispatch = useDispatch();
  const { isReadOnly, canWrite } = usePagePermission("checklist_task");
  const { customDropdowns = [] } = useSelector((state) => state.setting || {});
  const { showToast } = useMagicToast();
  // Active tab state
  const [activeTab, setActiveTab] = useState("checklist"); // checklist, maintenance, repair, ea
  const [showHistory, setShowHistory] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [cameraModal, setCameraModal] = useState({ open: false, taskId: null });

  // Data states
  const [tasks, setTasks] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [uploadedImages, setUploadedImages] = useState({});
  const [imageLocationData, setImageLocationData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [remarksData, setRemarksData] = useState({});
  const [statusData, setStatusData] = useState({});
  const [extendedDateData, setExtendedDateData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFilter, setDateFilter] = useState("all"); // all, today, overdue, upcoming
  const [userFilter, setUserFilter] = useState("all");
  const [givenByFilter, setGivenByFilter] = useState("all");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState({
    dateFilter: false,
    userFilter: false,
    givenByFilter: false,
  });

  // Restore draft form state if mobile browser reloads tab
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("alltasks_draft");
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.selectedItems && Array.isArray(draft.selectedItems)) {
          setSelectedItems(new Set(draft.selectedItems));
        }
        if (draft.remarksData) setRemarksData(draft.remarksData);
        sessionStorage.removeItem("alltasks_draft");
        showToast("Restored unsaved task entries from session.", "info");
      }
    } catch (e) {
      console.warn("Draft restore error:", e);
    }
  }, [showToast]);

  const saveDraftState = useCallback(() => {
    try {
      const draft = {
        selectedItems: Array.from(selectedItems),
        remarksData,
      };
      sessionStorage.setItem("alltasks_draft", JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [selectedItems, remarksData]);
  const [lightboxImage, setLightboxImage] = useState(null); // { url, name }
  // Repair Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUpdateTask, setSelectedUpdateTask] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    partReplaced: "",
    billAmount: "",
    status: "",
    remarks: "",
    workDone: "",
    vendorName: "",
    workPhoto: null,
    billCopy: null,
  });

  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Infinite Scroll Tracking
  const [visibleCount, setVisibleCount] = useState(50);
  const loadingRef = useRef(null);

  const statusDateColumn =
    activeTab === "repair" ? "created_at" : "planned_date";
  // Use planned_date for checklist/delegation sort — task_start_date is same for all occurrences of a recurring task
  const sortDateColumn = activeTab === "repair" ? "created_at" : "planned_date";
  const [holidaysList, setHolidaysList] = useState([]);
  const [, setWorkingDaysList] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Fetch holidays and users on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [holidaysRes, usersRes, workingDaysRes] = await Promise.all([
          supabase.from("holidays").select("holiday_date"),
          supabase
            .from("checklist_users")
            .select("user_name")
            .eq("status", "active")
            .order("user_name", { ascending: true }),
          supabase.from("working_day_calender").select("working_date"),
        ]);

        if (holidaysRes.data)
          setHolidaysList(holidaysRes.data.map((h) => h.holiday_date));
        if (usersRes.data) setAllUsers(usersRes.data.map((u) => u.user_name));
        if (workingDaysRes.data)
          setWorkingDaysList(workingDaysRes.data.map((w) => w.working_date));
      } catch (err) {
        console.error("Error fetching initial data:", err);
      }
    };
    fetchInitialData();
    dispatch(customDropdownDetails());
  }, [dispatch]);

  // Check user credentials
  useEffect(() => {
    const role = localStorage.getItem("role");
    const user = localStorage.getItem("user-name");

    setUserRole(role || "admin");
    setUsername(user || "Admin");
  }, []);

  // Format date to dd/mm/yyyy
  const formatDate = useCallback((dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }, []);

  const formatDateWithTime = useCallback((dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return dateString;
    }
  }, []);

  const formatTimeOnly = useCallback((dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      return `${hours}:${minutes} ${ampm}`;
    } catch {
      return "";
    }
  }, []);

  const getTimeStatus = useCallback((dateString, taskStatus, extendedDate) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const isExtended =
      taskStatus?.toLowerCase() === "extended" ||
      taskStatus?.toLowerCase() === "extend" ||
      Boolean(extendedDate);

    // Extended tasks should show as "Today" until the planned date passes
    if (isExtended) {
      if (taskDate < today) return "Overdue";
      return "Today"; // Treat both today and upcoming as "Today" for extended tasks
    }

    if (taskDate < today) return "Overdue";
    if (taskDate.getTime() === today.getTime()) return "Today";
    return "Upcoming";
  }, []);

  // EA tasks are one-off assignments, not recurring series, so future-dated
  // ones should still be selectable to let the doer/admin update or extend them.
  // Other tabs (checklist/delegation/maintenance) keep their recurring-series
  // restriction: only the current/overdue occurrence can be actioned.
  const isTaskSelectable = useCallback(
    (dateValue, status) => {
      if (["ea", "checklist", "delegation"].includes(activeTab)) return true;
      return getTimeStatus(dateValue, status) !== "Upcoming";
    },
    [activeTab, getTimeStatus],
  );

  // Fetch tasks based on active state (Pending or History)
  const fetchData = useCallback(async () => {
    if (!username) return;

    try {
      setIsLoading(true);
      setError(null);
      setTasks([]);
      setHistoryData([]);

      let tableName;
      let dateColumn;
      let completionField;
      let nameField = "name";
      let headers = [];

      switch (activeTab) {
        case "maintenance":
          tableName = "maintenance_tasks";
          dateColumn = "planned_date";
          completionField = "submission_date";
          if (showHistory) {
            headers = [
              { id: "time_status", label: "Time" },
              { id: "id", label: "ID" },
              { id: "task_description", label: "Description" },
              { id: "department", label: "Dept" },
              { id: "machine_name", label: "Machine" },
              { id: "part_name", label: "Part" },
              { id: "part_area", label: "Area" },
              { id: "planned_date", label: "Planned" },
              { id: "freq", label: "Freq" },
              { id: "require_attachment", label: "Attach" },
              { id: "submission_date", label: "Actual" },
              { id: "status", label: "Status" },
            ];
          } else {
            headers = [
              { id: "time_status", label: "Time" },
              { id: "id", label: "ID" },
              { id: "task_description", label: "Description" },
              { id: "department", label: "Dept" },
              { id: "machine_name", label: "Machine" },
              { id: "part_name", label: "Part" },
              { id: "part_area", label: "Area" },
              { id: "given_by", label: "Given By" },
              { id: "name", label: "Name" },
              { id: "planned_date", label: "Planned" },
              { id: "freq", label: "Freq" },
              { id: "enable_reminders", label: "Remind" },
              { id: "require_attachment", label: "Attach" },
              { id: "status", label: "Status" },
            ];
          }
          break;
        case "repair":
          tableName = "repair_tasks";
          dateColumn = "created_at";
          completionField = "status";
          nameField = "assigned_person";
          if (showHistory) {
            headers = [
              { id: "time_status", label: "Time Status" },
              { id: "id", label: "Task ID" },
              { id: "issue_description", label: "Issue Detail" },
              { id: "submission_date", label: "Submission Date" },
              { id: "filled_by", label: "Form Filled By" },
              { id: "assigned_person", label: "Assigned To" },
              { id: "machine_name", label: "Machine Name" },
              { id: "status", label: "Status" },
              { id: "attachment", label: "Attach" },
              { id: "part_replaced", label: "Part" },
              { id: "vendor_name", label: "Vendor" },
              { id: "bill_amount", label: "Amount" },
              { id: "duration", label: "Duration" },
            ];
          } else {
            headers = [
              { id: "action", label: "Action" },
              { id: "time_status", label: "Time" },
              { id: "id", label: "ID" },
              { id: "issue_description", label: "Detail" },
              { id: "filled_by", label: "Filled By" },
              { id: "assigned_person", label: "Assigned" },
              { id: "machine_name", label: "Machine" },
              { id: "status", label: "Status" },
              { id: "attachment", label: "Attach" },
              { id: "part_replaced", label: "Part" },
              { id: "vendor_name", label: "Vendor" },
              { id: "bill_amount", label: "Amount" },
              { id: "duration", label: "Duration" },
            ];
          }
          break;
        case "delegation":
          tableName = "delegation";
          dateColumn = "task_start_date";
          completionField = "submission_date";
          headers = [
            { id: "time_status", label: "Time" },
            { id: "id", label: "ID" },
            { id: "task_description", label: "Description" },
            { id: "department", label: "Dept" },
            { id: "given_by", label: "Given By" },
            { id: "name", label: "Name" },
            { id: "planned_date", label: "Planned" },
            { id: "frequency", label: "Freq" },
            { id: "enable_reminder", label: "Remind" },
            { id: "require_attachment", label: "Attach" },
            { id: "status", label: "Status" },
          ];
          break;
        case "checklist":
        default:
          tableName = "checklist";
          dateColumn = "task_start_date"; // task_start_date = original admin start date; used for lte filter in query
          completionField = "submission_date";
          headers = [
            { id: "time_status", label: "Time" },
            { id: "id", label: "ID" },
            { id: "task_description", label: "Description" },
            { id: "department", label: "Dept" },
            { id: "given_by", label: "Given By" },
            { id: "name", label: "Name" },
            { id: "submission_date", label: "Last Activity" },
            { id: "planned_date", label: "Planned" },
            { id: "frequency", label: "Freq" },
            { id: "enable_reminder", label: "Remind" },
            { id: "require_attachment", label: "Attach" },
            { id: "status", label: "Status" },
          ];
          break;
      }

      setTableHeaders(
        showHistory ? headers.filter((h) => h.id !== "time_status") : headers,
      );

      let query = supabase.from(tableName).select("*");

      const currentUsername = username || "";
      const currentUserRole = (userRole || "").toLowerCase();
      const isAdminUser = isAdminOrSuperAdmin(currentUserRole, currentUsername);
      const isHODUser = currentUserRole === "hod";
      const allowedDepartments = getUserAllowedDepartments({
        role: currentUserRole,
        username: currentUsername,
      });

      let reportingUsers = [];
      if (!isAdminUser) {
        if (isHODUser) {
          if (allowedDepartments && allowedDepartments.length > 0) {
            query = query.in("department", allowedDepartments);
          } else {
            reportingUsers = [currentUsername];
            const { data: reports } = await supabase
              .from("checklist_users")
              .select("user_name")
              .eq("reported_by", username);
            if (reports && reports.length > 0) {
              reportingUsers = [
                currentUsername,
                ...reports.map((r) => r.user_name || ""),
              ];
            }
            query = query.in(nameField, reportingUsers);
          }
        } else {
          // Standard User: strictly see only their own tasks
          reportingUsers = [currentUsername];
          query = query.in(nameField, reportingUsers);
        }
      }

      let allFetchedData = [];

      if (
        !showHistory &&
        (activeTab === "checklist" ||
          activeTab === "delegation" ||
          activeTab === "maintenance")
      ) {
        // Pre-filter: Don't fetch absurdly old records, keep UI fast and avoid freezing.
        // Today string for exact partition
        const todayStr = new Date().toISOString().split("T")[0];

        // Overdue window: past 90 days
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 90);

        // Upcoming window: next 3 months
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 3);

        let baseQueryOverdue = supabase.from(tableName).select("*");
        let baseQueryUpcoming = supabase.from(tableName).select("*");

        if (!isAdminUser) {
          if (isHODUser && allowedDepartments && allowedDepartments.length > 0) {
            // checklist/delegation/maintenance always have a department column
            baseQueryOverdue = baseQueryOverdue.in("department", allowedDepartments);
            baseQueryUpcoming = baseQueryUpcoming.in("department", allowedDepartments);
          } else {
            baseQueryOverdue = baseQueryOverdue.in(nameField, reportingUsers);
            baseQueryUpcoming = baseQueryUpcoming.in(nameField, reportingUsers);
          }
        }

        if (activeTab === "checklist" || activeTab === "delegation") {
          baseQueryOverdue = baseQueryOverdue.or(
            `${completionField}.is.null,status.eq.extend,status.eq.extended`,
          );
          baseQueryUpcoming = baseQueryUpcoming.or(
            `${completionField}.is.null,status.eq.extend,status.eq.extended`,
          );
        } else {
          baseQueryOverdue = baseQueryOverdue.is(completionField, null);
          baseQueryUpcoming = baseQueryUpcoming.is(completionField, null);
        }

        // 1. Most recent Overdue tasks (descending order so the latest overdue are prioritized)
        const overduePromise = baseQueryOverdue
          .gte("planned_date", pastDate.toISOString().split("T")[0] + "T00:00:00")
          .lt("planned_date", todayStr + "T00:00:00")
          .order("planned_date", { ascending: false })
          .limit(1000);

        // 2. Today and Upcoming tasks (ascending order so today and immediate upcoming are guaranteed)
        const upcomingPromise = baseQueryUpcoming
          .gte("planned_date", todayStr + "T00:00:00")
          .lte("planned_date", futureDate.toISOString().split("T")[0] + "T23:59:59")
          .order("planned_date", { ascending: true })
          .limit(1000);

        const [overdueRes, upcomingRes] = await Promise.all([
          overduePromise,
          upcomingPromise,
        ]);

        if (overdueRes.error) throw overdueRes.error;
        if (upcomingRes.error) throw upcomingRes.error;

        allFetchedData = [
          ...(overdueRes.data || []),
          ...(upcomingRes.data || []),
        ];
      } else {
        if (showHistory) {
          if (activeTab === "repair") {
            query = query
              .not("submission_date", "is", null)
              .order("submission_date", { ascending: false });
          } else {
            query = query
              .not(completionField, "is", null)
              .order(completionField, { ascending: false });
          }
        } else {
          if (activeTab === "repair") {
            query = query
              .is("submission_date", null)
              .order(dateColumn, { ascending: false });
          }
        }

        // Fetch
        const { data, error: fetchError } = await query.limit(10000);
        if (fetchError) throw fetchError;
        allFetchedData = data || [];
      }

      if (allFetchedData.length > 0) {
        // Filter out tasks that fall on holidays or non-working days (respect the updated calendar)
        const filteredData = allFetchedData.filter((item) => {
          if (activeTab === "repair") return true; // Repairs are reactive, ignore calendar

          const taskDate = (
            item.planned_date ||
            item.task_start_date ||
            item.created_at
          )?.split("T")[0];
          if (!taskDate) return true;

          const isHoliday = holidaysList.includes(taskDate);

          // Remove strict working day check to align with Dashboard and ensure
          // all assigned tasks are visible to doers.
          return !isHoliday;
        });

        const mappedData = filteredData.map((item) => ({
          ...item,
          id: item.id || item.task_id,
          _table: item._table || tableName,
          department: item.department || "-",
        }));

        if (showHistory) {
          setHistoryData(mappedData);
        } else {
          setTasks(mappedData);
        }
      } else {
        if (showHistory) {
          setHistoryData([]);
        } else {
          setTasks([]);
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [
    username,
    userRole,
    activeTab,
    showHistory,
    holidaysList,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtering Logic
  const filteredPendingTasks = useMemo(() => {
    // Multi-level sort: Priority Group (Overdue > Today > Upcoming) → Date
    const sortedTasks = [...tasks].sort((a, b) => {
      const statusA = getTimeStatus(a[statusDateColumn], a.status);
      const statusB = getTimeStatus(b[statusDateColumn], b.status);

      const rank = { Overdue: 0, Today: 1, Upcoming: 2 };
      const groupA = rank[statusA] !== undefined ? rank[statusA] : 3;
      const groupB = rank[statusB] !== undefined ? rank[statusB] : 3;

      if (groupA !== groupB) return groupA - groupB;

      // Same group, sort by date
      const dateA = a[sortDateColumn]
        ? new Date(a[sortDateColumn])
        : new Date(0);
      const dateB = b[sortDateColumn]
        ? new Date(b[sortDateColumn])
        : new Date(0);
      return dateA - dateB;
    });

    const seen = new Set();

    return sortedTasks.filter((task) => {
      const matchesSearch = searchTerm
        ? Object.values(task).some(
            (val) =>
              val &&
              val.toString().toLowerCase().includes(searchTerm.toLowerCase()),
          )
        : true;

      if (!matchesSearch) return false;

      // Filter by User
      if (userFilter !== "all") {
        const taskUser =
          task.name || task.assigned_person || task.doer_name || "";
        if (taskUser.toLowerCase() !== userFilter.toLowerCase()) return false;
      }

      // Filter by Given By
      if (givenByFilter !== "all") {
        const givenByUser = task.given_by || task.filled_by || "";
        if (givenByUser.toLowerCase() !== givenByFilter.toLowerCase()) return false;
      }

      const taskDateValue = task[statusDateColumn];
      const status = taskDateValue
        ? getTimeStatus(taskDateValue, task.status)
        : null;

      // Apply the dropdown date filter
      if (taskDateValue && status) {
        if (dateFilter === "all") {
          // Show all: overdue + today + upcoming
        } else if (dateFilter === "today") {
          if (status !== "Today") return false;
        } else if (dateFilter === "overdue") {
          if (status !== "Overdue") return false;
        } else if (dateFilter === "upcoming") {
          if (status !== "Upcoming") return false;
        }
      }

      // Smart deduplication for checklist, delegation, and maintenance tabs
      if (
        activeTab === "checklist" ||
        activeTab === "delegation" ||
        activeTab === "maintenance"
      ) {
        if (status === "Upcoming") {
          // UPCOMING: only show the NEXT (earliest) occurrence per task series
          const descKey = task.task_description || task.issue_description || "";
          const nameKey = task.name || task.assigned_person || "";
          const key = `upcoming::${descKey}::${nameKey}`;
          if (seen.has(key)) return false;
          seen.add(key);
        } else {
          // OVERDUE & TODAY: show each day individually
          const taskDate = taskDateValue
            ? new Date(taskDateValue).toDateString()
            : "";
          const descKey = task.task_description || task.issue_description || "";
          const nameKey = task.name || task.assigned_person || "";
          const key = `${descKey}::${nameKey}::${taskDate}`;
          if (seen.has(key)) return false;
          seen.add(key);
        }
      }

      return true;
    });
  }, [
    tasks,
    searchTerm,
    activeTab,
    dateFilter,
    userFilter,
    givenByFilter,
    sortDateColumn,
    statusDateColumn,
    getTimeStatus,
  ]);

  const filteredHistoryTasks = useMemo(() => {
    const completionField = "submission_date";

    return historyData.filter((task) => {
      const matchesSearch = searchTerm
        ? Object.values(task).some(
            (val) =>
              val &&
              val.toString().toLowerCase().includes(searchTerm.toLowerCase()),
          )
        : true;

      if (!matchesSearch) return false;

      // Filter by User
      if (userFilter !== "all") {
        const taskUser =
          task.name || task.assigned_person || task.doer_name || "";
        if (taskUser.toLowerCase() !== userFilter.toLowerCase()) return false;
      }

      // Filter by Given By
      if (givenByFilter !== "all") {
        const givenByUser = task.given_by || task.filled_by || "";
        if (givenByUser.toLowerCase() !== givenByFilter.toLowerCase()) return false;
      }

      let matchesDateRange = true;
      if (startDate || endDate) {
        const itemDate = task[completionField]
          ? new Date(task[completionField])
          : null;
        if (!itemDate) return false;

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) matchesDateRange = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) matchesDateRange = false;
        }
      }

      return matchesSearch && matchesDateRange;
    });
  }, [historyData, searchTerm, startDate, endDate, userFilter, givenByFilter]);

  const availableUsersForFilter = useMemo(() => {
    if (!allUsers || allUsers.length === 0) return [];
    const currentUserRole = (userRole || "").toLowerCase();
    const currentUsername = username || "";
    if (isAdminOrSuperAdmin(currentUserRole, currentUsername)) {
      return allUsers;
    }
    const allowedDepts = getUserAllowedDepartments({
      role: currentUserRole,
      username: currentUsername,
    });
    if (currentUserRole === "hod" && allowedDepts && allowedDepts.length > 0) {
      const userSet = new Set();
      tasks.forEach((t) => {
        const u = t.name || t.assigned_person || t.doer_name;
        if (u) userSet.add(u);
      });
      historyData.forEach((t) => {
        const u = t.name || t.assigned_person || t.doer_name;
        if (u) userSet.add(u);
      });
      userSet.add(currentUsername);
      const filtered = allUsers.filter((u) => userSet.has(u));
      return filtered.length > 0 ? filtered : allUsers;
    }
    return allUsers;
  }, [allUsers, userRole, username, tasks, historyData]);

  // Handle Selections
  const handleSelectItem = useCallback((id, isChecked) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
        setRemarksData((prevR) => {
          const n = { ...prevR };
          delete n[id];
          return n;
        });
        setUploadedImages((prevI) => {
          const n = { ...prevI };
          delete n[id];
          return n;
        });
        setStatusData((prevS) => {
          const n = { ...prevS };
          delete n[id];
          return n;
        });
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (e) => {
      if (e.target.checked) {
        // Use the same dateColumn logic as in the render loop
        const col = activeTab === "repair" ? "created_at" : "planned_date"; // Changed to planned_date for EA and others
        const submittableTasks = filteredPendingTasks.filter((t) =>
          isTaskSelectable(t[col], t.status),
        );
        setSelectedItems(new Set(submittableTasks.map((t) => t.id)));
      } else {
        setSelectedItems(new Set());
        setRemarksData({});
        setUploadedImages({});
        setStatusData({});
      }
    },
    [filteredPendingTasks, activeTab, isTaskSelectable],
  );

  const paginatedTasks = useMemo(() => {
    return (showHistory ? filteredHistoryTasks : filteredPendingTasks).slice(
      0,
      visibleCount,
    );
  }, [showHistory, filteredHistoryTasks, filteredPendingTasks, visibleCount]);

  const totalItemsRendered = paginatedTasks.length;
  const exactTotalAvailable = (
    showHistory ? filteredHistoryTasks : filteredPendingTasks
  ).length;

  // Intersection Observer for infinite scrolling inside AdminLayout
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          setVisibleCount((prev) => prev + 50);
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );

    const currentLoadingEl = loadingRef.current;
    if (currentLoadingEl) {
      observer.observe(currentLoadingEl);
    }

    return () => {
      if (currentLoadingEl) observer.unobserve(currentLoadingEl);
    };
  }, [isLoading, paginatedTasks.length]);

  // Reset visible count when filters or UI scope changes
  useEffect(() => {
    setVisibleCount(50);
  }, [activeTab, showHistory, searchTerm, dateFilter, startDate, endDate]);

  // Output pagination definitions successfully hoisted.

  // Pagination loader logic is directly in the return standard JSX now.

  // Lightbox Modal State for multi-image popup preview
  const [lightboxState, setLightboxState] = useState({
    isOpen: false,
    images: [],
    currentIndex: 0,
  });

  const openLightboxModal = useCallback((images, index = 0, locationMeta = null) => {
    let parsedLoc = locationMeta;
    if (typeof parsedLoc === "string") {
      try {
        parsedLoc = JSON.parse(parsedLoc);
      } catch {
        // ignore
      }
    }

    const formatted = (Array.isArray(images) ? images : [images])
      .map((img, i) => {
        if (!img) return null;
        let loc = null;
        if (Array.isArray(parsedLoc)) {
          loc = parsedLoc[i] || parsedLoc[0] || null;
        } else if (parsedLoc && typeof parsedLoc === "object") {
          loc = parsedLoc;
        }
        if (typeof img === "string") return { url: img, locationMeta: loc };
        if (img instanceof File)
          return { url: URL.createObjectURL(img), name: img.name, locationMeta: loc };
        if (img && typeof img === "object" && img.url) {
          return { ...img, locationMeta: loc || img.locationMeta || img.image_location_data || null };
        }
        return null;
      })
      .filter(Boolean);

    if (formatted.length > 0) {
      setLightboxState({
        isOpen: true,
        images: formatted,
        currentIndex: Math.min(index, formatted.length - 1),
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setLightboxState({ isOpen: false, images: [], currentIndex: 0 });
      }
    };
    if (lightboxState.isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxState.isOpen]);

  const [removedHistoryImages, setRemovedHistoryImages] = useState({});

  const handleRemoveHistoryImage = useCallback((taskId, urlToRemove) => {
    setRemovedHistoryImages((prev) => {
      const existing = prev[taskId] || [];
      return { ...prev, [taskId]: [...existing, urlToRemove] };
    });
  }, []);

  const getHistoryImageUrls = useCallback(
    (task) => {
      if (!task) return [];
      const removed = removedHistoryImages[task.id] || [];
      let urls = [];
      if (Array.isArray(task.image_urls) && task.image_urls.length > 0) {
        urls = task.image_urls.filter(Boolean);
      } else {
        const raw =
          task.image ||
          task.uploaded_image_url ||
          task.image_url ||
          task.work_photo_url;
        if (raw && typeof raw === "string") {
          if (raw.trim().startsWith("[")) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) urls = parsed.filter(Boolean);
            } catch {
              urls = [raw];
            }
          } else {
            urls = [raw];
          }
        }
      }
      return urls.filter((u) => !removed.includes(u));
    },
    [removedHistoryImages],
  );

  // File Upload with Mandatory Location Metadata
  const handleImageUpload = useCallback(
    async (id, e, sourceHint = "gallery") => {
      const rawFiles = Array.from(e.target.files || []);
      if (!rawFiles.length) return;

      showToast("File is uploading...", "info");

      try {
        const locationMetas = [];
        const processedFiles = [];
        for (let file of rawFiles) {
          if (file.type?.startsWith("image/")) {
            file = await compressImageFile(file, 1600);
          }
          const meta = await getImageLocationMeta(file, sourceHint);
          if (meta) {
            const metaWithBakedFlag = { ...meta, is_baked: true, isBaked: true };
            locationMetas.push(metaWithBakedFlag);
            const stampedFile = await bakeLocationWatermark(file, metaWithBakedFlag);
            processedFiles.push(stampedFile);
          } else {
            processedFiles.push(file);
          }
        }

        setUploadedImages((prev) => {
          const existing = prev[id] || [];
          const existingList = Array.isArray(existing) ? existing : [existing];
          return {
            ...prev,
            [id]: [...existingList, ...processedFiles],
          };
        });

        setImageLocationData((prev) => {
          const existing = prev[id] || [];
          return {
            ...prev,
            [id]: [...existing, ...locationMetas],
          };
        });

        setSuccessMessage(`${rawFiles.length} file(s) selected with location for task ID: ${id}`);
        showToast(`Location captured for ${rawFiles.length} photo(s).`, "success");
      } catch (err) {
        console.error("GPS capture error:", err);
        setShowLocationModal(true);
        showToast(
          err.message || "Failed to capture location metadata. Upload canceled.",
          "error",
        );
      } finally {
        if (e.target) e.target.value = "";
      }
    },
    [showToast],
  );

  const handleCameraCapture = useCallback(
    async (capturedFile) => {
      const targetId = cameraModal.taskId;
      setCameraModal({ open: false, taskId: null });
      if (!targetId || !capturedFile) return;

      showToast("Processing camera photo...", "info");

      try {
        const compressed = await compressImageFile(capturedFile, 1600);
        const meta = await getImageLocationMeta(compressed, "camera");
        let stampedFile = compressed;
        let locationMeta = meta;

        if (meta) {
          locationMeta = { ...meta, is_baked: true, isBaked: true };
          stampedFile = await bakeLocationWatermark(compressed, locationMeta);
        }

        setUploadedImages((prev) => {
          const existing = prev[targetId] || [];
          const existingList = Array.isArray(existing) ? existing : [existing];
          return {
            ...prev,
            [targetId]: [...existingList, stampedFile],
          };
        });

        if (locationMeta) {
          setImageLocationData((prev) => {
            const existing = prev[targetId] || [];
            return {
              ...prev,
              [targetId]: [...existing, locationMeta],
            };
          });
        }

        setSuccessMessage(`Photo captured with location for task ID: ${targetId}`);
        showToast("Photo captured with location!", "success");
      } catch (err) {
        console.error("GPS capture error:", err);
        setShowLocationModal(true);
        showToast(
          err.message || "Failed to capture location metadata.",
          "error"
        );
      }
    },
    [cameraModal.taskId, showToast]
  );

  const removeUploadedImage = useCallback((id, index) => {
    setUploadedImages((prev) => {
      const existing = prev[id] || [];
      const list = Array.isArray(existing) ? existing : [existing];
      const updated = list.filter((_, i) => i !== index);
      if (updated.length === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: updated };
    });

    setImageLocationData((prev) => {
      const existing = prev[id] || [];
      const updated = existing.filter((_, i) => i !== index);
      if (updated.length === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: updated };
    });
  }, []);

  const uploadFiles = async (id, files) => {
    if (!files || files.length === 0) return [];
    showToast("File is uploading...", "info");
    const fileList = Array.isArray(files) ? files : [files];
    const bucketName = activeTab === "delegation" ? "checklist" : activeTab;
    const urls = [];
    for (const file of fileList) {
      const fileName = `${id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from(bucketName).getPublicUrl(fileName);
        if (publicUrl) urls.push(publicUrl);
      } else {
        console.error("Storage upload error:", uploadError);
      }
    }
    return urls;
  };

  // Repair Update Handler
  const openUpdateModal = (task) => {
    setSelectedUpdateTask(task);
    setUpdateForm({
      partReplaced: task.part_replaced || "",
      billAmount: task.bill_amount || "",
      status: task.status || "",
      remarks: task.remarks || "",
      vendorName: task.vendor_name || "",
      workPhoto: null,
      billCopy: null,
    });
    setIsModalOpen(true);
  };

  const handleRepairUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!canWrite) return;
    if (!updateForm.status) return alert("Please select a status");

    // If status is Pending, just close modal and return (don't save/submit)
    if (updateForm.status === "Pending") {
      setIsModalOpen(false);
      return;
    }

    // Validation for Mandatory Attachment
    const isAttachmentRequired =
      selectedUpdateTask.require_attachment === true ||
      String(selectedUpdateTask.require_attachment).toLowerCase() === "yes" ||
      String(selectedUpdateTask.require_attachment).toLowerCase() === "true" ||
      selectedUpdateTask.attachment === true;

    const isMarkedDone = ["completed", "done", "approved", "✅ completed"].some(
      (s) => updateForm.status.toLowerCase().includes(s),
    );

    if (isAttachmentRequired && isMarkedDone && !updateForm.workPhoto) {
      showToast(
        "Attachment required! Please upload a work photo before completing this repair.",
        "error",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let workPhotoUrl = null;
      let billCopyUrl = null;

      // Upload Work Photo if selected
      if (updateForm.workPhoto) {
        showToast("File is uploading...", "info");
        const fileExt = updateForm.workPhoto.name.split(".").pop();
        const fileName = `work_${selectedUpdateTask.id}_${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage
          .from("repair")
          .upload(fileName, updateForm.workPhoto);
        if (error) throw error;
        const {
          data: { publicUrl },
        } = supabase.storage.from("repair").getPublicUrl(fileName);
        workPhotoUrl = publicUrl;
      }

      // Upload Bill Copy if selected
      if (updateForm.billCopy) {
        showToast("File is uploading...", "info");
        const fileExt = updateForm.billCopy.name.split(".").pop();
        const fileName = `bill_${selectedUpdateTask.id}_${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage
          .from("repair")
          .upload(fileName, updateForm.billCopy);
        if (error) throw error;
        const {
          data: { publicUrl },
        } = supabase.storage.from("repair").getPublicUrl(fileName);
        billCopyUrl = publicUrl;
      }

      await updateRepairData([
        {
          taskId: selectedUpdateTask.id,
          status: updateForm.status,
          partReplaced: updateForm.partReplaced || null,
          billAmount: updateForm.billAmount
            ? parseFloat(updateForm.billAmount)
            : null, // Fix empty string issue
          remarks: updateForm.remarks || null,
          vendorName: updateForm.vendorName || null,
          workPhotoUrl: workPhotoUrl,
          billCopyUrl: billCopyUrl,
        },
      ]);

      setIsModalOpen(false);
      showToast("Repair task updated successfully!", "success");
      fetchData(); // Refresh list
    } catch (error) {
      console.error(error);
      showToast("Failed to update task: " + error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canWrite) return;
    if (selectedItems.size === 0) {
      showToast("Please select at least one task to submit", "error");
      return;
    }

    // =================================================================
    // NEW LOGIC: Check for mandatory attachments across all tabs
    // =================================================================
    const selectedArray = Array.from(selectedItems);

    for (const id of selectedArray) {
      // Find the specific task object from your tasks state
      const task = tasks.find((t) => t.id === id || t.task_id === id);

      if (task) {
        // Check if the task requires an attachment
        // (handling boolean true, or strings like "yes", "Yes", "true")
        const isAttachmentRequired =
          task.require_attachment === true ||
          String(task.require_attachment).toLowerCase() === "yes" ||
          String(task.require_attachment).toLowerCase() === "true" ||
          task.attachment === true;

        // Check if the user has selected a status of "Done" or "yes"
        // (You might not want to enforce attachment if they mark it "Not Done", but remove this extra condition if you want it strictly required on ANY submission)
        const currentStatus =
          statusData[id] ||
          (activeTab === "checklist" || activeTab === "delegation"
            ? "yes"
            : "Done");
        const isMarkedDone = ["done", "yes", "completed"].includes(
          currentStatus.toLowerCase(),
        );

        // If attachment is required, status is Done, and NO image is uploaded, block submission
        const hasStaged =
          uploadedImages[id] &&
          (Array.isArray(uploadedImages[id])
            ? uploadedImages[id].length > 0
            : true);
        if (isAttachmentRequired && isMarkedDone && !hasStaged) {
          showToast(
            `Attachment required! Please upload an image/file for Task #${id} before submitting.`,
            "error",
          );
          return; // Instantly stops the submit process
        }
      }
    }
    // =================================================================

    // Validate Checklist tasks with extended status must have extended date AND remarks
    if (activeTab === "checklist") {
      for (const id of selectedArray) {
        const isExtendedStatus =
          statusData[id] === "extended" || statusData[id] === "extend";
        if (isExtendedStatus) {
          if (!extendedDateData[id]) {
            showToast(
              "Please provide an extended date for tasks with 'Extend' status",
              "error",
            );
            return;
          }
          if (!remarksData[id] || remarksData[id].trim() === "") {
            showToast(
              "Please provide remarks for tasks with 'Extend' status",
              "error",
            );
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    setSuccessMessage("");

    // ... (Keep the rest of your try-catch submission logic unchanged)

    try {
      const tableName =
        activeTab === "checklist"
          ? "checklist"
          : activeTab === "delegation"
            ? "delegation"
            : activeTab === "maintenance"
              ? "maintenance_tasks"
              : "repair_tasks";
      const completionField = "submission_date";

      const selectedArray = Array.from(selectedItems);

      const updatePromises = selectedArray.map(async (id) => {
        let imageUrl = null;
        let imageUrls = [];
        if (uploadedImages[id]) {
          const fileList = Array.isArray(uploadedImages[id])
            ? uploadedImages[id]
            : [uploadedImages[id]];
          if (fileList.length > 0) {
            imageUrls = await uploadFiles(id, fileList);
            if (imageUrls.length > 0) {
              imageUrl = imageUrls[0];
            }
          }
        }

        const remarksField =
          activeTab === "checklist" || activeTab === "delegation" ? "remark" : "remarks";
        const imageField =
          activeTab === "checklist" || activeTab === "delegation"
            ? "image"
            : activeTab === "maintenance"
              ? "uploaded_image_url"
              : "image_url";

        // Original logic for other task types (including checklist)
        const isExtension =
          statusData[id] === "extended" || statusData[id] === "extend";

          let rawStatus = statusData[id];
          if (!rawStatus) {
            rawStatus =
              activeTab === "checklist" || activeTab === "delegation"
                ? "yes"
                : "Done";
          }
          if (isExtension) {
            rawStatus = "extend";
          }

          const updates = {
            [completionField]: new Date(new Date().getTime() + 330 * 60000)
              .toISOString()
              .replace("Z", "+05:30"),
            [remarksField]: remarksData[id] || null,
            status: rawStatus,
            admin_done: false,
          };

          if (isExtension && extendedDateData[id]) {
            const extendedDateISO = new Date(extendedDateData[id]).toISOString();
            updates.next_extend_date = extendedDateISO;
            updates.planned_date = extendedDateISO;
          }

          if (imageUrl) {
            updates[imageField] = imageUrl;
          }
          if (imageUrls.length > 0) {
            updates.image_urls = imageUrls;
          }

          const locationMeta = (imageLocationData && imageLocationData[id]) || null;
          if (locationMeta) {
            updates.image_location_data = locationMeta;
          }

          // Checklist and Delegation tables use `task_id`, all others use `id`
          const idKey =
            activeTab === "checklist" || activeTab === "delegation"
              ? "task_id"
              : "id";

          let { error: updateError } = await supabase
            .from(tableName)
            .update(updates)
            .eq(idKey, id);

          // Fallback if status column in DB has an enum constraint (e.g. enable_reminder enum)
          if (
            updateError &&
            isExtension &&
            (updateError.message?.includes("enum") ||
              updateError.message?.includes("enable_reminder"))
          ) {
            console.warn(
              "DB enum constraint detected on status column, falling back to 'yes' status for extension.",
            );
            const fallbackUpdates = { ...updates, status: "yes" };
            const fallbackResult = await supabase
              .from(tableName)
              .update(fallbackUpdates)
              .eq(idKey, id);
            updateError = fallbackResult.error;
          }

          if (updateError) throw updateError;

          // Send extension notification if task was extended
          if (isExtension && extendedDateData[id]) {
            const taskObj = tasks.find(
              (t) => t.id === id || t.task_id === id,
            );
            if (taskObj) {
              await sendTaskExtensionNotification({
                doerName:
                  taskObj.name || taskObj.assigned_person || taskObj.doer_name,
                taskId: taskObj.task_id || taskObj.id,
                givenBy:
                  taskObj.given_by ||
                  localStorage.getItem("user-name") ||
                  "Admin",
                description: taskObj.task_description,
                nextExtendDate: new Date(
                  extendedDateData[id],
                ).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
                reason: remarksData[id] || null,
              });
            }
          }
        });

      await Promise.all(updatePromises);

      setSuccessMessage(
        `Successfully submitted ${selectedItems.size} task(s)!`,
      );
      setSelectedItems(new Set());
      setRemarksData({});
      setUploadedImages({});
      setStatusData({});
      setExtendedDateData({});
      fetchData();
    } catch (err) {
      console.error("Submission error:", err);
      const errMsg =
        err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert("Failed to submit tasks: " + errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendUrgentWhatsApp = async () => {
    if (!canWrite) return;
    if (selectedItems.size === 0) return;

    setIsSubmitting(true);
    try {
      const selectedTasks = tasks.filter((t) => selectedItems.has(t.id));
      let allSuccess = true;

      for (const task of selectedTasks) {
        const doerName = task.doer_name || task.name || task.assigned_person;
        const taskId = task.task_id || task.id;
        const description = task.task_description || task.issue_description;
        const dueDateRaw =
          task.planned_date || task.task_start_date || task.created_at;
        const givenBy = task.given_by || task.filled_by;

        const sent = await sendUrgentTaskNotification({
          doerName,
          taskId,
          description,
          dueDate: formatDateWithTime(dueDateRaw),
          givenBy,
          taskType: activeTab,
          machineName: task.machine_name,
          partName: task.part_name,
          department: task.department || task.assigned_dept,
        });
        if (!sent) {
          allSuccess = false;
        }
      }

      if (allSuccess) {
        showToast("WhatsApp message(s) sent successfully!", "success");
      } else {
        showToast("Some WhatsApp messages failed to send.", "warning");
      }
      setSelectedItems(new Set());
    } catch (err) {
      console.error("WhatsApp error:", err);
      alert("Failed to send WhatsApp messages: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {isReadOnly && <ReadOnlyBanner className="mb-3" />}
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-gray-200/80 shadow-xs space-y-2.5">
          {/* Row 1: System Tabs & Main Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <TaskManagementTabs
              activeTab={activeTab}
              setActiveTab={(newTab) => {
                setActiveTab(newTab);
                setShowHistory(false);
                setSelectedItems(new Set());
                setSearchTerm("");
                setDateFilter("all");
              }}
              allowedTabs={["checklist", "delegation"]}
            />

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  setSearchTerm("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-blue-600 transition-all shadow-xs cursor-pointer"
              >
                {showHistory ? (
                  <>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Live Tasks</span>
                  </>
                ) : (
                  <>
                    <History className="h-3.5 w-3.5" />
                    <span>History</span>
                  </>
                )}
              </button>

              {!showHistory && (
                <>
                  <button
                    onClick={handleSendUrgentWhatsApp}
                    disabled={!canWrite || selectedItems.size === 0 || isSubmitting}
                    title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    <span>Urgent WhatsApp</span>
                  </button>

                  {activeTab !== "repair" && (
                    <button
                      onClick={handleSubmit}
                      disabled={!canWrite || selectedItems.size === 0 || isSubmitting}
                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-extrabold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer"
                    >
                      {isSubmitting
                        ? "Submitting..."
                        : `Submit (${selectedItems.size})`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: Search Bar + Filter Dropdowns */}
          <div className="flex flex-col md:flex-row items-center gap-2">
            {/* Search Input + Mobile Filter Toggle */}
            <div className="flex items-center gap-2 w-full flex-1">
              <div className="relative flex-1 w-full">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder={showHistory ? "Search history..." : "Search tasks..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Mobile Filter Toggle Button */}
              <button
                onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl shrink-0 cursor-pointer"
              >
                <Filter size={13} />
                <span>Filters</span>
                <ChevronDown size={13} className={`transition-transform ${isMobileFiltersOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Filter Dropdowns Grid (Collapsible on mobile) */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto shrink-0 ${!isMobileFiltersOpen ? 'hidden sm:grid' : 'grid'}`}>
              {/* User Filter */}
              <div className="relative min-w-[120px]">
                <button
                  onClick={() =>
                    setDropdownOpen((prev) => ({
                      ...prev,
                      userFilter: !prev.userFilter,
                    }))
                  }
                  className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${userFilter !== "all" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Users size={13} className="shrink-0" />
                    <span className="truncate">{userFilter === "all" ? "All Users" : userFilter}</span>
                  </div>
                  <ChevronDown
                    size={13}
                    className={`shrink-0 transition-transform ${dropdownOpen?.userFilter ? "rotate-180" : ""}`}
                  />
                </button>
                {dropdownOpen?.userFilter && (
                  <div className="absolute z-50 mt-1 w-48 right-0 rounded-xl bg-white shadow-xl border border-gray-100 py-1 overflow-y-auto max-h-60">
                    <button
                      onClick={() => {
                        setUserFilter("all");
                        setSelectedItems(new Set());
                        setDropdownOpen((prev) => ({
                          ...prev,
                          userFilter: false,
                        }));
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${userFilter === "all" ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      All Users
                    </button>
                    {availableUsersForFilter.map((name) => (
                      <button
                        key={name}
                        onClick={() => {
                          setUserFilter(name);
                          setSelectedItems(new Set());
                          setDropdownOpen((prev) => ({
                            ...prev,
                            userFilter: false,
                          }));
                        }}
                        className={`block w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${userFilter === name ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Given By Filter */}
              <div className="relative min-w-[120px]">
                <button
                  onClick={() =>
                    setDropdownOpen((prev) => ({
                      ...prev,
                      givenByFilter: !prev.givenByFilter,
                    }))
                  }
                  className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${givenByFilter !== "all" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Users size={13} className="shrink-0" />
                    <span className="truncate">{givenByFilter === "all" ? "Given By" : givenByFilter}</span>
                  </div>
                  <ChevronDown
                    size={13}
                    className={`shrink-0 transition-transform ${dropdownOpen?.givenByFilter ? "rotate-180" : ""}`}
                  />
                </button>
                {dropdownOpen?.givenByFilter && (
                  <div className="absolute z-50 mt-1 w-48 right-0 rounded-xl bg-white shadow-xl border border-gray-100 py-1 overflow-y-auto max-h-60">
                    <button
                      onClick={() => {
                        setGivenByFilter("all");
                        setSelectedItems(new Set());
                        setDropdownOpen((prev) => ({
                          ...prev,
                          givenByFilter: false,
                        }));
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${givenByFilter === "all" ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      All Assigners
                    </button>
                    {allUsers.map((name) => (
                      <button
                        key={name}
                        onClick={() => {
                          setGivenByFilter(name);
                          setSelectedItems(new Set());
                          setDropdownOpen((prev) => ({
                            ...prev,
                            givenByFilter: false,
                          }));
                        }}
                        className={`block w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${givenByFilter === name ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date Filter */}
              {!showHistory && (
                <div className="relative min-w-[120px]">
                  <button
                    onClick={() =>
                      setDropdownOpen((prev) => ({
                        ...prev,
                        dateFilter: !prev.dateFilter,
                      }))
                    }
                    className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${dateFilter !== "all" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Filter size={13} className="shrink-0" />
                      <span className="capitalize truncate">{dateFilter === "all" ? "All Tasks" : dateFilter}</span>
                    </div>
                    <ChevronDown
                      size={13}
                      className={`shrink-0 transition-transform ${dropdownOpen?.dateFilter ? "rotate-180" : ""}`}
                    />
                  </button>
                  {dropdownOpen?.dateFilter && (
                    <div className="absolute z-50 mt-1 w-40 right-0 rounded-xl bg-white shadow-xl border border-gray-100 py-1 overflow-hidden">
                      {[
                        { id: "all", label: "All Tasks" },
                        { id: "overdue", label: "Overdue" },
                        { id: "today", label: "Today" },
                        { id: "upcoming", label: "Upcoming" },
                      ].map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => {
                            setDateFilter(filter.id);
                            setSelectedItems(new Set());
                            setDropdownOpen((prev) => ({
                              ...prev,
                              dateFilter: false,
                            }));
                          }}
                          className={`block w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${dateFilter === filter.id ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" : "text-gray-600 hover:bg-gray-50"}`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 sm:px-4 py-3 rounded-md flex items-center justify-between text-sm sm:text-base animate-in fade-in duration-300">
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-emerald-600 flex-shrink-0" />
              <span className="break-words font-black uppercase tracking-wide">
                {successMessage}
              </span>
            </div>
            <button
              onClick={() => setSuccessMessage("")}
              className="text-emerald-600 hover:text-emerald-800 ml-2 flex-shrink-0"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}

        {/* Removed redundant date filter tabs - now in dropdown */}

        {/* Table Container */}
        <div className="rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden">
          {showHistory && (
            <div className="p-3 sm:p-4 border-b border-blue-100 bg-gray-50 flex flex-col sm:flex-row gap-3 items-center">
              <span className="text-xs sm:text-sm font-medium text-blue-700 whitespace-nowrap">
                Filter by Range:
              </span>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs sm:text-sm border border-gray-200 rounded-md p-1 focus:ring-1 focus:ring-blue-400 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs sm:text-sm border border-gray-200 rounded-md p-1 focus:ring-1 focus:ring-blue-400 outline-none"
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-2"></div>
                <p className="text-blue-600 text-sm font-bold uppercase tracking-wider">
                  Loading data...
                </p>
              </div>
            ) : error ? (
              <div className="py-20 text-center">
                <p className="text-red-500 mb-2 font-medium">{error}</p>
                <button
                  onClick={fetchData}
                  className="text-sm text-blue-600 underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                {/* Desktop view */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm transition-all duration-300">
                      <tr>
                        {!showHistory && (
                          <th className="px-3 sm:px-6 py-3 sm:py-4 text-left font-bold text-gray-900">
                            <input
                              type="checkbox"
                              checked={(() => {
                                const col =
                                  activeTab === "repair"
                                    ? "created_at"
                                    : "planned_date";
                                const submittableTasks =
                                  filteredPendingTasks.filter((t) =>
                                    isTaskSelectable(t[col], t.status),
                                  );
                                return (
                                  submittableTasks.length > 0 &&
                                  submittableTasks.every((t) =>
                                    selectedItems.has(t.id),
                                  )
                                );
                              })()}
                              onChange={handleSelectAll}
                              disabled={!canWrite}
                              title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-30"
                            />
                          </th>
                        )}
                        {tableHeaders.map((header) => (
                          <th
                            key={header.id}
                            className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${header.id === "task_description" || header.id === "issue_description" ? "max-w-xs xl:max-w-sm" : "whitespace-nowrap"}`}
                          >
                            {header.label}
                          </th>
                        ))}
                        {!showHistory && (activeTab === "ea" || activeTab === "checklist") && (
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Extended Date
                          </th>
                        )}
                        {!showHistory && activeTab !== "repair" && (
                          <>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              Remarks
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              Image
                            </th>
                          </>
                        )}
                        {showHistory && (
                          <>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              Remarks
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              Attachment
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedTasks.length > 0 ? (
                        paginatedTasks.map((task, index) => {
                          const currentStatus = getTimeStatus(
                            task[statusDateColumn],
                            task.status,
                            task.extended_date,
                          );
                          const prevStatus =
                            index > 0
                              ? getTimeStatus(
                                  paginatedTasks[index - 1][statusDateColumn],
                                  paginatedTasks[index - 1].status,
                                  paginatedTasks[index - 1].extended_date,
                                )
                              : null;
                          const showGroupHeader = currentStatus !== prevStatus;

                          return (
                            <Fragment key={task.id}>
                              {showGroupHeader && (
                                <tr className="bg-gray-100/30">
                                  <td
                                    colSpan={tableHeaders.length + 6}
                                    className="px-3 py-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-1.5 h-1.5 rounded-full ${currentStatus === "Overdue" ? "bg-red-500" : currentStatus === "Today" ? "bg-green-500" : "bg-blue-500"}`}
                                      ></div>
                                      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                                        {currentStatus}{" "}
                                        {activeTab === "ea" &&
                                        currentStatus === "Today"
                                          ? " & Extended"
                                          : ""}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              <tr className="hover:bg-gray-50">
                                {!showHistory && (
                                  <td className="px-3 py-3 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={selectedItems.has(task.id)}
                                      onChange={(e) =>
                                        handleSelectItem(
                                          task.id,
                                          e.target.checked,
                                        )
                                      }
                                      disabled={
                                        !canWrite ||
                                        !isTaskSelectable(
                                          task[statusDateColumn],
                                          task.status,
                                        )
                                      }
                                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                )}
                                {activeTab === "repair" ? (
                                  <>
                                    {!showHistory ? (
                                      <>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          <button
                                            onClick={() =>
                                              openUpdateModal(task)
                                            }
                                            disabled={!canWrite}
                                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            <Edit className="h-3 w-3" /> Process
                                          </button>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800 font-bold">
                                          {task.id}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                                          <span
                                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTimeStatus(task.created_at, task.status) === "Overdue" ? "bg-red-100 text-red-800" : getTimeStatus(task.created_at, task.status) === "Today" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
                                          >
                                            {getTimeStatus(
                                              task.created_at,
                                              task.status,
                                            )}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-800 max-w-xs xl:max-w-sm break-words">
                                          <RenderDescription
                                            text={task.issue_description}
                                            audioUrl={task.audio_url}
                                            instructionUrl={
                                              task.instruction_attachment_url
                                            }
                                            instructionType={
                                              task.instruction_attachment_type
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.filled_by}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          <span className="font-bold text-gray-900">
                                            {task.assigned_person || "—"}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.machine_name}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                                          <span
                                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                              task.status === "Pending"
                                                ? "bg-yellow-100 text-yellow-800"
                                                : task.status === "Approved" ||
                                                    task.status === "Completed"
                                                  ? "bg-green-100 text-green-800"
                                                  : !task.admin_done &&
                                                      task.submission_date
                                                    ? "bg-orange-100 text-orange-800"
                                                    : "bg-gray-100 text-gray-800"
                                            }`}
                                          >
                                            {!task.admin_done &&
                                            task.submission_date
                                              ? "Pending Approval"
                                              : task.status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.part_replaced || "—"}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.bill_amount
                                            ? `₹${task.bill_amount}`
                                            : "—"}
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800 font-bold">
                                          {task.id}
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-800 max-w-xs xl:max-w-sm break-words">
                                          <RenderDescription
                                            text={task.issue_description}
                                            audioUrl={task.audio_url}
                                            instructionUrl={
                                              task.instruction_attachment_url
                                            }
                                            instructionType={
                                              task.instruction_attachment_type
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.submission_date
                                            ? new Date(
                                                task.submission_date,
                                              ).toLocaleString()
                                            : "—"}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.filled_by}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.assigned_person}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.machine_name}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                                          <span
                                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                              task.status === "Pending"
                                                ? "bg-yellow-100 text-yellow-800"
                                                : task.status === "Approved" ||
                                                    task.status === "Completed"
                                                  ? "bg-green-100 text-green-800"
                                                  : task.status ===
                                                      "Pending Approval"
                                                    ? "bg-orange-100 text-orange-800"
                                                    : "bg-gray-100 text-gray-800"
                                            }`}
                                          >
                                            {task.status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.part_replaced || "—"}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.bill_amount
                                            ? `₹${task.bill_amount}`
                                            : "—"}
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-800 max-w-xs truncate">
                                          {task.remarks || "—"}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-800">
                                          {task.work_photo_url ||
                                          task.bill_copy_url ? (
                                            <div className="flex flex-col gap-1">
                                              {task.work_photo_url && (
                                                <a
                                                  href={task.work_photo_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:underline text-xs"
                                                >
                                                  View Work Photo
                                                </a>
                                              )}
                                              {task.bill_copy_url && (
                                                <a
                                                  href={task.bill_copy_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:underline text-xs"
                                                >
                                                  View Bill
                                                </a>
                                              )}
                                            </div>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {tableHeaders.map((header) => (
                                      <td
                                        key={header.id}
                                        className={`px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 ${header.id === "task_description" || header.id === "issue_description" ? "min-w-[200px] whitespace-normal" : header.id === "status" ? "min-w-[145px] whitespace-nowrap" : "whitespace-nowrap"}`}
                                      >
                                        {header.id === "time_status" ? (
                                          <span
                                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                              getTimeStatus(
                                                task[statusDateColumn],
                                                task.status,
                                              ) === "Overdue"
                                                ? "bg-red-100 text-red-800"
                                                : getTimeStatus(
                                                      task[statusDateColumn],
                                                      task.status,
                                                    ) === "Today"
                                                  ? "bg-green-100 text-green-800"
                                                  : "bg-blue-100 text-blue-800"
                                            }`}
                                          >
                                            {getTimeStatus(
                                              task[statusDateColumn],
                                              task.status,
                                            )}
                                          </span>
                                        ) : header.id === "task_start_date" ||
                                          header.id === "created_at" ||
                                          header.id === "planned_date" ||
                                          header.id === "updated_at" ? (
                                          <div className="flex flex-col">
                                            <span className="font-bold text-gray-900">
                                              {formatDate(task[header.id])}
                                            </span>
                                            <span className="text-[11px] text-gray-400">
                                              {formatTimeOnly(task[header.id])}
                                            </span>
                                          </div>
                                        ) : header.id === "id" ||
                                          header.id === "task_id" ? (
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900">
                                              {task[header.id]}
                                            </span>
                                            {(task.status?.toLowerCase() ===
                                              "extended" ||
                                              task.status?.toLowerCase() ===
                                                "extend" ||
                                              task.extended_date) && (
                                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded uppercase tracking-tighter border border-amber-200 shadow-sm animate-pulse">
                                                Extended
                                              </span>
                                            )}
                                          </div>
                                        ) : header.id === "submission_date" ? (
                                          activeTab === "maintenance" &&
                                          showHistory ? (
                                            <div className="flex flex-col">
                                              <span className="font-bold text-gray-900">
                                                {formatDate(task[header.id])}
                                              </span>
                                              <span className="text-[11px] text-gray-400">
                                                {formatTimeOnly(
                                                  task[header.id],
                                                )}
                                              </span>
                                            </div>
                                          ) : (
                                            <div className="text-[10px] text-blue-600 font-bold whitespace-nowrap">
                                              {task.submission_date
                                                ? formatDateWithTime(
                                                    task.submission_date,
                                                  )
                                                : "New Task"}
                                            </div>
                                          )
                                        ) : header.id === "status" ? (
                                          !showHistory &&
                                          (activeTab === "maintenance" ||
                                            activeTab === "checklist" ||
                                            activeTab === "ea" ||
                                            activeTab === "delegation") ? (
                                            <select
                                              value={
                                                statusData[task.id] ||
                                                task.status ||
                                                ""
                                              }
                                              onChange={(e) =>
                                                setStatusData((prev) => ({
                                                  ...prev,
                                                  [task.id]: e.target.value,
                                                }))
                                              }
                                              disabled={
                                                !selectedItems.has(task.id)
                                              }
                                              className="block w-full py-1.5 pl-3 pr-8 text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-gray-50/50 disabled:text-gray-400 appearance-none shadow-sm cursor-pointer hover:border-gray-300 transition-colors"
                                              style={{
                                                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                                backgroundPosition: `right 0.5rem center`,
                                                backgroundRepeat: `no-repeat`,
                                                backgroundSize: `1.5em 1.5em`,
                                              }}
                                            >
                                              <option value="">
                                                Select Status
                                              </option>
                                              {activeTab === "ea" ? (
                                                <>
                                                  <option value="done">
                                                    Done
                                                  </option>
                                                  <option value="extended">
                                                    Extend
                                                  </option>
                                                </>
                                              ) : activeTab === "checklist" ? (
                                                <>
                                                  <option value="yes">
                                                    Done
                                                  </option>
                                                  <option value="no">
                                                    Not Done
                                                  </option>
                                                  {String(
                                                    task.frequency ||
                                                      task.freq ||
                                                      task.FREQ ||
                                                      "",
                                                  )
                                                    .toLowerCase()
                                                    .trim() !== "daily" && (
                                                    <option value="extended">
                                                      Extend
                                                    </option>
                                                  )}
                                                </>
                                              ) : (
                                                <>
                                                  <option
                                                    value={
                                                      activeTab === "delegation"
                                                        ? "yes"
                                                        : "Done"
                                                    }
                                                  >
                                                    Done
                                                  </option>
                                                  <option
                                                    value={
                                                      activeTab === "delegation"
                                                        ? "no"
                                                        : "Not Done"
                                                    }
                                                  >
                                                    Not Done
                                                  </option>
                                                </>
                                              )}
                                            </select>
                                          ) : (
                                            <span
                                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                activeTab === "ea"
                                                  ? task[
                                                      header.id
                                                    ]?.toLowerCase() ===
                                                    "approved"
                                                    ? "bg-green-100 text-green-800"
                                                    : task[
                                                          header.id
                                                        ]?.toLowerCase() ===
                                                        "done"
                                                      ? "bg-orange-100 text-orange-800"
                                                      : task[
                                                            header.id
                                                          ]?.toLowerCase() ===
                                                            "pending" ||
                                                          task[
                                                            header.id
                                                          ]?.toLowerCase() ===
                                                            "extend" ||
                                                          task[
                                                            header.id
                                                          ]?.toLowerCase() ===
                                                            "extended"
                                                        ? "bg-amber-100 text-amber-800"
                                                        : "bg-gray-100 text-gray-800"
                                                  : task[header.id] ===
                                                        "Done" ||
                                                      task[header.id] ===
                                                        "yes" ||
                                                      task[header.id] ===
                                                        "done" ||
                                                      task[header.id] ===
                                                        "approved" ||
                                                      task[header.id] ===
                                                        "Completed"
                                                    ? task.admin_done
                                                      ? "bg-green-100 text-green-800"
                                                      : "bg-orange-100 text-orange-800"
                                                    : task[header.id] ===
                                                          "extend" ||
                                                        task[header.id] ===
                                                          "pending" ||
                                                        task[header.id] ===
                                                          "extended"
                                                      ? "bg-yellow-100 text-yellow-800"
                                                      : "bg-gray-100 text-gray-800"
                                              }`}
                                            >
                                              {activeTab === "ea" && showHistory
                                                ? task[
                                                    header.id
                                                  ]?.toLowerCase() ===
                                                    "approved" ||
                                                  (task[
                                                    header.id
                                                  ]?.toLowerCase() === "done" &&
                                                    task.admin_done)
                                                  ? "Completed"
                                                  : task[
                                                        header.id
                                                      ]?.toLowerCase() ===
                                                      "done"
                                                    ? "Pending Approval"
                                                    : task[
                                                          header.id
                                                        ]?.toLowerCase() ===
                                                          "extended" ||
                                                        task[
                                                          header.id
                                                        ]?.toLowerCase() ===
                                                          "extend"
                                                      ? "Extended"
                                                      : task[header.id]
                                                : showHistory &&
                                                    (task[header.id] ===
                                                      "Done" ||
                                                      task[header.id] ===
                                                        "yes" ||
                                                      task[header.id] ===
                                                        "done" ||
                                                      task[header.id] ===
                                                        "Completed") &&
                                                    !task.admin_done
                                                  ? "Pending Approval"
                                                  : showHistory &&
                                                      (task[header.id] ===
                                                        "Done" ||
                                                        task[header.id] ===
                                                          "yes" ||
                                                        task[header.id] ===
                                                          "done" ||
                                                        task[header.id] ===
                                                          "Completed") &&
                                                      task.admin_done
                                                    ? "Approved"
                                                    : task[header.id]}
                                            </span>
                                          )
                                        ) : header.id === "enable_reminders" ||
                                          header.id === "require_attachment" ||
                                          header.id === "enable_reminder" ||
                                          header.id === "attachment" ? (
                                          task[header.id] ? (
                                            "Yes"
                                          ) : (
                                            "No"
                                          )
                                        ) : header.id === "name" ||
                                          header.id === "assigned_person" ||
                                          header.id === "doer_name" ? (
                                          <span className="font-bold text-gray-900">
                                            {task[header.id] || "—"}
                                          </span>
                                        ) : header.id === "machine_name" ? (
                                          task.machine_name ||
                                          (task.task_description
                                            ? task.task_description.split(
                                                " - ",
                                              )[0]
                                            : "—")
                                        ) : header.id === "part_name" ? (
                                          <div className="flex flex-col gap-1 min-w-[120px]">
                                            <span className="text-gray-900">
                                              {task.part_name || "—"}
                                            </span>
                                            <div className="flex gap-1 flex-wrap">
                                              {task.part_name &&
                                                task.part_name
                                                  .split(",")
                                                  .map((p) => p.trim())
                                                  .map((part, idx) => {
                                                    const match =
                                                      customDropdowns.find(
                                                        (d) =>
                                                          d.category ===
                                                            "Part Name" &&
                                                          d.value === part &&
                                                          d.image_url,
                                                      );
                                                    return match ? (
                                                      <img
                                                        key={idx}
                                                        src={match.image_url}
                                                        alt={part}
                                                        className="w-10 h-10 object-cover rounded shadow-sm border border-gray-200 bg-gray-50 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-blue-400 hover:scale-105 transition-all"
                                                        title={`Click to enlarge: ${part}`}
                                                        onClick={() =>
                                                          setLightboxImage({
                                                            url: match.image_url,
                                                            name: part,
                                                          })
                                                        }
                                                      />
                                                    ) : null;
                                                  })}
                                            </div>
                                          </div>
                                        ) : header.id === "task_description" ||
                                          header.id === "issue_description" ||
                                          header.id === "remarks" ? (
                                          <RenderDescription
                                            text={task[header.id]}
                                            audioUrl={task.audio_url}
                                            instructionUrl={
                                              task.instruction_attachment_url
                                            }
                                            instructionType={
                                              task.instruction_attachment_type
                                            }
                                          />
                                        ) : isAudioUrl(task[header.id]) ? (
                                          <AudioPlayer url={task[header.id]} />
                                        ) : header.id === "work_photo_url" ||
                                          header.id === "bill_copy_url" ? (
                                          task[header.id] ? (
                                            <a
                                              href={task[header.id]}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 underline"
                                            >
                                              View
                                            </a>
                                          ) : (
                                            "—"
                                          )
                                        ) : (
                                          task[header.id] || "—"
                                        )}
                                      </td>
                                    ))}
                                    {!showHistory && (activeTab === "ea" || activeTab === "checklist") && (
                                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                        <input
                                          type="date"
                                          placeholder="Extended Date"
                                          value={
                                            extendedDateData[task.id] !== undefined
                                              ? extendedDateData[task.id]
                                              : (task.next_extend_date
                                                  ? String(task.next_extend_date).split("T")[0]
                                                  : (task.planned_date
                                                      ? String(task.planned_date).split("T")[0]
                                                      : ""))
                                          }
                                          onChange={(e) =>
                                            setExtendedDateData((prev) => ({
                                              ...prev,
                                              [task.id]: e.target.value,
                                            }))
                                          }
                                          className="w-full min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:border-blue-400 outline-none text-xs text-gray-700 disabled:opacity-50"
                                          disabled={
                                            !selectedItems.has(task.id) ||
                                            (statusData[task.id] !== "extended" &&
                                              statusData[task.id] !== "extend")
                                          }
                                        />
                                      </td>
                                    )}
                                    {!showHistory && activeTab !== "repair" && (
                                      <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                          <input
                                            type="text"
                                            placeholder="Enter remarks"
                                            value={
                                              remarksData[task.id] !== undefined
                                                ? remarksData[task.id]
                                                : (task.remark || task.remarks || "")
                                            }
                                            onChange={(e) =>
                                              setRemarksData((prev) => ({
                                                ...prev,
                                                [task.id]: e.target.value,
                                              }))
                                            }
                                            className="w-full min-w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:border-blue-400 outline-none text-xs text-gray-700 disabled:opacity-50"
                                            disabled={
                                                      !selectedItems.has(task.id)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 bg-emerald-50/30 min-w-[200px]">
                                          <div className="flex flex-col gap-2">
                                            {/* Staged uploaded files */}
                                            {uploadedImages[task.id] &&
                                            (Array.isArray(
                                              uploadedImages[task.id],
                                            )
                                              ? uploadedImages[task.id].length >
                                                0
                                              : true) ? (
                                              <div className="flex flex-wrap items-center gap-2 p-1.5 bg-green-50 rounded-lg border border-green-200">
                                                {(Array.isArray(
                                                  uploadedImages[task.id],
                                                )
                                                  ? uploadedImages[task.id]
                                                  : [uploadedImages[task.id]]
                                                ).map((file, fIdx) => {
                                                  const isImg =
                                                    file.type?.startsWith(
                                                      "image/",
                                                    ) ||
                                                    getFileType(file.name) ===
                                                      "image";
                                                  const previewUrl = isImg
                                                    ? getFilePreviewUrl(file)
                                                    : null;
                                                  return (
                                                    <div
                                                      key={fIdx}
                                                      className="relative group flex-shrink-0 pt-1 pr-1"
                                                    >
                                                      {isImg ? (
                                                        <img
                                                          src={previewUrl}
                                                          alt={file.name}
                                                          onClick={() =>
                                                            openLightboxModal(
                                                              uploadedImages[
                                                                task.id
                                                              ],
                                                              fIdx,
                                                              imageLocationData[
                                                                task.id
                                                              ],
                                                            )
                                                          }
                                                          className="w-10 h-10 rounded-md object-cover border border-green-400 cursor-pointer hover:scale-105 transition-all shadow-xs"
                                                          title={`${file.name} (Click to preview)`}
                                                        />
                                                      ) : (
                                                        <div
                                                          onClick={() =>
                                                            openLightboxModal(
                                                              uploadedImages[
                                                                task.id
                                                              ],
                                                              fIdx,
                                                              imageLocationData[
                                                                task.id
                                                              ],
                                                            )
                                                          }
                                                          className="w-10 h-10 rounded-md bg-green-100 border border-green-300 flex items-center justify-center text-green-700 cursor-pointer"
                                                          title={file.name}
                                                        >
                                                          <FileText
                                                            size={16}
                                                          />
                                                        </div>
                                                      )}
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          removeUploadedImage(
                                                            task.id,
                                                            fIdx,
                                                          );
                                                        }}
                                                        className="absolute top-0 right-0 w-5 h-5 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-full flex items-center justify-center shadow-md z-20 transition-all cursor-pointer"
                                                        title="Remove image"
                                                      >
                                                        <X size={12} strokeWidth={2.5} />
                                                      </button>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : getHistoryImageUrls(task)
                                                .length > 0 ? (
                                              <div className="flex items-center gap-2 flex-wrap p-1 bg-blue-50/50 rounded-lg border border-blue-100">
                                                {getHistoryImageUrls(task).map(
                                                  (url, uIdx) => (
                                                    <div
                                                      key={uIdx}
                                                      className="relative group flex-shrink-0 pt-1 pr-1"
                                                    >
                                                      <img
                                                        src={url}
                                                        alt="preview"
                                                        onClick={() =>
                                                          openLightboxModal(
                                                            getHistoryImageUrls(
                                                              task,
                                                            ),
                                                            uIdx,
                                                            task.image_location_data,
                                                          )
                                                        }
                                                        className="w-10 h-10 rounded-md object-cover border-2 border-blue-300 cursor-pointer hover:scale-105 transition-all shadow-xs"
                                                        title="Click to preview"
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleRemoveHistoryImage(
                                                            task.id,
                                                            url,
                                                          );
                                                        }}
                                                        className="absolute top-0 right-0 w-5 h-5 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-full flex items-center justify-center shadow-md z-20 transition-all cursor-pointer"
                                                        title="Remove image"
                                                      >
                                                        <X size={12} strokeWidth={2.5} />
                                                      </button>
                                                    </div>
                                                  ),
                                                )}
                                              </div>
                                            ) : null}

                                            {/* Buttons: Upload Proof & Take Photo */}
                                            <div className="flex items-center gap-2">
                                              <label
                                                onClick={(e) => e.stopPropagation()}
                                                className={`flex items-center gap-1.5 cursor-pointer text-xs font-semibold px-2 py-1 rounded border border-dashed transition-all ${
                                                  selectedItems.has(task.id)
                                                    ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-50"
                                                }`}
                                              >
                                                <Upload className="h-3.5 w-3.5" />
                                                <span>Upload</span>
                                                {(task.require_attachment ||
                                                  task.attachment) && (
                                                  <span className="text-red-500 font-bold">
                                                    *
                                                  </span>
                                                )}
                                                <input
                                                  type="file"
                                                  className="hidden"
                                                  multiple
                                                  onClick={(e) => e.stopPropagation()}
                                                  disabled={
                                                    !selectedItems.has(
                                                      task.id,
                                                    )
                                                  }
                                                  onChange={(e) =>
                                                    handleImageUpload(
                                                      task.id,
                                                      e,
                                                      "gallery",
                                                    )
                                                  }
                                                />
                                              </label>
                                              <button
                                                type="button"
                                                disabled={!selectedItems.has(task.id)}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!selectedItems.has(task.id)) return;
                                                  saveDraftState();
                                                  setCameraModal({ open: true, taskId: task.id });
                                                }}
                                                className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded border border-dashed transition-all ${
                                                  selectedItems.has(task.id)
                                                    ? "border-cyan-300 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 cursor-pointer"
                                                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-50"
                                                }`}
                                              >
                                                <Camera className="h-3.5 w-3.5" />
                                                <span>Photo</span>
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </>
                                    )}
                                    {showHistory && (
                                      <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-800 max-w-xs truncate">
                                          <RenderDescription
                                            text={task.remark || task.remarks}
                                            audioUrl={task.audio_url}
                                            instructionUrl={
                                              task.instruction_attachment_url
                                            }
                                            instructionType={
                                              task.instruction_attachment_type
                                            }
                                          />
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-800">
                                          {getHistoryImageUrls(task).length >
                                          0 ? (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {getHistoryImageUrls(task).map(
                                                (url, uIdx) => (
                                                  <img
                                                    key={uIdx}
                                                    src={url}
                                                    alt="Attachment"
                                                    onClick={() =>
                                                      openLightboxModal(
                                                        getHistoryImageUrls(
                                                          task,
                                                        ),
                                                        uIdx,
                                                        task.image_location_data,
                                                      )
                                                    }
                                                    className="h-8 w-8 object-cover rounded-lg border border-blue-200 cursor-pointer hover:scale-105 transition-all shadow-xs"
                                                  />
                                                ),
                                              )}
                                              <button
                                                onClick={() =>
                                                  openLightboxModal(
                                                    getHistoryImageUrls(task),
                                                    0,
                                                    task.image_location_data,
                                                  )
                                                }
                                                className="text-blue-600 text-xs font-bold underline ml-1"
                                              >
                                                View (
                                                {
                                                  getHistoryImageUrls(task)
                                                    .length
                                                }
                                                )
                                              </button>
                                            </div>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                      </>
                                    )}
                                  </>
                                )}
                              </tr>
                            </Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={tableHeaders.length + 6}
                            className="px-6 py-20 text-center text-gray-400"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Search size={40} className="text-gray-200" />
                              <p>
                                No {showHistory ? "history" : "pending tasks"}{" "}
                                found.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view Toolbar */}
                {!showHistory && (
                  <div className="md:hidden z-30 transition-all duration-300">
                    <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={(() => {
                              const col =
                                activeTab === "repair"
                                  ? "created_at"
                                  : "planned_date";
                              const submittableTasks =
                                filteredPendingTasks.filter((t) =>
                                  isTaskSelectable(t[col], t.status),
                                );
                              return (
                                submittableTasks.length > 0 &&
                                submittableTasks.every((t) =>
                                  selectedItems.has(t.id),
                                )
                              );
                            })()}
                            onChange={handleSelectAll}
                            disabled={!canWrite}
                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                            className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                        <span className="text-sm font-black text-gray-700 uppercase tracking-tight">
                          Select All Tasks
                        </span>
                      </div>

                      {selectedItems.size > 0 && (
                        <button
                          onClick={() => {
                            setSelectedItems(new Set());
                            setRemarksData({});
                            setUploadedImages({});
                            setStatusData({});
                          }}
                          className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile view Cards */}
                <div className="md:hidden space-y-4 p-4 bg-gray-50/50 pb-24">
                  {paginatedTasks.length > 0 ? (
                    paginatedTasks.map((task, index) => {
                      const currentStatus = getTimeStatus(
                        task[statusDateColumn],
                        task.status,
                        task.extended_date,
                      );
                      const prevStatus =
                        index > 0
                          ? getTimeStatus(
                              paginatedTasks[index - 1][statusDateColumn],
                              paginatedTasks[index - 1].status,
                              paginatedTasks[index - 1].extended_date,
                            )
                          : null;
                      const showGroupHeader = currentStatus !== prevStatus;

                      return (
                        <Fragment key={task.id}>
                          {showGroupHeader && (
                            <div className="pt-2 pb-1 px-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                                <div
                                  className={`w-1 h-1 rounded-full ${currentStatus === "Overdue" ? "bg-red-500" : currentStatus === "Today" ? "bg-green-500" : "bg-blue-500"}`}
                                ></div>
                                {currentStatus}{" "}
                                {activeTab === "ea" && currentStatus === "Today"
                                  ? " & Extended"
                                  : ""}
                              </span>
                            </div>
                          )}
                          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden animate-fade-in">
                            {/* Card Header */}
                            <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                {!showHistory && (
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.has(task.id)}
                                    onChange={(e) =>
                                      handleSelectItem(
                                        task.id,
                                        e.target.checked,
                                      )
                                    }
                                    disabled={
                                      !canWrite ||
                                      !isTaskSelectable(
                                        task[statusDateColumn],
                                        task.status,
                                      )
                                    }
                                    title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                )}
                                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
                                  #{task.id}
                                </span>
                                {(task.status?.toLowerCase() === "extended" ||
                                  task.status?.toLowerCase() === "extend" ||
                                  task.extended_date) && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black rounded uppercase tracking-tighter border border-amber-200 animate-pulse">
                                    Extended
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2 py-0.5 inline-flex text-[10px] leading-5 font-semibold rounded-full ${
                                  getTimeStatus(
                                    task[statusDateColumn] || task.created_at,
                                    task.status,
                                  ) === "Overdue"
                                    ? "bg-red-100 text-red-800"
                                    : getTimeStatus(
                                          task[statusDateColumn] ||
                                            task.created_at,
                                          task.status,
                                        ) === "Today"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {getTimeStatus(
                                  task[statusDateColumn] || task.created_at,
                                  task.status,
                                )}
                              </span>
                            </div>

                            {/* Card Body */}
                            <div className="p-4 space-y-3">
                              {/* Main Description */}
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                  Description
                                </p>
                                <div className="text-sm text-gray-800">
                                  <RenderDescription
                                    text={
                                      task.issue_description ||
                                      task.task_description
                                    }
                                    audioUrl={task.audio_url}
                                    instructionUrl={
                                      task.instruction_attachment_url
                                    }
                                    instructionType={
                                      task.instruction_attachment_type
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Assigned To
                                  </p>
                                  <p className="text-sm font-bold text-gray-900">
                                    {task.assigned_person ||
                                      task.name ||
                                      task.doer_name ||
                                      "—"}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Status
                                  </p>
                                  <div className="text-sm">
                                    {!showHistory &&
                                    (activeTab === "maintenance" ||
                                      activeTab === "checklist" ||
                                      activeTab === "ea" ||
                                      activeTab === "delegation") ? (
                                      <select
                                        value={
                                          statusData[task.id] ||
                                          task.status ||
                                          ""
                                        }
                                        onChange={(e) =>
                                          setStatusData((prev) => ({
                                            ...prev,
                                            [task.id]: e.target.value,
                                          }))
                                        }
                                        disabled={!selectedItems.has(task.id)}
                                        className="w-full text-xs border-gray-200 rounded-md py-1 focus:ring-blue-400"
                                      >
                                        <option value="">Status</option>
                                        {activeTab === "ea" ? (
                                          <>
                                            <option value="done">Done</option>
                                            <option value="extended">
                                              Extend
                                            </option>
                                          </>
                                        ) : activeTab === "checklist" ? (
                                          <>
                                            <option value="yes">Done</option>
                                            <option value="no">Not Done</option>
                                            {String(
                                              task.frequency ||
                                                task.freq ||
                                                task.FREQ ||
                                                "",
                                            )
                                              .toLowerCase()
                                              .trim() !== "daily" && (
                                              <option value="extended">
                                                Extend
                                              </option>
                                            )}
                                          </>
                                        ) : (
                                          <>
                                            <option
                                              value={
                                                activeTab === "delegation"
                                                  ? "yes"
                                                  : "Done"
                                              }
                                            >
                                              Done
                                            </option>
                                            <option
                                              value={
                                                activeTab === "delegation"
                                                  ? "no"
                                                  : "Not Done"
                                              }
                                            >
                                              Not Done
                                            </option>
                                          </>
                                        )}
                                      </select>
                                    ) : (
                                      <span
                                        className={`px-2 inline-flex text-[10px] leading-5 font-semibold rounded-full ${
                                          task.status === "Done" ||
                                          task.status === "yes" ||
                                          task.status === "done" ||
                                          task.status === "approved" ||
                                          task.status === "Completed"
                                            ? task.admin_done
                                              ? "bg-green-100 text-green-800"
                                              : "bg-orange-100 text-orange-800"
                                            : task.status?.toLowerCase() ===
                                                  "extended" ||
                                                task.status?.toLowerCase() ===
                                                  "extend"
                                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                                              : "bg-gray-100 text-gray-800"
                                        }`}
                                      >
                                        {!task.admin_done &&
                                        task.submission_date
                                          ? "Pending Approval"
                                          : task.status?.toLowerCase() ===
                                                "extended" ||
                                              task.status?.toLowerCase() ===
                                                "extend"
                                            ? "Extended"
                                            : task.status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-gray-50">
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Planned Date
                                  </p>
                                  <p className="text-sm font-bold text-blue-700">
                                    {formatDate(
                                      task.planned_date ||
                                        task.task_start_date ||
                                        task.created_at,
                                    )}
                                  </p>
                                </div>
                                {task.department && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                      Department
                                    </p>
                                    <p className="text-sm text-gray-800 uppercase text-[11px] font-bold">
                                      {task.department}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Extra fields based on tab */}
                              {(activeTab === "repair" ||
                                task.machine_name) && (
                                <div className="space-y-1 pt-1 border-t border-gray-50">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Machine / Unit
                                  </p>
                                  <p className="text-sm text-gray-800">
                                    {task.machine_name || "—"}
                                  </p>
                                </div>
                              )}

                              {task.part_name && (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Part
                                  </p>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-sm text-gray-800">
                                      {task.part_name}
                                    </span>
                                    <div className="flex gap-3 flex-wrap mt-2">
                                      {task.part_name
                                        .split(",")
                                        .map((p) => p.trim())
                                        .map((part, idx) => {
                                          const match = customDropdowns?.find(
                                            (d) =>
                                              d.category === "Part Name" &&
                                              d.value === part &&
                                              d.image_url,
                                          );
                                          return match ? (
                                            <img
                                              key={idx}
                                              src={match.image_url}
                                              alt={part}
                                              className="w-24 h-24 object-cover rounded-lg shadow-md border-2 border-blue-100 bg-gray-50 flex-shrink-0 cursor-zoom-in transition-all active:scale-95"
                                              title={`Click to enlarge: ${part}`}
                                              onClick={() =>
                                                setLightboxImage({
                                                  url: match.image_url,
                                                  name: part,
                                                })
                                              }
                                            />
                                          ) : null;
                                        })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {activeTab === "repair" && task.bill_amount && (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Amount
                                  </p>
                                  <p className="text-sm font-bold text-gray-900">
                                    ₹{task.bill_amount}
                                  </p>
                                </div>
                              )}

                              {/* Actions for Pending Tasks */}
                              {!showHistory && activeTab !== "repair" && (
                                <div className="pt-2 space-y-3 border-t border-gray-50">
                                  {(activeTab === "ea" ||
                                    activeTab === "checklist") &&
                                    (statusData[task.id] === "extended" ||
                                      statusData[task.id] === "extend") && (
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-red-500 uppercase font-bold">
                                        Extended Date *
                                      </p>
                                      <input
                                        type="date"
                                        value={
                                          extendedDateData[task.id] !== undefined
                                            ? extendedDateData[task.id]
                                            : (task.next_extend_date
                                                ? String(task.next_extend_date).split("T")[0]
                                                : "")
                                        }
                                        onChange={(e) =>
                                          setExtendedDateData((prev) => ({
                                            ...prev,
                                            [task.id]: e.target.value,
                                          }))
                                        }
                                        disabled={!selectedItems.has(task.id)}
                                        className="w-full text-xs border-red-200 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-red-400 bg-red-50/30"
                                      />
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                      Remarks
                                    </p>
                                    <input
                                      type="text"
                                      placeholder="Enter remarks"
                                      value={
                                        remarksData[task.id] !== undefined
                                          ? remarksData[task.id]
                                          : (task.remark || task.remarks || "")
                                      }
                                      onChange={(e) =>
                                        setRemarksData((prev) => ({
                                          ...prev,
                                          [task.id]: e.target.value,
                                        }))
                                      }
                                      disabled={!selectedItems.has(task.id)}
                                      className="w-full text-xs border-gray-200 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-2 pt-1">
                                    {/* Staged uploaded files */}
                                    {uploadedImages[task.id] &&
                                    (Array.isArray(uploadedImages[task.id])
                                      ? uploadedImages[task.id].length > 0
                                      : true) ? (
                                      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-green-50 rounded-lg border border-green-200">
                                        {(Array.isArray(
                                          uploadedImages[task.id],
                                        )
                                          ? uploadedImages[task.id]
                                          : [uploadedImages[task.id]]
                                        ).map((file, fIdx) => {
                                          const isImg =
                                            file.type?.startsWith("image/") ||
                                            getFileType(file.name) === "image";
                                          const previewUrl = isImg
                                            ? getFilePreviewUrl(file)
                                            : null;
                                          return (
                                            <div
                                              key={fIdx}
                                              className="relative group flex-shrink-0"
                                            >
                                              {isImg ? (
                                                <img
                                                  src={previewUrl}
                                                  alt={file.name}
                                                  onClick={() =>
                                                    openLightboxModal(
                                                      uploadedImages[task.id],
                                                      fIdx,
                                                    )
                                                  }
                                                  className="w-10 h-10 rounded-md object-cover border border-green-400 cursor-pointer hover:scale-105 transition-all shadow-xs"
                                                />
                                              ) : (
                                                <div
                                                  onClick={() =>
                                                    openLightboxModal(
                                                      uploadedImages[task.id],
                                                      fIdx,
                                                    )
                                                  }
                                                  className="w-10 h-10 rounded-md bg-green-100 border border-green-300 flex items-center justify-center text-green-700 cursor-pointer"
                                                >
                                                  <FileText size={16} />
                                                </div>
                                              )}
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeUploadedImage(
                                                    task.id,
                                                    fIdx,
                                                  );
                                                }}
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm z-10"
                                              >
                                                <X size={10} />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}

                                    <div className="flex gap-2">
                                      <label
                                        onClick={(e) => e.stopPropagation()}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-all cursor-pointer ${selectedItems.has(task.id) ? "border-blue-200 bg-blue-50 text-blue-600 active:scale-95" : "border-gray-100 bg-gray-50 text-gray-400 grayscale cursor-not-allowed"}`}
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        <span>Upload</span>
                                        <input
                                          type="file"
                                          className="hidden"
                                          multiple
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) =>
                                            handleImageUpload(task.id, e, "gallery")
                                          }
                                          disabled={
                                            !selectedItems.has(task.id)
                                          }
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        disabled={!selectedItems.has(task.id)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!selectedItems.has(task.id)) return;
                                          saveDraftState();
                                          setCameraModal({ open: true, taskId: task.id });
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-all ${selectedItems.has(task.id) ? "border-cyan-200 bg-cyan-50 text-cyan-500 active:scale-95 cursor-pointer" : "border-gray-100 bg-gray-50 text-gray-400 grayscale cursor-not-allowed"}`}
                                      >
                                        <Camera className="h-3.5 w-3.5" />
                                        <span>Photo</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {!showHistory && activeTab === "repair" && (
                                <div className="pt-2">
                                  <button
                                    onClick={() => openUpdateModal(task)}
                                    disabled={!canWrite}
                                    title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                    className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Edit className="h-3.5 w-3.5" /> PROCESS
                                    REPAIR
                                  </button>
                                </div>
                              )}

                              {/* History attachments */}
                              {showHistory &&
                                (task.work_photo_url ||
                                  task.bill_copy_url ||
                                  task.image_url ||
                                  task.uploaded_image_url) && (
                                  <div className="pt-2 border-t border-gray-50">
                                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">
                                      Attachments
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                      {(task.work_photo_url ||
                                        task.image_url ||
                                        task.uploaded_image_url) && (
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[10px] text-gray-500 font-medium">
                                            Work Photo
                                          </span>
                                          <img
                                            src={
                                              task.work_photo_url ||
                                              task.image_url ||
                                              task.uploaded_image_url
                                            }
                                            alt="Work"
                                            className="w-24 h-24 object-cover rounded-lg border-2 border-blue-100 shadow-sm cursor-zoom-in"
                                            onClick={() =>
                                              setLightboxImage({
                                                url:
                                                  task.work_photo_url ||
                                                  task.image_url ||
                                                  task.uploaded_image_url,
                                                name: "Work Photo",
                                              })
                                            }
                                          />
                                        </div>
                                      )}
                                      {task.bill_copy_url && (
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[10px] text-gray-500 font-medium">
                                            Bill Copy
                                          </span>
                                          <img
                                            src={task.bill_copy_url}
                                            alt="Bill"
                                            className="w-24 h-24 object-cover rounded-lg border-2 border-blue-100 shadow-sm cursor-zoom-in"
                                            onClick={() =>
                                              setLightboxImage({
                                                url: task.bill_copy_url,
                                                name: "Bill Copy",
                                              })
                                            }
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        </Fragment>
                      );
                    })
                  ) : (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                      <Search
                        size={40}
                        className="text-gray-200 mx-auto mb-3"
                      />
                      <p className="text-gray-400 text-sm">No tasks found.</p>
                    </div>
                  )}
                </div>

                {/* Mobile Floating Submit Bar */}
                {!showHistory && selectedItems.size > 0 && (
                  <div className="md:hidden fixed bottom-6 left-4 right-4 z-40 animate-in slide-in-from-bottom-8 duration-500">
                    <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-blue-100 p-2 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="pl-4">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-0.5">
                            Ready to Submit
                          </p>
                          <p className="text-xs font-bold text-gray-500">
                            {selectedItems.size} task
                            {selectedItems.size !== 1 ? "s" : ""} selected
                          </p>
                        </div>
                        <button
                          onClick={handleSubmit}
                          disabled={!canWrite || isSubmitting}
                          title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-black rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />{" "}
                              Submitting
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> Submit Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Infinite Scroll Sentinel */}
                {exactTotalAvailable > 0 && (
                  <div
                    ref={loadingRef}
                    className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm w-full"
                  >
                    {totalItemsRendered < exactTotalAvailable ? (
                      <div className="flex items-center space-x-3 bg-white px-6 py-3 rounded-full shadow-sm border border-gray-100">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="font-medium text-gray-600">
                          Loading more tasks...
                        </span>
                      </div>
                    ) : (
                      <span className="bg-gray-50 text-gray-400 px-4 py-2 rounded-full font-medium text-xs">
                        All tasks loaded.
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Repair Update Modal */}
        {isModalOpen && selectedUpdateTask && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-fade-in border border-blue-100">
              <div className="bg-gradient-to-r from-blue-50 to-pink-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-blue-800 uppercase">
                  Update Ticket #{selectedUpdateTask.id}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-blue-400 hover:text-blue-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleRepairUpdateSubmit} className="p-6">
                <div className="bg-blue-50 rounded border border-blue-200 p-3 mb-6 flex gap-4 text-sm">
                  <div className="flex-1">
                    <span className="block text-xs font-bold text-blue-500 uppercase mb-1">
                      Machine
                    </span>
                    <span className="text-gray-800 font-medium">
                      {selectedUpdateTask.machine_name}
                    </span>
                  </div>
                  <div className="flex-[2]">
                    <span className="block text-xs font-bold text-blue-500 uppercase mb-1">
                      Issue
                    </span>
                    {isAudioUrl(selectedUpdateTask.issue_description) ? (
                      <AudioPlayer url={selectedUpdateTask.issue_description} />
                    ) : (
                      <span className="text-gray-600">
                        {selectedUpdateTask.issue_description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="w-full p-2 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={updateForm.status}
                      onChange={(e) =>
                        setUpdateForm({ ...updateForm, status: e.target.value })
                      }
                    >
                      <option value="">Select Status...</option>
                      <option value="Completed">
                        ✅ Completed (कार्य पूर्ण)
                      </option>
                      <option value="Pending">⏳ Pending (लंबित कार्य)</option>
                      <option value="Observation">
                        🔍 Under Observation (निरीक्षण)
                      </option>
                      <option value="Temporary Fix">
                        🔄 Temporary Fix (अस्थायी/जुगाड़)
                      </option>
                      <option value="Cancelled">🚫 Cancelled (रद्द)</option>
                    </select>
                  </div>

                  {/* Conditional Fields for Completed Status */}
                  {updateForm.status === "Completed" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Part Replaced
                          </label>
                          <select
                            className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
                            value={updateForm.partReplaced}
                            onChange={(e) =>
                              setUpdateForm({
                                ...updateForm,
                                partReplaced: e.target.value,
                              })
                            }
                          >
                            <option value="">Select part...</option>
                            <option value="Part Replaced">Part Replaced</option>
                            <option value="Repairing">Repairing</option>
                            <option value="Service/Maintenance">
                              Service/Maintenance
                            </option>
                            <option value="Installation">Installation</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Vendor Name
                          </label>
                          <input
                            className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
                            value={updateForm.vendorName}
                            onChange={(e) =>
                              setUpdateForm({
                                ...updateForm,
                                vendorName: e.target.value,
                              })
                            }
                            placeholder="Enter vendor name..."
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                          Bill Amount (₹)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
                          value={updateForm.billAmount}
                          onChange={(e) =>
                            setUpdateForm({
                              ...updateForm,
                              billAmount: e.target.value,
                            })
                          }
                          placeholder="Enter bill amount..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                          Remarks
                        </label>
                        <textarea
                          className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
                          rows="2"
                          value={updateForm.remarks}
                          onChange={(e) =>
                            setUpdateForm({
                              ...updateForm,
                              remarks: e.target.value,
                            })
                          }
                          placeholder="Enter any additional remarks..."
                        ></textarea>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                          <Upload className="h-6 w-6 text-gray-400 mb-2" />
                          <span className="text-xs font-bold text-gray-500">
                            Photo of Work Done
                            {(selectedUpdateTask.require_attachment ||
                              selectedUpdateTask.attachment) && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </span>
                          <span className="text-[10px] text-gray-400 mt-1">
                            {updateForm.workPhoto
                              ? updateForm.workPhoto.name
                              : "Click to upload"}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) =>
                              setUpdateForm({
                                ...updateForm,
                                workPhoto: e.target.files[0],
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                          <Upload className="h-6 w-6 text-gray-400 mb-2" />
                          <span className="text-xs font-bold text-gray-500">
                            Bill Copy
                          </span>
                          <span className="text-[10px] text-gray-400 mt-1">
                            {updateForm.billCopy
                              ? updateForm.billCopy.name
                              : "Click to upload"}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) =>
                              setUpdateForm({
                                ...updateForm,
                                billCopy: e.target.files[0],
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {updateForm.status && updateForm.status !== "Completed" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Remarks
                      </label>
                      <textarea
                        className="w-full p-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
                        rows="3"
                        value={updateForm.remarks}
                        onChange={(e) =>
                          setUpdateForm({
                            ...updateForm,
                            remarks: e.target.value,
                          })
                        }
                        placeholder="Add remarks..."
                      ></textarea>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canWrite || isSubmitting}
                    title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}{" "}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      {/* MULTI-IMAGE LIGHTBOX POPUP MODAL */}
      {lightboxState.isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() =>
            setLightboxState({ isOpen: false, images: [], currentIndex: 0 })
          }
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="w-full flex items-center justify-between text-white pb-3 px-1">
              <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
                {lightboxState.currentIndex + 1} / {lightboxState.images.length}
              </span>
              <div className="flex items-center gap-2">
                {lightboxState.images[lightboxState.currentIndex]?.url && (
                  <a
                    href={lightboxState.images[lightboxState.currentIndex].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold px-3"
                    title="Open in new tab"
                  >
                    <ExternalLink size={14} /> Expand
                  </a>
                )}
                <button
                  onClick={() =>
                    setLightboxState({
                      isOpen: false,
                      images: [],
                      currentIndex: 0,
                    })
                  }
                  className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all"
                  title="Close (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Main Image View */}
            <div className="relative flex items-center justify-center w-full max-h-[78vh] overflow-hidden rounded-2xl bg-black/40 border border-white/10 shadow-2xl">
              <div className="relative inline-flex items-center justify-center max-h-[76vh] max-w-full">
                <img
                  src={lightboxState.images[lightboxState.currentIndex]?.url}
                  alt="Preview"
                  className="max-h-[76vh] max-w-full object-contain transition-all duration-200 select-none"
                />

                {/* Photo Location Overlay */}
                <PhotoLocationOverlay
                  locationMeta={
                    lightboxState.images[lightboxState.currentIndex]?.locationMeta
                  }
                />
              </div>

              {/* Left Arrow */}
              {lightboxState.images.length > 1 && (
                <button
                  onClick={() =>
                    setLightboxState((prev) => ({
                      ...prev,
                      currentIndex:
                        (prev.currentIndex - 1 + prev.images.length) %
                        prev.images.length,
                    }))
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all shadow-lg border border-white/20"
                  title="Previous Image"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* Right Arrow */}
              {lightboxState.images.length > 1 && (
                <button
                  onClick={() =>
                    setLightboxState((prev) => ({
                      ...prev,
                      currentIndex:
                        (prev.currentIndex + 1) % prev.images.length,
                    }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all shadow-lg border border-white/20"
                  title="Next Image"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Thumbnail navigation strip */}
            {lightboxState.images.length > 1 && (
              <div className="flex items-center gap-2 mt-3 overflow-x-auto max-w-full p-2 bg-black/40 rounded-xl border border-white/10 backdrop-blur-md">
                {lightboxState.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setLightboxState((prev) => ({
                        ...prev,
                        currentIndex: idx,
                      }))
                    }
                    className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                      idx === lightboxState.currentIndex
                        ? "border-blue-500 scale-105 shadow-md"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {lightboxImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-800 truncate">
                {lightboxImage.name}
              </span>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="bg-gray-900 flex items-center justify-center"
              style={{ minHeight: "320px" }}
            >
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Click outside or{" "}
                <span className="font-bold text-gray-600">✕</span> to close
              </p>
            </div>
          </div>
        </div>
      )}

      <WebCameraModal
        isOpen={cameraModal.open}
        onClose={() => setCameraModal({ open: false, taskId: null })}
        onCapture={handleCameraCapture}
      />
      <LocationPermissionModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
      />
    </AdminLayout>
  );
};

export default AllTasks;
