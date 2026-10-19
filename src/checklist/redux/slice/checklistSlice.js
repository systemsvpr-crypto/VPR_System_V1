// Redux state for doer-facing checklist lists (store key `checklist`).
//   checklist — pending occurrences, paged (page 1 replaces, later pages append)
//   history   — submitted occurrences, paged the same way
//
// Thunks take a bare page number (SalesDataPage: `checklistData(1)`).
// `checklistHistoryData` resolves to the page's rows array — the page checks
// `payload.length < 50` to stop infinite scroll.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchChecklistHistoryApi,
  fetchChecklistPendingApi,
  submitChecklistApi,
} from "../api/checkListApi";

const toPage = (arg) =>
  arg && typeof arg === "object" ? Number(arg.page) || 1 : Number(arg) || 1;

export const checklistData = createAsyncThunk(
  "checklist/fetchPending",
  async (arg) => fetchChecklistPendingApi({ page: toPage(arg) }),
);

export const checklistHistoryData = createAsyncThunk(
  "checklist/fetchHistory",
  async (arg) => (await fetchChecklistHistoryApi({ page: toPage(arg) })).data,
);

// [{ taskId, status, remarks, image, … }] → updated rows.
export const updateChecklist = createAsyncThunk(
  "checklist/submit",
  async (items) => submitChecklistApi(items),
);

const initialState = {
  checklist: [],
  history: [],
  loading: false,
  historyLoading: false,
  submitting: false,
  hasMore: true,
  currentPage: 1,
  historyHasMore: true,
  historyPage: 1,
  error: null,
};

const appendUnique = (list, rows) => {
  const seen = new Set(list.map((t) => t.id));
  return [...list, ...rows.filter((t) => !seen.has(t.id))];
};

const checklistSlice = createSlice({
  name: "checklist",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(checklistData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(checklistData.fulfilled, (state, action) => {
        const { data, page, hasMore } = action.payload;
        state.checklist = page <= 1 ? data : appendUnique(state.checklist, data);
        state.currentPage = page;
        state.hasMore = hasMore;
        state.loading = false;
      })
      .addCase(checklistData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      })

      .addCase(checklistHistoryData.pending, (state) => {
        state.historyLoading = true;
      })
      .addCase(checklistHistoryData.fulfilled, (state, action) => {
        const page = toPage(action.meta.arg);
        const rows = action.payload || [];
        state.history = page <= 1 ? rows : appendUnique(state.history, rows);
        state.historyPage = page;
        state.historyHasMore = rows.length >= 50;
        state.historyLoading = false;
      })
      .addCase(checklistHistoryData.rejected, (state, action) => {
        state.historyLoading = false;
        state.error = action.error?.message;
      })

      .addCase(updateChecklist.pending, (state) => {
        state.submitting = true;
      })
      .addCase(updateChecklist.fulfilled, (state, action) => {
        // Submitted rows leave the pending list (status 'extend' stays open).
        const done = new Set(
          (action.payload || [])
            .filter((r) => r.status !== "extend" && r.status !== "extended")
            .map((r) => r.id),
        );
        state.checklist = state.checklist.filter((t) => !done.has(t.id));
        state.submitting = false;
      })
      .addCase(updateChecklist.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error?.message;
      });
  },
});

export default checklistSlice.reducer;
