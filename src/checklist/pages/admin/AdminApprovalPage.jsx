import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDispatch } from "react-redux";
import AdminLayout from "../../components/layout/ChecklistLayout";
import { isAdministrator, isAdminOrSuperAdmin } from "../../utils/roleUtils";
import {
  fetchPendingApprovals,
  updateDelegationDoneStatus,
  rejectDelegationTask,
  fetchDelegationHistory,
} from "../../redux/api/delegationApi";
import {
  fetchPendingMaintenanceApprovals,
  approveMaintenanceTask,
  rejectMaintenanceTask,
  fetchApprovedMaintenance,
} from "../../redux/api/maintenanceApi";
import {
  fetchPendingRepairApprovals,
  approveRepairTask,
  rejectRepairTask,
  fetchApprovedRepairs,
} from "../../redux/api/repairApi";
import {
  fetchPendingChecklistApprovals,
  approveChecklistTask,
  rejectChecklistTask,
  fetchChecklistHistory,
} from "../../redux/api/quickTaskApi";
import {
  CheckCircle2,
  Search,
  AlertCircle,
  BookCheck,
  Briefcase,
  XCircle,
  History,
  Clock,
  User,
  Loader2,
  MessageSquare,
  FileText,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Eye,
} from "lucide-react";
import {
  sendTaskRejectionNotification,
  sendAdminExtensionRemarkNotification,
} from "../../services/whatsappService";
import { useMagicToast } from "../../context/MagicToastContext";
import RenderDescription from "../../components/RenderDescription";
import PhotoLocationOverlay from "../../components/PhotoLocationOverlay";
import { usePagePermission, READ_ONLY_TOOLTIP } from "../../utils/pagePermissionUtils";
import ReadOnlyBanner from "../../components/ReadOnlyBanner";

// Helper to determine file type from URL
const getFileType = (url) => {
  if (!url) return "image";
  
  // Clean URL of query parameters and hashes, then lowercase
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  
  if (cleanUrl.endsWith(".pdf")) return "pdf";
  
  const excelExtensions = [".xls", ".xlsx", ".csv", ".xlsm", ".xlsb", ".ods"];
  if (excelExtensions.some(ext => cleanUrl.endsWith(ext))) return "excel";
  
  const wordExtensions = [".doc", ".docx", ".odt", ".rtf", ".txt"];
  if (wordExtensions.some(ext => cleanUrl.endsWith(ext))) return "word";
  
  const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico", ".tiff", ".tif"];
  if (imageExtensions.some(ext => cleanUrl.endsWith(ext))) return "image";
  
  // Default to general document for any other non-image file types to prevent broken image previews
  return "document";
};

// Helper to extract all proof objects (array or single URL fallback)
const getProofImages = (task) => {
  const seen = new Set();
  const proofs = [];
  let locationData = task.image_location_data || task.location_data || null;

  if (typeof locationData === "string") {
    try {
      locationData = JSON.parse(locationData);
    } catch {
      // ignore
    }
  }

  const addProof = (url, label, index = 0) => {
    if (!url || typeof url !== "string" || seen.has(url)) return;
    seen.add(url);
    let locMeta = null;
    if (Array.isArray(locationData)) {
      locMeta = locationData[index] || locationData[0] || null;
    } else if (locationData && typeof locationData === "object") {
      locMeta = locationData;
    }
    proofs.push({ url, label, locationMeta: locMeta });
  };

  // Repair-specific attachments
  if (task.work_photo_url) addProof(task.work_photo_url, "Work Photo", 0);
  if (task.bill_copy_url) addProof(task.bill_copy_url, "Bill Copy", 1);

  // Multi-image array (new column image_urls)
  const imageUrls = task.image_urls;
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    imageUrls.forEach((url, i) =>
      addProof(
        url,
        `Proof ${imageUrls.length > 1 ? i + 1 : ""}`.trim(),
        i,
      ),
    );
  } else if (typeof imageUrls === "string" && imageUrls.startsWith("[")) {
    try {
      const parsed = JSON.parse(imageUrls);
      if (Array.isArray(parsed)) {
        parsed.forEach((url, i) =>
          addProof(
            url,
            `Proof ${parsed.length > 1 ? i + 1 : ""}`.trim(),
            i,
          ),
        );
      }
    } catch {
      // proof image URLs weren't valid JSON, skip parsing them
    }
  }

  // Single-image fallback fields (backward compatibility)
  const singleImg =
    task.image || task.image_url || task.img_url || task.uploaded_image_url;
  if (singleImg) {
    addProof(singleImg, "Proof", 0);
  }

  return proofs;
};

