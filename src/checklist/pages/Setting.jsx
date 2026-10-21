import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  User,
  Building,
  X,
  Save,
  Edit,
  Trash2,
  Settings,
  Search,
  ChevronDown,
  Calendar,
  RefreshCw,
  Image,
  AlertCircle,
  Shield,
} from "lucide-react";
import AdminLayout from "../components/layout/ChecklistLayout";
import { useDispatch, useSelector } from "react-redux";
import {
  createDepartment,
  updateDepartment,
  createUser,
  deleteUser,
  departmentOnlyDetails,
  givenByDetails,
  departmentDetails,
  updateUser,
  userDetails,
  customDropdownDetails,
  deleteCustomDropdown,
  createAssignFrom,
  deleteDepartment,
  deleteAssignFrom,
  updateCustomDropdown,
  updateAssignFrom,
  createMachineEntries,
  uploadProfileImage,
} from "../redux/slice/settingSlice";
import { uploadPartImageApi } from "../redux/api/settingApi";
import supabase from "../SupabaseClient";
import CalendarComponent from "../components/CalendarComponent";
import { createPortal } from "react-dom";
import { sendTaskReassignmentNotification } from "../services/whatsappService";
import { useMagicToast } from "../context/MagicToastContext";

const formatDateLong = (date) =>
  date
    ? date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
