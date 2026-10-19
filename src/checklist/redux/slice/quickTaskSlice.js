// Redux state for Task Management (store key `quickTask`).
//   quickTask       — checklist series (one row per unique task)
//   delegationTasks — open delegation tasks
//   eaTasks         — not-yet-approved EA tasks
//   users           — checklist_users records
//
// The three lists are paged with 0-based pages: a call with `append: true`
// adds the next page, anything else replaces the list. After each fetch
// `<list>Page` holds the NEXT page to request and `<list>HasMore` whether
// there is one — QuickTask's infinite scroll passes them straight back.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  deleteChecklistTasksApi,
  deleteDelegationTasksApi,
  deleteEATasksApi,
  fetchChecklistData,
  fetchDelegationData,
  fetchEAData,
  fetchUsersApi,
  updateChecklistTaskApi,
  updateDelegationTaskApi,
  updateEATaskApi,
} from "../api/quickTaskApi";

const listArgs = (arg = {}) => ({
  page: Number(arg.page) || 0,
  pageSize: Number(arg.pageSize) || 50,
  search: arg.nameFilter || "",
  dateFilter: arg.dateFilter || "all",
  department: arg.departmentFilter || "",
  givenBy: arg.givenByFilter || "",
  doer: arg.doerFilter || "",
  frequency: arg.freqFilter || "",
  append: !!arg.append,
});

export const uniqueChecklistTaskData = createAsyncThunk(
  "quickTask/checklist",
  async (arg) => {
    const a = listArgs(arg);
    const res = await fetchChecklistData(
      a.page, a.pageSize, a.search, a.dateFilter, a.department, a.givenBy, a.doer, a.frequency,
    );
    return { ...res, append: a.append };
  },
);

export const uniqueDelegationTaskData = createAsyncThunk(
  "quickTask/delegation",
  async (arg) => {
    const a = listArgs(arg);
    const res = await fetchDelegationData(
      a.page, a.pageSize, a.search, a.dateFilter, a.department, a.givenBy, a.doer, a.frequency,
    );
    return { ...res, append: a.append };
  },
);

export const uniqueEATaskData = createAsyncThunk("quickTask/ea", async (arg) => {
  const a = listArgs(arg);
  const res = await fetchEAData(a.page, a.pageSize, a.search, a.dateFilter, a.givenBy, a.doer);
  return { ...res, append: a.append };
});

// { updatedTask, originalTask } — errors are thrown so `.unwrap()` callers
// get an object with .message.
export const updateChecklistTask = createAsyncThunk(
  "quickTask/updateChecklist",
  async (arg) => updateChecklistTaskApi(arg),
);

export const updateDelegationTask = createAsyncThunk(
  "quickTask/updateDelegation",
  async (arg) => updateDelegationTaskApi(arg),
);

export const updateEATask = createAsyncThunk(
  "quickTask/updateEA",
  async (arg) => updateEATaskApi(arg),
);

// Deletes take the selected rows (or ids) and resolve to the removed ids.
export const deleteChecklistTask = createAsyncThunk(
  "quickTask/deleteChecklist",
  async (tasks) => deleteChecklistTasksApi(tasks),
);

export const deleteDelegationTask = createAsyncThunk(
  "quickTask/deleteDelegation",
  async (tasks) => deleteDelegationTasksApi(tasks),
);

export const deleteEATask = createAsyncThunk(
  "quickTask/deleteEA",
  async (tasks) => deleteEATasksApi(tasks),
);

export const fetchUsers = createAsyncThunk("quickTask/users", async () => fetchUsersApi());

const initialState = {
  quickTask: [],
  delegationTasks: [],
  eaTasks: [],
  users: [],
  loading: false,
  error: null,
  checklistPage: 0,
  checklistHasMore: true,
  delegationPage: 0,
  delegationHasMore: true,
  eaPage: 0,
  eaHasMore: true,
};

const merge = (list, rows, append) => {
  if (!append) return rows;
  const key = (t) => t.task_id ?? t.id;
  const seen = new Set(list.map(key));
  return [...list, ...rows.filter((t) => !seen.has(key(t)))];
};

const idSet = (ids) => new Set((ids || []).map(String));
const keyOf = (t) => String(t.task_id ?? t.id);

// Patches edited rows in place (series edits return every touched occurrence;
// the list row is one of them).
const patch = (list, rows) => {
  if (!rows?.length) return list;
  const byId = new Map(rows.map((r) => [String(r.task_id ?? r.id), r]));
  return list.map((t) => (byId.has(keyOf(t)) ? { ...t, ...byId.get(keyOf(t)) } : t));
};

// Adds pending/rejected handlers for one paged list.
const addListCases = (builder, thunk, listKey, pageKey, hasMoreKey) => {
  builder
    .addCase(thunk.pending, (state) => {
      state.loading = true;
      state.error = null;
    })
    .addCase(thunk.fulfilled, (state, action) => {
      const { data = [], page = 0, hasMore = false, append } = action.payload || {};
      state[listKey] = merge(state[listKey], data, append);
      state[pageKey] = page + 1;
      state[hasMoreKey] = hasMore;
      state.loading = false;
    })
    .addCase(thunk.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error?.message;
    });
};

const quickTaskSlice = createSlice({
  name: "quickTask",
  initialState,
  reducers: {
    resetChecklistPagination: (state) => {
      state.checklistPage = 0;
      state.checklistHasMore = true;
    },
    resetDelegationPagination: (state) => {
      state.delegationPage = 0;
      state.delegationHasMore = true;
    },
    resetEAPagination: (state) => {
      state.eaPage = 0;
      state.eaHasMore = true;
    },
  },
  extraReducers: (builder) => {
    addListCases(builder, uniqueChecklistTaskData, "quickTask", "checklistPage", "checklistHasMore");
    addListCases(builder, uniqueDelegationTaskData, "delegationTasks", "delegationPage", "delegationHasMore");
    addListCases(builder, uniqueEATaskData, "eaTasks", "eaPage", "eaHasMore");

    builder
      .addCase(updateChecklistTask.fulfilled, (state, action) => {
        state.quickTask = patch(state.quickTask, action.payload?.rows);
      })
      .addCase(updateDelegationTask.fulfilled, (state, action) => {
        state.delegationTasks = patch(state.delegationTasks, action.payload?.rows);
      })
      .addCase(updateEATask.fulfilled, (state, action) => {
        state.eaTasks = patch(state.eaTasks, action.payload);
      })

      .addCase(deleteChecklistTask.fulfilled, (state, action) => {
        const ids = idSet(action.payload);
        state.quickTask = state.quickTask.filter((t) => !ids.has(keyOf(t)));
      })
      .addCase(deleteDelegationTask.fulfilled, (state, action) => {
        const ids = idSet(action.payload);
        state.delegationTasks = state.delegationTasks.filter((t) => !ids.has(keyOf(t)));
      })
      .addCase(deleteEATask.fulfilled, (state, action) => {
        const ids = idSet(action.payload);
        state.eaTasks = state.eaTasks.filter((t) => !ids.has(keyOf(t)));
      })

      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload || [];
      });

    // Mutation failures only record the message; the pages surface them via .unwrap().
    [updateChecklistTask, updateDelegationTask, updateEATask, deleteChecklistTask,
      deleteDelegationTask, deleteEATask, fetchUsers].forEach((thunk) =>
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.error?.message;
      }),
    );
  },
});

export const {
  resetChecklistPagination,
  resetDelegationPagination,
  resetEAPagination,
} = quickTaskSlice.actions;
export default quickTaskSlice.reducer;
