import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Edit } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import {
  deleteDelegationTask,
  uniqueDelegationTaskData,
} from "../redux/slice/quickTaskSlice";
import { useMagicToast } from "../context/MagicToastContext";
import TableScrollSync from "@/components/TableScrollSync";

import RenderDescription from "../components/RenderDescription";

const isAudioUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("http") &&
    (url.includes("audio-recordings") ||
      url.includes("voice-notes") ||
      url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i))
  );
};

function DelegationPage({
  searchTerm = "",
  freqFilter = "",
  departmentFilter = "",
  givenByFilter = "",
  doerFilter = "",
  startDate = "",
  endDate = "",
  externalSelectedTasks = null,
  onSelectionChange = null,
  onDelete = null,
  isExternalDeleting = false,
  onEdit = null,
}) {
  const { showToast } = useMagicToast();
  const [, setUserRole] = useState("");
  const [, setUsername] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [internalSelectedTasks, setInternalSelectedTasks] = useState([]);
  const [internalIsDeleting, setInternalIsDeleting] = useState(false);
  const [, setEditingTaskId] = useState(null);
  const [, setEditFormData] = useState({});

  const isControlled = externalSelectedTasks !== null;
  const selectedTasks = isControlled
    ? externalSelectedTasks
    : internalSelectedTasks;
  const isDeleting = isControlled ? isExternalDeleting : internalIsDeleting;

  const { delegationTasks, loading } = useSelector((state) => state.quickTask);
  const dispatch = useDispatch();

  // Handle checkbox selection
  const handleCheckboxChange = (task) => {
    if (isControlled) {
      if (onSelectionChange) onSelectionChange(task);
      return;
    }
    const taskId = task.id;
    if (internalSelectedTasks.find((t) => t.id === taskId)) {
      setInternalSelectedTasks(
        internalSelectedTasks.filter((t) => t.id !== taskId),
      );
    } else {
      setInternalSelectedTasks([...internalSelectedTasks, task]);
    }
  };

  // Select all checkboxes
  const handleSelectAll = () => {
    if (isControlled) {
      // In controlled mode, we expect the parent to handle "Select All"
      if (onSelectionChange) onSelectionChange("ALL", filteredTasks);
      return;
    }
    if (internalSelectedTasks.length === filteredTasks.length) {
      setInternalSelectedTasks([]);
    } else {
      setInternalSelectedTasks(filteredTasks);
    }
  };

  // Delete selected tasks
  const handleDeleteSelected = async () => {
    if (selectedTasks.length === 0) return;

    if (isControlled && onDelete) {
      onDelete();
      return;
    }

    setInternalIsDeleting(true);
    try {
      await dispatch(deleteDelegationTask(selectedTasks)).unwrap();
      setInternalSelectedTasks([]);
      showToast("Tasks deleted successfully", "success");
      dispatch(uniqueDelegationTaskData({}));
    } catch (error) {
      console.error("Failed to delete tasks:", error);
      showToast("Failed to delete tasks", "error");
    } finally {
      setInternalIsDeleting(false);
    }
  };

  // Edit functionality - use external onEdit if provided
  const handleEditClick = (task) => {
    if (onEdit) {
      onEdit(task);
    } else {
      // Parse instruction attachments if they exist
      let instructionUrls = [];
      let instructionTypes = [];
      try {
        instructionUrls = task.instruction_attachment_url
          ? JSON.parse(task.instruction_attachment_url)
          : [];
        instructionTypes = task.instruction_attachment_type
          ? JSON.parse(task.instruction_attachment_type)
          : [];
        if (!Array.isArray(instructionUrls)) {
          instructionUrls = task.instruction_attachment_url
            ? [task.instruction_attachment_url]
            : [];
          instructionTypes = task.instruction_attachment_type
            ? [task.instruction_attachment_type]
            : [];
        }
      } catch {
        instructionUrls = task.instruction_attachment_url
          ? [task.instruction_attachment_url]
          : [];
        instructionTypes = task.instruction_attachment_type
          ? [task.instruction_attachment_type]
          : [];
      }

      setEditingTaskId(task.id);
      setEditFormData({
        id: task.id,
        department: task.department || "",
        given_by: task.given_by || "",
        name: task.name || "",
        task_description: task.task_description || "",
        audio_url: task.audio_url || null,
        task_start_date: task.task_start_date || "",
        frequency: task.frequency || "",
        duration: task.duration || "",
        enable_reminder: task.enable_reminder || "",
        require_attachment: task.require_attachment || "",
        instruction_attachment_url: instructionUrls,
        instruction_attachment_type: instructionTypes,
        remarks: task.remarks || "",
        originalAudioUrl:
          task.audio_url ||
          (isAudioUrl(task.task_description) ? task.task_description : null),
      });
    }
  };

  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const user = localStorage.getItem("user-name");
    setUserRole(role || "");
    setUsername(user || "");
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized && !isControlled) {
      dispatch(uniqueDelegationTaskData({}));
    }
  }, [dispatch, isInitialized, isControlled]);

  const filteredTasks = useMemo(() => {
    let filtered = delegationTasks;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          (task.task_description || "").toLowerCase().includes(term) ||
          (task.name || "").toLowerCase().includes(term) ||
          (task.given_by || "").toLowerCase().includes(term) ||
          String(task.id || task.task_id || "").includes(term),
      );
    }

    if (departmentFilter) {
      filtered = filtered.filter(
        (task) =>
          (task.department || "").toLowerCase() ===
          departmentFilter.toLowerCase(),
      );
    }

    if (givenByFilter) {
      filtered = filtered.filter(
        (task) =>
          (task.given_by || "").toLowerCase() === givenByFilter.toLowerCase(),
      );
    }

    if (doerFilter) {
      filtered = filtered.filter(
        (task) =>
          (task.name || "").toLowerCase() === doerFilter.toLowerCase(),
      );
    }

    if (freqFilter) {
      filtered = filtered.filter(
        (task) =>
          (task.frequency || "").toLowerCase() === freqFilter.toLowerCase(),
      );
    }

    if (startDate || endDate) {
      filtered = filtered.filter((task) => {
        const tDate =
          task.task_start_date || task.planned_date || task.created_at;
        if (!tDate) return false;
        const d = new Date(tDate);
        if (isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);

        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (d < s) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          if (d > e) return false;
        }
        return true;
      });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return filtered.map((task) => {
      const taskDate = task.task_start_date
        ? new Date(task.task_start_date)
        : null;
      let timeStatus = "Not Submitted";

      if (taskDate) {
        const taskDay = new Date(taskDate);
        taskDay.setHours(0, 0, 0, 0);

        if (taskDay < now) {
          timeStatus = "Overdue";
        } else if (taskDay.getTime() === now.getTime()) {
          timeStatus = "Today";
        } else {
          timeStatus = "Upcoming";
        }
      }

      return { ...task, timeStatus };
    });
  }, [
    delegationTasks,
    searchTerm,
    freqFilter,
    departmentFilter,
    givenByFilter,
    doerFilter,
    startDate,
    endDate,
  ]);

  return (
    <>
      {/* Main Content */}
      {isInitialized && (
        <div className="mt-4 rounded-lg border border-blue-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-pink-50 border-b border-blue-100 p-4 flex justify-between items-center">
            <div>
              <h2 className="text-blue-700 font-medium">
                {departmentFilter
                  ? `${departmentFilter} Tasks`
                  : "Delegation Tasks"}
              </h2>
              <p className="text-blue-600 text-sm">
                Manage your{" "}
                {departmentFilter
                  ? departmentFilter.toLowerCase()
                  : "delegation"}{" "}
                tasks ({filteredTasks.length})
              </p>
            </div>

            {selectedTasks.length > 0 && !isControlled && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
              >
                <Trash2 size={16} />
                {isDeleting
                  ? "Deleting..."
                  : `Delete (${selectedTasks.length})`}
              </button>
            )}
          </div>

          <TableScrollSync
            className="w-full"
            scrollClassName="overflow-x-auto overflow-y-auto md:overflow-y-scroll max-h-[calc(100vh-320px)] min-h-[350px] custom-scrollbar"
          >
            {/* Desktop View */}
            <table className="hidden md:table min-w-[1600px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedTasks.length === filteredTasks.length &&
                        filteredTasks.length > 0
                      }
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Time Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Task ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">
                    {departmentFilter ? "Work Description" : "Task Description"}
                  </th>
                  {!departmentFilter && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Department
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Given By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {departmentFilter ? "Doer Name" : "Name"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50 whitespace-nowrap">
                    Start Date
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Freq
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-blue-50">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Reminders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Attachment
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((task, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${selectedTasks.find((t) => t.id === task.id) ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-2 sm:px-3 py-2 sm:py-4 w-16">
                        <div className="text-xs sm:text-sm font-medium text-gray-900 text-center">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={
                            !!selectedTasks.find((t) => t.id === task.id)
                          }
                          onChange={() => handleCheckboxChange(task)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            task.timeStatus === "Overdue"
                              ? "bg-red-100 text-red-700"
                              : task.timeStatus === "Today"
                                ? "bg-amber-100 text-amber-700"
                                : task.timeStatus === "Upcoming"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {task.timeStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleEditClick(task)}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          <Edit size={14} />
                          Edit
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.id || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 min-w-[300px] max-w-[400px]">
                        <RenderDescription
                          text={task.task_description}
                          audioUrl={task.audio_url}
                          instructionUrl={task.instruction_attachment_url}
                          instructionType={task.instruction_attachment_type}
                        />
                      </td>
                      {!departmentFilter && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {task.department || "—"}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.given_by || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.name || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap bg-yellow-50">
                        {formatDateTime(task.task_start_date) || "—"}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            task.frequency === "Daily"
                              ? "bg-blue-100 text-blue-800"
                              : task.frequency === "Weekly"
                                ? "bg-green-100 text-green-800"
                                : task.frequency === "Monthly"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {task.frequency || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-blue-50">
                        {task.duration ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ⏱ {task.duration}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="capitalize">
                          {task.enable_reminder || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="capitalize">
                          {task.require_attachment || "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      {loading ? (
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                          <p>Loading tasks from database...</p>
                        </div>
                      ) : (
                        "No tasks found in database"
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Mobile View - Delegation Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task, index) => (
                  <div
                    key={index}
                    className={`p-5 bg-white space-y-4 ${selectedTasks.find((t) => t.id === task.id) ? "bg-blue-50/50" : ""}`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-300">
                          {(index + 1).toString().padStart(2, "0")}
                        </span>
                        <input
                          type="checkbox"
                          checked={
                            !!selectedTasks.find((t) => t.id === task.id)
                          }
                          onChange={() => handleCheckboxChange(task)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">
                            #{task.id || "N/A"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${
                              task.frequency === "Daily"
                                ? "bg-blue-100 text-blue-800"
                                : task.frequency === "Weekly"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {task.frequency || "Manual"}
                          </span>
                        </div>

                        <div className="mb-4 flex flex-col min-w-[200px] max-w-full">
                          <RenderDescription
                            text={task.task_description}
                            audioUrl={task.audio_url}
                            instructionUrl={task.instruction_attachment_url}
                            instructionType={task.instruction_attachment_type}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-4">
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              Dept
                            </span>
                            <div className="text-[11px] font-bold text-gray-700 truncate">
                              {task.department || "—"}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              From
                            </span>
                            <div className="text-[11px] font-bold text-gray-700 truncate">
                              {task.given_by || "—"}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              Assignee
                            </span>
                            <div className="text-[11px] font-bold text-gray-700 truncate">
                              {task.name || "—"}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              Start
                            </span>
                            <div className="text-[11px] font-bold text-gray-700">
                              {formatDateTime(task.task_start_date)}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                              Time Status
                            </span>
                            <div
                              className={`text-[10px] font-bold w-fit px-2 py-0.5 rounded-full ${
                                task.timeStatus === "Overdue"
                                  ? "bg-red-100 text-red-700"
                                  : task.timeStatus === "Today"
                                    ? "bg-amber-100 text-amber-700"
                                    : task.timeStatus === "Upcoming"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {task.timeStatus}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleEditClick(task)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-xl active:scale-95 transition-all"
                      >
                        <Edit size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-gray-400 font-bold text-sm">
                  No delegation tasks archived
                </div>
              )}
            </div>
          </TableScrollSync>
        </div>
      )}
    </>
  );
}

export default DelegationPage;