const formatDateISO = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const Setting = () => {
  const { showToast } = useMagicToast();
  const [activeTab, setActiveTab] = useState("departments");
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentDeptId, setCurrentDeptId] = useState(null);
  const [usernameFilter, setUsernameFilter] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastSyncError = useRef({ status: null, timestamp: 0 });

  const [activeDeptSubTab, setActiveDeptSubTab] = useState("departments");
  // Leave Management State
  const [leavePersonId, setLeavePersonId] = useState("");
  const [leavePersonName, setLeavePersonName] = useState("");
  const [leaveRemark, setLeaveRemark] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveTasks, setLeaveTasks] = useState([]);
  const [leaveTasksLoading, setLeaveTasksLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [shiftToPerson, setShiftToPerson] = useState("");
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [startCalendarPos, setStartCalendarPos] = useState({ top: 0, left: 0 });
  const [endCalendarPos, setEndCalendarPos] = useState({ top: 0, left: 0 });
  const [selectedLeaveTaskIds, setSelectedLeaveTaskIds] = useState([]);
  const startBtnRef = useRef(null);
  const endBtnRef = useRef(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDeleteData, setUserToDeleteData] = useState({
    id: null,
    name: "",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCountingTasks, setIsCountingTasks] = useState(false);
  const [deleteRelatedTasks, setDeleteRelatedTasks] = useState(false);
  const [taskCounts, setTaskCounts] = useState({
    checklist: 0,
    delegation: 0,
    maintenance: 0,
    repair: 0,
    ea: 0,
    total: 0,
  });
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);

  // Cleanup State
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(45);
  const [cleanupItems, setCleanupItems] = useState([]);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [showDangerPopup, setShowDangerPopup] = useState(false);

  const {
    userData,
    department,
    givenBy,
    customDropdowns,
    loading,
    error,
  } = useSelector((state) => state.setting);
  const dispatch = useDispatch();

  useEffect(() => {
    console.log("Setting Component - userData:", userData);
    console.log("Setting Component - loading:", loading);
    console.log("Setting Component - error:", error);
  }, [userData, loading, error]);

  const fetchDeviceLogsAndUpdateStatus = useCallback(async () => {
    // Set to true to enable background sync when the hardware API is online
    const ENABLE_DEVICE_SYNC = false;
    if (!ENABLE_DEVICE_SYNC) return;

    try {
      const now = Date.now();
      // Only sync once every 30 mins if we are in an error state
      if (
        lastSyncError.current.status === 400 &&
        now - lastSyncError.current.timestamp < 30 * 60 * 1000
      ) {
        return;
      }

      setIsRefreshing(true);
      const today = new Date().toISOString().split("T")[0];

      const urls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB34D83AA02&FromDate=${today}&ToDate=${today}`)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB36042AA02&FromDate=${today}&ToDate=${today}`)}`,
      ];

      let allLogs = [];
      let encountered400 = false;

      // Sequential fetch to isolate errors
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const logs = await response.json();
            if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
          } else if (response.status === 400) {
            encountered400 = true;
          }
        } catch {
          // Network errors are caught here
        }
      }

      // Back-off logic if entirely failing
      if (encountered400 && allLogs.length === 0) {
        if (lastSyncError.current.status !== 400) {
          console.log(
            "ℹ️ Device APIs unreachable (400). Sync paused for 30 minutes.",
          );
        }
        lastSyncError.current = { status: 400, timestamp: now };
        return;
      }

      // Clear back-off if we got any data
      if (allLogs.length > 0 && lastSyncError.current.status === 400) {
        console.log("✅ Device sync partially or fully restored.");
        lastSyncError.current = { status: null, timestamp: 0 };
      }

      if (allLogs.length === 0) return;

      // Sort logs by date (latest first)
      allLogs.sort((a, b) => new Date(b.LogDate) - new Date(a.LogDate));

      const employeeStatus = {};
      allLogs.forEach((log) => {
        const employeeCode = log.EmployeeCode;
        if (!employeeStatus[employeeCode]) {
          const punchDirection = log.PunchDirection?.toLowerCase();
          employeeStatus[employeeCode] = {
            status: punchDirection === "in" ? "active" : "inactive",
          };
        }
      });

      const updatePromises = Object.entries(employeeStatus).map(
        async ([employeeCode, statusInfo]) => {
          if (!userData || !Array.isArray(userData)) return;
          const user = userData.find((u) => u.employee_id === employeeCode);
          if (
            user &&
            user.status !== statusInfo.status &&
            user.status !== "on leave" &&
            user.status !== "on_leave"
          ) {
            const { error } = await supabase
              .from("checklist_users")
              .update({ status: statusInfo.status })
              .eq("id", user.id);

            if (error)
              console.error(
                `Error updating status for ${user.user_name}:`,
                error,
              );
          }
        },
      );

      await Promise.all(updatePromises);
      dispatch(userDetails());
    } catch {
      // Final catch for logic errors
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch, userData]);

  // Add real-time subscription
  useEffect(() => {
    // Subscribe to users table changes
    const subscription = supabase
      .channel("users-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_users",
        },
        () => {
          // Refresh user data when any change occurs
          dispatch(userDetails());
        },
      )
      .subscribe();

    // Set up interval to check device logs every 60 seconds (reduced frequency)
    const intervalId = setInterval(fetchDeviceLogsAndUpdateStatus, 60000);

    // Initial fetch of device logs
    fetchDeviceLogsAndUpdateStatus();

    // Fetch departments and dropdowns on mount
    dispatch(departmentDetails());
    dispatch(customDropdownDetails());
    dispatch(givenByDetails()); // Fetch givenBy details on mount

    return () => {
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [dispatch, fetchDeviceLogsAndUpdateStatus]);

  // Add manual refresh button handler
  const handleManualRefresh = () => {
    fetchDeviceLogsAndUpdateStatus();
  };

  const handleAddButtonClick = () => {
    if (activeTab === "users") {
      resetUserForm();
      setShowUserModal(true);
    } else if (activeTab === "departments" || activeTab === "categories") {
      if (activeTab === "departments" && activeDeptSubTab === "divisions") {
        setDivisionForm({ name: "" });
        setShowDivisionModal(true);
      } else {
        resetDeptForm();
        setShowDeptModal(true);
      }
    }
    // No action for leave tab
  };

  // Fetch tasks for the person on leave within the date range
  const handleFetchLeaveTasks = async () => {
    if (!leavePersonName || !leaveStartDate || !leaveEndDate) {
      showToast("Please select a person and both start and end dates", "error");
      return;
    }
    if (new Date(leaveStartDate) > new Date(leaveEndDate)) {
      showToast("End date cannot be before start date", "error");
      return;
    }
    setLeaveTasksLoading(true);
    setLeaveTasks([]);
    setSelectedLeaveTaskIds([]);
    setHasFetched(false);
    setLeaveSuccess(false);
    try {
      const startISO = `${leaveStartDate}T00:00:00`;
      const endISO = `${leaveEndDate}T23:59:59`;

      const [
        { data: checklistTasks, error: checklistErr },
        { data: delegationTasks, error: delegationErr },
        { data: maintenanceTasks, error: maintenanceErr },
        { data: repairTasks, error: repairErr },
        eaResult,
      ] = await Promise.all([
        supabase
          .from("checklist")
          .select("*")
          .eq("name", leavePersonName)
          .gte("planned_date", startISO)
          .lte("planned_date", endISO)
          .is("submission_date", null)
          .limit(5000),
        supabase
          .from("delegation")
          .select("*")
          .eq("name", leavePersonName)
          .gte("planned_date", startISO)
          .lte("planned_date", endISO)
          .is("submission_date", null)
          .limit(5000),
        supabase
          .from("maintenance_tasks")
          .select("*")
          .eq("name", leavePersonName)
          .gte("planned_date", startISO)
          .lte("planned_date", endISO)
          .is("submission_date", null)
          .limit(5000),
        supabase
          .from("repair_tasks")
          .select("*")
          .eq("assigned_person", leavePersonName)
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .is("submission_date", null)
          .limit(5000),
        supabase
          .from("ea_tasks")
          .select("*")
          .eq("doer_name", leavePersonName)
          .gte("planned_date", startISO)
          .lte("planned_date", endISO)
          .is("submission_date", null)
          .limit(5000)
          .then((res) => res)
          .catch(() => ({ data: [] })),
      ]);

      if (checklistErr) console.warn("Checklist fetch error:", checklistErr);
      if (delegationErr) console.warn("Delegation fetch error:", delegationErr);
      if (maintenanceErr) console.warn("Maintenance fetch error:", maintenanceErr);
      if (repairErr) console.warn("Repair fetch error:", repairErr);

      const eaTasks = eaResult?.data || [];

      const combined = [
        ...(checklistTasks || []).map((t) => ({
          ...t,
          _table: "checklist",
          id: t.task_id || t.id,
          task_date: t.planned_date || t.task_start_date,
          _uniqueId: `checklist-${t.task_id || t.id}`,
        })),
        ...(delegationTasks || []).map((t) => ({
          ...t,
          _table: "delegation",
          id: t.task_id || t.id,
          task_date: t.planned_date || t.task_start_date,
          _uniqueId: `delegation-${t.task_id || t.id}`,
        })),
        ...(maintenanceTasks || []).map((t) => ({
          ...t,
          _table: "maintenance_tasks",
          id: t.id,
          task_date: t.planned_date || t.task_start_date,
          _uniqueId: `maintenance_tasks-${t.id}`,
        })),
        ...(repairTasks || []).map((t) => ({
          ...t,
          _table: "repair_tasks",
          id: t.id,
          task_description: t.issue_description || t.task_description,
          task_date: t.planned_date || t.created_at,
          _uniqueId: `repair_tasks-${t.id}`,
        })),
        ...(eaTasks || []).map((t) => ({
          ...t,
          _table: "ea_tasks",
          id: t.id,
          task_description: t.task_description,
          task_date: t.planned_date || t.task_start_date,
          _uniqueId: `ea_tasks-${t.id}`,
        })),
      ];

      // Sort chronological by date
      combined.sort((a, b) => {
        const da = new Date(a.task_date || a.planned_date || a.task_start_date || a.created_at || 0).getTime();
        const db = new Date(b.task_date || b.planned_date || b.task_start_date || b.created_at || 0).getTime();
        return da - db;
      });

      setLeaveTasks(combined);
      // Auto-select all tasks so user can immediately shift them (as shown in screenshot)
      setSelectedLeaveTaskIds(combined.map((t) => t._uniqueId));
      setHasFetched(true);
    } catch (err) {
      console.error("Error fetching leave tasks:", err);
      showToast("Failed to fetch tasks. Please check your connection.", "error");
    } finally {
      setLeaveTasksLoading(false);
    }
  };

  // Shift selected fetched tasks to the substitute person
  const handleShiftTasks = async () => {
    // Determine which tasks to shift
    const tasksToShift =
      leaveTasks.length > 0
        ? leaveTasks.filter((t) => selectedLeaveTaskIds.includes(t._uniqueId))
        : [];

    // If there are tasks found but none selected, alert user
    if (leaveTasks.length > 0 && tasksToShift.length === 0 && shiftToPerson) {
      showToast("Please select tasks to shift using the checkboxes", "warning");
      return;
    }

    // Must have a substitute if shifting tasks
    if (tasksToShift.length > 0 && !shiftToPerson) {
      showToast("Please select a person to shift tasks to", "error");
      return;
    }

    const confirmMsg =
      tasksToShift.length > 0
        ? `Shift ${tasksToShift.length} selected task(s) from "${leavePersonName}" to "${shiftToPerson}"?`
        : `Mark "${leavePersonName}" as On Leave? (No tasks found to shift)`;

    if (!window.confirm(confirmMsg)) return;

    setLeaveSubmitting(true);
    try {
      const checklistIds = tasksToShift
        .filter((t) => t._table === "checklist")
        .map((t) => t.task_id);
      const delegationIds = tasksToShift
        .filter((t) => t._table === "delegation")
        .map((t) => t.task_id);
      const maintenanceIds = tasksToShift
        .filter((t) => t._table === "maintenance_tasks")
        .map((t) => t.id);
      const repairIds = tasksToShift
        .filter((t) => t._table === "repair_tasks")
        .map((t) => t.id);
      const eaIds = tasksToShift
        .filter((t) => t._table === "ea_tasks")
        .map((t) => t.id);

      // Only mark user as on leave if it's the first shift or a direct "Mark on leave"
      // or if all tasks are being shifted at once.
      // Usually, we should probably mark as on leave on the first action.
      const { data: currentUser } = await supabase
        .from("checklist_users")
        .select("status")
        .eq("id", leavePersonId)
        .single();

      if (currentUser?.status !== "on_leave") {
        const { error: userUpdateError } = await supabase
          .from("checklist_users")
          .update({
            status: "on_leave",
            leave_date: leaveStartDate,
            leave_end_date: leaveEndDate,
            remark: leaveRemark || "Shifted tasks",
          })
          .eq("id", leavePersonId);
        if (userUpdateError) throw userUpdateError;
      }

      // Update Tasks (If any)
      if (checklistIds.length > 0) {
        const { error: checklistError } = await supabase
          .from("checklist")
          .update({ name: shiftToPerson })
          .in("task_id", checklistIds);
        if (checklistError)
          console.error("Error updating checklist tasks:", checklistError);
      }
      if (delegationIds.length > 0) {
        const { error: delegationError } = await supabase
          .from("delegation")
          .update({ name: shiftToPerson })
          .in("task_id", delegationIds);
        if (delegationError)
          console.error("Error updating delegation tasks:", delegationError);
      }
      if (maintenanceIds.length > 0) {
        const { error: maintenanceError } = await supabase
          .from("maintenance_tasks")
          .update({ name: shiftToPerson })
          .in("id", maintenanceIds);
        if (maintenanceError)
          console.error("Error updating maintenance tasks:", maintenanceError);
      }
      if (repairIds.length > 0) {
        const { error: repairError } = await supabase
          .from("repair_tasks")
          .update({ assigned_person: shiftToPerson })
          .in("id", repairIds);
        if (repairError)
          console.error("Error updating repair tasks:", repairError);
      }
      if (eaIds.length > 0) {
        const { error: eaError } = await supabase
          .from("ea_tasks")
          .update({ doer_name: shiftToPerson })
          .in("id", eaIds);
        if (eaError) console.error("Error updating EA tasks:", eaError);
      }

      // Send WhatsApp Notifications for shifted tasks in background
      if (tasksToShift.length > 0) {
        Promise.allSettled(
          tasksToShift.map((task) =>
            sendTaskReassignmentNotification({
              newDoerName: shiftToPerson,
              originalDoerName: leavePersonName,
              taskId: task.task_id || task.id,
              description:
                task.task_description ||
                task.tasks ||
                task.title ||
                task.issue_description,
              startDate:
                task.task_date || task.planned_date || task.task_start_date || task.created_at
                  ? new Date(
                      task.task_date ||
                        task.planned_date ||
                        task.task_start_date ||
                        task.created_at,
                    ).toLocaleDateString("en-IN")
                  : "N/A",
              givenBy: task.given_by || task.filled_by || "Admin",
              department: task.department,
              taskType: task._table,
            }).catch((err) => console.warn("WhatsApp notification error:", err)),
          ),
        );
      }

      // Filter out shifted tasks from the local view
      const remainingTasks = leaveTasks.filter(
        (t) => !selectedLeaveTaskIds.includes(t._uniqueId),
      );

      if (remainingTasks.length === 0) {
        setLeaveSuccess(true);
      } else {
        showToast(
          `${tasksToShift.length} tasks shifted to ${shiftToPerson}. ${remainingTasks.length} tasks remaining.`,
          "success",
        );
      }

      setLeaveTasks(remainingTasks);
      setSelectedLeaveTaskIds([]); // Clear selection
      setShiftToPerson("");
      // Re-fetch user details to reflect the "on leave" status immediately
      dispatch(userDetails());
    } catch (err) {
      console.error("Error shifting tasks:", err);
      showToast("Error shifting tasks. Please try again.", "error");
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleResetLeave = () => {
    setLeavePersonId("");
    setLeavePersonName("");
    setLeaveRemark("");
    setLeaveStartDate("");
    setLeaveEndDate("");
    setLeaveTasks([]);
    setSelectedLeaveTaskIds([]);
    setShiftToPerson("");
    setLeaveSuccess(false);
    setHasFetched(false);
  };

  const fetchCleanupPreview = async (days) => {
    setCleanupLoading(true);
    setCleanupItems([]);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateString = cutoffDate.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("checklist")
        .select("*")
        .eq("admin_done", true)
        .lt("submission_date", cutoffDateString)
        .limit(100);

      if (error) {
        console.error("Supabase Query Error:", error);
        throw error;
      }
      setCleanupItems(data || []);
    } catch (err) {
      console.error("Error fetching cleanup preview:", err);
      const errMsg = err.message || "Database connection error";
      showToast(`Failed to fetch preview: ${errMsg}`, "error");
    } finally {
      setCleanupLoading(false);
    }
  };

  // Add to your existing handleTabChange function
  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "users") {
      dispatch(userDetails());
      dispatch(departmentOnlyDetails());
    } else if (tab === "departments") {
      // Fetch data based on activeDeptSubTab
      if (activeDeptSubTab === "departments") {
        dispatch(departmentDetails());
      } else if (activeDeptSubTab === "givenBy") {
        dispatch(givenByDetails());
      }
    } else if (tab === "categories") {
      dispatch(customDropdownDetails());
    }
  };

  // Add to your handleAddButtonClick function

  // Sample data
  // const [users, setUsers] = useState([
  //   {
  //     id: '1',
  //     username: 'john_doe',
  //     email: 'john@example.com',
  //     password: '********',
  //     department: 'IT',
  //     givenBy: 'admin',
  //     phone: '1234567890',
  //     role: 'user',
  //     status: 'active'
  //   },
  //   {
  //     id: '2',
  //     username: 'jane_smith',
  //     email: 'jane@example.com',
  //     password: '********',
  //     department: 'HR',
  //     givenBy: 'admin',
  //     phone: '0987654321',
  //     role: 'admin',
  //     status: 'active'
  //   }
  // ]);

  // const [departments, setDepartments] = useState([
  //   { id: '1', name: 'IT', givenBy: 'super_admin' },
  //   { id: '2', name: 'HR', givenBy: 'super_admin' },
  //   { id: '3', name: 'Finance', givenBy: 'admin' }
  // ]);

  // Form states
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    employee_id: "",
    role: "user",
    status: "active",
    department: "",
    division: "",
    user_access: "",
    Designation: "",
    profile_image: "",
    reported_by: "",
    can_self_assign: false,
    day_off: "",
  });

  // Check for duplicate username (case-insensitive)
  const isDuplicateUsername = useMemo(() => {
    const trimmed = (userForm.username || "").trim().toLowerCase();
    if (!trimmed) return false;
    return (userData || []).some((u) => {
      if (isEditing && u.id === currentUserId) return false;
      return String(u.user_name || "").trim().toLowerCase() === trimmed;
    });
  }, [userForm.username, userData, isEditing, currentUserId]);

  const [deptForm, setDeptForm] = useState({
    name: "",
    givenBy: "",
    partName: "",
    machineArea: "",
    division: "",
  });
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [divisionForm, setDivisionForm] = useState({ name: "" });
  const [isUserDivisionDropdownOpen, setIsUserDivisionDropdownOpen] = useState(false);

  const consolidatedDepartments = useMemo(() => {
    if (!department || department.length === 0) return [];

    const map = new Map();

    department.forEach((dept) => {
      const rawName = (dept.department || "").trim();
      if (!rawName) return;

      const normName = rawName.toLowerCase();
      const div = (dept.division || "").trim();

      if (!map.has(normName)) {
        map.set(normName, {
          name: rawName,
          divisionsSet: new Set(),
          ids: [],
          givenBy: dept.given_by || "",
          items: [],
        });
      }

      const group = map.get(normName);
      if (div) group.divisionsSet.add(div);
      if (dept.id) group.ids.push(dept.id);
      group.items.push(dept);
    });

    return Array.from(map.values())
      .map((group) => ({
        name: group.name,
        divisionStr: Array.from(group.divisionsSet).sort().join(", "),
        divisionsList: Array.from(group.divisionsSet).sort(),
        ids: group.ids,
        givenBy: group.givenBy,
        items: group.items,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [department]);
  const [inputParts, setInputParts] = useState([
    { name: "", file: null, preview: null },
  ]);

  const handleAddPartInput = () => {
    setInputParts([...inputParts, { name: "", file: null, preview: null }]);
  };

  const handlePartInputChange = (index, value) => {
    const newParts = [...inputParts];
    newParts[index] = { ...newParts[index], name: value };
    setInputParts(newParts);
  };

  const handlePartImageChange = (index, file) => {
    const newParts = [...inputParts];
    if (!file) {
      newParts[index] = { ...newParts[index], file: null, preview: null };
    } else {
      newParts[index] = {
        ...newParts[index],
        file,
        preview: URL.createObjectURL(file),
      };
    }
    setInputParts(newParts);
  };

  const handleRemovePartInput = (index) => {
    const newParts = inputParts.filter((_, i) => i !== index);
    setInputParts(newParts);
  };

  const fetchDivisions = async () => {
    try {
      const { data, error } = await supabase.from("divisions").select("*").order("name");
      if (error) throw error;
      if (data) setDivisions(data);
    } catch (err) {
      console.error("Error fetching divisions:", err);
    }
  };

  useEffect(() => {
    dispatch(userDetails());
    dispatch(departmentDetails()); // Fetch departments on mount
    dispatch(givenByDetails()); // Fetch givenBy details on mount
    dispatch(customDropdownDetails()); // Fetch custom dropdowns on mount
    fetchDivisions();
  }, [dispatch]);

  const handleAddUser = async (e) => {
    e.preventDefault();

    const trimmedUsername = (userForm.username || "").trim();
    if (!trimmedUsername) {
      showToast("Please enter a username.", "error");
      return;
    }

    // 1. Instant check against loaded users list
    const duplicateInList = (userData || []).find(
      (u) => String(u.user_name || "").trim().toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicateInList) {
      showToast(
        `User "${duplicateInList.user_name}" already exists. Please choose a different username.`,
        "error"
      );
      return;
    }

    // 2. Real-time DB check against Supabase
    try {
      const { data: existingDbUser } = await supabase
        .from("checklist_users")
        .select("id, user_name")
        .ilike("user_name", trimmedUsername)
        .maybeSingle();

      if (existingDbUser) {
        showToast(
          `User "${existingDbUser.user_name}" already exists in the system. Account creation stopped to prevent duplicate account.`,
          "error"
        );
        return;
      }
    } catch (checkErr) {
      console.error("Error checking username uniqueness:", checkErr);
    }

    // Auto-generate employee_id
    const generatedEmpId = `EMP-${Date.now().toString().slice(-6)}`;

    let imageUrl = userForm.profile_image;
    if (profileFile) {
      try {
        imageUrl = await dispatch(
          uploadProfileImage({ file: profileFile, userId: generatedEmpId }),
        ).unwrap();
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr);
        showToast("Image upload failed, continuing without image.", "warning");
      }
    }

    const newUser = {
      ...userForm,
      employee_id: generatedEmpId,
      user_access: userForm.user_access || userForm.department,
      department: userForm.department,
      profile_image: imageUrl,
      reported_by: userForm.reported_by,
      can_self_assign: userForm.can_self_assign,
    };

    try {
      console.log("Creating user with payload:", newUser);
      await dispatch(createUser(newUser)).unwrap();

      // If the new user has the same name as current logged in user (unlikely but safe)
      if (newUser.user_name === localStorage.getItem("user-name")) {
        localStorage.setItem("profile_image", imageUrl || "");
      }

      resetUserForm();
      setShowUserModal(false);
      showToast("User created successfully!", "success");
      dispatch(userDetails()); // Explicitly refresh user details
    } catch (error) {
      console.error("Error adding user:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Failed to create user."), "error");
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();

    const trimmedUsername = (userForm.username || "").trim();
    if (!trimmedUsername) {
      showToast("Please enter a username.", "error");
      return;
    }

    // Check duplicate in local state (excluding the current user being edited)
    const duplicateInList = (userData || []).find(
      (u) => u.id !== currentUserId && String(u.user_name || "").trim().toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicateInList) {
      showToast(
        `User "${duplicateInList.user_name}" already exists. Please choose a different username.`,
        "error"
      );
      return;
    }

    let imageUrl = userForm.profile_image;
    if (profileFile) {
      try {
        imageUrl = await dispatch(
          uploadProfileImage({
            file: profileFile,
            userId: userForm.employee_id || currentUserId,
          }),
        ).unwrap();
      } catch (uploadErr) {
        console.error("Image upload failed:", uploadErr);
        showToast(
          "Image upload failed, continuing with previous image.",
          "warning",
        );
      }
    }

    const updatedUser = {
      user_name: userForm.username,
      password: userForm.password,
      email_id: userForm.email,
      number: userForm.phone,
      employee_id: userForm.employee_id,
      role: userForm.role,
      status: userForm.status,
      user_access: userForm.user_access || userForm.department,
      department: userForm.department,
      division: userForm.division || null,
      Designation: userForm.Designation || null,
      profile_image: imageUrl,
      leave_date: userForm.leave_date || null,
      leave_end_date: userForm.leave_end_date || null,
      remark: userForm.remark || null,
      reported_by: userForm.reported_by,
      can_self_assign: userForm.can_self_assign,
      day_off: userForm.day_off || null,
    };

    try {
      console.log("Updating user with image:", imageUrl);
      await dispatch(updateUser({ id: currentUserId, updatedUser })).unwrap();

      // Critical: Update localStorage if the edited user is the current logged-in user
      if (updatedUser.user_name === localStorage.getItem("user-name")) {
        console.log("Updating current user's localStorage image");
        localStorage.setItem("profile_image", imageUrl || "");
        localStorage.setItem("division", updatedUser.division || "");
        // Refresh to update all layouts immediately
        window.location.reload();
      }

      resetUserForm();
      setShowUserModal(false);
      showToast("User updated successfully!", "success");
      dispatch(userDetails()); // Explicitly refresh user details
    } catch (error) {
      console.error("Error updating user:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Failed to update user."), "error");
    }
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();

    if (activeTab === "categories") {
      try {
        await dispatch(
          updateCustomDropdown({
            id: currentDeptId,
            category: "Machine Name", // Force Machine Name category
            value: deptForm.givenBy,
          }),
        ).unwrap();
        resetDeptForm();
        setShowDeptModal(false);
        dispatch(customDropdownDetails()); // Explicitly refresh custom dropdowns
      } catch (error) {
        console.error("Error updating category:", error);
      }
      return;
    }

    if (activeTab === "departments") {
      if (activeDeptSubTab === "departments") {
        const trimmedName = (deptForm.name || "").trim();
        if (!trimmedName) {
          showToast("Department Name is required", "error");
          return;
        }

        try {
          const deptId = Array.isArray(currentDeptId) ? currentDeptId[0] : currentDeptId;
          if (deptId) {
            await dispatch(
              updateDepartment({
                id: deptId,
                department: trimmedName,
              }),
            ).unwrap();
          }

          resetDeptForm();
          setShowDeptModal(false);
          dispatch(departmentDetails());
          showToast("Department updated successfully!", "success");
        } catch (error) {
          console.error("Error updating department:", error);
          showToast(error?.message || "Failed to update department", "error");
        }
      } else if (activeDeptSubTab === "givenBy") {
        try {
          await dispatch(
            updateAssignFrom({
              id: currentDeptId,
              given_by: deptForm.name,
            }),
          ).unwrap();
          resetDeptForm();
          setShowDeptModal(false);
          dispatch(givenByDetails()); // Explicitly refresh givenBy details
        } catch (error) {
          console.error("Error updating assign_from:", error);
        }
      }
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();

    if (activeTab === "categories") {
      try {
        const machineName = deptForm.givenBy;
        const machineArea = deptForm.machineArea;
        const parts = inputParts.filter((p) => p.name.trim() !== "");

        if (!machineName) {
          showToast("Machine Name is required", "error");
          return;
        }

        showToast("Saving machine... please wait", "info");

        const entries = [];
        if (parts.length > 0) {
          for (const part of parts) {
            let imageUrl = null;
            if (part.file) {
              try {
                imageUrl = await uploadPartImageApi(part.file);
              } catch (uploadErr) {
                console.error("Part image upload failed:", uploadErr);
                showToast(
                  `Image upload failed for part "${part.name}", saving without image.`,
                  "warning",
                );
              }
            }
            entries.push({
              machine_name: machineName,
              part_name: part.name,
              machine_area: machineArea,
              ...(imageUrl && { image_url: imageUrl }),
            });
          }
        } else {
          entries.push({
            machine_name: machineName,
            part_name: null,
            machine_area: machineArea,
          });
        }

        await dispatch(createMachineEntries(entries)).unwrap();

        resetDeptForm();
        setShowDeptModal(false);
        dispatch(customDropdownDetails());
        showToast("Machine saved successfully!", "success");
      } catch (error) {
        console.error("Error adding category option:", error);
        showToast("Failed to save machine.", "error");
      }
      return;
    }

    if (activeTab === "departments") {
      if (activeDeptSubTab === "givenBy") {
        try {
          await dispatch(
            createAssignFrom({ given_by: deptForm.name }),
          ).unwrap(); // Changed to createAssignFrom
          resetDeptForm();
          setShowDeptModal(false);
          dispatch(givenByDetails()); // Explicitly refresh givenBy details
        } catch (error) {
          console.error("Error adding assign_from:", error);
        }
      } else {
        // activeDeptSubTab === 'departments'
        const trimmedName = (deptForm.name || "").trim();
        if (!trimmedName) {
          showToast("Department Name is required", "error");
          return;
        }

        try {
          await dispatch(
            createDepartment({
              department: trimmedName,
            }),
          ).unwrap();

          resetDeptForm();
          setShowDeptModal(false);
          dispatch(departmentDetails()); // Explicitly refresh department details
          showToast("Department created successfully!", "success");
        } catch (error) {
          console.error("Error adding department:", error);
          showToast(error?.message || "Error adding department", "error");
        }
      }
    }
  };

  const handleAddDivision = async (e) => {
    e.preventDefault();
    if (!divisionForm.name.trim()) return;
    try {
      const { error } = await supabase.from("divisions").insert([{ name: divisionForm.name.trim() }]).select();
      if (error) throw error;
      setDivisionForm({ name: "" });
      setShowDivisionModal(false);
      fetchDivisions();
      showToast("Division added successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to add division", "error");
    }
  };

  const handleDeleteDivision = async (id) => {
    if (!window.confirm("Are you sure you want to delete this division?")) return;
    try {
      const { error } = await supabase.from("divisions").delete().eq("id", id);
      if (error) throw error;
      fetchDivisions();
      showToast("Division deleted successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete division", "error");
    }
  };

  // Modified handleDeleteUser
  const handleDeleteUser = async (userId) => {
    const userToDel = userData.find((u) => u.id === userId);
    if (!userToDel) return;
    setUserToDeleteData({ id: userId, name: userToDel.user_name });
    setDeleteRelatedTasks(false); // default to preserving task history
    setIsCountingTasks(true);
    setTaskCounts({ checklist: 0, delegation: 0, maintenance: 0, repair: 0, ea: 0, total: 0 });
    setShowDeleteConfirm(true);

    try {
      const userName = userToDel.user_name;
      const [clRes, delRes, mtRes, rpRes, eaRes] = await Promise.all([
        supabase.from("checklist").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("delegation").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("maintenance_tasks").select("id", { count: "exact", head: true }).eq("name", userName),
        supabase.from("repair_tasks").select("id", { count: "exact", head: true }).eq("assigned_person", userName),
        supabase.from("ea_tasks").select("id", { count: "exact", head: true }).eq("doer_name", userName),
      ]);

      const counts = {
        checklist: clRes.count || 0,
        delegation: delRes.count || 0,
        maintenance: mtRes.count || 0,
        repair: rpRes.count || 0,
        ea: eaRes.count || 0,
      };
      counts.total = counts.checklist + counts.delegation + counts.maintenance + counts.repair + counts.ea;
      setTaskCounts(counts);
    } catch (err) {
      console.error("Error fetching task counts for user deletion:", err);
    } finally {
      setIsCountingTasks(false);
    }
  };

  const confirmDeleteUserAndTasks = async () => {
    const { id: userId, name: userName } = userToDeleteData;
    if (!userId) return;
    setIsDeleting(true);
    try {
      // 1. Delete tasks only if user chose to delete related tasks
      if (deleteRelatedTasks && userName) {
        const deletePromises = [
          supabase.from("checklist").delete().eq("name", userName),
          supabase.from("delegation").delete().eq("name", userName),
          supabase.from("maintenance_tasks").delete().eq("name", userName),
          supabase
            .from("repair_tasks")
            .delete()
            .eq("assigned_person", userName),
          supabase.from("ea_tasks").delete().eq("doer_name", userName),
        ];

        const results = await Promise.all(deletePromises);

        results.forEach((res, idx) => {
          if (res.error)
            console.error(
              `Error deleting tasks from table index ${idx}:`,
              res.error,
            );
        });
      }

      // 2. Delete the user
      await dispatch(deleteUser(userId)).unwrap();

      if (deleteRelatedTasks) {
        showToast(
          `User "${userName}" and ${taskCounts.total} associated tasks deleted successfully`,
          "success",
        );
      } else {
        showToast(
          `User "${userName}" deleted. All ${taskCounts.total} task records preserved in history.`,
          "success",
        );
      }
      dispatch(userDetails());
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting user and tasks:", error);
      showToast(typeof error === "string" ? error : (error?.message || "Error during deletion process"), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUserInputChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "department") {
        updated.user_access = value;
      }
      return updated;
    });
  };

  // const handleAddUser = (e) => {
  //   e.preventDefault();
  //   const newUser = {
  //     ...userForm,
  //     id: (users.length + 1).toString(),
  //     password: '********'
  //   };
  //   setUsers([...users, newUser]);
  //   resetUserForm();
  //   setShowUserModal(false);
  // };
  const handleEditUser = (userId) => {
    if (!userData) return;
    const user = userData.find((u) => u.id === userId);
    if (!user) return;

    setUserForm({
      username: user.user_name || "",
      email: user.email_id || "",
      password: "", // Leave empty when editing to keep current password
      phone: user.number || "",
      employee_id: user.employee_id || "",
      department: user.department || "",
      user_access: user.user_access || "",
      role: user.role || "user",
      status: user.status || "active",
      Designation: user.Designation || "",
      profile_image: user.profile_image || "",
      leave_date: user.leave_date ? user.leave_date.split("T")[0] : "",
      leave_end_date: user.leave_end_date
        ? user.leave_end_date.split("T")[0]
        : "",
      remark: user.remark || "",
      reported_by: user.reported_by || "",
      can_self_assign: user.can_self_assign || false,
      day_off: user.day_off || "",
    });
    setProfilePreview(user.profile_image || null);
    setProfileFile(null);
    setCurrentUserId(userId);
    setIsEditing(true);
    setShowUserModal(true);
  };

  const handleEditDepartment = (deptIdentifier) => {
    if (activeTab === "departments" && activeDeptSubTab === "departments") {
      const group = consolidatedDepartments.find(
        (g) => g.name === deptIdentifier || g.ids.includes(deptIdentifier),
      );
      if (group) {
        setDeptForm({
          name: group.name,
          givenBy: group.givenBy || "",
          division: "",
        });
        setSelectedDivisions([]);
        setCurrentDeptId(group.ids);
        setIsEditing(true);
        setShowDeptModal(true);
      } else {
        const dept = department.find((d) => d.id === deptIdentifier);
        if (dept) {
          setDeptForm({
            name: (dept.department || "").trim(),
            givenBy: dept.given_by || "",
            division: "",
          });
          setSelectedDivisions([]);
          setCurrentDeptId([dept.id]);
          setIsEditing(true);
          setShowDeptModal(true);
        }
      }
    } else if (activeTab === "departments" && activeDeptSubTab === "givenBy") {
      const item = givenBy.find((g) => g.id === deptIdentifier);
      if (item) {
        setDeptForm({
          name: item.given_by,
          givenBy: "",
          division: "",
        });
        setCurrentDeptId(deptIdentifier);
        setIsEditing(true);
        setShowDeptModal(true);
      }
    } else if (activeTab === "categories") {
      const item = customDropdowns.find((c) => c.id === deptIdentifier);
      if (item) {
        setDeptForm({
          name: item.category,
          givenBy: item.value,
          division: "",
        });
        setCurrentDeptId(deptIdentifier);
        setIsEditing(true);
        setShowDeptModal(true);
      }
    }
  };

  const handleDeleteDepartmentGroup = async (group) => {
    if (
      window.confirm(
        `Are you sure you want to delete department "${group.name}"?`,
      )
    ) {
      try {
        for (const id of group.ids) {
          await dispatch(deleteDepartment(id)).unwrap();
        }
        showToast(`Department "${group.name}" deleted successfully!`, "success");
        dispatch(departmentDetails());
      } catch (err) {
        console.error("Error deleting department group:", err);
        showToast("Failed to delete department", "error");
      }
    }
  };
  // const handleUpdateUser = (e) => {
  //   e.preventDefault();
  //   setUsers(users.map(user =>
  //     user.id === currentUserId ? { ...userForm, id: currentUserId } : user
  //   ));
  //   resetUserForm();
  //   setShowUserModal(false);
  // };

  const resetUserForm = () => {
    setUserForm({
      username: "",
      email: "",
      password: "",
      phone: "",
      employee_id: "",
      department: "",
      user_access: "",
      givenBy: "",
      role: "user",
      status: "active",
      Designation: "",
      profile_image: "",
      leave_date: "",
      leave_end_date: "",
      remark: "",
      reported_by: "",
      can_self_assign: false,
      day_off: "",
    });
    setProfileFile(null);
    setProfilePreview(null);
    setIsEditing(false);
    setCurrentUserId(null);
  };

  // Department form handlers
  const handleDeptInputChange = (e) => {
    const { name, value } = e.target;
    setDeptForm((prev) => ({ ...prev, [name]: value }));
  };

  // const handleAddDepartment = (e) => {
  //   e.preventDefault();
  //   const newDept = {
  //     ...deptForm,
  //     id: (departments.length + 1).toString()
  //   };
  //   setDepartments([...departments, newDept]);
  //   resetDeptForm();
  //   setShowDeptModal(false);
  // };

  //   const handleUpdateDepartment = (e) => {
  //     e.preventDefault();
  //     setDepartments(departments.map(dept =>
  //       dept.id === currentDeptId ? { ...deptForm, id: currentDeptId } : dept
  //     ));
  //     resetDeptForm();
  //     setShowDeptModal(false);
  //   };

  // const handleDeleteDepartment = (deptId) => {
  //   setDepartments(department.filter(dept => dept.id !== deptId));
  // };

  const resetDeptForm = () => {
    setDeptForm({
      name: "",
      givenBy: "",
      partName: "",
      machineArea: "",
      division: "",
    });
    setSelectedDivisions([]);
    setCurrentDeptId(null);
    setIsEditing(false);
    setInputParts([{ name: "", file: null, preview: null }]);
  };

  // User names list for dropdowns
  const userNames = (userData || [])
    .filter(
      (u) =>
        u && u.user_name && u.user_name !== "admin" && u.user_name !== "DSMC",
    )
    .map((u) => u.user_name);

  const getStatusColor = (status) => {
    if (status === "active") return "bg-green-100 text-green-800";
    if (status === "on leave" || status === "on_leave")
      return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  };
  const getRoleColor = (role) => {
    switch (role) {
      case "admin":
        return "bg-blue-100 text-blue-800";
      case "HOD":
        return "bg-orange-100 text-orange-800";
      case "manager":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleUpdatePartImage = async (file, part) => {
    if (!file) return;
    showToast("Uploading new image...", "info");
    try {
      const imageUrl = await uploadPartImageApi(file);
      await dispatch(
        updateCustomDropdown({
          id: part.id,
          category: "Part Name",
          value: part.value,
          image_url: imageUrl,
        }),
      ).unwrap();
      dispatch(customDropdownDetails());
      showToast("Image updated successfully!", "success");
    } catch (err) {
      console.error("Error updating part image:", err);
      showToast("Failed to update image", "error");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header and Controls */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-5 bg-blue-600 rounded-full inline-block" />
              User Management <span className="text-blue-600">System</span>
            </h1>

            {/* Main System Tabs */}
            <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200/60 overflow-x-auto no-scrollbar">
              {[
                {
                  id: "departments",
                  label: "Departments",
                  icon: Building,
                  action: () => {
                    dispatch(departmentDetails());
                    dispatch(givenByDetails());
                  },
                },
                { id: "leave", label: "Leave", icon: Calendar },
                { id: "categories", label: "Machines", icon: Settings },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`relative flex items-center justify-center gap-1.5 py-1 px-3.5 rounded-lg text-xs font-extrabold transition-all duration-300 whitespace-nowrap z-10 ${
                    activeTab === tab.id
                      ? "text-white"
                      : "text-gray-600 hover:text-blue-600"
                  }`}
                  onClick={() => {
                    handleTabChange(tab.id);
                    if (tab.action) tab.action();
                  }}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="settingsTabPillMinimal"
                      className="absolute inset-0 bg-blue-600 rounded-lg shadow-xs"
                      transition={{
                        type: "spring",
                        bounce: 0.2,
                        duration: 0.5,
                      }}
                    />
                  )}
                  <tab.icon size={13} className="relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all disabled:opacity-50 active:scale-95"
              title="Refresh Status"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>

            {(activeTab === "users" ||
              activeTab === "departments" ||
              activeTab === "categories") && (
              <button
                onClick={() => {
                  if (activeTab === "categories") {
                    resetDeptForm();
                    setShowDeptModal(true);
                  } else {
                    handleAddButtonClick();
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={16} />
                <span>
                  {activeTab === "users"
                    ? "New User"
                    : activeTab === "departments"
                      ? activeDeptSubTab === "departments"
                        ? "New Department"
                        : activeDeptSubTab === "divisions"
                          ? "New Division"
                          : "New Assign From"
                      : "New Machine"}
                </span>
              </button>
            )}
          </div>
        </div>
        {/* <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="text-sm font-medium text-yellow-800">Debug Info</h3>
        <p className="text-xs text-yellow-700">
          Total Users: {userData?.length || 0} | 
          Active: {userData?.filter(u => u && u.status === 'active').length || 0} | 
          Inactive: {userData?.filter(u => u && u.status === 'inactive').length || 0}
        </p>
        <div className="text-[10px] text-gray-400 mt-1 truncate">
          Employee IDs in DB: {userData?.filter(u => u && u.employee_id).map(u => u.employee_id).join(', ') || 'None'}
        </div>
      </div> */}

        {/* Leave Management Tab */}
        {activeTab === "leave" && (
          <div className="space-y-5">
            {/* Step 1: Leave Form */}
            <div className="bg-white shadow rounded-xl border border-blue-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-pink-50 border-b border-blue-100 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-blue-700">
                    Leave Management
                  </h2>
                  <p className="text-xs text-blue-500 mt-0.5">
                    Reassign tasks to a substitute during leave period
                  </p>
                </div>
                {(leaveTasks.length > 0 || leaveSuccess) && (
                  <button
                    onClick={handleResetLeave}
                    className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 font-semibold transition-all"
                  >
                    ↺ Start Over
                  </button>
                )}
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Person on Leave */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Person on Leave
                    </label>
                    <select
                      value={leavePersonId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const user = userData.find(
                          (u) => u.id.toString() === id.toString(),
                        );
                        setLeavePersonId(id);
                        setLeavePersonName(user ? user.user_name : "");
                        setLeaveTasks([]);
                        setSelectedLeaveTaskIds([]);
                        setHasFetched(false);
                        setLeaveSuccess(false);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                    >
                      <option value="">Select person...</option>
                      {userData &&
                        [...userData]
                          .filter((u) => u && u.user_name)
                          .sort((a, b) =>
                            a.user_name.localeCompare(b.user_name),
                          )
                          .map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.user_name}
                            </option>
                          ))}
                    </select>
                  </div>

                  {/* Remark Field */}
                  <div className="md:col-span-2 relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Leave Remark / Reason
                    </label>
                    <input
                      type="text"
                      value={leaveRemark}
                      onChange={(e) => setLeaveRemark(e.target.value)}
                      placeholder="e.g. Family function, Sick leave..."
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                    />
                  </div>

                  {/* Leave Start Date */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Leave Start Date
                    </label>
                    <button
                      ref={startBtnRef}
                      type="button"
                      onClick={() => {
                        const rect =
                          startBtnRef.current?.getBoundingClientRect();
                        if (rect) {
                          const calendarHeight = 360; // Estimated max height
                          const calendarWidth = 288;

                          let left = rect.left;
                          if (left + calendarWidth > window.innerWidth) {
                            left = window.innerWidth - calendarWidth - 20;
                          }

                          let top = rect.bottom + 4;
                          // If it overflows bottom, show above the button
                          if (top + calendarHeight > window.innerHeight) {
                            top = rect.top - calendarHeight - 4;
                          }

                          setStartCalendarPos({
                            top: Math.max(10, top),
                            left: Math.max(10, left),
                          });
                        }
                        setShowStartCalendar(!showStartCalendar);
                        setShowEndCalendar(false);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-left flex justify-between items-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <span
                        className={
                          leaveStartDate ? "text-gray-800" : "text-gray-400"
                        }
                      >
                        {leaveStartDate
                          ? formatDateLong(new Date(leaveStartDate))
                          : "Select date"}
                      </span>
                      <Calendar size={14} className="text-gray-400" />
                    </button>
                    {showStartCalendar &&
                      createPortal(
                        <div
                          style={{
                            position: "fixed",
                            top: startCalendarPos.top,
                            left: startCalendarPos.left,
                            zIndex: 9999,
                          }}
                        >
                          <CalendarComponent
                            date={
                              leaveStartDate ? new Date(leaveStartDate) : null
                            }
                            onChange={(date) => {
                              setLeaveStartDate(formatDateISO(date));
                              setShowStartCalendar(false);
                              setLeaveTasks([]);
                              setSelectedLeaveTaskIds([]);
                              setHasFetched(false);
                              setLeaveSuccess(false);
                            }}
                            onClose={() => setShowStartCalendar(false)}
                          />
                        </div>,
                        document.body,
                      )}
                  </div>

                  {/* Leave End Date */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Leave End Date
                    </label>
                    <button
                      ref={endBtnRef}
                      type="button"
                      onClick={() => {
                        const rect = endBtnRef.current?.getBoundingClientRect();
                        if (rect) {
                          const calendarHeight = 360;
                          const calendarWidth = 288;

                          let left = rect.left;
                          if (left + calendarWidth > window.innerWidth) {
                            left = window.innerWidth - calendarWidth - 20;
                          }

                          let top = rect.bottom + 4;
                          if (top + calendarHeight > window.innerHeight) {
                            top = rect.top - calendarHeight - 4;
                          }

                          setEndCalendarPos({
                            top: Math.max(10, top),
                            left: Math.max(10, left),
                          });
                        }
                        setShowEndCalendar(!showEndCalendar);
                        setShowStartCalendar(false);
                      }}
                      className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-left flex justify-between items-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <span
                        className={
                          leaveEndDate ? "text-gray-800" : "text-gray-400"
                        }
                      >
                        {leaveEndDate
                          ? formatDateLong(new Date(leaveEndDate))
                          : "Select date"}
                      </span>
                      <Calendar size={14} className="text-gray-400" />
                    </button>
                    {showEndCalendar &&
                      createPortal(
                        <div
                          style={{
                            position: "fixed",
                            top: endCalendarPos.top,
                            left: endCalendarPos.left,
                            zIndex: 9999,
                          }}
                        >
                          <CalendarComponent
                            date={leaveEndDate ? new Date(leaveEndDate) : null}
                            onChange={(date) => {
                              setLeaveEndDate(formatDateISO(date));
                              setShowEndCalendar(false);
                              setLeaveTasks([]);
                              setSelectedLeaveTaskIds([]);
                              setHasFetched(false);
                              setLeaveSuccess(false);
                            }}
                            onClose={() => setShowEndCalendar(false)}
                          />
                        </div>,
                        document.body,
                      )}
                  </div>

                  {/* Fetch Button */}
                  <div className="flex items-end">
                    <button
                      onClick={handleFetchLeaveTasks}
                      disabled={
                        leaveTasksLoading ||
                        !leavePersonName ||
                        !leaveStartDate ||
                        !leaveEndDate
                      }
                      className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {leaveTasksLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{" "}
                          Fetching...
                        </>
                      ) : (
                        "Show Tasks"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Success Banner */}
            {leaveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-lg">
                  ✓
                </div>
                <div>
                  <p className="text-green-800 font-bold text-sm">
                    Tasks shifted successfully!
                  </p>
                  <p className="text-green-600 text-xs mt-0.5">
                    All tasks have been reassigned to{" "}
                    <strong>{shiftToPerson || "the substitute"}</strong> and
                    will appear in their task panel.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Tasks Preview + Shift */}
            {leaveTasks.length > 0 && !leaveSuccess && (
              <div className="bg-white shadow rounded-xl border border-blue-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-800">
                      Tasks During Leave Period
                    </h3>
                    <p className="text-xs text-blue-500 mt-0.5">
                      {leaveTasks.length} task(s) found for{" "}
                      <strong>{leavePersonName}</strong> between{" "}
                      {leaveStartDate} and {leaveEndDate}
                    </p>
                  </div>

                  {/* Shift To + Confirm */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div>
                      <select
                        value={shiftToPerson}
                        onChange={(e) => setShiftToPerson(e.target.value)}
                        className="border border-blue-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white min-w-[180px]"
                      >
                        <option value="">Shift to person...</option>
                        {userNames
                          .filter((n) => n !== leavePersonName)
                          .map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      onClick={handleShiftTasks}
                      disabled={
                        leaveSubmitting ||
                        !shiftToPerson ||
                        selectedLeaveTaskIds.length === 0
                      }
                      className="py-2 px-5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {leaveSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{" "}
                          Shifting...
                        </>
                      ) : (
                        `✓ Confirm Shift (${selectedLeaveTaskIds.length})`
                      )}
                    </button>
                  </div>
                </div>

                <div className="overflow-auto max-h-[400px]">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left w-10">
                          <input
                            type="checkbox"
                            checked={
                              leaveTasks.length > 0 &&
                              selectedLeaveTaskIds.length === leaveTasks.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeaveTaskIds(
                                  leaveTasks.map((t) => t._uniqueId),
                                );
                              } else {
                                setSelectedLeaveTaskIds([]);
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Task
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Department
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Given By
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {leaveTasks.map((task, idx) => (
                        <tr
                          key={task._uniqueId}
                          className={`hover:bg-gray-50 transition-colors ${selectedLeaveTaskIds.includes(task._uniqueId) ? "bg-blue-50/50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedLeaveTaskIds.includes(
                                task._uniqueId,
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLeaveTaskIds((prev) => [
                                    ...prev,
                                    task._uniqueId,
                                  ]);
                                } else {
                                  setSelectedLeaveTaskIds((prev) =>
                                    prev.filter((id) => id !== task._uniqueId),
                                  );
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-medium">
                            {idx + 1}
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={() => {
                              // Click row to toggle checkbox
                              if (
                                selectedLeaveTaskIds.includes(task._uniqueId)
                              ) {
                                setSelectedLeaveTaskIds((prev) =>
                                  prev.filter((id) => id !== task._uniqueId),
                                );
                              } else {
                                setSelectedLeaveTaskIds((prev) => [
                                  ...prev,
                                  task._uniqueId,
                                ]);
                              }
                            }}
                          >
                            <div className="text-sm font-bold text-gray-800 max-w-md whitespace-pre-line">
                              {task.task_description ||
                                task.tasks ||
                                task.title ||
                                task.issue_description ||
                                "—"}
                            </div>
                            {task.issue_description &&
                              task._table === "repair_tasks" &&
                              task.issue_description !== task.task_description && (
                                <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                                  {task.issue_description}
                                </div>
                              )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                task._table === "checklist"
                                  ? "bg-blue-100 text-blue-700"
                                  : task._table === "delegation"
                                    ? "bg-blue-100 text-blue-700"
                                    : task._table === "maintenance_tasks"
                                      ? "bg-orange-100 text-orange-700"
                                      : task._table === "repair_tasks"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-green-100 text-green-700"
                              }`}
                            >
                              {task._table === "checklist"
                                ? "CHECK"
                                : task._table === "delegation"
                                  ? "DELEG"
                                  : task._table === "maintenance_tasks"
                                    ? "MAINT"
                                    : task._table === "repair_tasks"
                                      ? "REPAIR"
                                      : "EA"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-medium whitespace-nowrap">
                            {task.task_date ||
                            task.planned_date ||
                            task.task_start_date ||
                            task.created_at
                              ? new Date(
                                  task.task_date ||
                                    task.planned_date ||
                                    task.task_start_date ||
                                    task.created_at,
                                ).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-medium truncate max-w-[100px]">
                            {task.department || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 font-bold">
                            {task.given_by || task.filled_by || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state after fetch */}
            {!leaveTasksLoading &&
              hasFetched &&
              leavePersonName &&
              leaveStartDate &&
              leaveEndDate &&
              leaveTasks.length === 0 &&
              !leaveSuccess && (
                <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
                  <Calendar size={36} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">
                    No pending tasks found
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    There are no pending tasks for{" "}
                    <strong>{leavePersonName}</strong> between the selected
                    dates.
                  </p>
                  <button
                    onClick={handleShiftTasks}
                    disabled={leaveSubmitting}
                    className="mt-6 py-2.5 px-6 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2 mx-auto"
                  >
                    {leaveSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{" "}
                        Updating...
                      </>
                    ) : (
                      "Mark as On Leave Anyway"
                    )}
                  </button>
                </div>
              )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="bg-white shadow rounded-lg overflow-hidden border border-blue-200">
            <div className="bg-gradient-to-r from-blue-50 to-pink-50 border-b border-blue px-4 py-4 md:px-6 flex flex-col md:flex-row gap-4 md:items-center justify-between">
              <h2 className="text-lg font-bold text-blue-700">User List</h2>

              <div className="flex flex-wrap items-center gap-3">
                {/* Bulk Cleanup Feature */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowCleanupModal(true);
                      fetchCleanupPreview(cleanupDays);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-all active:scale-95 shadow-sm"
                  >
                    <Trash2 size={14} />
                    <span>Cleanup Checklist</span>
                  </button>
                </div>

                <div className="relative w-full sm:w-auto">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    type="text"
                    list="usernameOptions"
                    placeholder="Search users..."
                    value={usernameFilter}
                    onChange={(e) => setUsernameFilter(e.target.value)}
                    className="w-full sm:w-48 pl-10 pr-8 py-2 border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                  />
                  <datalist id="usernameOptions">
                    {(userData || [])
                      .filter((u) => u && u.user_name)
                      .map((user) => (
                        <option
                          key={`opt-user-${user.id}`}
                          value={user.user_name}
                        />
                      ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-thin">
              <div className="inline-block min-w-full align-middle">
                {/* Desktop View */}
                <div className="hidden md:block">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Username
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Email
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Phone No.
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Employee ID
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Department
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Designation
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Status
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Role
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Reported To
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        const filtered = (userData || []).filter(
                          (user) =>
                            user &&
                            user.user_name &&
                            (!usernameFilter ||
                              user.user_name
                                .toLowerCase()
                                .includes(usernameFilter.toLowerCase())),
                        );
                        console.log(
                          "Setting Page - Filtered Users COUNT:",
                          filtered.length,
                        );
                        return filtered;
                      })().map((user, index) => (
                        <tr
                          key={`user-${user?.id || index}`}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden mr-3 border border-indigo-200">
                                {user?.profile_image ? (
                                  <img
                                    src={user.profile_image}
                                    alt={user.user_name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-indigo-700">
                                    {user?.user_name?.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-medium text-gray-900">
                                {user?.user_name}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user?.email_id}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user?.number}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user?.employee_id || "N/A"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user?.department || "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-blue-700 font-bold">
                              {user?.Designation || "—"}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <span
                                  className={`px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase tracking-wider ${getStatusColor(user?.status)}`}
                                >
                                  {user?.status === "on_leave"
                                    ? "On Leave"
                                    : user?.status}
                                </span>
                                {user?.status === "active" && (
                                  <span
                                    className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-200"
                                    title="Live Status"
                                  ></span>
                                )}
                              </div>
                              {(user?.status === "on leave" ||
                                user?.status === "on_leave") &&
                                user?.leave_date && (
                                  <div className="flex flex-col mt-1 space-y-0.5">
                                    <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                      <Calendar size={10} />
                                      {new Date(
                                        user.leave_date,
                                      ).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                      {user.leave_end_date
                                        ? ` - ${new Date(user.leave_end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                                        : ""}
                                    </span>
                                    {user.remark && (
                                      <span
                                        className="text-[9px] text-gray-400 italic font-medium truncate max-w-[120px]"
                                        title={user.remark}
                                      >
                                        {user.remark}
                                      </span>
                                    )}
                                  </div>
                                )}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1.5">
                              <span
                                className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(user?.role)}`}
                              >
                                {user?.role}
                              </span>
                              {user?.can_self_assign && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-tighter border border-indigo-100 shadow-sm animate-fade-in">
                                  <div className="w-1 h-1 rounded-full bg-indigo-600 animate-pulse"></div>
                                  Self-Assign
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-medium text-gray-600">
                              {user?.reported_by || "Admin"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditUser(user?.id)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Edit User"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user?.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete User"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="md:hidden space-y-4 p-4 bg-gray-50/50">
                  {(userData || [])
                    .filter(
                      (user) =>
                        user &&
                        user.user_name &&
                        user.user_name !== "admin" &&
                        user.user_name !== "DSMC" &&
                        (!usernameFilter ||
                          user.user_name
                            .toLowerCase()
                            .includes(usernameFilter.toLowerCase())),
                    )
                    .map((user, index) => (
                      <div
                        key={`user-card-${user?.id || index}`}
                        className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden animate-fade-in"
                      >
                        <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                          <span className="text-sm font-bold text-blue-900">
                            {user?.user_name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 inline-flex text-[10px] leading-5 font-bold rounded-full uppercase ${getStatusColor(user?.status)}`}
                            >
                              {user?.status === "on_leave"
                                ? "On Leave"
                                : user?.status}
                            </span>
                            {user?.status === "active" && (
                              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-200"></span>
                            )}
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                Employee ID
                              </p>
                              <p className="text-xs text-gray-700 font-medium">
                                {user?.employee_id || "N/A"}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                Role
                              </p>
                              <span
                                className={`px-1.5 py-0.5 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase ${getRoleColor(user?.role)}`}
                              >
                                {user?.role}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">
                              Email
                            </p>
                            <p className="text-xs text-gray-700 truncate">
                              {user?.email_id || "—"}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                Department
                              </p>
                              <p className="text-xs text-indigo-700 font-bold">
                                {user?.department || "—"}
                              </p>
                            </div>
                            {user?.Designation && (
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                  Designation
                                </p>
                                <p className="text-xs text-blue-700 font-bold">
                                  {user.Designation}
                                </p>
                              </div>
                            )}
                          </div>

                          {(user?.status === "on leave" ||
                            user?.status === "on_leave") &&
                            user?.leave_date && (
                              <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
                                <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1 uppercase tracking-wider">
                                  <Calendar size={10} /> Leave Period
                                </p>
                                <p className="text-xs text-amber-800 mt-1">
                                  {new Date(user.leave_date).toLocaleDateString(
                                    "en-IN",
                                    { day: "numeric", month: "short" },
                                  )}
                                  {user.leave_end_date
                                    ? ` to ${new Date(user.leave_end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                                    : ""}
                                </p>
                                {user.remark && (
                                  <p className="text-[10px] text-amber-600 italic mt-1 font-medium">
                                    {user.remark}
                                  </p>
                                )}
                              </div>
                            )}

                          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                            <button
                              onClick={() => handleEditUser(user?.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all"
                            >
                              <Edit size={14} /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user?.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Departments Tab */}
        {activeTab === "departments" && (
          <div className="bg-white shadow-xs rounded-2xl overflow-hidden border border-gray-200">
            <div className="bg-gray-50/80 border-b border-gray-200 px-4 py-2.5">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
                <h2 className="text-sm font-extrabold text-gray-800">
                  Department Management
                </h2>

                <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs p-0.5">
                  <button
                    className={`px-4 py-2 text-xs font-bold transition-all ${activeDeptSubTab === "departments" ? "bg-blue-600 text-white" : "bg-white text-blue-600 hover:bg-blue-50"}`}
                    onClick={() => {
                      setActiveDeptSubTab("departments");
                      dispatch(departmentDetails());
                    }}
                  >
                    Main Departments
                  </button>
                  <button
                    className={`px-4 py-2 text-xs font-bold border-l border-blue-100 transition-all ${activeDeptSubTab === "givenBy" ? "bg-blue-600 text-white" : "bg-white text-blue-600 hover:bg-blue-50"}`}
                    onClick={() => {
                      setActiveDeptSubTab("givenBy");
                      dispatch(givenByDetails());
                    }}
                  >
                    Assign From
                  </button>
                  <button
                    className={`px-4 py-2 text-xs font-bold border-l border-blue-100 transition-all ${activeDeptSubTab === "divisions" ? "bg-blue-600 text-white" : "bg-white text-blue-600 hover:bg-blue-50"}`}
                    onClick={() => {
                      setActiveDeptSubTab("divisions");
                      fetchDivisions();
                    }}
                  >
                    Divisions
                  </button>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md m-4">
                <p className="text-red-600">Error: {error}</p>
              </div>
            )}

            {/* Departments Sub-tab - Show only department names */}
            {activeDeptSubTab === "departments" && !loading && (
              <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-thin">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          ID
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Department Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {consolidatedDepartments && consolidatedDepartments.length > 0 ? (
                        consolidatedDepartments.map((group, index) => (
                          <tr
                            key={`consolidated-dept-${group.name}-${index}`}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                              {index + 1}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {group.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex space-x-2 justify-end">
                                <button
                                  onClick={() => handleEditDepartment(group.name)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit Department"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteDepartmentGroup(group)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Department"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="3"
                            className="px-6 py-4 text-center text-sm text-gray-500"
                          >
                            No departments found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Given By Sub-tab - Show only given_by values */}
            {activeDeptSubTab === "givenBy" && !loading && (
              <div
                className="h-[calc(100vh-275px)] overflow-auto"
                style={{ maxHeight: "calc(100vh - 220px)" }}
              >
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        ID
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Assign From
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {givenBy && givenBy.length > 0 ? (
                      givenBy.map((item, index) => (
                        <tr
                          key={`given-${item.id || index}`}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.given_by}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2 justify-end">
                              <button
                                onClick={() => handleEditDepartment(item.id)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-md"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm("Delete this entry?")) {
                                    dispatch(deleteAssignFrom(item.id));
                                  }
                                }}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          className="px-6 py-4 text-center text-sm text-gray-500"
                        >
                          No data found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Divisions Sub-tab - Show divisions list */}
            {activeDeptSubTab === "divisions" && !loading && (
              <div
                className="h-[calc(100vh-275px)] overflow-auto"
                style={{ maxHeight: "calc(100vh - 220px)" }}
              >
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        ID
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Division Name
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {divisions && divisions.length > 0 ? (
                      divisions.map((div, index) => (
                        <tr
                          key={`div-${div.id || index}`}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {div.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2 justify-end">
                              <button
                                onClick={() => handleDeleteDivision(div.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          className="px-6 py-4 text-center text-sm text-gray-500"
                        >
                          No divisions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Machines Tab (Machine Management) */}
        {activeTab === "categories" && (
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-blue-100">
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-8 py-6 flex justify-between items-center border-b border-blue-100">
              <div>
                <h2 className="text-xl font-bold text-indigo-900">
                  Machine Manager
                </h2>
                <p className="text-sm text-indigo-600">
                  Add and manage machines for tasks
                </p>
              </div>
            </div>

            <div className="max-h-[calc(100vh-250px)] overflow-auto scrollbar-hide">
              <div className="p-0 md:p-6">
                {(() => {
                  // Group by Machine Name
                  const machinesByName = {};

                  if (customDropdowns) {
                    customDropdowns.forEach((item) => {
                      if (item.category === "Machine Name") {
                        if (!machinesByName[item.value]) {
                          machinesByName[item.value] = {
                            parts: [],
                            areas: new Set(),
                            ids: [],
                          };
                        }
                        machinesByName[item.value].ids.push(item.id);
                      }
                    });

                    // Associate Parts and Areas
                    Object.keys(machinesByName).forEach((machineName) => {
                      const ids = machinesByName[machineName].ids;
                      customDropdowns.forEach((item) => {
                        if (ids.includes(item.id)) {
                          if (item.category === "Part Name")
                            machinesByName[machineName].parts.push(item);
                          if (item.category === "Machine Area")
                            machinesByName[machineName].areas.add(item.value);
                        }
                      });
                    });
                  }

                  const machineNames = Object.keys(machinesByName).sort();

                  if (machineNames.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Settings size={48} className="text-gray-200 mb-4" />
                        <p className="text-gray-500 font-medium">
                          No machines found
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                          Add a new machine to get started
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Desktop View */}
                      <div className="hidden md:block">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Machine Name
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Machine Area
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Parts Count
                              </th>
                              <th
                                scope="col"
                                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {machineNames.map((machineName, idx) => {
                              const data = machinesByName[machineName];
                              const isExpanded =
                                activeDeptSubTab === `expanded-${idx}`;

                              return (
                                <React.Fragment key={idx}>
                                  <tr
                                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() =>
                                      setActiveDeptSubTab(
                                        isExpanded ? "" : `expanded-${idx}`,
                                      )
                                    }
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                                      <ChevronDown
                                        size={16}
                                        className={`transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                      />
                                      {machineName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {[...data.areas].join(", ") || "-"}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      <span className="bg-indigo-100 text-indigo-800 py-0.5 px-2.5 rounded-full text-xs font-medium">
                                        {data.parts.length} parts
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (
                                            window.confirm(
                                              `Delete machine "${machineName}" and all its parts?`,
                                            )
                                          ) {
                                            data.ids.forEach((id) =>
                                              dispatch(
                                                deleteCustomDropdown(id),
                                              ),
                                            );
                                          }
                                        }}
                                        className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-gray-50/50">
                                      <td colSpan="4" className="px-6 py-4">
                                        <div className="pl-6 border-l-2 border-indigo-200">
                                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                            Associated Parts
                                          </p>
                                          <div className="flex flex-wrap gap-2">
                                            {data.parts.length > 0 ? (
                                              data.parts.map((part) => (
                                                <span
                                                  key={part.id}
                                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-md border border-gray-200 shadow-sm relative group/part"
                                                >
                                                  {part.image_url && (
                                                    <img
                                                      src={part.image_url}
                                                      alt={part.value}
                                                      className="w-6 h-6 rounded object-cover border border-gray-100 flex-shrink-0"
                                                      onError={(e) => {
                                                        e.target.style.display =
                                                          "none";
                                                      }}
                                                    />
                                                  )}
                                                  {part.value}
                                                  <div className="flex gap-1.5 ml-1 opacity-100 lg:opacity-0 group-hover/part:opacity-100 transition-opacity">
                                                    <label
                                                      className="text-blue-400 hover:text-blue-600 cursor-pointer flex items-center justify-center p-0.5"
                                                      title="Edit part image"
                                                    >
                                                      <Edit size={12} />
                                                      <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                          const file =
                                                            e.target.files[0];
                                                          if (file)
                                                            handleUpdatePartImage(
                                                              file,
                                                              part,
                                                            );
                                                          e.target.value = null;
                                                        }}
                                                      />
                                                    </label>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (
                                                          window.confirm(
                                                            `Delete part "${part.value}"?`,
                                                          )
                                                        ) {
                                                          dispatch(
                                                            deleteCustomDropdown(
                                                              part.id,
                                                            ),
                                                          );
                                                        }
                                                      }}
                                                      className="text-gray-400 hover:text-red-600 transition-colors p-0.5"
                                                      title="Delete part"
                                                    >
                                                      <X size={12} />
                                                    </button>
                                                  </div>
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-sm text-gray-400 italic">
                                                No parts added for this machine
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile View */}
                      <div className="md:hidden space-y-4 p-4 bg-gray-50/50">
                        {machineNames.map((machineName, idx) => {
                          const data = machinesByName[machineName];
                          const isExpanded =
                            activeDeptSubTab === `expanded-mob-${idx}`;

                          return (
                            <div
                              key={`machine-card-${idx}`}
                              className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden"
                            >
                              <div
                                className="bg-indigo-50/50 px-4 py-3 border-b border-indigo-100 flex justify-between items-center cursor-pointer"
                                onClick={() =>
                                  setActiveDeptSubTab(
                                    isExpanded ? "" : `expanded-mob-${idx}`,
                                  )
                                }
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    size={16}
                                    className={`text-indigo-600 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                  <span className="text-sm font-bold text-indigo-900">
                                    {machineName}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      window.confirm(
                                        `Delete machine "${machineName}" and all its parts?`,
                                      )
                                    ) {
                                      data.ids.forEach((id) =>
                                        dispatch(deleteCustomDropdown(id)),
                                      );
                                    }
                                  }}
                                  className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              <div className="p-4 space-y-3">
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Area
                                  </p>
                                  <p className="text-xs text-gray-700 font-medium">
                                    {[...data.areas].join(", ") || "-"}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-400 uppercase font-semibold">
                                    Parts Count
                                  </p>
                                  <span className="bg-indigo-100 text-indigo-800 py-0.5 px-2.5 rounded-full text-[10px] font-bold">
                                    {data.parts.length} Parts
                                  </span>
                                </div>

                                {isExpanded && (
                                  <div className="mt-3 pt-3 border-t border-gray-100">
                                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">
                                      Associated Parts
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {data.parts.length > 0 ? (
                                        data.parts.map((part) => (
                                          <span
                                            key={part.id}
                                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-700 text-[10px] font-bold rounded border border-gray-100"
                                          >
                                            {part.image_url && (
                                              <img
                                                src={part.image_url}
                                                alt={part.value}
                                                className="w-5 h-5 rounded object-cover border border-gray-100 flex-shrink-0"
                                                onError={(e) => {
                                                  e.target.style.display =
                                                    "none";
                                                }}
                                              />
                                            )}
                                            {part.value}
                                            <div className="flex gap-1.5 ml-1">
                                              <label className="text-blue-400 hover:text-blue-600 cursor-pointer p-0.5 flex items-center justify-center">
                                                <Edit size={12} />
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={(e) => {
                                                    const file =
                                                      e.target.files[0];
                                                    if (file)
                                                      handleUpdatePartImage(
                                                        file,
                                                        part,
                                                      );
                                                    e.target.value = null;
                                                  }}
                                                />
                                              </label>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (
                                                    window.confirm(
                                                      `Delete part "${part.value}"?`,
                                                    )
                                                  ) {
                                                    dispatch(
                                                      deleteCustomDropdown(
                                                        part.id,
                                                      ),
                                                    );
                                                  }
                                                }}
                                                className="text-gray-400 hover:text-red-600 p-0.5"
                                              >
                                                <X size={12} />
                                              </button>
                                            </div>
                                          </span>
                                        ))
                                      ) : (
                                        <p className="text-[10px] text-gray-400 italic">
                                          No parts added
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setShowUserModal(false)}
            ></div>

            <div className="relative bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-300 border border-white/50 flex flex-col max-h-[95vh]">
              {/* Premium Header */}
              <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-pink-500 px-10 py-8 relative">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">
                      {isEditing ? "Update Profile" : "Nurture Talent"}
                    </h3>
                    <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mt-1">
                      {isEditing
                        ? "Refine user information"
                        : "Create a new team member"}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all hover:rotate-90"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              <div className="p-10 overflow-y-auto no-scrollbar">
                <form
                  onSubmit={isEditing ? handleUpdateUser : handleAddUser}
                  className="space-y-8"
                >
                  {/* Profile Image Section */}
                  <div className="flex flex-col items-center mb-8">
                    <div className="relative group">
                      <div className="h-28 w-28 rounded-full bg-white p-1.5 shadow-2xl ring-4 ring-blue-100/50">
                        <div className="h-full w-full rounded-full bg-gradient-to-tr from-indigo-50 to-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-blue-400 group-hover:bg-blue-50/50">
                          {profilePreview || userForm.profile_image ? (
                            <img
                              src={profilePreview || userForm.profile_image}
                              alt="Profile"
                              className="h-full w-full object-cover transform transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <User
                              size={40}
                              className="text-blue-200 group-hover:text-blue-400 transition-colors"
                            />
                          )}
                        </div>
                      </div>
                      <label className="absolute bottom-1 right-1 bg-indigo-600 text-white p-2.5 rounded-full cursor-pointer shadow-xl hover:bg-indigo-700 transition-all active:scale-90 ring-4 ring-white">
                        <Plus size={18} strokeWidth={3} />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setProfileFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () =>
                                setProfilePreview(reader.result);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-4 font-black uppercase tracking-widest">
                      Profile Identity
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label
                        htmlFor="username"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Username
                      </label>
                      <input
                        type="text"
                        name="username"
                        id="username"
                        value={userForm.username}
                        onChange={handleUserInputChange}
                        required
                        className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 outline-none transition-all ${
                          isDuplicateUsername
                            ? "border-rose-500 focus:ring-rose-500 text-rose-900"
                            : "border-gray-200 focus:ring-blue-500 focus:border-transparent"
                        }`}
                        placeholder="Enter username"
                      />
                      {isDuplicateUsername && (
                        <p className="text-xs font-bold text-rose-500 mt-1 flex items-center gap-1">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>Username already exists. Please choose another username.</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="email"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Email Address
                      </label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={userForm.email}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        placeholder="Enter email address"
                      />
                    </div>

                    {!isEditing && (
                      <div className="space-y-2">
                        <label
                          htmlFor="password"
                          className="block text-sm font-bold text-gray-700 ml-1"
                        >
                          Password
                        </label>
                        <input
                          type="password"
                          name="password"
                          id="password"
                          value={userForm.password}
                          onChange={handleUserInputChange}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label
                        htmlFor="phone"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        value={userForm.phone}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        placeholder="+91 00000 00000"
                      />
                    </div>

                    {isEditing && (
                      <div className="space-y-2">
                        <label
                          htmlFor="employee_id"
                          className="block text-sm font-bold text-gray-700 ml-1"
                        >
                          Employee ID
                        </label>
                        <input
                          type="text"
                          name="employee_id"
                          id="employee_id"
                          value={userForm.employee_id}
                          readOnly
                          className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label
                        htmlFor="role"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        User Role
                      </label>
                      <select
                        id="role"
                        name="role"
                        value={userForm.role}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="admin">Admin</option>
                        <option value="HOD">HOD</option>
                        <option value="user">User</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="reported_by"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Reported To (Supervisor)
                      </label>
                      <select
                        id="reported_by"
                        name="reported_by"
                        value={userForm.reported_by}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="">No Supervisor (Direct Admin)</option>
                        {userData &&
                          userData.length > 0 &&
                          userData
                            .filter(
                              (u) =>
                                u &&
                                u.user_name &&
                                u.user_name !== userForm.username &&
                                u.user_name !== "admin",
                            )
                            .map((u, i) => (
                              <option key={i} value={u.user_name}>
                                {u.user_name}
                              </option>
                            ))}
                      </select>
                    </div>

                    <div className="space-y-2 md:col-span-2 relative">
                      <label
                        htmlFor="division"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Division (Select Multiple)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsUserDivisionDropdownOpen((prev) => !prev)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-left text-gray-950 transition-all text-sm font-medium flex items-center justify-between"
                      >
                        <span className="truncate">
                          {(userForm.division || "")
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean).length > 0
                            ? (userForm.division || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .join(", ")
                            : "Choose division(s)..."}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">▼</span>
                      </button>

                      {isUserDivisionDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl p-2 space-y-1 max-h-48 overflow-y-auto">
                          {divisions.map((div) => {
                            const selected = (userForm.division || "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .includes(div.name);
                            return (
                              <label
                                key={div.id}
                                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-sm font-medium text-gray-800"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    const current = (userForm.division || "")
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    let updated;
                                    if (selected) {
                                      updated = current.filter((d) => d !== div.name);
                                    } else {
                                      updated = [...current, div.name];
                                    }
                                    setUserForm((prev) => ({
                                      ...prev,
                                      division: updated.join(", "),
                                    }));
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span>{div.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label
                        htmlFor="department"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Department Assigned
                      </label>
                      <select
                        id="department"
                        name="department"
                        value={userForm.department}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="">Choose a department...</option>
                        {(() => {
                          if (!department || department.length === 0) return null;

                          const deptNames = Array.from(
                            new Set(
                              department
                                .map((d) => (d.department || d.name || "").trim())
                                .filter(Boolean),
                            ),
                          ).sort((a, b) => a.localeCompare(b));

                          return deptNames.map((deptName, index) => (
                            <option key={index} value={deptName}>
                              {deptName}
                            </option>
                          ));
                        })()}
                      </select>
                    </div>

                    {/* Designation Field — shown for both new and edit */}
                    <div className="space-y-2">
                      <label
                        htmlFor="Designation"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Designation
                      </label>
                      <input
                        type="text"
                        name="Designation"
                        id="Designation"
                        value={userForm.Designation}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        placeholder="e.g. Senior Technician, Supervisor..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="day_off"
                        className="block text-sm font-bold text-gray-700 ml-1"
                      >
                        Day Off
                      </label>
                      <select
                        id="day_off"
                        name="day_off"
                        value={userForm.day_off || ""}
                        onChange={handleUserInputChange}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-800 font-medium"
                      >
                        <option value="">None (No Day Off)</option>
                        <option value="sunday">Sunday</option>
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                        <option value="saturday">Saturday</option>
                      </select>
                    </div>

                    {isEditing && (
                      <>
                        <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-2">
                          <h4 className="text-sm font-bold text-indigo-900 mb-4 px-1">
                            Leave &amp; Status Management
                          </h4>
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="status"
                            className="block text-sm font-bold text-gray-700 ml-1"
                          >
                            User Status
                          </label>
                          <select
                            id="status"
                            name="status"
                            value={userForm.status}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="leave_date"
                            className="block text-sm font-bold text-gray-700 ml-1"
                          >
                            Leave Start Date
                          </label>
                          <input
                            type="date"
                            id="leave_date"
                            name="leave_date"
                            value={userForm.leave_date}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="leave_end_date"
                            className="block text-sm font-bold text-gray-700 ml-1"
                          >
                            Leave End Date
                          </label>
                          <input
                            type="date"
                            id="leave_end_date"
                            name="leave_end_date"
                            value={userForm.leave_end_date}
                            onChange={handleUserInputChange}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="remark"
                            className="block text-sm font-bold text-gray-700 ml-1"
                          >
                            Remark / Reason
                          </label>
                          <textarea
                            id="remark"
                            name="remark"
                            value={userForm.remark}
                            onChange={handleUserInputChange}
                            rows="2"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                            placeholder="Enter any remarks or leave reason..."
                          ></textarea>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-[2rem] border border-blue-100/50 flex items-center justify-between group transition-all hover:shadow-xl hover:shadow-blue-100/30">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-blue-600 shadow-sm border border-blue-100 group-hover:scale-110 transition-transform">
                        <User size={20} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-0.5 group-hover:text-indigo-600 transition-colors">
                          Self-Assign Rights
                        </h4>
                        <p className="text-[10px] text-gray-400 font-bold max-w-[200px]">
                          Allow this user to assign tasks to themselves
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer scale-110">
                      <input
                        type="checkbox"
                        name="can_self_assign"
                        checked={userForm.can_self_assign}
                        onChange={(e) =>
                          setUserForm((prev) => ({
                            ...prev,
                            can_self_assign: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-50 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowUserModal(false)}
                      className="px-8 py-3 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDuplicateUsername}
                      className={`px-10 py-3 text-white text-xs font-black rounded-2xl shadow-[0_10px_20px_-5px_rgba(79,70,229,0.4)] hover:shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-widest ${
                        isDuplicateUsername
                          ? "bg-gray-400 cursor-not-allowed opacity-60"
                          : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 cursor-pointer"
                      }`}
                    >
                      <Save size={16} strokeWidth={3} />
                      {isEditing ? "Save Changes" : "Create User"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Division Modal */}
        {showDivisionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setShowDivisionModal(false)}
            ></div>

            <div className="relative bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50 max-h-[90vh] flex flex-col">
              {/* Premium Header */}
              <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-600 px-10 py-8 relative">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">
                      Create Division
                    </h3>
                    <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mt-1">
                      Configure corporate divisions
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDivisionModal(false)}
                    className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all hover:rotate-90"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-8 overflow-y-auto flex-1">
                <form
                  onSubmit={handleAddDivision}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="divisionName"
                      className="block text-sm font-bold text-gray-700 ml-1"
                    >
                      Division Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="divisionName"
                      value={divisionForm.name}
                      onChange={(e) => setDivisionForm({ name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      placeholder="e.g. Sales & Marketing"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-50 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowDivisionModal(false)}
                      className="px-8 py-3 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-10 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-black rounded-2xl hover:from-indigo-700 hover:to-blue-700 shadow-[0_10px_20px_-5px_rgba(79,70,229,0.4)] hover:shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-widest"
                    >
                      <Save size={16} strokeWidth={3} />
                      Create Division
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Department / Category Modal */}
        {showDeptModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setShowDeptModal(false)}
            ></div>

            <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 max-h-[88vh] flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-600 px-5 py-4 sm:px-6 sm:py-5 relative shrink-0">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                      {activeTab === "categories"
                        ? isEditing
                          ? "Refine Asset"
                          : "New Infrastructure"
                        : activeDeptSubTab === "givenBy"
                          ? isEditing
                            ? "Update Designation"
                            : "Create Designation"
                          : isEditing
                            ? "Update Department"
                            : "Create Department"}
                    </h3>
                    <p className="text-white/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-0.5">
                      {activeTab === "categories"
                        ? "Configure machine architecture"
                        : "Organize your workforce structure"}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeptModal(false)}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all hover:rotate-90 active:scale-95"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                <form
                  onSubmit={
                    isEditing ? handleUpdateDepartment : handleAddDepartment
                  }
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor="givenBy"
                      className="block text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide"
                    >
                      {activeTab === "categories"
                        ? "Machine Name"
                        : activeDeptSubTab === "givenBy"
                          ? "Assign From Name"
                          : "Department Name"}
                    </label>
                    {activeTab === "categories" ? (
                      <input
                        type="text"
                        name="givenBy"
                        id="givenBy"
                        value={deptForm.givenBy}
                        onChange={handleDeptInputChange}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium transition-all"
                        placeholder="Enter machine name..."
                      />
                    ) : activeDeptSubTab === "givenBy" ? (
                      <select
                        name="name"
                        id="name"
                        value={deptForm.name}
                        onChange={handleDeptInputChange}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-gray-800 transition-all"
                      >
                        <option value="">Select Assign From...</option>
                        {(userData || [])
                          .filter(
                            (u) =>
                              u &&
                              u.user_name &&
                              (u.role === "admin" || u.role === "HOD"),
                          )
                          .map((u) => u.user_name)
                          .sort((a, b) => a.localeCompare(b))
                          .map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={deptForm.name}
                        onChange={handleDeptInputChange}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium text-gray-800 transition-all"
                        placeholder="e.g. Marketing"
                      />
                    )}
                  </div>

                  {deptForm.name === "Temperature" && (
                    <p className="text-xs text-amber-600 ml-1 mt-1 font-bold">
                      ⚠️ Temperature strictly uses: 'Low', 'Medium', 'High'
                    </p>
                  )}

                  {activeTab === "categories" && !isEditing && (
                    <>
                      <div className="space-y-2 pt-1">
                        <label className="block text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">
                          Part Names{" "}
                          <span className="text-gray-400 font-normal normal-case">
                            (Add multiple parts with optional images)
                          </span>
                        </label>
                        <div className="space-y-2">
                          {inputParts.map((part, index) => (
                            <div
                              key={index}
                              className="bg-gray-50 rounded-xl border border-gray-200 p-2.5 space-y-2"
                            >
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={part.name}
                                  onChange={(e) =>
                                    handlePartInputChange(index, e.target.value)
                                  }
                                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs transition-all"
                                  placeholder={`Part #${index + 1} name`}
                                />
                                {inputParts.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePartInput(index)}
                                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>

                              {/* Part Image Upload */}
                              <div className="flex items-center gap-3">
                                <label
                                  htmlFor={`part-img-${index}`}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-dashed border-blue-300 text-blue-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-blue-50 transition-all"
                                >
                                  <Image size={13} />
                                  {part.preview ? "Change Image" : "Add Image"}
                                  <input
                                    id={`part-img-${index}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handlePartImageChange(
                                        index,
                                        e.target.files[0],
                                      )
                                    }
                                  />
                                </label>
                                {part.preview && (
                                  <div className="relative flex-shrink-0">
                                    <img
                                      src={part.preview}
                                      alt="Part preview"
                                      className="w-9 h-9 rounded-lg object-cover border border-gray-200 shadow-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePartImageChange(index, null)
                                      }
                                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-red-600"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleAddPartInput}
                          className="mt-1 text-xs text-blue-600 font-bold hover:text-blue-800 flex items-center gap-1"
                        >
                          <Plus size={14} /> Add Another Part
                        </button>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <label
                          htmlFor="machineArea"
                          className="block text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide"
                        >
                          Machine Area{" "}
                          <span className="text-gray-400 font-normal normal-case">
                            (Optional)
                          </span>
                        </label>
                        <input
                          type="text"
                          name="machineArea"
                          id="machineArea"
                          value={deptForm.machineArea}
                          onChange={handleDeptInputChange}
                          className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium transition-all"
                          placeholder="Enter machine area..."
                        />
                      </div>
                    </>
                  )}

                  <div className="flex justify-end items-center gap-2 pt-4 border-t border-gray-100 mt-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowDeptModal(false)}
                      className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5 uppercase tracking-wider cursor-pointer"
                    >
                      <Save size={14} strokeWidth={2.5} />
                      {activeTab === "categories"
                        ? currentDeptId
                          ? "Update Asset"
                          : "Save Asset"
                        : currentDeptId
                          ? "Update Entry"
                          : "Save Entry"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Custom Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
            ></div>
            <div className="relative bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50 max-h-[90vh] flex flex-col">
              {/* Header with Icon */}
              <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 pt-8 pb-6 text-center relative shrink-0">
                <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
                <div className="relative z-10">
                  <div className="mx-auto w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-3 shadow-xl ring-4 ring-white/30">
                    <Trash2
                      size={28}
                      className="text-white"
                      strokeWidth={2.5}
                    />
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight mb-1">
                    Delete User Account?
                  </h3>
                  <p className="text-white/90 text-xs font-bold uppercase tracking-widest px-4">
                    Account: {userToDeleteData.name}
                  </p>
                </div>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto no-scrollbar space-y-5 text-center">
                {/* Calculated Related Tasks Breakdown Card */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                      Associated Task Records
                    </span>
                    {isCountingTasks ? (
                      <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1.5 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" /> Calculating...
                      </span>
                    ) : (
                      <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                        taskCounts.total > 0
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        {taskCounts.total} Total Records
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Checklist</span>
                      <span className="text-sm font-black text-gray-900">
                        {isCountingTasks ? "..." : taskCounts.checklist}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Delegation</span>
                      <span className="text-sm font-black text-gray-900">
                        {isCountingTasks ? "..." : taskCounts.delegation}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Maintenance</span>
                      <span className="text-sm font-black text-gray-900">
                        {isCountingTasks ? "..." : taskCounts.maintenance}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Repair</span>
                      <span className="text-sm font-black text-gray-900">
                        {isCountingTasks ? "..." : taskCounts.repair}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs col-span-2 sm:col-span-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">EA Tasks</span>
                      <span className="text-sm font-black text-gray-900">
                        {isCountingTasks ? "..." : taskCounts.ea}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Option Selector */}
                <div className="space-y-2.5 text-left">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    What should happen to the related tasks?
                  </p>

                  {/* Option 1: Keep Task History (Default & Recommended) */}
                  <div
                    onClick={() => setDeleteRelatedTasks(false)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      !deleteRelatedTasks
                        ? "border-blue-600 bg-blue-50/70 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="setting_delete_tasks_mode"
                      id="setting_opt_keep_history"
                      checked={!deleteRelatedTasks}
                      onChange={() => setDeleteRelatedTasks(false)}
                      className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="setting_opt_keep_history" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">
                          Keep Task Records (Preserve History)
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">
                        Preserves all {taskCounts.total} task records for reporting, historical analytics, and audits. Only deletes the user login account.
                      </p>
                    </label>
                  </div>

                  {/* Option 2: Purge Tasks */}
                  <div
                    onClick={() => setDeleteRelatedTasks(true)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      deleteRelatedTasks
                        ? "border-rose-500 bg-rose-50/70 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="setting_delete_tasks_mode"
                      id="setting_opt_purge_tasks"
                      checked={deleteRelatedTasks}
                      onChange={() => setDeleteRelatedTasks(true)}
                      className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <label htmlFor="setting_opt_purge_tasks" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-rose-600">
                          Delete All Related Tasks
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                          Irreversible
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">
                        Permanently deletes the user account AND completely wipes all {taskCounts.total} associated task records from the database.
                      </p>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isDeleting || isCountingTasks}
                    onClick={confirmDeleteUserAndTasks}
                    className={`w-full py-3.5 px-6 font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-75 text-white ${
                      deleteRelatedTasks
                        ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-red-200"
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                    }`}
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />{" "}
                        Executing...
                      </>
                    ) : deleteRelatedTasks ? (
                      `Confirm: Delete User & Purge ${taskCounts.total} Tasks`
                    ) : (
                      `Confirm: Delete User Only (Keep History)`
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full py-2.5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors disabled:opacity-50"
                  >
                    Cancel (Keep Profile)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cleanup Selection Modal */}
        {showCleanupModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowCleanupModal(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Checklist Cleanup
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    Manage history & optimize storage
                  </p>
                </div>
                <button
                  onClick={() => setShowCleanupModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-3">
                    Retention Period
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                    {[45, 50, 60].map((days) => (
                      <button
                        key={`cleanup-btn-${days}`}
                        onClick={() => {
                          setCleanupDays(days);
                          fetchCleanupPreview(days);
                        }}
                        className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${
                          cleanupDays === days
                            ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    Data older than {cleanupDays} days will be identified for
                    cleanup.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Data Preview
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {cleanupItems.length} records found
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {cleanupLoading ? (
                      <div className="flex items-center justify-center py-10 gap-2">
                        <RefreshCw
                          size={16}
                          className="animate-spin text-blue-500"
                        />
                        <span className="text-xs text-slate-500 font-medium">
                          Scanning records...
                        </span>
                      </div>
                    ) : cleanupItems.length > 0 ? (
                      cleanupItems.map((item) => (
                        <div
                          key={item.task_id}
                          className="p-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex justify-between items-center gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">
                                {item.task_description}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {item.name || "User"} •{" "}
                                {new Date(
                                  item.submission_date,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-slate-400">
                              ID: {String(item.task_id || "").slice(-4)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-10 text-center">
                        <p className="text-xs text-slate-400 font-medium">
                          No matching records found.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <button
                    disabled={cleanupItems.length === 0}
                    onClick={() => {
                      setShowCleanupModal(false);
                      setShowDangerPopup(true);
                    }}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Proceed to Cleanup
                  </button>
                  <p className="text-[9px] text-center text-slate-400 font-medium">
                    This action is a safety-first workflow. No data is deleted
                    in the current step.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Danger Cleanup Popup */}
        {showDangerPopup && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
              <div className="px-6 py-6 border-b border-red-50 bg-red-50/30 flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Critical Action Required
                  </h3>
                  <p className="text-[10px] text-red-600 font-black uppercase tracking-widest">
                    Permanent Data Purge
                  </p>
                </div>
              </div>

              <div className="p-6">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 text-center">
                    Retention Protocol
                  </h4>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">
                        Preserve
                      </p>
                      <p className="text-sm font-black text-slate-700">
                        Latest {cleanupDays} Days
                      </p>
                    </div>
                    <div className="h-10 w-px bg-slate-200"></div>
                    <div className="flex-1 text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">
                        Delete
                      </p>
                      <p className="text-sm font-black text-red-600">
                        All History Prior
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                    Targeted Records ({cleanupItems.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                    {cleanupItems.map((item, idx) => (
                      <div
                        key={`purge-${item.task_id}-${idx}`}
                        className="p-3 bg-white flex items-center gap-3"
                      >
                        <span className="text-[10px] font-bold text-slate-300">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {item.task_description}
                          </p>
                          <p className="text-[9px] text-slate-400 font-medium">
                            Submitted:{" "}
                            {new Date(
                              item.submission_date,
                            ).toLocaleDateString()}{" "}
                            • {item.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    disabled={isRefreshing}
                    onClick={async () => {
                      setIsRefreshing(true);
                      try {
                        const { bulkDeleteApprovedChecklists } =
                          await import("../redux/api/checkListApi");
                        const { count } =
                          await bulkDeleteApprovedChecklists(cleanupDays);
                        showToast(
                          `Successfully purged ${count} old checklist records.`,
                          "success",
                        );
                        setShowDangerPopup(false);
                        // Refresh data if needed or stay on settings
                        dispatch(userDetails());
                      } catch (err) {
                        console.error("Purge operation failed:", err);
                        showToast(
                          "Failed to purge records. Database error.",
                          "error",
                        );
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-red-100 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isRefreshing ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />{" "}
                        Purging...
                      </>
                    ) : (
                      <>Confirm & Purge History</>
                    )}
                  </button>
                  <button
                    disabled={isRefreshing}
                    onClick={() => setShowDangerPopup(false)}
                    className="w-full py-3 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                  >
                    Cancel and Return
                  </button>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                  <p className="text-[9px] text-slate-400 font-medium italic">
                    Note: This is a system-level administrative action. <br />
                    <span className="font-bold text-slate-500">
                      Currently executing in Test Mode.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default Setting;
