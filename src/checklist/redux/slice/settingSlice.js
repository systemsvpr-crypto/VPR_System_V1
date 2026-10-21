// Redux state behind the module's Settings screens (reducer key `setting`).
// Pages read: userData (checklist_users rows), department (department rows,
// one per parent division), givenBy (assign_from rows with a `given_by` key),
// customDropdowns (flattened { id, category, value, parent, image_url }
// items), plus loading / error.
//
// Several delete buttons in Setting.jsx dispatch without re-fetching, so the
// delete reducers drop the affected rows locally. `loading` reflects only the
// list fetches, counted so one finishing early doesn't hide the spinner while
// another is still in flight. Rejections carry a plain message string — the
// pages show `typeof error === "string" ? error : error.message`.
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  uploadProfileImageApi,
  fetchDepartmentsApi,
  fetchDepartmentsOnlyApi,
  createDepartmentApi,
  updateDepartmentApi,
  deleteDepartmentApi,
  fetchGivenByApi,
  createAssignFromApi,
  updateAssignFromApi,
  deleteAssignFromApi,
  fetchCustomDropdownsApi,
  createMachineEntriesApi,
  updateCustomDropdownApi,
  deleteCustomDropdownApi,
  flattenDropdownRow,
} from "../api/settingApi";

const message = (err, fallback) =>
  (typeof err === "string" ? err : err?.message) || fallback;

// Wraps an api call so failures reject with a string payload.
const thunk = (type, fn, fallback) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try {
      return await fn(arg);
    } catch (err) {
      return rejectWithValue(message(err, fallback));
    }
  });

export const userDetails = thunk("setting/userDetails", () => fetchUsersApi(), "Failed to load users");
export const createUser = thunk("setting/createUser", createUserApi, "Failed to create user");
export const updateUser = thunk("setting/updateUser", updateUserApi, "Failed to update user");
export const deleteUser = thunk("setting/deleteUser", deleteUserApi, "Failed to delete user");
export const uploadProfileImage = thunk(
  "setting/uploadProfileImage",
  uploadProfileImageApi,
  "Image upload failed",
);

export const departmentDetails = thunk(
  "setting/departmentDetails",
  () => fetchDepartmentsApi(),
  "Failed to load departments",
);
export const departmentOnlyDetails = thunk(
  "setting/departmentOnlyDetails",
  () => fetchDepartmentsOnlyApi(),
  "Failed to load departments",
);
export const createDepartment = thunk(
  "setting/createDepartment",
  createDepartmentApi,
  "Failed to create department",
);
export const updateDepartment = thunk(
  "setting/updateDepartment",
  updateDepartmentApi,
  "Failed to update department",
);
export const deleteDepartment = thunk(
  "setting/deleteDepartment",
  deleteDepartmentApi,
  "Failed to delete department",
);

export const givenByDetails = thunk(
  "setting/givenByDetails",
  () => fetchGivenByApi(),
  "Failed to load Assign From list",
);
export const createAssignFrom = thunk(
  "setting/createAssignFrom",
  createAssignFromApi,
  "Failed to add Assign From",
);
export const updateAssignFrom = thunk(
  "setting/updateAssignFrom",
  updateAssignFromApi,
  "Failed to update Assign From",
);
export const deleteAssignFrom = thunk(
  "setting/deleteAssignFrom",
  deleteAssignFromApi,
  "Failed to delete Assign From",
);

export const customDropdownDetails = thunk(
  "setting/customDropdownDetails",
  () => fetchCustomDropdownsApi(),
  "Failed to load dropdown options",
);
export const createMachineEntries = thunk(
  "setting/createMachineEntries",
  createMachineEntriesApi,
  "Failed to save machine",
);
export const updateCustomDropdown = thunk(
  "setting/updateCustomDropdown",
  updateCustomDropdownApi,
  "Failed to update option",
);
export const deleteCustomDropdown = thunk(
  "setting/deleteCustomDropdown",
  deleteCustomDropdownApi,
  "Failed to delete option",
);

const initialState = {
  userData: [],
  department: [],
  departmentsOnly: [],
  givenBy: [],
  customDropdowns: [],
  loading: false,
  error: null,
  pendingFetches: 0,
};

