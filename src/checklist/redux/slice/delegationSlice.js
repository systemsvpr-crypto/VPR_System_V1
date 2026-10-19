// Redux state for the doer-facing delegation page (store key `delegation`).
//   delegation      — open delegation tasks (pending or extended)
//   delegation_done — submission snapshots, newest first (the page's History)
//
// Plain users get only their own rows; other roles get everything and
// delegation.jsx narrows by department/division. Submission and approval
// thunks live in api/delegationApi.js (the pages import them from there).
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchDelegationDoneApi,
  fetchDelegationPendingApi,
  insertDelegationDoneAndUpdate,
} from "../api/delegationApi";

export const delegationData = createAsyncThunk(
  "delegation/fetchPending",
  async () => fetchDelegationPendingApi(),
);

export const delegation_DoneData = createAsyncThunk(
  "delegation/fetchDone",
  async () => fetchDelegationDoneApi(),
);

const initialState = {
  delegation: [],
  delegation_done: [],
  loading: false,
  doneLoading: false,
  submitting: false,
  error: null,
};

const delegationSlice = createSlice({
  name: "delegation",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(delegationData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(delegationData.fulfilled, (state, action) => {
        state.delegation = action.payload || [];
        state.loading = false;
      })
      .addCase(delegationData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      })

      .addCase(delegation_DoneData.pending, (state) => {
        state.doneLoading = true;
      })
      .addCase(delegation_DoneData.fulfilled, (state, action) => {
        state.delegation_done = action.payload || [];
        state.doneLoading = false;
      })
      .addCase(delegation_DoneData.rejected, (state, action) => {
        state.doneLoading = false;
        state.error = action.error?.message;
      })

      .addCase(insertDelegationDoneAndUpdate.pending, (state) => {
        state.submitting = true;
      })
      .addCase(insertDelegationDoneAndUpdate.fulfilled, (state) => {
        state.submitting = false;
      })
      .addCase(insertDelegationDoneAndUpdate.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.payload || action.error?.message;
      });
  },
});

export default delegationSlice.reducer;
