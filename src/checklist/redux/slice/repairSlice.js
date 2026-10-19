// Redux state for repair_tasks (store key `repair`).
//   repair  — open tickets (submission_date null), newest first
//   history — tickets submitted for / past admin approval
// Thunks throw instead of rejectWithValue so `.unwrap()` callers get an
// error object with a usable .message.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchRepairDataApi,
  fetchRepairHistoryApi,
  updateRepairData,
} from "../api/repairApi";

const pageOf = (arg) =>
  arg && typeof arg === "object" ? arg.page || 1 : Number(arg) || 1;

export const repairData = createAsyncThunk("repair/fetchData", async (arg) =>
  fetchRepairDataApi({ page: pageOf(arg) }),
);

export const repairHistoryData = createAsyncThunk(
  "repair/fetchHistory",
  async (arg) => fetchRepairHistoryApi({ page: pageOf(arg) }),
);

// [{ taskId, status, partReplaced, billAmount, remarks, vendorName?,
//    workPhotoUrl?, billCopyUrl? }] — resolves to the updated rows.
export const updateRepair = createAsyncThunk("repair/update", async (items) =>
  updateRepairData(items),
);

const initialState = {
  repair: [],
  history: [],
  loading: false,
  historyLoading: false,
  submitting: false,
  error: null,
  hasMore: true,
  currentPage: 1,
  historyHasMore: true,
  historyPage: 1,
};

const repairSlice = createSlice({
  name: "repair",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(repairData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(repairData.fulfilled, (state, action) => {
        const { data, page, hasMore } = action.payload;
        state.repair = page <= 1 ? data : [...state.repair, ...data];
        state.currentPage = page;
        state.hasMore = hasMore;
        state.loading = false;
      })
      .addCase(repairData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      })

      .addCase(repairHistoryData.pending, (state) => {
        state.historyLoading = true;
      })
      .addCase(repairHistoryData.fulfilled, (state, action) => {
        const { data, page, hasMore } = action.payload;
        state.history = page <= 1 ? data : [...state.history, ...data];
        state.historyPage = page;
        state.historyHasMore = hasMore;
        state.historyLoading = false;
      })
      .addCase(repairHistoryData.rejected, (state, action) => {
        state.historyLoading = false;
        state.error = action.error?.message;
      })

      .addCase(updateRepair.pending, (state) => {
        state.submitting = true;
      })
      .addCase(updateRepair.fulfilled, (state, action) => {
        // Patch in place; tickets that reached a final status (now carrying a
        // submission_date) move from the open list to the head of history.
        const rows = action.payload || [];
        const byId = new Map(rows.map((r) => [r.id, r]));
        const moved = [];
        state.repair = state.repair.filter((t) => {
          const r = byId.get(t.id);
          if (r && r.submission_date) {
            moved.push(r);
            return false;
          }
          return true;
        });
        state.repair = state.repair.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t));
        const movedIds = new Set(moved.map((r) => r.id));
        state.history = [
          ...moved,
          ...state.history
            .filter((t) => !movedIds.has(t.id))
            .map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)),
        ];
        state.submitting = false;
      })
      .addCase(updateRepair.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error?.message;
      });
  },
});

export default repairSlice.reducer;
