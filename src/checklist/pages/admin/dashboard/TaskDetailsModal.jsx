import { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  User,
  UserCheck,
  Calendar,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import supabase from "../../../SupabaseClient";

export default function TaskDetailsModal({
  isOpen,
  onClose,
  category,
  tasks,
  // Dynamic fetch configuration props:
  dashboardType = "checklist",
  dashboardStaffFilter = "all",
  departmentFilter = "all",
  assignFromFilter = "all",
  dateRange = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Infinite Scroll & DB query pagination states
  const [loadedTasks, setLoadedTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const listContainerRef = useRef(null);
  // Tracks the most recent fetch so stale/out-of-order responses can be discarded
  const requestIdRef = useRef(0);

  // Debounce the search input so React doesn't fire a Supabase/PostgREST
  // query on every keystroke. Clearing the box is applied instantly (no
  // debounce) so the "Clear" action feels immediate.
  useEffect(() => {
    if (searchTerm === "") {
      setDebouncedSearchTerm("");
      return;
    }
    const handle = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // Safely embed a value inside a PostgREST `.or()` filter list.
  // Values containing commas/parentheses/quotes must be double-quoted or
  // they break the filter syntax and silently fail the whole query.
  const escapeOrFilterValue = (value) =>
    `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  // Helper date parsing function to handle both formats
  const parseTaskStartDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;

    // Handle YYYY-MM-DD format (ISO format from Supabase)
    if (dateStr.includes("-") && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parsed = new Date(dateStr);
      return isNaN(parsed) ? null : parsed;
    }

    // Handle DD/MM/YYYY format (with or without time)
    if (dateStr.includes("/")) {
      const parts = dateStr.split(" ");
      const datePart = parts[0]; // "25/08/2025"

      const dateComponents = datePart.split("/");
      if (dateComponents.length !== 3) return null;

      const [day, month, year] = dateComponents.map(Number);

      if (!day || !month || !year) return null;

      // Create date object (month is 0-indexed)
      const date = new Date(year, month - 1, day);

      // If there's time component, parse it
      if (parts.length > 1) {
        const timePart = parts[1]; // "09:00:00"
        const timeComponents = timePart.split(":");
        if (timeComponents.length >= 2) {
          const [hours, minutes, seconds] = timeComponents.map(Number);
          date.setHours(hours || 0, minutes || 0, seconds || 0);
        }
      }

      return isNaN(date) ? null : date;
    }

    // Fallback: Try ISO format
    const parsed = new Date(dateStr);
    return isNaN(parsed) ? null : parsed;
  };

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Filter tasks by clicked category (used for the header count stats)
  const categoryTasks = tasks.filter((task) => {
    if (category === "completed") return task.status === "completed";
    if (category === "pending") return task.status === "pending";
    if (category === "overdue") return task.status === "overdue";
    if (category === "total") {
      return (
        task.status === "completed" ||
        task.status === "pending" ||
        task.status === "overdue"
      );
    }
    return true;
  });

  const fetchModalTasks = async (pageNum = 1, queryTerm = "", isAppend = false) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    const requestId = ++requestIdRef.current;

    try {
      const limit = 20;
      const from = (pageNum - 1) * limit;
      const to = from + limit - 1;
      
      const role = (localStorage.getItem('role') || "").toUpperCase();
      const username = localStorage.getItem('user-name');
      const todayStr = new Date().toISOString().split('T')[0];
      
      const dateColumn = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance') ? 'planned_date' : 'task_start_date';
      const isAscending = (dashboardType === 'checklist' || dashboardType === 'delegation' || dashboardType === 'maintenance');
      
      let query = supabase
        .from(dashboardType)
        .select('*')
        .order(dateColumn, { ascending: isAscending });

      // Apply role-based filtering first
      if (role === 'USER' && username) {
        query = query.eq('name', username);
      } else if (role === 'HOD' && username) {
        const { data: reports } = await supabase
          .from("checklist_users")
          .select("user_name")
          .eq("reported_by", username);
        const reportingUsers = [username, ...(reports?.map(r => r.user_name) || [])];
        query = query.in('name', reportingUsers);
      }

      // Apply department filter if provided (for checklist and delegation)
      if (departmentFilter && departmentFilter !== 'all' && (dashboardType === 'checklist' || dashboardType === 'delegation')) {
        query = query.eq('department', departmentFilter);
      }

      // Apply assignFromFilter if provided and not "all"
      if (assignFromFilter && assignFromFilter !== 'all') {
        query = query.eq('given_by', assignFromFilter);
      }

      // Apply staff filter if provided and not "all" (for admin/HOD users)
      if (dashboardStaffFilter && dashboardStaffFilter !== 'all' && (role === 'ADMIN' || role === 'HOD')) {
        query = query.eq('name', dashboardStaffFilter);
      }

      // Apply date range filters if active
      if (dateRange && dateRange.filtered) {
        if (dateRange.startDate && dateRange.endDate) {
          query = query.gte(dateColumn, `${dateRange.startDate}T00:00:00`)
                       .lte(dateColumn, `${dateRange.endDate}T23:59:59`);
        }
      }

      // Apply search query term as a single PostgREST `.or()` call so
      // doer (name), assigned-from (given_by) and task_description are all
      // matched case-insensitively (ilike) in one round trip to Supabase.
      // Skip single-character terms — they match almost every row and just
      // waste a full table scan without narrowing results usefully.
      const trimmedQueryTerm = queryTerm.trim();
      if (trimmedQueryTerm.length >= 2) {
        const likeValue = escapeOrFilterValue(`%${trimmedQueryTerm}%`);
        const orFilter = `task_description.ilike.${likeValue},name.ilike.${likeValue},given_by.ilike.${likeValue}`;
        query = query.or(orFilter);
      }

      // Filter by category
      switch (category) {
        case "completed":
          if (dashboardType === 'delegation') {
            query = query.or("submission_date.not.is.null,status.ilike.%yes%,status.ilike.%done%,status.ilike.%completed%,admin_done.is.true");
          } else if (dashboardType === 'checklist') {
            // The `checklist` table's `status` column is backed by a
            // restrictive Postgres enum type that only accepts a small set
            // of values (e.g. "yes") and does not support the ILIKE
            // operator at all — using `.ilike()` here makes the whole
            // query fail with a 42883 DB error, silently returning zero
            // rows. Match on submission_date and an exact `status.eq.yes`
            // instead, both of which the enum supports.
            query = query.or("submission_date.not.is.null,status.eq.yes");
          } else {
            query = query.or("submission_date.not.is.null,status.ilike.%yes%,status.ilike.%done%,status.ilike.%completed%");
          }
          break;
        case "pending":
          query = query.is("submission_date", null)
                       .gte(dateColumn, `${todayStr}T00:00:00`)
                       .lte(dateColumn, `${todayStr}T23:59:59`);
          if (dashboardType === 'delegation') {
            query = query.neq('status', 'done');
          }
          break;
        case "overdue":
          query = query.is("submission_date", null)
                       .lt(dateColumn, `${todayStr}T00:00:00`);
          if (dashboardType === 'delegation') {
            query = query.neq('status', 'done');
          }
          break;
        case "total":
          query = query.lte(dateColumn, `${todayStr}T23:59:59`);
          break;
        default:
          break;
      }

      // Pagination range
      query = query.range(from, to);

      const { data: dbData, error: dbError } = await query;
      if (dbError) throw dbError;

      // Map database fields to task properties
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const mapped = (dbData || []).map((task) => {
        const taskStartDateVal = parseTaskStartDate(task.planned_date || task.task_start_date || task.created_at);
        
        const statusLower = (task.status || "").toLowerCase();
        const isCompleted =
          task.submission_date !== null ||
          statusLower === "yes" ||
          statusLower.includes("done") ||
          statusLower.includes("completed") ||
          (dashboardType === "delegation" && task.admin_done === true);

        let statusVal;
        if (isCompleted) {
          statusVal = "completed";
        } else if (taskStartDateVal && taskStartDateVal < todayStart) {
          statusVal = "overdue";
        } else if (taskStartDateVal && taskStartDateVal >= todayStart && taskStartDateVal <= todayEnd) {
          statusVal = "pending";
        } else {
          statusVal = "upcoming";
        }

        return {
          id: task.task_id || task.id,
          title: task.task_description || task.title || "",
          status: statusVal,
          assignedTo: task.name || task.assigned_person || task.doer_name || "",
          given_by: task.given_by || task.filled_by || "Admin",
          taskStartDate: task.planned_date ? formatDate(task.planned_date) : (task.task_start_date ? formatDate(task.task_start_date) : formatDate(task.created_at)),
        };
      });

      // Discard this response if a newer request has since been issued
      // (e.g. user kept typing or switched category/filters mid-flight)
      if (requestId !== requestIdRef.current) return;

      if (isAppend) {
        setLoadedTasks((prev) => [...prev, ...mapped]);
      } else {
        setLoadedTasks(mapped);
      }

      if (mapped.length < limit) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (err) {
      console.error("Error fetching modal tasks:", err);
      if (requestId !== requestIdRef.current) return;
      if (!isAppend) {
        setLoadedTasks([]);
      }
      setHasMore(false);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setIsLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    setHasMore(true);
    fetchModalTasks(1, debouncedSearchTerm, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchModalTasks isn't memoized; its actual dependencies are the ones listed here
  }, [
    isOpen,
    category,
    debouncedSearchTerm,
    dashboardType,
    dashboardStaffFilter,
    departmentFilter,
    assignFromFilter,
    dateRange
  ]);

  useEffect(() => {
    if (!isOpen || page === 1) return;
    fetchModalTasks(page, debouncedSearchTerm, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to page changes (pagination); isOpen/debouncedSearchTerm/fetchModalTasks changes are handled by the effect above, which resets page to 1
  }, [page]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 30) {
      if (hasMore && !isLoadingMore && !loading) {
        setPage((prevPage) => prevPage + 1);
      }
    }
  };

  // Get status configuration
  const getStatusBadgeConfig = (status) => {
    switch (status) {
      case "completed":
        return {
          bg: "bg-green-50 text-green-700 border-green-200",
          label: "Completed",
        };
      case "pending":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          label: "Due Today",
        };
      case "overdue":
        return {
          bg: "bg-red-50 text-red-700 border-red-200",
          label: "Overdue",
        };
      default:
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          label: status || "N/A",
        };
    }
  };

  // Get title for the modal based on category
  const getCategoryTitle = () => {
    switch (category) {
      case "completed":
        return "Done Tasks";
      case "pending":
        return "Due Today Tasks";
      case "overdue":
        return "Overdue Tasks";
      case "total":
        return "Analyzed Tasks";
      default:
        return "Tasks";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop with Blur */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-[6px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden transform transition-all border border-gray-100 z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-pink-50/30">
          <div>
            <h2 className="text-lg font-black text-blue-900 tracking-wide flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              {getCategoryTitle()}
              <span className="ml-2 text-sm font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                {categoryTasks.length}
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Click outside or press close to exit
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by description, doer, or assigner..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-gray-400 text-gray-700 shadow-sm"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tasks List container */}
        <div
          ref={listContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[250px] bg-gray-50/30"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-250/80 rounded-2xl">
              <RefreshCw className="animate-spin text-blue-600 h-10 w-10 mb-3" />
              <span className="text-sm font-bold text-gray-500">Loading tasks from database...</span>
            </div>
          ) : loadedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white border border-gray-200 rounded-2xl">
              <ClipboardList className="h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-sm font-bold text-gray-700">
                No tasks found
              </h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1">
                {searchTerm
                  ? "Try adjusting your search query."
                  : "There are no tasks matching this status."}
              </p>
            </div>
          ) : (
            <>
              {/* Table (Desktop View) */}
              <div className="hidden lg:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-450 text-[10px] font-black uppercase tracking-wider">
                        <th className="px-5 py-4">Task ID</th>
                        <th className="px-5 py-4">Title/Description</th>
                        <th className="px-5 py-4">Doer</th>
                        <th className="px-5 py-4">Assign From</th>
                        <th className="px-5 py-4">Planned Date</th>
                        <th className="px-5 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loadedTasks.map((task) => {
                        const badge = getStatusBadgeConfig(task.status);
                        return (
                          <tr
                            key={task.id}
                            className="hover:bg-gray-50/40 transition-colors"
                          >
                            <td className="px-5 py-4 font-bold text-gray-500 whitespace-nowrap">
                              #{task.id}
                            </td>
                            <td className="px-5 py-4 font-semibold text-gray-800 max-w-sm">
                              <span className="line-clamp-2 leading-relaxed" title={task.title}>
                                {task.title}
                              </span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-gray-700">
                                <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                <span className="font-bold">{task.assignedTo || "—"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-gray-700">
                                <UserCheck className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                                <span className="font-bold">{task.given_by || "—"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-gray-600 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                <span>
                                  {task.taskStartDate}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span
                                className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cards (Mobile & Tablet View) */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                {loadedTasks.map((task) => {
                  const badge = getStatusBadgeConfig(task.status);
                  return (
                    <div
                      key={task.id}
                      className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 group hover:border-blue-200"
                    >
                      <div>
                        {/* Top Row: ID and Status badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[10px] font-black text-gray-400 tracking-wider">
                            TASK #{task.id}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Title/Description */}
                        <h4 className="text-sm font-bold text-gray-800 line-clamp-2 leading-relaxed group-hover:text-blue-900 transition-colors">
                          {task.title}
                        </h4>
                      </div>

                      {/* Metadata Row */}
                      <div className="pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-[11px] text-gray-500 font-medium">
                        {/* Doer */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                            Doer
                          </span>
                          <div className="flex items-center gap-1 text-gray-700 min-w-0">
                            <User className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="truncate">{task.assignedTo}</span>
                          </div>
                        </div>

                        {/* Assign From */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                            Assign From
                          </span>
                          <div className="flex items-center gap-1 text-gray-700 min-w-0">
                            <UserCheck className="h-3 w-3 text-pink-500 shrink-0" />
                            <span className="truncate">{task.given_by}</span>
                          </div>
                        </div>

                        {/* Planned Date */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                            Planned Date
                          </span>
                          <div className="flex items-center gap-1 text-gray-700 min-w-0">
                            <Calendar className="h-3 w-3 text-indigo-500 shrink-0" />
                            <span className="truncate">
                              {task.taskStartDate}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Loading More Indicator */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-4 bg-white/50 rounded-xl border border-dashed border-gray-200">
                  <RefreshCw className="animate-spin text-blue-600 h-5 w-5 mr-2" />
                  <span className="text-xs font-bold text-gray-500">Loading more tasks from database...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-700 hover:shadow-md transition-all active:scale-[0.98]"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
