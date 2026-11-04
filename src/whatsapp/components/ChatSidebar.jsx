import { useState } from "react";
import { Search, MailWarning, CheckCheck, Layers, RefreshCw, Download, MessageSquarePlus, Pencil, Check, X } from "lucide-react";
import { getInitials, formatTime, lastMessagePreview } from "../utils/chatUtils";
import { updateContact } from "../services/whatsappApi";
import { useWaToast } from "../utils/toast";

// "Groups" was dropped: the WhatsApp Business Cloud API has no
// group-messaging concept, so there is no real data to filter on.
const FILTERS = [
  { key: "ALL", label: "All", icon: Layers },
  { key: "UNREAD", label: "Unread", icon: MailWarning },
  { key: "AWAITING", label: "Awaiting Reply", icon: CheckCheck },
];

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-40";

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
  onContactNameUpdated,
}) {
  const { showToast } = useWaToast();
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const startRename = (e, c) => {
    e.stopPropagation();
    setRenamingId(c.contactId);
    setRenameValue(c.customerName || "");
  };

  const cancelRename = (e) => {
    if (e) e.stopPropagation();
    setRenamingId(null);
    setRenameValue("");
  };

  const saveRename = async (e, contactId) => {
    if (e) e.stopPropagation();
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setSavingRename(true);
    try {
      await updateContact(contactId, { display_name: trimmed });
      onContactNameUpdated?.(contactId, trimmed);
      setRenamingId(null);
      setRenameValue("");
    } catch (err) {
      console.error("Failed to rename contact:", err);
      showToast("Failed to rename contact: " + err.message, "error");
    } finally {
      setSavingRename(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (activeFilter === "UNREAD" && c.unreadCount === 0) return false;
    if (activeFilter === "AWAITING" && !c.awaitingReply) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return c.customerName.toLowerCase().includes(term) || (c.phoneNumber || "").toLowerCase().includes(term);
    }
    return true;
  });

  return (
    <aside
      className={`flex h-full flex-col border-r border-slate-200 bg-white ${
        activeChatId ? "hidden md:flex md:w-[330px] lg:w-[360px] shrink-0" : "flex w-full md:w-[330px] lg:w-[360px] shrink-0"
      }`}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
              {getInitials(activeAgent.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{activeAgent.name}</p>
              <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onRefreshData}
              disabled={isRefreshingData}
              title="Refresh conversations and messages"
              className={ICON_BTN}
            >
              <RefreshCw size={14} className={isRefreshingData ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onSyncTemplates}
              disabled={isSyncingTemplates}
              title="Fetch approved templates from Meta"
              className={ICON_BTN}
            >
              <Download size={14} className={isSyncingTemplates ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onNewChat}
              title="Start a new outbound conversation"
              className="flex h-8 items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
            >
              <MessageSquarePlus size={13} />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search or start a new chat"
            className="w-full h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <Icon size={13} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No conversations match this filter.</div>
        ) : (
          filtered.map((c) => {
            const lastMsg = c.messages[c.messages.length - 1];
            const isTemplate = lastMsg?.type === "TEMPLATE";
            const isActive = c.chatId === activeChatId;
            const isRenaming = renamingId === c.contactId;
            return (
              <div
                key={c.chatId}
                role="button"
                tabIndex={0}
                onClick={() => !isRenaming && onSelectChat(c.chatId)}
                onKeyDown={(e) => {
                  if (!isRenaming && (e.key === "Enter" || e.key === " ")) onSelectChat(c.chatId);
                }}
                className={`group flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors cursor-pointer ${
                  isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-slate-50"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className={`h-10 w-10 rounded-full bg-gradient-to-tr ${c.avatarColor} flex items-center justify-center text-white text-xs font-semibold`}
                  >
                    {getInitials(c.customerName)}
                  </div>
                  {/* Status dot: unread / awaiting reply / idle */}
                  <span
                    className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-white ${
                      c.unreadCount > 0 ? "bg-primary" : c.awaitingReply ? "bg-amber-400" : "bg-slate-300"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {isRenaming ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(e, c.contactId);
                            else if (e.key === "Escape") cancelRename(e);
                          }}
                          className="h-7 flex-1 min-w-0 rounded-md border border-primary/40 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          onClick={(e) => saveRename(e, c.contactId)}
                          disabled={savingRename}
                          title="Save name"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={cancelRename}
                          title="Cancel"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <p className={`truncate text-sm text-slate-800 ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                          {c.customerName}
                        </p>
                        <button
                          onClick={(e) => startRename(e, c)}
                          title="Rename contact"
                          className="flex shrink-0 h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-primary hover:bg-primary/10"
                        >
                          <Pencil size={11} />
                        </button>
                      </div>
                    )}
                    <span
                      className={`shrink-0 text-[10px] font-medium ${c.unreadCount > 0 ? "text-primary" : "text-slate-400"}`}
                    >
                      {lastMsg ? formatTime(lastMsg.timestamp) : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-500 flex items-center gap-1">
                      {isTemplate && (
                        <span title="System template" className="text-primary shrink-0">
                          ⚡
                        </span>
                      )}
                      {lastMsg?.direction === "OUTBOUND" && <span className="text-slate-400">You:</span>}
                      <span className="truncate">{lastMsg ? lastMessagePreview(lastMsg) : "No messages yet"}</span>
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
