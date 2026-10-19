// Redux state for broadcast notifications (reducer key `notifications`).
// `list` holds the feed for the current user, newest first, each item with
// an `isRead` flag — AdminLayout's unread badge counts `!isRead` items, so
// markAsRead flips the flag locally as soon as it is dispatched (hovering a
// card shouldn't wait on the network) and rolls it back if the write fails.
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchNotificationsApi,
  createNotificationApi,
  deleteNotificationApi,
  markNotificationReadApi,
} from "../api/notificationApi";

const message = (err, fallback) =>
  (typeof err === "string" ? err : err?.message) || fallback;

export const fetchNotifications = createAsyncThunk(
  "notifications/fetch",
  async (args, { rejectWithValue }) => {
    try {
      return await fetchNotificationsApi(args);
    } catch (err) {
      return rejectWithValue(message(err, "Failed to load notifications"));
    }
  },
);

export const createNotification = createAsyncThunk(
  "notifications/create",
  async (payload, { rejectWithValue }) => {
    try {
      return await createNotificationApi(payload);
    } catch (err) {
      return rejectWithValue(message(err, "Failed to create notification"));
    }
  },
);

export const removeNotification = createAsyncThunk(
  "notifications/remove",
  async (id, { rejectWithValue }) => {
    try {
      return await deleteNotificationApi(id);
    } catch (err) {
      return rejectWithValue(message(err, "Failed to delete notification"));
    }
  },
);

export const markAsRead = createAsyncThunk(
  "notifications/markAsRead",
  async (args, { rejectWithValue }) => {
    try {
      return await markNotificationReadApi(args);
    } catch (err) {
      return rejectWithValue(message(err, "Failed to mark as read"));
    }
  },
);

const sameId = (a, b) => String(a) === String(b);

const setRead = (state, id, value) => {
  const item = state.list.find((n) => sameId(n.id, id));
  if (item) item.isRead = value;
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState: {
    list: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        // Only show the spinner on the first load; background refreshes
        // (AdminLayout re-fetches for the badge) keep the current list up.
        state.loading = state.list.length === 0;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload || [];
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error?.message || null;
      })
      .addCase(createNotification.fulfilled, (state, action) => {
        if (action.payload) state.list.unshift(action.payload);
      })
      .addCase(removeNotification.fulfilled, (state, action) => {
        state.list = state.list.filter((n) => !sameId(n.id, action.payload));
      })
      .addCase(markAsRead.pending, (state, action) => {
        setRead(state, action.meta.arg?.notificationId, true);
      })
      .addCase(markAsRead.rejected, (state, action) => {
        setRead(state, action.meta.arg?.notificationId, false);
      });
  },
});

export default notificationSlice.reducer;
