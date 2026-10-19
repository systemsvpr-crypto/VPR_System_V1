// Redux state for the admin Dashboard's headline counts (store key
// `dashBoard`). Each thunk takes the Dashboard's filter object
//   { dashboardType, staffFilter, departmentFilter, divisionFilter,
//     assignFromFilter? }
// and resolves to a plain number — the same buckets the cards show
// (see api/dashboardApi.js): total = due up to today, complete = of those
// submitted, pending = due today & open, overdue = due before today & open.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { countDashboardTasksApi } from "../api/dashboardApi";

export const totalTaskInTable = createAsyncThunk(
  "dashBoard/totalTask",
  async (filters = {}) => countDashboardTasksApi("total", filters),
);

export const completeTaskInTable = createAsyncThunk(
  "dashBoard/completeTask",
  async (filters = {}) => countDashboardTasksApi("completed", filters),
);

export const pendingTaskInTable = createAsyncThunk(
  "dashBoard/pendingTask",
  async (filters = {}) => countDashboardTasksApi("pending", filters),
);

export const overdueTaskInTable = createAsyncThunk(
  "dashBoard/overdueTask",
  async (filters = {}) => countDashboardTasksApi("overdue", filters),
);

const initialState = {
  totalTask: 0,
  completeTask: 0,
  pendingTask: 0,
  overdueTask: 0,
  loading: {
    totalTask: false,
    completeTask: false,
    pendingTask: false,
    overdueTask: false,
  },
  error: null,
};

// Wires pending/fulfilled/rejected of one count thunk to its state field.
const addCountCases = (builder, thunk, field) => {
  builder
    .addCase(thunk.pending, (state) => {
      state.loading[field] = true;
      state.error = null;
    })
    .addCase(thunk.fulfilled, (state, action) => {
      state[field] = Number(action.payload) || 0;
      state.loading[field] = false;
    })
    .addCase(thunk.rejected, (state, action) => {
      state.loading[field] = false;
      state.error = action.error?.message || "Failed to load dashboard counts";
    });
};

const dashboardSlice = createSlice({
  name: "dashBoard",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    addCountCases(builder, totalTaskInTable, "totalTask");
    addCountCases(builder, completeTaskInTable, "completeTask");
    addCountCases(builder, pendingTaskInTable, "pendingTask");
    addCountCases(builder, overdueTaskInTable, "overdueTask");
  },
});

export default dashboardSlice.reducer;
