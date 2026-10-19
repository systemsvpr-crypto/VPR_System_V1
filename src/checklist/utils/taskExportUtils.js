import * as XLSX from "xlsx";

/**
 * Parses user names if stored as a JSON string or object
 */
export const parseUsername = (val) => {
  if (!val) return "";
  if (typeof val === "object") {
    return val.given_by || val.name || val.user_name || "";
  }
  if (typeof val === "string" && val.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(val);
      return parsed.given_by || parsed.name || parsed.user_name || val;
    } catch {
      return val;
    }
  }
  return String(val);
};

/**
 * Checks if a string is an audio recording URL
 */
const isAudioUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("http") &&
    (url.includes("audio-recordings") ||
      url.includes("voice-notes") ||
      url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?.*)?$/i))
  );
};

/**
 * Cleans task description text (e.g. replacing audio URLs with a readable note)
 */
export const cleanDescription = (desc) => {
  if (!desc) return "—";
  if (isAudioUrl(desc)) {
    return `[Voice Note] ${desc}`;
  }
  return String(desc).trim();
};

/**
 * Formats a date or timestamp to DD/MM/YYYY
 */
export const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "" || dateStr === "null" || dateStr === "undefined") {
    return "—";
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateStr);
  }
};

/**
 * Formats duration into minutes string
 */
export const formatDuration = (val) => {
  if (val === null || val === undefined || val === "" || val === "—") return "—";
  const num = parseInt(val, 10);
  if (isNaN(num)) return String(val);
  return `${num} MIN`;
};

/**
 * Formats boolean-like values into Yes / No
 */
export const formatYesNo = (val) => {
  if (val === null || val === undefined || val === "") return "—";
  const str = String(val).trim().toLowerCase();
  if (str === "true" || str === "yes" || str === "1") return "Yes";
  if (str === "false" || str === "no" || str === "0") return "No";
  return String(val);
};

/**
 * Formats frequency with capitalization
 */
export const formatFrequency = (val) => {
  if (!val) return "—";
  const str = String(val).trim();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Transforms raw task row into export-ready structured object
 */
export const transformTaskForExport = (task, tab = "checklist") => {
  const normalizedTab = (tab || "checklist").toLowerCase();

  if (normalizedTab === "checklist") {
    return {
      "Task ID": task.id || task.task_id || "—",
      "Task Description": cleanDescription(task.task_description),
      "Division": task.division || "—",
      "Department": task.department || "—",
      "Assign From": parseUsername(task.given_by) || "—",
      "Doer Name": parseUsername(task.name) || "—",
      "Working Day": formatDate(task.task_start_date),
      "End Date": formatDate(task.planned_date || task.last_date),
      "Frequency": formatFrequency(task.frequency),
      "Duration": formatDuration(task.duration),
      "Reminders": formatYesNo(task.enable_reminder),
      "Attachment Required": formatYesNo(task.require_attachment),
      "Remarks": task.remarks || task.remark || "—",
    };
  }

  if (normalizedTab === "delegation") {
    return {
      "Task ID": task.id || task.task_id || "—",
      "Time Status": task.timeStatus || "—",
      "Task Description": cleanDescription(task.task_description),
      "Division": task.division || "—",
      "Department": task.department || "—",
      "Given By": parseUsername(task.given_by) || "—",
      "Doer Name": parseUsername(task.name) || "—",
      "Start Date": formatDate(task.task_start_date),
      "Frequency": formatFrequency(task.frequency),
      "Duration": formatDuration(task.duration),
      "Reminders": formatYesNo(task.enable_reminder),
      "Attachment Required": formatYesNo(task.require_attachment),
      "Remarks": task.remarks || "—",
    };
  }

  if (normalizedTab === "ea") {
    return {
      "Task ID": task.id || task.task_id || "—",
      "Task Description": cleanDescription(task.task_description),
      "Assign From": parseUsername(task.given_by) || "—",
      "Doer Name": parseUsername(task.doer_name || task.name) || "—",
      "Phone Number": task.phone_number || "—",
      "Planned Date": formatDate(task.planned_date),
      "Duration": formatDuration(task.duration),
      "Attachment Required": formatYesNo(task.require_attachment),
      "Status": task.status || "Pending",
      "Remarks": task.remarks || "—",
    };
  }

  if (normalizedTab === "maintenance") {
    return {
      "Task ID": task.id || task.task_id || "—",
      "Task Description": cleanDescription(task.task_description),
      "Machine Name": task.machine_name || "—",
      "Part Area": task.part_area || "—",
      "Part Name": task.part_name || "—",
      "Doer Name": parseUsername(task.name) || "—",
      "Start Date": formatDate(task.task_start_date),
      "Frequency": formatFrequency(task.freq || task.frequency),
      "Remarks": task.remarks || "—",
    };
  }

  // Generic fallback
  return {
    "Task ID": task.id || task.task_id || "—",
    "Task Description": cleanDescription(task.task_description),
    "Department": task.department || "—",
    "Given By": parseUsername(task.given_by) || "—",
    "Name": parseUsername(task.name) || "—",
    "Date": formatDate(task.task_start_date || task.planned_date),
    "Frequency": formatFrequency(task.frequency),
    "Remarks": task.remarks || "—",
  };
};

/**
 * Calculates optimal column widths based on cell content lengths
 */
const calculateColumnWidths = (data, headers) => {
  return headers.map((key) => {
    let maxLen = key.length;
    data.forEach((row) => {
      const val = row[key];
      if (val !== null && val !== undefined) {
        const str = String(val);
        if (str.length > maxLen) {
          maxLen = str.length;
        }
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 12), 65) };
  });
};

/**
 * Generates and triggers download of Excel file (.xlsx)
 * 
 * @param {Object} options
 * @param {Array} options.tasks - List of raw task objects
 * @param {string} options.tab - Active tab identifier ('checklist' | 'delegation' | 'ea' | 'maintenance')
 * @param {string} [options.filterSummary] - Optional summary of applied filters for filename
 * @param {string} [options.customFilename] - Optional full filename
 * @returns {number} Number of exported records
 */
export const exportTasksToExcel = ({
  tasks = [],
  tab = "checklist",
  filterSummary = "",
  customFilename = "",
}) => {
  if (!tasks || tasks.length === 0) {
    throw new Error("No tasks available to export.");
  }

  const tabLabels = {
    checklist: "Checklist Tasks",
    delegation: "Delegation Tasks",
    ea: "EA Tasks",
    maintenance: "Maintenance Tasks",
  };

  const sheetName = (tabLabels[tab.toLowerCase()] || "Tasks").slice(0, 31);
  const transformedRows = tasks.map((task) => transformTaskForExport(task, tab));
  const headers = Object.keys(transformedRows[0] || {});

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(transformedRows, { header: headers });

  // Auto-fit column widths
  worksheet["!cols"] = calculateColumnWidths(transformedRows, headers);

  // Append sheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate filename
  let filename = customFilename;
  if (!filename) {
    const today = new Date().toISOString().slice(0, 10);
    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    const cleanFilterSummary = filterSummary
      ? `_${filterSummary.replace(/[^a-zA-Z0-9_-]/g, "_")}`
      : "";
    filename = `${tabName}_Tasks${cleanFilterSummary}_${today}.xlsx`;
  }

  // Trigger file download
  XLSX.writeFile(workbook, filename);
  return transformedRows.length;
};