const FETCH_THUNKS = [
  userDetails,
  departmentDetails,
  departmentOnlyDetails,
  givenByDetails,
  customDropdownDetails,
];

const sameId = (a, b) => String(a) === String(b);

const settingSlice = createSlice({
  name: "setting",
  initialState,
  reducers: {
    clearSettingError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // --- list fetches -------------------------------------------------------
    builder
      .addCase(userDetails.fulfilled, (state, action) => {
        state.userData = action.payload || [];
      })
      .addCase(departmentDetails.fulfilled, (state, action) => {
        state.department = action.payload || [];
      })
      .addCase(departmentOnlyDetails.fulfilled, (state, action) => {
        state.department = action.payload?.rows || [];
        state.departmentsOnly = action.payload?.names || [];
      })
      .addCase(givenByDetails.fulfilled, (state, action) => {
        state.givenBy = action.payload || [];
      })
      .addCase(customDropdownDetails.fulfilled, (state, action) => {
        state.customDropdowns = action.payload || [];
      });

    // --- users --------------------------------------------------------------
    builder
      .addCase(createUser.fulfilled, (state, action) => {
        if (action.payload) state.userData.push(action.payload);
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const row = action.payload;
        if (!row) return;
        const i = state.userData.findIndex((u) => sameId(u.id, row.id));
        if (i >= 0) state.userData[i] = row;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.userData = state.userData.filter((u) => !sameId(u.id, action.payload));
      });

    // --- departments --------------------------------------------------------
    builder
      .addCase(createDepartment.fulfilled, (state, action) => {
        state.department.push(...(action.payload || []));
      })
      .addCase(updateDepartment.fulfilled, (state, action) => {
        const row = action.payload;
        if (!row) return;
        const i = state.department.findIndex((d) => sameId(d.id, row.id));
        if (i >= 0) state.department[i] = row;
      })
      .addCase(deleteDepartment.fulfilled, (state, action) => {
        state.department = state.department.filter((d) => !sameId(d.id, action.payload));
      });

    // --- assign from --------------------------------------------------------
    builder
      .addCase(createAssignFrom.fulfilled, (state, action) => {
        const { item, created } = action.payload || {};
        if (item && created) state.givenBy.push(item);
      })
      .addCase(updateAssignFrom.fulfilled, (state, action) => {
        const row = action.payload;
        if (!row) return;
        const i = state.givenBy.findIndex((g) => sameId(g.id, row.id));
        if (i >= 0) state.givenBy[i] = row;
      })
      .addCase(deleteAssignFrom.fulfilled, (state, action) => {
        state.givenBy = state.givenBy.filter((g) => !sameId(g.id, action.payload));
      });

    // --- custom dropdowns / machines ---------------------------------------
    builder
      .addCase(createMachineEntries.fulfilled, (state, action) => {
        state.customDropdowns.push(...(action.payload || []).flatMap(flattenDropdownRow));
      })
      .addCase(updateCustomDropdown.fulfilled, (state, action) => {
        const row = action.payload;
        if (!row) return;
        state.customDropdowns = [
          ...state.customDropdowns.filter((c) => !sameId(c.id, row.id)),
          ...flattenDropdownRow(row),
        ];
      })
      .addCase(deleteCustomDropdown.fulfilled, (state, action) => {
        state.customDropdowns = state.customDropdowns.filter(
          (c) => !sameId(c.id, action.payload),
        );
      });

    // --- shared loading / error bookkeeping (matchers run after cases) -----
    FETCH_THUNKS.forEach((t) => {
      builder.addMatcher(t.pending.match, (state) => {
        state.pendingFetches += 1;
        state.loading = true;
      });
      builder.addMatcher(t.fulfilled.match, (state) => {
        state.pendingFetches = Math.max(0, state.pendingFetches - 1);
        state.loading = state.pendingFetches > 0;
        state.error = null;
      });
      builder.addMatcher(t.rejected.match, (state, action) => {
        state.pendingFetches = Math.max(0, state.pendingFetches - 1);
        state.loading = state.pendingFetches > 0;
        state.error = action.payload || action.error?.message || "Request failed";
      });
    });
  },
});

export const { clearSettingError } = settingSlice.actions;
export default settingSlice.reducer;
