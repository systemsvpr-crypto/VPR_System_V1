// Redux state for maintenance_tasks (store key `maintenance`).
//   maintenance — pending occurrences, paged (QuickTask infinite-scrolls it
//                 via hasMore/currentPage; page 1 replaces, later pages append)
//   history     — submitted occurrences (MaintenanceDataPage "History")
//
// `maintenanceData` takes either a bare page number — the doer-facing pages'
// `maintenanceData(1)`, which lists only occurrences due up to today — or
// `{ page, frequency, searchTerm }` from QuickTask's management view, which
// lists every pending occurrence. A follow-up page request that omits the
// filters reuses the ones from the previous call, so infinite scroll keeps
// the active search.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  deleteMaintenanceTasksApi,
  fetchMaintenanceDataApi,
  fetchMaintenanceHistoryApi,
  submitMaintenanceApi,
  updateMaintenanceTaskApi,
} from "../api/maintenanceApi";

export const maintenanceData = createAsyncThunk(
  "maintenance/fetchData",
  async (arg, { getState }) => {
    let params;
    if (arg && typeof arg === "object") {
      const prev = getState()?.maintenance?.filters || {};
      const hasFilters = "frequency" in arg || "searchTerm" in arg;
      params = {
        page: arg.page || 1,
        frequency: hasFilters ? arg.frequency || "" : prev.frequency || "",
        searchTerm: hasFilters ? arg.searchTerm || "" : prev.searchTerm || "",
        dueOnly: hasFilters ? false : !!prev.dueOnly,
      };
    } else {
      params = { page: Number(arg) || 1, frequency: "", searchTerm: "", dueOnly: true };
    }
    const result = await fetchMaintenanceDataApi(params);
    return { ...result, filters: params };
  },
);

export const maintenanceHistoryData = createAsyncThunk(
  "maintenance/fetchHistory",
  async (arg) => {
    const page = arg && typeof arg === "object" ? arg.page || 1 : Number(arg) || 1;
    return fetchMaintenanceHistoryApi({ page });
  },
);

// Edit a series (`{ updatedTask, originalTask }`) or a single row (flat
// `{ id, ...columns }`) — see updateMaintenanceTaskApi. Errors are thrown,
// not rejectWithValue'd, so `.unwrap()` callers get an object with .message.
export const updateMaintenanceTask = createAsyncThunk(
  "maintenance/updateTask",
  async (arg) => updateMaintenanceTaskApi(arg),
);

// Doer submission from MaintenanceDataPage:
// [{ taskId, status, remarks, image: { name, type, previewUrl } | null }]
export const updateMaintenance = createAsyncThunk(
  "maintenance/submit",
  async (items) => submitMaintenanceApi(items),
);

// QuickTask bulk delete — takes the selected rows (or ids).
export const deleteMaintenanceTask = createAsyncThunk(
  "maintenance/deleteTasks",
  async (tasks) => deleteMaintenanceTasksApi(tasks),
);

const initialState = {
  maintenance: [],
  history: [],
  loading: false,
  historyLoading: false,
  submitting: false,
  error: null,
  hasMore: true,
  currentPage: 1,
  historyHasMore: true,
  historyPage: 1,
  filters: { frequency: "", searchTerm: "", dueOnly: true },
};

const patchRows = (list, rows) => {
  if (!rows?.length) return list;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return list.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t));
};

const maintenanceSlice = createSlice({
  name: "maintenance",
  initialState,
  reducers: {
    resetMaintenancePagination: (state) => {
      state.maintenance = [];
      state.currentPage = 1;
      state.hasMore = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(maintenanceData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(maintenanceData.fulfilled, (state, action) => {
        const { data, page, hasMore, filters } = action.payload;
        if (page <= 1) {
          state.maintenance = data;
        } else {
          const seen = new Set(state.maintenance.map((t) => t.id));
          state.maintenance = [...state.maintenance, ...data.filter((t) => !seen.has(t.id))];
        }
        state.currentPage = page;
        state.hasMore = hasMore;
        state.filters = filters;
        state.loading = false;
      })
      .addCase(maintenanceData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      })

      .addCase(maintenanceHistoryData.pending, (state) => {
        state.historyLoading = true;
      })
      .addCase(maintenanceHistoryData.fulfilled, (state, action) => {
        const { data, page, hasMore } = action.payload;
        state.history = page <= 1 ? data : [...state.history, ...data];
        state.historyPage = page;
        state.historyHasMore = hasMore;
        state.historyLoading = false;
      })
      .addCase(maintenanceHistoryData.rejected, (state, action) => {
        state.historyLoading = false;
        state.error = action.error?.message;
      })

      .addCase(updateMaintenanceTask.fulfilled, (state, action) => {
        state.maintenance = patchRows(state.maintenance, action.payload);
      })
      .addCase(updateMaintenanceTask.rejected, (state, action) => {
        state.error = action.error?.message;
      })

      .addCase(updateMaintenance.pending, (state) => {
        state.submitting = true;
      })
      .addCase(updateMaintenance.fulfilled, (state, action) => {
        // Submitted rows leave the pending list; the page refetches history.
        const ids = new Set((action.payload || []).map((r) => r.id));
        state.maintenance = state.maintenance.filter((t) => !ids.has(t.id));
        state.submitting = false;
      })
      .addCase(updateMaintenance.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error?.message;
      })

      .addCase(deleteMaintenanceTask.fulfilled, (state, action) => {
        const ids = new Set(action.payload || []);
        state.maintenance = state.maintenance.filter((t) => !ids.has(t.id));
      })
      .addCase(deleteMaintenanceTask.rejected, (state, action) => {
        state.error = action.error?.message;
      });
  },
});

export const { resetMaintenancePagination } = maintenanceSlice.actions;
export default maintenanceSlice.reducer;
