// Redux state for the task-assignment forms (store key `assignTask`).
//   department — [{ department, division }] pairs for the Department selects
//   givenBy    — Assign-From names (strings)
//   doerName   — active doer records (objects with user_name, status, leave
//                dates, reported_by, can_self_assign) for the doer filters
//
// `assignTaskInTable({ tasks, table })` inserts generated occurrences; its
// payload is the inserted DB rows so callers can send WhatsApp notices.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchDoerUsersApi,
  fetchUniqueDepartmentDataApi,
  fetchUniqueGivenByDataApi,
  insertTasksApi,
} from "../api/assignTaskApi";

export const uniqueDepartmentData = createAsyncThunk(
  "assignTask/uniqueDepartment",
  async () => fetchUniqueDepartmentDataApi(),
);

export const uniqueGivenByData = createAsyncThunk(
  "assignTask/uniqueGivenBy",
  async () => fetchUniqueGivenByDataApi(),
);

// Accepts nothing (all doers), a department string, or { department, division }.
export const uniqueDoerNameData = createAsyncThunk(
  "assignTask/uniqueDoerName",
  async (filter) => fetchDoerUsersApi(filter),
);

// Errors are thrown (not rejectWithValue'd) so both `result.error.message`
// and `.unwrap()` callers see the real database message.
export const assignTaskInTable = createAsyncThunk(
  "assignTask/insert",
  async ({ tasks, table = null } = {}) => insertTasksApi({ tasks, table }),
);

const initialState = {
  department: [],
  givenBy: [],
  doerName: [],
  assignedTasks: [],
  loading: false,
  error: null,
};

const assignTaskSlice = createSlice({
  name: "assignTask",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(uniqueDepartmentData.fulfilled, (state, action) => {
        state.department = action.payload || [];
      })
      .addCase(uniqueGivenByData.fulfilled, (state, action) => {
        state.givenBy = action.payload || [];
      })
      .addCase(uniqueDoerNameData.fulfilled, (state, action) => {
        state.doerName = action.payload || [];
      })
      .addCase(uniqueDoerNameData.rejected, (state, action) => {
        state.doerName = [];
        state.error = action.error?.message;
      })

      .addCase(assignTaskInTable.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(assignTaskInTable.fulfilled, (state, action) => {
        state.loading = false;
        state.assignedTasks = action.payload || [];
      })
      .addCase(assignTaskInTable.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      });
  },
});

export default assignTaskSlice.reducer;
