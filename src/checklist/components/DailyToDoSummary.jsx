// "Today's To-Do" strip above the live task list: the viewer's own open work
// (overdue / due today / urgent+high) across checklist and delegation. Admins
// see the whole team's totals and can push the WhatsApp daily reminder.
import { useEffect, useState } from "react";
import { BellRing, ClipboardList } from "lucide-react";
import { fetchDailyToDoSummaryApi, sendDailyRemindersApi } from "../redux/api/reminderApi";
import { useMagicToast } from "../context/MagicToastContext";

const Stat = ({ value, label, className }) => (
  <span className={`inline-flex items-baseline gap-1 ${className}`}>
    <span className="text-sm font-black">{value}</span>
    <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
  </span>
);

export default function DailyToDoSummary({ username, isAdmin, canWrite, refreshKey }) {
  const { showToast } = useMagicToast();
  const [summary, setSummary] = useState(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    fetchDailyToDoSummaryApi(isAdmin ? {} : { userName: username })
      .then((rows) => {
        if (cancelled) return;
        setSummary(
          rows.reduce(
            (acc, r) => ({
              overdue: acc.overdue + r.overdue,
              today: acc.today + r.today,
              important: acc.important + r.urgent + r.high,
              users: acc.users + 1,
            }),
            { overdue: 0, today: 0, important: 0, users: 0 },
          ),
        );
      })
      .catch((err) => console.warn("Daily to-do summary failed:", err));
    return () => {
      cancelled = true;
    };
  }, [username, isAdmin, refreshKey]);

  const handleSendReminders = async () => {
    if (
      !window.confirm(
        "Send today's to-do reminder on WhatsApp now? Users already reminded today are skipped.",
      )
    )
      return;
    setIsSending(true);
    try {
      const r = await sendDailyRemindersApi();
      if (r.skippedReason) {
        showToast(`No reminders sent — today is a ${r.skippedReason}.`, "error");
        return;
      }
      const notes = [
        r.alreadySent && `${r.alreadySent} already reminded today`,
        r.noPhone && `${r.noPhone} without a phone number`,
        r.failed && `${r.failed} failed`,
      ].filter(Boolean);
      showToast(
        `Reminders sent to ${r.sent} of ${r.total} user(s)${notes.length ? ` (${notes.join(", ")})` : ""}.`,
        r.failed ? "error" : "success",
      );
    } catch (err) {
      showToast(`Failed to send reminders: ${err.message || err}`, "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-blue-100 bg-blue-50/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-black text-blue-800 uppercase tracking-wide">
          <ClipboardList className="h-3.5 w-3.5" />
          {isAdmin ? `Team To-Do (${summary.users} users)` : "Your To-Do Today"}
        </span>
        <Stat value={summary.overdue} label="Overdue" className="text-red-600" />
        <Stat value={summary.today} label="Due Today" className="text-green-700" />
        <Stat value={summary.important} label="Urgent / High" className="text-orange-600" />
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={handleSendReminders}
          disabled={!canWrite || isSending || !summary.users}
          title="Send each user their to-do summary on WhatsApp (also sent automatically every working day at 9:00 AM)"
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-extrabold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <BellRing className="h-3.5 w-3.5" />
          {isSending ? "Sending..." : "Send Daily Reminders"}
        </button>
      )}
    </div>
  );
}
