import {
  Search,
  MailWarning,
  CheckCheck,
  Layers,
  RefreshCw,
  Download,
  MessageSquarePlus,
} from "lucide-react";
import {
  getInitials,
  formatTime,
  lastMessagePreview,
} from "../utils/chatUtils";

// "Groups" was dropped: the WhatsApp Business Cloud API this schema targets
// has no group-messaging concept, so there is no real data to filter on.
const FILTERS = [
  { key: "ALL", label: "All", icon: Layers },
  { key: "UNREAD", label: "Unread", icon: MailWarning },
  { key: "AWAITING", label: "Awaiting Reply", icon: CheckCheck },
];

export default function ChatSidebar({
  conversations,
  activeChatId,
  onSelectChat,
  activeFilter,
  onFilterChange,
  searchTerm,
  onSearchChange,
  activeAgent,
  onSyncTemplates,
  isSyncingTemplates,
  onRefreshData,
  isRefreshingData,
  onNewChat,
}) {
  const filtered = conversations.filter((c) => {
    if (activeFilter === "UNREAD" && c.unreadCount === 0) return false;
    if (activeFilter === "AWAITING" && !c.awaitingReply) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        c.customerName.toLowerCase().includes(term) ||
        c.phoneNumber.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <aside className={`flex h-full flex-col border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 ${
      activeChatId ? "hidden md:flex md:w-[350px] lg:w-[380px] flex-shrink-0" : "flex w-full md:w-[350px] lg:w-[380px] flex-shrink-0"
    }`}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-slate-800 px-4 py-3.5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
              {getInitials(activeAgent.name)}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                {activeAgent.name}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefreshData}
              disabled={isRefreshingData}
              title="Refresh conversations and messages"
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:text-emerald-600 hover:bg-gray-100 dark:hover:bg-slate-900 transition-colors disabled:opacity-40"
            >
              <RefreshCw
                size={14}
                className={isRefreshingData ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={onSyncTemplates}
              disabled={isSyncingTemplates}
              title="Fetch approved templates from Meta and save them to whatsapp_templates"
              className="flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors disabled:opacity-40"
            >
              <Download
                size={14}
                className={isSyncingTemplates ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={onNewChat}
              title="Start a new outbound conversation"
              className="flex h-7 items-center gap-1 px-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/30 transition-all text-[11px] font-black uppercase tracking-wider cursor-pointer"
            >
              <MessageSquarePlus size={12} />
              <span>New Chat</span>
            </button>
            {/* <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-200 dark:border-emerald-900">
              WhatsApp
            </span> */}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search or start a new chat"
            className="w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-slate-900 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={12} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-slate-500">
            No conversations match this filter.
          </div>
        ) : (
          filtered.map((c) => {
            const lastMsg = c.messages[c.messages.length - 1];
            const isTemplate = lastMsg?.type === "TEMPLATE";
            const isActive = c.chatId === activeChatId;
            return (
              <button
                key={c.chatId}
                onClick={() => onSelectChat(c.chatId)}
                className={`flex w-full items-start gap-3 border-b border-gray-100 dark:border-slate-900 px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/30"
                    : "hover:bg-gray-50 dark:hover:bg-slate-900"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className={`h-11 w-11 rounded-full bg-gradient-to-tr ${c.avatarColor} flex items-center justify-center text-white text-sm font-bold shadow-sm`}
                  >
                    {getInitials(c.customerName)}
                  </div>
                  {/* CRM status color indicator dot */}
                  <span
                    className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-white dark:border-slate-950 ${
                      c.unreadCount > 0
                        ? "bg-emerald-500" // Green for unread/New Lead
                        : c.awaitingReply
                          ? "bg-amber-400" // Yellow for awaiting reply/In Progress
                          : "bg-gray-300 dark:bg-slate-700" // Muted Grey
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                      {c.customerName}
                    </p>
                    <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                      {lastMsg ? formatTime(lastMsg.timestamp) : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      {isTemplate && (
                        <span
                          title="System template"
                          className="text-emerald-500 flex-shrink-0"
                        >
                          ⚡
                        </span>
                      )}
                      {lastMsg?.direction === "OUTBOUND" && (
                        <span className="text-gray-400">You:</span>
                      )}
                      <span className="truncate">
                        {lastMsg
                          ? lastMessagePreview(lastMsg)
                          : "No messages yet"}
                      </span>
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
