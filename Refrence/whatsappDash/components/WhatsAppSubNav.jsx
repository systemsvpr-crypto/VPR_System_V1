import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Calendar } from "lucide-react";

export default function WhatsAppSubNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isInbox = location.pathname === "/dashboard/whatsapp/inbox";
  const isScheduler = location.pathname === "/dashboard/whatsapp/scheduler";

  return (
    <div className="flex items-center justify-between bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/dashboard/whatsapp/inbox")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            isInbox
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
          }`}
        >
          <MessageSquare size={15} />
          <span>Chat Inbox</span>
        </button>

        <button
          onClick={() => navigate("/dashboard/whatsapp/scheduler")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            isScheduler
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
          }`}
        >
          <Calendar size={15} />
          <span>Broadcast Scheduler</span>
        </button>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:block">
        WhatsApp System Module
      </div>
    </div>
  );
}