export default function AdminApprovalPage() {
  const { showToast } = useMagicToast();
  const { isReadOnly, canWrite: canAccessPage } = usePagePermission("checklist_approval");
  const canWrite = canAccessPage && isAdminOrSuperAdmin();
  const [activeTab, setActiveTab] = useState("checklist");
  const [viewMode, setViewMode] = useState("pending"); // 'pending' or 'history'
  const [pendingTasks, setPendingTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDoer, setSelectedDoer] = useState("");
  const [selectedGivenBy, setSelectedGivenBy] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [taskToReject, setTaskToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminRemarks, setAdminRemarks] = useState({}); // For extension remarks
  const [showBulkRemarkModal, setShowBulkRemarkModal] = useState(false);
  const [bulkRemark, setBulkRemark] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null); // Full-screen image URL
  const [lightboxState, setLightboxState] = useState({
    isOpen: false,
    images: [],
    currentIndex: 0,
  });
  const loadingRef = useRef(null);
  const dispatch = useDispatch();

  const openLightbox = (images, startIndex = 0) => {
    setLightboxState({
      isOpen: true,
      images,
      currentIndex: startIndex,
    });
  };

  // Esc key listener for Lightbox modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setLightboxState({ isOpen: false, images: [], currentIndex: 0 });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExtensionRemark = async (task) => {
    if (!canWrite) return;
    const remark = adminRemarks[task.id];
    if (!remark || !remark.trim()) {
      showToast("Please enter a remark.", "error");
      return;
    }

    setProcessingId(task.id);
    try {
      // we dont need to store the remark only send to the user via whatsapp

      // Send notification
      await sendAdminExtensionRemarkNotification({
        doerName: task.doer_name || task.name || task.filled_by,
        taskId: task.original_task_id || task.task_id || task.id,
        description: task.task_description || task.issue_description,
        remark: remark,
      });

      showToast("Remark sent successfully!", "success");
      // Clear remark for this task
      setAdminRemarks((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    } catch (error) {
      console.error("Error sending remark:", error);
      showToast(
        "Failed to send remark: " + (error.message || "Unknown error"),
        "error",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setPendingTasks([]);
    let data = [];
    try {
      if (viewMode === "pending") {
        if (activeTab === "delegation") data = await fetchPendingApprovals();
        else if (activeTab === "maintenance")
          data = await fetchPendingMaintenanceApprovals();
        else if (activeTab === "repair")
          data = await fetchPendingRepairApprovals();
        else if (activeTab === "checklist")
          data = await fetchPendingChecklistApprovals();
      } else {
        // History Mode
        if (activeTab === "delegation") data = await fetchDelegationHistory();
        else if (activeTab === "maintenance")
          data = await fetchApprovedMaintenance();
        else if (activeTab === "repair") data = await fetchApprovedRepairs();
        else if (activeTab === "checklist")
          data = await fetchChecklistHistory();
      }

      // Deduplicate data to ensure each task only shows once
      const seenIds = new Set();
      const uniqueData = (data || []).filter((task) => {
        // Use task_id or original_task_id as the primary key for deduplication
        const baseId = task.task_id || task.original_task_id || task.id;
        if (!baseId || seenIds.has(baseId)) return false;
        seenIds.add(baseId);
        return true;
      });
      data = uniqueData; // Update 'data' with unique data
    } catch (error) {
      console.error("Error loading tasks:", error);
    }
    const userRole = localStorage.getItem("role");
    const username = localStorage.getItem("user-name");
    const currentUsername = (username || "").toLowerCase();
    const currentUserRole = (userRole || "").toLowerCase();
    const isFullAdmin = isAdminOrSuperAdmin(currentUserRole, currentUsername);

    // Only admins and super admins review submissions.
    const filteredData = isFullAdmin ? data || [] : [];

    setPendingTasks(filteredData);
    setLoading(false);
  }, [activeTab, viewMode]);

  useEffect(() => {
    loadTasks();
    setVisibleCount(50); // Reset count on tab/mode change
    setSelectedTaskIds([]); // Reset selection
    setSelectedDoer("");
    setSelectedGivenBy("");
    setSelectedDepartment("");
  }, [loadTasks]);

  // Intersection Observer for infinite scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
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
  }, [loading]);

  const handleApprove = async (task) => {
    if (!canWrite) return;
    const doerName = (
      task.doer_name ||
      task.name ||
      task.filled_by ||
      ""
    ).toLowerCase();
    const currentUsername = (
      localStorage.getItem("user-name") || ""
    ).toLowerCase();
    const currentUserRole = (localStorage.getItem("role") || "").toLowerCase();
    const isFullAdmin = isAdminOrSuperAdmin(currentUserRole, currentUsername);

    if (!isFullAdmin && doerName === currentUsername) {
      showToast("You cannot approve your own submitted task.", "error");
      return;
    }

    setProcessingId(task.id);
    if (!task.id) {
      console.error("Task ID is missing!", task);
      showToast("Failed to approve task: Task ID is missing", "error");
      setProcessingId(null);
      return;
    }

    try {
      if (activeTab === "delegation") {
        await dispatch(
          updateDelegationDoneStatus({
            id: task.id,
            status: "done",
            taskId: task.task_id,
          }),
        ).unwrap();
      } else if (activeTab === "maintenance") {
        await approveMaintenanceTask(task.id);
      } else if (activeTab === "repair") {
        await approveRepairTask(task.id);
      } else if (activeTab === "checklist") {
        await approveChecklistTask(task.id);
      }

      // Remove from list
      setPendingTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast("Task approved successfully!", "success");
    } catch (error) {
      console.error("Detailed error in handleApprove:", error);
      showToast(
        "Failed to approve task: " + (error.message || "Unknown error"),
        "error",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (task) => {
    if (!canWrite) return;
    setTaskToReject(task);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const toggleSelectAll = () => {
    if (
      selectedTaskIds.length === paginatedTasks.length &&
      paginatedTasks.length > 0
    ) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(paginatedTasks.map((t) => t.id));
    }
  };

  const handleBulkApprove = async () => {
    if (!canWrite) return;
    if (selectedTaskIds.length === 0) return;

    const currentUsername = (
      localStorage.getItem("user-name") || ""
    ).toLowerCase();

    setBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;

    // Only approve tasks that are NOT in 'extend' status AND (NOT submitted by current user OR user is system admin)
    const tasksToApprove = pendingTasks.filter((t) => {
      const isSelected = selectedTaskIds.includes(t.id);
      const isNotExtended = t.status !== "extend";
      const doerName = (
        t.doer_name ||
        t.name ||
        t.filled_by ||
        ""
      ).toLowerCase();
      const currentUserRole = (
        localStorage.getItem("role") || ""
      ).toLowerCase();
      const isSystemAdmin = isAdminOrSuperAdmin(currentUserRole, currentUsername);
      const isNotSelf = isSystemAdmin || doerName !== currentUsername;

      return isSelected && isNotExtended && isNotSelf;
    });

    if (tasksToApprove.length === 0) {
      showToast("No valid tasks found for approval.", "warning");
      setBulkProcessing(false);
      return;
    }

    for (const task of tasksToApprove) {
      try {
        if (activeTab === "delegation") {
          await dispatch(
            updateDelegationDoneStatus({
              id: task.id,
              status: "done",
              taskId: task.task_id,
            }),
          ).unwrap();
        } else if (activeTab === "maintenance") {
          await approveMaintenanceTask(task.id);
        } else if (activeTab === "repair") {
          await approveRepairTask(task.id);
        } else if (activeTab === "checklist") {
          await approveChecklistTask(task.id);
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to approve task ${task.id}:`, error);
        failCount++;
      }
    }

    loadTasks();
    setSelectedTaskIds([]);
    setBulkProcessing(false);

    if (failCount === 0) {
      showToast(`Successfully approved ${successCount} tasks!`, "success");
    } else {
      showToast(
        `Approved ${successCount} tasks, ${failCount} failed.`,
        "warning",
      );
    }
  };

  const handleBulkRemark = async () => {
    if (!canWrite) return;
    if (!bulkRemark.trim()) {
      showToast("Please enter a remark.", "error");
      return;
    }

    setBulkProcessing(true);
    setShowBulkRemarkModal(false);

    const tasksToRemark = pendingTasks.filter(
      (t) => selectedTaskIds.includes(t.id) && t.status === "extend",
    );
    let count = 0;

    for (const task of tasksToRemark) {
      try {
        await sendAdminExtensionRemarkNotification({
          doerName: task.doer_name || task.name || task.filled_by,
          taskId: task.original_task_id || task.task_id || task.id,
          description: task.task_description || task.issue_description,
          remark: bulkRemark,
        });
        count++;
      } catch (err) {
        console.error("Bulk remark failed for task:", task.id, err);
      }
    }

    setBulkProcessing(false);
    setBulkRemark("");
    setSelectedTaskIds([]);
    showToast(`Sent remarks to ${count} users.`, "success");
  };

  const confirmReject = async () => {
    if (!canWrite) return;
    if (!taskToReject) return;
    if (!rejectionReason.trim()) {
      showToast("Rejection reason is required.", "error");
      return;
    }

    const task = taskToReject;
    const reason = rejectionReason;

    setProcessingId(task.id);
    setShowRejectModal(false);

    try {
      if (activeTab === "delegation") {
        await rejectDelegationTask(task.id, task.task_id, reason);
      } else if (activeTab === "maintenance") {
        await rejectMaintenanceTask(task.id, reason);
      } else if (activeTab === "repair") {
        await rejectRepairTask(task.id, reason);
      } else if (activeTab === "checklist") {
        await rejectChecklistTask(task.id, reason);
      }

      // Send notification
      await sendTaskRejectionNotification({
        doerName: task.doer_name || task.name || task.filled_by,
        taskId: task.id, // Or visible task ID
        description: task.task_description || task.issue_description,
        taskType: activeTab,
        reason: reason,
      });

      // Remove from list
      setPendingTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast("Task rejected successfully!", "success");
    } catch (error) {
      console.error("Error rejecting task:", error);
      showToast(
        "Failed to reject task: " + (error.message || "Unknown error"),
        "error",
      );
    } finally {
      setProcessingId(null);
      setTaskToReject(null);
    }
  };

  const availableDoers = useMemo(() => {
    const set = new Set();
    (pendingTasks || []).forEach((t) => {
      const doer = t.doer_name || t.name || t.filled_by;
      if (doer && typeof doer === "string" && doer.trim()) {
        set.add(doer.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pendingTasks]);

  const availableGivenBy = useMemo(() => {
    const set = new Set();
    (pendingTasks || []).forEach((t) => {
      const givenBy = t.given_by || t.assign_from || t.assigned_by || t.created_by;
      if (givenBy && typeof givenBy === "string" && givenBy.trim()) {
        set.add(givenBy.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pendingTasks]);

  const availableDepartments = useMemo(() => {
    const set = new Set();
    (pendingTasks || []).forEach((t) => {
      const dept = t.department;
      if (dept && typeof dept === "string" && dept.trim()) {
        set.add(dept.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pendingTasks]);

  const filteredTasks = pendingTasks.filter((task) => {
    if (selectedDoer) {
      const doer = (task.doer_name || task.name || task.filled_by || "").trim();
      if (doer.toLowerCase() !== selectedDoer.toLowerCase()) return false;
    }
    if (selectedGivenBy) {
      const givenBy = (
        task.given_by ||
        task.assign_from ||
        task.assigned_by ||
        task.created_by ||
        ""
      ).trim();
      if (givenBy.toLowerCase() !== selectedGivenBy.toLowerCase()) return false;
    }
    if (selectedDepartment) {
      const dept = (task.department || "").trim();
      if (dept.toLowerCase() !== selectedDepartment.toLowerCase()) return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      task.doer_name?.toLowerCase().includes(term) ||
      task.name?.toLowerCase().includes(term) ||
      task.task_description?.toLowerCase().includes(term) ||
      task.given_by?.toLowerCase().includes(term) ||
      task.machine_name?.toLowerCase().includes(term) ||
      task.issue_description?.toLowerCase().includes(term) ||
      task.department?.toLowerCase().includes(term)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      // Ensure proper Indian Standard Time formatting
      const date = new Date(dateStr);
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const paginatedTasks = filteredTasks.slice(0, visibleCount);

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {isReadOnly && <ReadOnlyBanner className="mb-3" />}
        {/* Header and Controls */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-3 space-y-2.5">
          {/* Row 1: Title + System Tabs + View Mode Switcher + Badge */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-lg font-black text-gray-900 tracking-tight shrink-0 flex items-center gap-2">
                <span className="w-1.5 h-5 bg-blue-600 rounded-full inline-block" />
                Admin <span className="text-blue-600">Approval</span>
              </h1>

              {/* Tabs */}
              <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200/60 overflow-x-auto no-scrollbar">
                {[
                  {
                    id: "checklist",
                    label: "Checklist",
                    icon: BookCheck,
                    color: "bg-blue-600",
                  },
                  {
                    id: "delegation",
                    label: "Delegation",
                    icon: BookCheck,
                    color: "bg-indigo-600",
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg text-xs font-extrabold transition-all duration-200 whitespace-nowrap shrink-0 z-10 ${
                      activeTab === tab.id
                        ? "text-white"
                        : "text-gray-600 hover:text-blue-600"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="approvalTabPillMinimal"
                        className={`absolute inset-0 rounded-lg shadow-xs z-[-1] ${tab.color}`}
                        transition={{
                          type: "spring",
                          bounce: 0.2,
                          duration: 0.5,
                        }}
                      />
                    )}
                    <tab.icon size={13} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
              {/* Pending / History Switcher */}
              <div className="flex items-center bg-gray-100 rounded-xl p-0.5 border border-gray-200/60">
                <button
                  onClick={() => setViewMode("pending")}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all ${
                    viewMode === "pending"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Clock size={12} />
                  Pending
                </button>
                <button
                  onClick={() => setViewMode("history")}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all ${
                    viewMode === "history"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <History size={12} />
                  History
                </button>
              </div>

              {/* Pending Count Badge */}
              <div className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200/60 text-xs font-extrabold flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                {pendingTasks.length}{" "}
                {viewMode === "pending" ? "Pending" : "Total"}
              </div>

              {/* Bulk Action Buttons if items selected */}
              {viewMode === "pending" && selectedTaskIds.length > 0 && (
                <button
                  onClick={handleBulkApprove}
                  disabled={!canWrite || bulkProcessing}
                  title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                  className="px-3 py-1 bg-emerald-600 text-white rounded-lg shadow-xs flex items-center gap-1 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  <CheckCircle2 size={13} />
                  Approve (
                  {
                    pendingTasks.filter(
                      (t) =>
                        selectedTaskIds.includes(t.id) &&
                        t.status !== "extend",
                    ).length
                  }
                  )
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Search + 3 Dropdown Filters Inline */}
          <div className="flex flex-col md:flex-row items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={14}
              />
              <input
                type="text"
                placeholder="Search tasks or doers..."
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

            {/* Dropdown Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto shrink-0">
              <div className="relative min-w-[130px]">
                <select
                  value={selectedDoer}
                  onChange={(e) => setSelectedDoer(e.target.value)}
                  className="w-full pl-2.5 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold text-gray-700 appearance-none cursor-pointer"
                >
                  <option value="">All Doers</option>
                  {availableDoers.map((doer) => (
                    <option key={doer} value={doer}>
                      {doer}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>

              <div className="relative min-w-[130px]">
                <select
                  value={selectedGivenBy}
                  onChange={(e) => setSelectedGivenBy(e.target.value)}
                  className="w-full pl-2.5 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold text-gray-700 appearance-none cursor-pointer"
                >
                  <option value="">All Assign By</option>
                  {availableGivenBy.map((givenBy) => (
                    <option key={givenBy} value={givenBy}>
                      {givenBy}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>

              <div className="flex items-center gap-1.5 min-w-[130px]">
                <div className="relative flex-1">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full pl-2.5 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold text-gray-700 appearance-none cursor-pointer"
                  >
                    <option value="">All Departments</option>
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>

                {(selectedDoer || selectedGivenBy || selectedDepartment || searchTerm) && (
                  <button
                    onClick={() => {
                      setSelectedDoer("");
                      setSelectedGivenBy("");
                      setSelectedDepartment("");
                      setSearchTerm("");
                    }}
                    className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {viewMode === "pending" && (
                    <th className="px-3 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        checked={
                          selectedTaskIds.length === paginatedTasks.length &&
                          paginatedTasks.length > 0
                        }
                        onChange={toggleSelectAll}
                        disabled={!canWrite}
                        title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {activeTab === "delegation" ||
                    activeTab === "checklist"
                      ? "Task Description"
                      : activeTab === "maintenance"
                        ? "Task/Machine"
                        : "Issue/Machine"}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {viewMode === "pending"
                      ? "Submission Time"
                      : "Approval Data"}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Proof
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={viewMode === "pending" ? "8" : "7"}
                      className="px-6 py-10 text-center text-gray-500"
                    >
                      <div className="flex justify-center mb-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                      Loading...
                    </td>
                  </tr>
                ) : paginatedTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={viewMode === "pending" ? "8" : "7"}
                      className="px-6 py-10 text-center text-gray-500"
                    >
                      No {viewMode} approvals found.
                    </td>
                  </tr>
                ) : (
                  paginatedTasks.map((task) => (
                    <tr
                      key={task.id}
                      className={`hover:bg-gray-50 transition-colors ${selectedTaskIds.includes(task.id) ? "bg-blue-50/50" : ""}`}
                    >
                      {viewMode === "pending" && (
                        <td className="px-3 py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            checked={selectedTaskIds.includes(task.id)}
                            onChange={() => toggleTaskSelection(task.id)}
                            disabled={!canWrite}
                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs font-extrabold text-gray-900">
                          {task.doer_name || task.name || task.filled_by}
                        </div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">
                          By: {task.given_by || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs lg:max-w-sm xl:max-w-md break-words">
                        <RenderDescription
                          text={task.task_description || task.issue_description}
                          audioUrl={task.audio_url}
                          instructionUrl={task.instruction_attachment_url}
                          instructionType={task.instruction_attachment_type}
                        />
                        {(task.machine_name || task.part_name) && (
                          <div className="text-[10px] text-indigo-600 font-bold mt-1.5 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded inline-block">
                            Machine: {task.machine_name}{" "}
                            {task.part_name ? `(${task.part_name})` : ""}
                          </div>
                        )}
                        {task.reason && (
                          <div className="text-xs text-amber-600 mt-1 font-medium bg-amber-50 px-2 py-0.5 rounded">
                            Note: {task.reason}
                          </div>
                        )}
                        {(task.remarks || task.remark) && (
                          <div className="text-xs text-gray-500 mt-1 italic">
                            Remark: {task.remarks || task.remark}
                          </div>
                        )}
                        {task.status === "extend" && task.next_extend_date && (
                          <div className="text-[10px] font-bold text-amber-600 mt-2 uppercase bg-amber-50 px-2 py-0.5 rounded-sm inline-block tracking-widest">
                            Extended To: {formatDate(task.next_extend_date)}
                          </div>
                        )}
                        {task.status && task.status !== "extend" && (
                          <div className="text-[10px] font-bold text-blue-600 mt-2 uppercase bg-blue-50 px-2 py-0.5 rounded-sm inline-block tracking-widest">
                            Status: {task.status}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {task.department || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {viewMode === "pending" ? (
                          <span className="text-xs text-gray-500 font-medium">
                            {formatDate(
                              task.submission_date ||
                                task.submission_timestamp ||
                                task.created_at,
                            )}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                              Approved By
                            </span>
                            <span className="text-xs font-bold text-gray-800">
                              {task.admin_approved_by || "Admin"}
                            </span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                              At Time
                            </span>
                            <span className="text-xs text-blue-600 font-medium">
                              {formatDate(
                                task.admin_approval_date ||
                                  task.updated_at ||
                                  task.submission_date,
                              )}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(() => {
                          const proofs = getProofImages(task);

                          if (proofs.length === 0)
                            return (
                              <span className="text-gray-300 text-xs italic">
                                No Proof
                              </span>
                            );

                          return (
                            <div
                              onClick={() => openLightbox(proofs, 0)}
                              className="inline-flex items-center gap-2.5 cursor-pointer group"
                              title="Click to view proof images"
                            >
                              <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-blue-200 shadow-xs bg-gray-50 flex items-center justify-center group-hover:scale-105 group-hover:border-blue-400 group-hover:shadow-md transition-all">
                                {getFileType(proofs[0].url) === "image" ? (
                                  <img
                                    src={proofs[0].url}
                                    className="w-full h-full object-cover"
                                    alt={proofs[0].label}
                                  />
                                ) : (
                                  <div className="w-full h-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <FileText size={20} />
                                  </div>
                                )}
                                {proofs.length > 1 && (
                                  <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px] flex items-center justify-center text-white font-black text-xs">
                                    +{proofs.length - 1}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-gray-800 group-hover:text-blue-600 transition-colors flex items-center gap-1">
                                  <Eye size={13} className="text-blue-500" />
                                  {proofs.length === 1
                                    ? "View Proof"
                                    : `View Proofs (${proofs.length})`}
                                </span>
                                <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tight">
                                  Click to open
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-medium">
                        {viewMode === "pending" ? (
                          task.status === "extend" ? (
                            <div className="flex flex-col gap-1.5 min-w-[170px]">
                              <textarea
                                placeholder="Add administrative remark..."
                                className="text-xs p-1.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 min-h-[50px]"
                                value={adminRemarks[task.id] || ""}
                                onChange={(e) =>
                                  setAdminRemarks((prev) => ({
                                    ...prev,
                                    [task.id]: e.target.value,
                                  }))
                                }
                              />
                              <button
                                onClick={() => handleExtensionRemark(task)}
                                disabled={!canWrite || processingId === task.id}
                                title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                className="flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[11px] font-bold"
                              >
                                {processingId === task.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <MessageSquare size={12} />
                                )}
                                Send Remark
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleApprove(task)}
                                disabled={!canWrite || processingId === task.id}
                                title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs text-xs font-extrabold active:scale-95 cursor-pointer"
                              >
                                {processingId === task.id ? (
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                ) : (
                                  <CheckCircle2 size={13} />
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(task)}
                                disabled={!canWrite || processingId === task.id}
                                title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-extrabold active:scale-95 cursor-pointer"
                              >
                                <XCircle size={13} />
                                Reject
                              </button>
                            </div>
                          )
                        ) : task.status === "rejected" ||
                          task.rejection_reason ? (
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-800"
                            title={task.rejection_reason || task.reason}
                          >
                            Rejected
                          </span>
                        ) : task.status === "extend" ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-yellow-100 text-yellow-800">
                            Extended
                          </span>
                        ) : task.status === "pending" ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-800">
                            Pending Approval
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-800">
                            Approved
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile view Toolbar */}
          {viewMode === "pending" && (
            <div className="md:hidden z-30 transition-all duration-300">
              <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedTaskIds.length === paginatedTasks.length &&
                        paginatedTasks.length > 0
                      }
                      onChange={toggleSelectAll}
                      disabled={!canWrite}
                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition-all cursor-pointer"
                    />
                  </div>
                  <span className="text-sm font-black text-gray-700 uppercase tracking-tight">
                    Select All Pending
                  </span>
                </div>

                {selectedTaskIds.length > 0 && (
                  <button
                    onClick={() => setSelectedTaskIds([])}
                    className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                  >
                    Clear ({selectedTaskIds.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100 pb-24">
            {loading ? (
              <div className="p-10 text-center text-gray-500">
                <div className="flex justify-center mb-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
                <p className="text-sm font-medium">Loading tasks...</p>
              </div>
            ) : paginatedTasks.length === 0 ? (
              <div className="p-10 text-center text-gray-500 bg-gray-50/50">
                <BookCheck size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm font-medium">No tasks found</p>
              </div>
            ) : (
              paginatedTasks.map((task) => (
                <div
                  key={`card-${task.id}`}
                  className={`p-4 space-y-4 hover:bg-blue-50/30 transition-colors ${selectedTaskIds.includes(task.id) ? "bg-blue-50/80 border-l-4 border-l-blue-500" : ""}`}
                >
                  {/* Card Header: User & Info */}
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      {viewMode === "pending" && (
                        <input
                          type="checkbox"
                          className="w-5 h-5 mt-1 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={() => toggleTaskSelection(task.id)}
                          disabled={!canWrite}
                          title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                        />
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900">
                          {task.doer_name || task.name || task.filled_by}
                        </p>
                        <div className="space-y-1 mt-1">
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Clock size={10} />{" "}
                            {viewMode === "pending" ? "Submitted" : "Approved"}:{" "}
                            {formatDate(
                              viewMode === "pending"
                                ? task.submission_date ||
                                    task.submission_timestamp ||
                                    task.created_at
                                : task.admin_approval_date ||
                                    task.updated_at ||
                                    task.submission_date,
                            )}
                          </p>
                          {viewMode === "history" && (
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                              <User size={10} /> By:{" "}
                              {task.admin_approved_by || "Admin"}
                            </p>
                          )}
                          {task.status === "extend" && (
                            <p className="text-[10px] text-amber-600 font-black uppercase tracking-wider flex items-center gap-1 mt-0.5">
                              <Clock size={10} /> Extended To:{" "}
                              {formatDate(task.next_extend_date)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        {task.department || "No Dept"}
                      </span>
                    </div>
                  </div>

                  {/* Task Content */}
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                    <RenderDescription
                      text={task.task_description || task.issue_description}
                      audioUrl={task.audio_url}
                      instructionUrl={task.instruction_attachment_url}
                      instructionType={task.instruction_attachment_type}
                    />

                    {(task.machine_name || task.part_name) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                          Machine: {task.machine_name}
                        </span>
                        {task.part_name && (
                          <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                            Part: {task.part_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* proof & Metadata */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Given By:{" "}
                      <span className="text-gray-600 block sm:inline">
                        {task.given_by || "-"}
                      </span>
                    </div>
                    {(() => {
                      const proofs = getProofImages(task);

                      if (proofs.length === 0)
                        return (
                          <span className="text-gray-300 text-[10px] italic">
                            No Proof
                          </span>
                        );

                      return (
                        <div
                          onClick={() => openLightbox(proofs, 0)}
                          className="flex items-center gap-2 cursor-pointer group"
                          title="Tap to view proof images"
                        >
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-blue-200 shadow-xs bg-white flex items-center justify-center group-active:scale-95 transition-all">
                            {getFileType(proofs[0].url) === "image" ? (
                              <img
                                src={proofs[0].url}
                                className="w-full h-full object-cover"
                                alt={proofs[0].label}
                              />
                            ) : (
                              <div className="w-full h-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <FileText size={20} />
                              </div>
                            )}
                            {proofs.length > 1 && (
                              <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px] flex items-center justify-center text-white font-black text-xs">
                                +{proofs.length - 1}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-xs font-bold text-blue-600 underline flex items-center gap-1 justify-end">
                              <Eye size={12} />
                              {proofs.length === 1
                                ? "View Proof"
                                : `Proofs (${proofs.length})`}
                            </span>
                            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tight">
                              Tap to open
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div className="pt-2">
                    {viewMode === "pending" ? (
                      task.status === "extend" ? (
                        <div className="flex flex-col gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                          <textarea
                            placeholder="Add administrative remark..."
                            className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-blue-500 min-h-[80px] bg-white shadow-sm"
                            value={adminRemarks[task.id] || ""}
                            onChange={(e) =>
                              setAdminRemarks((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            onClick={() => handleExtensionRemark(task)}
                            disabled={!canWrite || processingId === task.id}
                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                            className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all w-full"
                          >
                            {processingId === task.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <MessageSquare size={16} />
                            )}
                            Send Remark to User
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleApprove(task)}
                            disabled={!canWrite || processingId === task.id}
                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                            className="flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black shadow-lg shadow-green-100 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                          >
                            {processingId === task.id ? (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <CheckCircle2 size={16} />
                            )}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(task)}
                            disabled={!canWrite || processingId === task.id}
                            title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                            className="flex items-center justify-center gap-2 py-2.5 bg-red-100 text-red-600 rounded-xl text-xs font-black active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle size={16} />
                            Reject
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="text-center">
                        {task.rejection_reason ? (
                          <span className="block w-full py-1.5 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest rounded-lg">
                            Rejected: {task.rejection_reason}
                          </span>
                        ) : (
                          <span className="block w-full py-1.5 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-lg">
                            Approved ✅
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mobile Floating Action Bar */}
        {viewMode === "pending" && selectedTaskIds.length > 0 && (
          <div className="md:hidden fixed bottom-6 left-4 right-4 z-40 animate-in slide-in-from-bottom-8 duration-500">
            <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-blue-100 p-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="pl-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-0.5">
                    Admin Action
                  </p>
                  <p className="text-xs font-bold text-gray-500">
                    {selectedTaskIds.length} items
                  </p>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {/* Approve Button */}
                  {(activeTab !== "delegation" ||
                    pendingTasks.filter(
                      (t) =>
                        selectedTaskIds.includes(t.id) && t.status !== "extend",
                    ).length > 0) && (
                    <button
                      onClick={handleBulkApprove}
                      disabled={!canWrite || bulkProcessing}
                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      className="px-4 py-2.5 bg-green-600 text-white text-xs font-black rounded-xl shadow-lg shadow-green-100 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {bulkProcessing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Approve (
                      {
                        pendingTasks.filter(
                          (t) =>
                            selectedTaskIds.includes(t.id) &&
                            t.status !== "extend",
                        ).length
                      }
                      )
                    </button>
                  )}

                  {/* Remark Button for Delegation */}
                  {activeTab === "delegation" &&
                    pendingTasks.filter(
                      (t) =>
                        selectedTaskIds.includes(t.id) && t.status === "extend",
                    ).length > 0 && (
                      <button
                        onClick={() => setShowBulkRemarkModal(true)}
                        disabled={!canWrite || bulkProcessing}
                        title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                        className="px-4 py-2.5 bg-blue-600 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MessageSquare size={14} />
                        Remark (
                        {
                          pendingTasks.filter(
                            (t) =>
                              selectedTaskIds.includes(t.id) &&
                              t.status === "extend",
                          ).length
                        }
                        )
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Infinite Scroll Trigger */}
        <div ref={loadingRef} className="py-8 flex justify-center">
          {paginatedTasks.length < filteredTasks.length && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">
                Loading more records...
              </span>
            </div>
          )}
          {paginatedTasks.length >= filteredTasks.length &&
            filteredTasks.length > 0 && (
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                — End of List —
              </span>
            )}
        </div>

        {/* Rejection Modal */}
        <AnimatePresence>
          {showRejectModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRejectModal(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900">
                        Reject Task
                      </h3>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Provide a reason for rejection
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Rejection Reason
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Example: Proof is blurry, Task not completed properly..."
                      className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50 transition-all resize-none"
                      autoFocus
                    />
                    <p className="text-[10px] text-gray-400 italic px-1">
                      * User will be notified via WhatsApp including this
                      reason.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowRejectModal(false)}
                      className="flex-1 py-3 text-sm font-black text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmReject}
                      disabled={!canWrite}
                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      className="flex-[2] py-3 text-sm font-black text-white bg-red-600 shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Bulk Remark Modal */}
        <AnimatePresence>
          {showBulkRemarkModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 ring-4 ring-white/50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 leading-tight">
                        Bulk Remark
                      </h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                        Extended Delegation Tasks
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Universal Remark
                    </label>
                    <textarea
                      value={bulkRemark}
                      onChange={(e) => setBulkRemark(e.target.value)}
                      placeholder="Example: Keep up the good work, Please complete by today evening..."
                      className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all resize-none shadow-inner"
                      autoFocus
                    />
                    <p className="text-[10px] text-gray-400 italic px-1 flex items-center gap-1.5 font-medium">
                      <AlertCircle size={10} />
                      Notification will be sent to{" "}
                      {
                        pendingTasks.filter(
                          (t) =>
                            selectedTaskIds.includes(t.id) &&
                            t.status === "extend",
                        ).length
                      }{" "}
                      users.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowBulkRemarkModal(false);
                        setBulkRemark("");
                      }}
                      className="flex-1 py-3.5 text-xs font-black text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all border border-gray-100"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleBulkRemark}
                      disabled={!canWrite || !bulkRemark.trim()}
                      title={!canWrite ? READ_ONLY_TOOLTIP : undefined}
                      className="flex-[2] py-3.5 text-xs font-black text-white bg-blue-600 shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all rounded-2xl disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:cursor-not-allowed"
                    >
                      SEND REMARKS
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Multi-Image Gallery Lightbox Modal */}
        <AnimatePresence>
          {lightboxState.isOpen && (
            <div
              className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
              onClick={() =>
                setLightboxState({
                  isOpen: false,
                  images: [],
                  currentIndex: 0,
                })
              }
            >
              <div
                className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Bar */}
                <div className="w-full flex items-center justify-between text-white pb-3 px-1">
                  <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
                    {lightboxState.currentIndex + 1} /{" "}
                    {lightboxState.images.length}
                  </span>
                  <div className="flex items-center gap-2">
                    {lightboxState.images[lightboxState.currentIndex]?.url && (
                      <a
                        href={
                          lightboxState.images[lightboxState.currentIndex].url
                        }
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
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>

                {/* Main View */}
                <div className="relative flex items-center justify-center w-full max-h-[78vh] overflow-hidden rounded-2xl bg-black/40 border border-white/10 shadow-2xl">
                  {getFileType(
                    lightboxState.images[lightboxState.currentIndex]?.url,
                  ) === "image" ? (
                    <div className="relative inline-flex items-center justify-center max-h-[76vh] max-w-full">
                      <img
                        src={
                          lightboxState.images[lightboxState.currentIndex]?.url
                        }
                        alt="Proof"
                        className="max-h-[76vh] max-w-full object-contain transition-all duration-200 select-none"
                      />
                      <PhotoLocationOverlay
                        locationMeta={
                          lightboxState.images[lightboxState.currentIndex]
                            ?.locationMeta
                        }
                      />
                    </div>
                  ) : getFileType(
                      lightboxState.images[lightboxState.currentIndex]?.url,
                    ) === "pdf" ? (
                    <iframe
                      src={
                        lightboxState.images[lightboxState.currentIndex]?.url
                      }
                      className="w-[85vw] md:w-[65vw] h-[72vh] bg-white rounded-2xl border-none shadow-2xl"
                      title="PDF Proof"
                    />
                  ) : (
                    <div className="w-[85vw] max-w-lg bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                      <div className="p-5 rounded-2xl mb-4 bg-blue-50 text-blue-600">
                        <FileText size={48} />
                      </div>
                      <h3 className="text-lg font-black text-gray-900 mb-2">
                        Document Proof
                      </h3>
                      <a
                        href={
                          lightboxState.images[lightboxState.currentIndex]?.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg"
                      >
                        Open File
                      </a>
                    </div>
                  )}

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

                {/* Thumbnail Strip */}
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
        </AnimatePresence>

        {/* Lightbox / Full Screen Modal */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10 cursor-zoom-out"
              onClick={() => setSelectedImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              >
                {getFileType(selectedImage) === "image" ? (
                  <img
                    src={selectedImage}
                    alt="Full Proof"
                    className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl border-4 border-white/20"
                  />
                ) : getFileType(selectedImage) === "pdf" ? (
                  <iframe
                    src={selectedImage}
                    className="w-[90vw] md:w-[70vw] h-[75vh] bg-white rounded-2xl border-none shadow-2xl"
                    title="PDF Document"
                  />
                ) : (
                  <div className="w-[90vw] max-w-lg bg-white rounded-3xl p-8 flex flex-col items-center justify-center border border-gray-100 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
                    <div className={`p-5 rounded-2xl mb-4 ${getFileType(selectedImage) === "excel" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                      {getFileType(selectedImage) === "excel" ? (
                        <FileSpreadsheet size={48} />
                      ) : (
                        <FileText size={48} />
                      )}
                    </div>
                    <h3 className="text-lg font-black text-gray-900 mb-2">
                      {getFileType(selectedImage) === "excel"
                        ? "Excel Spreadsheet"
                        : getFileType(selectedImage) === "word"
                          ? "Word Document"
                          : "Document"}
                    </h3>
                    <p className="text-xs font-bold text-gray-400 mb-6 truncate max-w-full px-4">
                      {selectedImage.split("/").pop().split("?")[0]}
                    </p>
                    <div className="flex gap-4 w-full">
                      <a
                        href={selectedImage}
                        download
                        className={`flex-1 py-3.5 text-white text-xs font-black rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-center ${getFileType(selectedImage) === "excel" ? "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700" : "bg-blue-600 shadow-blue-100 hover:bg-blue-700"}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download File
                      </a>
                      <a
                        href={selectedImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3.5 bg-gray-50 text-gray-600 text-xs font-black rounded-2xl border border-gray-200/80 hover:bg-gray-100 active:scale-95 transition-all uppercase tracking-widest text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open in New Tab
                      </a>
                    </div>
                  </div>
                )}
                <div className="absolute -top-12 left-0 right-0 flex justify-between items-center text-white px-2">
                  <span className="text-sm font-bold bg-black/40 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
                    {getFileType(selectedImage) === "image"
                      ? "Image Proof"
                      : getFileType(selectedImage) === "pdf"
                        ? "PDF Proof"
                        : getFileType(selectedImage) === "excel"
                          ? "Spreadsheet Proof"
                          : "Document Proof"}
                  </span>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="p-2 bg-white/10 hover:bg-red-500/80 rounded-full transition-colors group"
                  >
                    <XCircle
                      size={24}
                      className="group-hover:rotate-90 transition-transform duration-300"
                    />
                  </button>
                </div>
                {getFileType(selectedImage) !== "excel" && getFileType(selectedImage) !== "word" && (
                  <div className="mt-4 flex justify-center">
                    <a
                      href={selectedImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open Original URL
                    </a>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AdminLayout>
  );
}
