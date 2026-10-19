// Redux store for the checklist module only. VPR itself uses zustand; this
// store is mounted by ChecklistModule around /checklist/* routes, so its
// state never leaks into the rest of the app. Reducer keys are the names
// the pages read via useSelector(state => state.<key>).
import { configureStore } from "@reduxjs/toolkit";
import assignTask from "./slice/assignTaskSlice";
import checklist from "./slice/checklistSlice";
import delegation from "./slice/delegationSlice";
import quickTask from "./slice/quickTaskSlice";
import maintenance from "./slice/maintenanceSlice";
import repair from "./slice/repairSlice";
import setting from "./slice/settingSlice";
import notifications from "./slice/notificationSlice";
import dashBoard from "./slice/dashboardSlice";

const store = configureStore({
  reducer: {
    assignTask,
    checklist,
    delegation,
    quickTask,
    maintenance,
    repair,
    setting,
    notifications,
    dashBoard,
  },
  // Task rows carry Files/Dates in a few flows; skip the dev-only checks
  // that would otherwise warn on every such dispatch.
  middleware: (getDefault) =>
    getDefault({ serializableCheck: false, immutableCheck: false }),
});

export default store;
