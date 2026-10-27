import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  CheckSquare,
  PanelRightOpen,
  Smile,
  Send,
  FileText,
  Image as ImageIcon,
  FileStack,
  X,
  Forward,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Plus,
  BarChart2,
} from "lucide-react";
import MessageBubble from "./MessageBubble";
import ImagePreviewLightbox from "./ImagePreviewLightbox";
import VideoPreviewLightbox from "./VideoPreviewLightbox";
import PollModal from "./PollModal";
import {
  getInitials,
  formatDayLabel,
  groupConsecutiveMediaMessages,
} from "../utils/chatUtils";

const MAX_CHARS = 1000;

export default function ChatWindow({
  conversation,
  isLoadingMessages,
  isMultiSelectMode,
  selectedMessageIds,
  onToggleMultiSelect,
  onToggleMessageSelect,
  onForwardSelected,
  onDeleteSelected,
  onSendText,
  onSendMedia,
  onOpenTemplateDrawer,
  onReactToMessage,
  onOpenProfileDrawer,
  onBackToList,
  onSendInitiationTemplate,
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null); // { url, title } | null
  const [previewVideo, setPreviewVideo] = useState(null); // { url, title } | null
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const streamRef = useRef(null);
  const textareaRef = useRef(null);
  const docInputRef = useRef(null);
  const mediaInputRef = useRef(null);

  const handleDocChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    onSendMedia(file);
    e.target.value = "";
  };

  const handleMediaChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    onSendMedia(file);
    e.target.value = "";
  };

  const processedMessages = useMemo(() => {
    if (!conversation.messages) return [];
    
    // 1. Map messages to a mutable UI shape
    const list = conversation.messages.map((m) => ({
      ...m,
      reactions: [...(m.reactions || [])],
    }));

    // 2. Separate reactions from non-reaction messages
    const reactions = list.filter((m) => m.type === "REACTION");
    const mainMessages = list.filter((m) => m.type !== "REACTION");

    // Create a lookup for main messages to quickly attach reactions
    const mainMap = {};
    mainMessages.forEach((m) => {
      mainMap[m.id] = m;
    });

    // 3. Attach reactions to their target messages
    reactions.forEach((r) => {
      const targetWamid = r.metadata?.reaction?.wamid;
      const emoji = r.metadata?.reaction?.emoji;
      if (targetWamid && emoji && mainMap[targetWamid]) {
        const targetMsg = mainMap[targetWamid];
        // If there's an existing reaction, increment its count, or add new
        const existingReact = targetMsg.reactions.find((x) => x.emoji === emoji);
        if (existingReact) {
          existingReact.count += 1;
        } else {
          targetMsg.reactions.push({ emoji, count: 1 });
        }
      }
    });

    return groupConsecutiveMediaMessages(mainMessages);
  }, [conversation.messages]);

  const messagesById = useMemo(() => {
    const map = {};
    processedMessages.forEach((m) => (map[m.id] = m));
    return map;
  }, [processedMessages]);

  useEffect(() => {
    if (!isLoadingMessages && streamRef.current) {
      const scrollToBottom = () => {
        if (streamRef.current) {
          streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
      };
      scrollToBottom();
      // Double-check scroll after browser layout completes
      const timer = setTimeout(scrollToBottom, 50);
      return () => clearTimeout(timer);
    }
    setReplyTo(null);
  }, [conversation.chatId, processedMessages.length, isLoadingMessages]);

  // Auto-grow textarea height based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [draft]);

  const jumpToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId(null), 1400);
    }
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    onSendText(draft.trim(), replyTo?.id);
    setDraft("");
    setReplyTo(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sessionActive = !!conversation?.is_session_active;

  return (
    <div className="flex h-full flex-1 flex-col bg-[#efeae2] dark:bg-slate-900">
      {/* Header */}
      {isMultiSelectMode ? (
        <div className="flex h-16 flex-shrink-0 items-center justify-between bg-emerald-700 dark:bg-slate-900 px-3 text-white border-b border-emerald-800 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleMultiSelect(false)}
              className="h-12 w-12 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-all text-white cursor-pointer"
              title="Cancel selection"
            >
              <X size={20} />
            </button>
            <span className="text-base font-semibold select-none">
              {selectedMessageIds.length} selected
            </span>
          </div>
          <div>
            <button
              onClick={() => onForwardSelected()}
              disabled={selectedMessageIds.length === 0}
              className="h-12 w-12 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-all text-white disabled:opacity-40 transition-colors cursor-pointer"
              title="Forward messages"
            >
              <Forward size={22} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* Back button for mobile view */}
            <button
              onClick={onBackToList}
              className="flex md:hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors mr-1 cursor-pointer active:scale-95"
              title="Back to chat list"
            >
              <ArrowLeft size={20} />
            </button>

            <button
              onClick={onOpenProfileDrawer}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <div
                className={`h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-tr ${conversation.avatarColor} flex items-center justify-center text-white text-sm font-bold`}
              >
                {getInitials(conversation.customerName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                  {conversation.customerName}
                </p>
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                    {conversation.phoneNumber}
                  </p>
                  {conversation.tags.map((tag) => (
                    <span
                      key={tag}
                      className="hidden sm:inline-block rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              title={`Session ${sessionActive ? "active" : "expired"} until ${new Date(conversation.metaSessionExpiresAt).toLocaleString()}`}
              className={`hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                sessionActive
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
              }`}
            >
              {sessionActive ? (
                <ShieldCheck size={12} />
              ) : (
                <ShieldAlert size={12} />
              )}
              {sessionActive ? "24h Session Active" : "Session Expired"}
            </span>
            <IconButton icon={Search} title="Search chat" />
            <IconButton
              icon={CheckSquare}
              title="Toggle multi-select"
              onClick={() => onToggleMultiSelect(true)}
            />
            <IconButton
              icon={PanelRightOpen}
              title="Open profile"
              onClick={onOpenProfileDrawer}
            />
          </div>
        </div>
      )}

      {/* Conversation stream */}
      <div ref={streamRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-8">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-gray-400">
            Loading messages…
          </div>
        ) : (
          <>
             <div className="space-y-5">
              {processedMessages.map((msg, index) => {
                const showDateLabel =
                  index === 0 ||
                  new Date(msg.timestamp).toDateString() !==
                    new Date(processedMessages[index - 1].timestamp).toDateString();

                return (
                  <div key={msg.id} className="flex flex-col gap-2.5">
                    {showDateLabel && (
                      <div className="mx-auto my-1 flex justify-center">
                        <span className="rounded-full bg-white/80 dark:bg-slate-800/80 px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400 shadow-sm border border-gray-100 dark:border-slate-700/50 select-none">
                          {formatDayLabel(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isOutbound={msg.direction === "OUTBOUND"}
                      parentMessage={
                        msg.replyToMessageId
                          ? messagesById[msg.replyToMessageId]
                          : null
                      }
                      isMultiSelectMode={isMultiSelectMode}
                      isSelected={
                        msg.type === "MEDIA_ALBUM"
                          ? msg.mediaItems?.every((m) => selectedMessageIds.includes(m.id))
                          : selectedMessageIds.includes(msg.id)
                      }
                      onToggleSelect={(id, forceOpen) => {
                        if (forceOpen && !isMultiSelectMode)
                          onToggleMultiSelect(true);
                        if (msg.type === "MEDIA_ALBUM" && msg.mediaItems) {
                          const allSelected = msg.mediaItems.every((m) =>
                            selectedMessageIds.includes(m.id)
                          );
                          msg.mediaItems.forEach((m) => {
                            if (allSelected && selectedMessageIds.includes(m.id)) {
                              onToggleMessageSelect(m.id);
                            } else if (!allSelected && !selectedMessageIds.includes(m.id)) {
                              onToggleMessageSelect(m.id);
                            }
                          });
                        } else {
                          onToggleMessageSelect(id);
                        }
                      }}
                      onReply={(m) => setReplyTo(m)}
                      onForward={() =>
                        onForwardSelected(
                          msg.type === "MEDIA_ALBUM" && msg.mediaItems
                            ? msg.mediaItems.map((m) => m.id)
                            : [msg.id]
                        )
                      }
                      onStar={() => {}}
                      onDelete={() =>
                        onDeleteSelected(
                          msg.type === "MEDIA_ALBUM" && msg.mediaItems
                            ? msg.mediaItems.map((m) => m.id)
                            : [msg.id]
                        )
                      }
                      onReact={onReactToMessage}
                      onJumpToMessage={jumpToMessage}
                      highlighted={highlightedId === msg.id}
                      onPreviewImage={(url, title) =>
                        setPreviewImage({ url, title })
                      }
                      onPreviewVideo={(url, title) =>
                        setPreviewVideo({ url, title })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {previewImage && (
        <ImagePreviewLightbox
          url={previewImage.url}
          title={previewImage.title}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {previewVideo && (
        <VideoPreviewLightbox
          url={previewVideo.url}
          title={previewVideo.title}
          onClose={() => setPreviewVideo(null)}
        />
      )}

      {pollModalOpen && (
        <PollModal
          conversationId={conversation.chatId}
          onClose={() => setPollModalOpen(false)}
          onSent={() => setPollModalOpen(false)}
        />
      )}

      {/* Input dock */}
      {!isMultiSelectMode && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-3 md:px-5">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg border-l-4 border-emerald-500 bg-gray-50 dark:bg-slate-900 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Replying to{" "}
                  {replyTo.direction === "OUTBOUND"
                    ? "yourself"
                    : conversation.customerName}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                  {replyTo.body}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="flex-shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-800"
              >
                <X size={14} />
              </button>
            </div>
          )}          <div className="flex items-center gap-3">
            {/* Attachment & Templates Menu */}
            <div className="relative">
              <button
                onClick={() => setAttachMenuOpen((v) => !v)}
                disabled={!sessionActive}
                title="Attach & CRM Templates"
                className={`flex h-12 w-12 md:h-10 md:w-10 flex-shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm ${
                  sessionActive
                    ? "bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 text-gray-500 dark:text-slate-400 cursor-pointer"
                    : "bg-gray-250 border-gray-300/30 text-gray-400 dark:bg-slate-800/40 dark:border-slate-800/60 dark:text-slate-600 cursor-not-allowed opacity-40"
                }`}
              >
                <Plus size={18} />
              </button>
              <input
                type="file"
                ref={docInputRef}
                style={{ display: "none" }}
                onChange={handleDocChange}
              />
              <input
                type="file"
                ref={mediaInputRef}
                style={{ display: "none" }}
                accept="image/*,video/*"
                onChange={handleMediaChange}
              />
              {attachMenuOpen && (
                <div className="absolute bottom-14 left-0 z-20 w-56 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 shadow-xl">
                  <AttachOption
                    icon={FileText}
                    label="Document"
                    color="text-indigo-500"
                    onClick={() => docInputRef.current?.click()}
                  />
                  <AttachOption
                    icon={ImageIcon}
                    label="Image / Video"
                    color="text-purple-500"
                    onClick={() => mediaInputRef.current?.click()}
                  />
                  <AttachOption
                    icon={FileStack}
                    label="Canned Response"
                    color="text-emerald-500"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onOpenTemplateDrawer();
                    }}
                  />
                  <AttachOption
                    icon={BarChart2}
                    label="Create Poll"
                    color="text-violet-500"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setPollModalOpen(true);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Emoji Selector */}
            <div className="relative">
              <button
                onClick={() => setEmojiOpen((v) => !v)}
                disabled={!sessionActive}
                title="Emoji"
                className={`flex h-12 w-12 md:h-10 md:w-10 flex-shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm ${
                  !sessionActive
                    ? "bg-gray-250 border-gray-300/30 text-gray-400 dark:bg-slate-800/40 dark:border-slate-800/60 dark:text-slate-600 cursor-not-allowed opacity-40"
                    : emojiOpen
                      ? "bg-emerald-50 border-emerald-300 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 cursor-pointer"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 text-gray-500 dark:text-slate-400 cursor-pointer"
                }`}
              >
                <Smile size={18} />
              </button>
              {emojiOpen && (
                <EmojiPickerPanel
                  onSelectEmoji={(emoji) => {
                    setDraft((d) => d + emoji);
                    textareaRef.current?.focus();
                  }}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </div>

            {/* Textarea Input */}
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={!sessionActive}
                placeholder={
                  sessionActive
                    ? "Type a message"
                    : "Session expired — only template messages can be sent"
                }
                className={`max-h-32 w-full resize-none rounded-2xl border border-gray-200 dark:border-slate-800 py-2.5 pl-4 pr-16 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 animate-duration-150 ${
                  sessionActive
                    ? "bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-slate-200 placeholder:text-gray-400"
                    : "bg-gray-100 dark:bg-slate-950/60 text-gray-400 dark:text-slate-500 placeholder:text-gray-450 cursor-not-allowed"
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                <span className="text-[10px] font-mono font-bold text-gray-300 dark:text-slate-505 select-none">
                  {draft.length}/{MAX_CHARS}
                </span>
              </div>
            </div>

            {sessionActive ? (
              <button
                onClick={handleSend}
                disabled={!draft.trim()}
                className="flex h-12 w-12 md:h-10 md:w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <Send size={16} />
              </button>
            ) : (
              <button
                onClick={onSendInitiationTemplate}
                className="flex h-12 md:h-10 items-center gap-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <Send size={13} />
                <span>Send Initiation Template</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ icon: Icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
    >
      <Icon size={17} />
    </button>
  );
}

function AttachOption({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
    >
      <Icon size={16} className={color} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// EMOJI PICKER PANEL COMPONENT
// ---------------------------------------------------------------------------
function EmojiPickerPanel({ onSelectEmoji, onClose }) {
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [search, setSearch] = useState("");
  const [hoveredEmoji, setHoveredEmoji] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Filter emojis based on search query
  const displayedEmojis = useMemo(() => {
    if (!search.trim()) {
      return (
        EMOJI_CATEGORIES.find((cat) => cat.key === activeCategory)?.emojis || []
      );
    }
    const query = search.toLowerCase();
    let results = [];
    EMOJI_CATEGORIES.forEach((cat) => {
      cat.emojis.forEach((emoji) => {
        const name = EMOJI_NAMES[emoji]?.toLowerCase() || "";
        if (name.includes(query)) {
          results.push(emoji);
        }
      });
    });
    return results;
  }, [activeCategory, search]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-12 left-0 z-20 w-[290px] h-[330px] flex flex-col rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-gray-100 dark:border-slate-800">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Emojis..."
          className="w-full text-xs bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-gray-800 dark:text-slate-200"
        />
      </div>

      {/* Category Tabs */}
      {!search.trim() && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              title={cat.name}
              className={`text-base p-1 rounded-lg transition-all ${
                activeCategory === cat.key
                  ? "bg-emerald-500/10 scale-110"
                  : "hover:bg-gray-100 dark:hover:bg-slate-800"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Emojis Grid */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-7 gap-1">
        {displayedEmojis.length === 0 ? (
          <div className="col-span-7 py-8 text-center text-xs text-gray-400">
            No emojis found.
          </div>
        ) : (
          displayedEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelectEmoji(emoji)}
              onMouseEnter={() => setHoveredEmoji(emoji)}
              onMouseLeave={() => setHoveredEmoji(null)}
              className="text-xl p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 active:scale-90 transition-all text-center cursor-pointer"
            >
              {emoji}
            </button>
          ))
        )}
      </div>

      {/* Bottom Preview Status Bar */}
      <div className="h-10 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 px-3 flex items-center gap-2 flex-shrink-0">
        {hoveredEmoji ? (
          <>
            <span className="text-xl">{hoveredEmoji}</span>
            <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 truncate">
              {EMOJI_NAMES[hoveredEmoji] || "Emoji"}
            </span>
          </>
        ) : (
          <>
            <span className="text-base">😊</span>
            <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500">
              What's Your Mood?
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMOJI DATABASE AND METADATA CONSTANTS
// ---------------------------------------------------------------------------
const EMOJI_CATEGORIES = [
  {
    key: "smileys",
    label: "😃",
    name: "Smileys & People",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "🙃",
      "😉",
      "😌",
      "😍",
      "🥰",
      "😘",
      "😗",
      "😙",
      "😚",
      "😋",
      "😛",
      "😝",
      "😜",
      "🤪",
      "🤨",
      "🧐",
      "🤓",
      "😎",
      "🥸",
      "🤩",
      "🥳",
      "😏",
      "😒",
      "😞",
      "😔",
      "😟",
      "😕",
      "🙁",
      "☹️",
      "😣",
      "😖",
      "😫",
      "😩",
      "🥺",
      "😢",
      "😭",
      "😤",
      "😠",
      "😡",
      "🤬",
      "🤯",
      "😳",
      "🥵",
      "🥶",
      "😱",
      "😨",
      "😰",
      "😥",
      "😓",
      "🤗",
      "🤔",
      "🫣",
      "🤭",
      "🫢",
      "🫡",
      "🤫",
      "🫠",
      "🤥",
      "😶",
      "🫥",
      "😐",
      "😑",
      "😬",
      "🙄",
      "😯",
      "😦",
      "😧",
      "😮",
      "😲",
      "🥱",
      "😴",
      "🤤",
      "😪",
      "😵",
      "😵‍💫",
      "🤐",
      "🥴",
      "🤢",
      "🤮",
      "🤧",
      "😷",
      "🤒",
      "🤕",
      "🤑",
      "🤠",
      "😈",
      "👿",
      "👹",
      "👺",
      "🤡",
      "💩",
      "👻",
      "💀",
      "☠️",
      "👽",
      "👾",
      "🤖",
      "🎃",
      "😺",
      "😸",
      "😹",
      "😻",
      "😼",
      "😽",
      "🙀",
      "😿",
      "😾",
    ],
  },
  {
    key: "animals",
    label: "🐱",
    name: "Animals & Nature",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐽",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐒",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🐣",
      "🐥",
      "🦆",
      "🦅",
      "🦉",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🐝",
      "🪱",
      "🐛",
      "🦋",
      "🐌",
      "🐞",
      "🐜",
      "🪰",
      "🪲",
      "🪳",
      "🕷️",
      "🕸️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🐙",
      "🦑",
      "🦞",
      "🦀",
      "🐡",
      "🐠",
      "🐟",
      "🐬",
      "🐳",
      "🐋",
      "🦈",
      "🐊",
      "🐅",
      "🐆",
      "🦓",
      "🦍",
      "🦧",
      "🐘",
      "🦛",
      "🦏",
      "🐪",
      "🐫",
      "🦒",
      "🦘",
      "🐃",
      "🐂",
      "🐄",
      "🐎",
      "🐖",
      "🐏",
      "🐑",
      "🐐",
      "🦌",
      "🐕",
      "🐈",
      "🐓",
      "🦃",
      "🕊️",
      "🐇",
      "🦝",
      "🦨",
      "🦡",
      "🦦",
      "🦥",
      "🐁",
      "🐀",
      "🐿️",
      "🦔",
    ],
  },
  {
    key: "food",
    label: "🍔",
    name: "Food & Drink",
    emojis: [
      "🍏",
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🍆",
      "🥑",
      "🥦",
      "🥬",
      "🥒",
      "🌶️",
      "🫑",
      "🌽",
      "🥕",
      "🫒",
      "🥔",
      "🍠",
      "🥐",
      "🍞",
      "🥖",
      "🥨",
      "🥯",
      "🥞",
      "🧇",
      "🧀",
      "🍖",
      "🍗",
      "🥩",
      "🥓",
      "🍔",
      "🍟",
      "🍕",
      "🌭",
      "🥪",
      "🌮",
      "🌯",
      "🍳",
      "🥘",
      "🍲",
      "🍿",
      "🧂",
      "🍱",
      "🍙",
      "🍘",
      "🍡",
      "🥟",
      "🍣",
      "🍤",
      "🍦",
      "🍧",
      "🍨",
      "🍩",
      "🍪",
      "🎂",
      "🍰",
      "🧁",
      "🥧",
      "🍫",
      "🍬",
      "🍭",
      "🍮",
      "🍯",
      "🥛",
      "☕",
      "🍵",
      "🍶",
      "🍾",
      "🍷",
      "🍸",
      "🍹",
      "🍺",
      "🍻",
      "🥂",
      "🥃",
      "🥤",
      "🧃",
      "🧉",
      "🧊",
    ],
  },
  {
    key: "travel",
    label: "🚗",
    name: "Travel & Places",
    emojis: [
      "🚗",
      "🚕",
      "🚙",
      "🚌",
      "🚎",
      "🏎️",
      "🚓",
      "🚑",
      "🚒",
      "🚐",
      "🛻",
      "🚚",
      "🚛",
      "🚜",
      "🛵",
      "🏍️",
      "🛺",
      "🚲",
      "🛴",
      "🛹",
      "🚥",
      "🚦",
      "🚧",
      "⛵",
      "🛶",
      "🚤",
      "🛳️",
      "⛴️",
      "🛞",
      "🚢",
      "✈️",
      "🛩️",
      "🛫",
      "🛬",
      "🪂",
      "🚁",
      "🚟",
      "🚡",
      "🚀",
      "🛸",
      "🚂",
      "🚋",
      "🚞",
      "🚝",
      "🚄",
      "🚅",
      "🚈",
      "🚇",
      "🚉",
      "🚊",
      "🚏",
      "🎪",
      "🎡",
      "🎢",
      "🏔️",
      "⛰️",
      "🌋",
      "🗻",
      "🏕️",
      "🏖️",
      "🏜️",
      "🏝️",
      "🏞️",
      "🏟️",
      "🏠",
      "🏢",
      "🏥",
      "🏦",
      "🏨",
      "🏫",
      "🏪",
      "🏰",
      "💒",
      "🗼",
      "🗽",
      "⛪",
      "🕌",
      "⛩️",
      "⛲",
      "⛺",
      "🏙️",
      "🌅",
      "🌄",
      "🌉",
      "🌃",
      "🎇",
      "🎆",
      "🌌",
      "🌍",
      "🌎",
      "🪐",
      "🌑",
      "🌕",
      "🌙",
      "💫",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "☄️",
      "💥",
      "🔥",
      "🌈",
      "☀️",
      "🌤️",
      "⛅",
      "🌥️",
      "☁️",
      "🌧️",
      "🌨️",
      "🌩️",
      "🌪️",
      "🌫️",
      "🌬️",
      "💨",
      "💧",
      "💦",
      "☔",
    ],
  },
  {
    key: "activities",
    label: "⚽",
    name: "Activities & Sports",
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🎱",
      "🪀",
      "🏓",
      "🏏",
      "⛳",
      "🪁",
      "🏹",
      "🎣",
      "🤿",
      "🥊",
      "🥋",
      "⛸️",
      "🎿",
      "🛷",
      "🎯",
      "🪩",
      "🎮",
      "🕹️",
      "🎰",
      "🎲",
      "🧩",
      "♟️",
      "🎭",
      "🎨",
      "🧵",
      "🎻",
      "🎺",
      "🎸",
      "🎹",
      "🥁",
      "🎤",
      "🎧",
      "🎬",
    ],
  },
  {
    key: "objects",
    label: "👕",
    name: "Objects & Symbols",
    emojis: [
      "👕",
      "👖",
      "🧥",
      "👔",
      "👗",
      "🩲",
      "🩳",
      "👘",
      "👠",
      "👞",
      "👟",
      "👑",
      "🎩",
      "🎓",
      "🧢",
      "🪖",
      "💄",
      "💍",
      "💼",
      "🎒",
      "🧳",
      "💼",
      "🕶️",
      "🥽",
      "🌂",
      "🧣",
      "🧤",
      "🔋",
      "🔌",
      "💻",
      "🖥️",
      "🖨️",
      "⌨️",
      "🖱️",
      "💽",
      "💾",
      "💿",
      "🎥",
      "🎞️",
      "📽️",
      "📺",
      "📷",
      "📸",
      "📹",
      "📼",
      "🔍",
      "🔎",
      "🕯️",
      "💡",
      "🏮",
      "📔",
      "📕",
      "📖",
      "📗",
      "📘",
      "📙",
      "📚",
      "📓",
      "📒",
      "📝",
      "✉️",
      "📩",
      "📨",
      "📪",
      "📫",
      "📬",
      "📭",
      "📮",
      "📥",
      "📤",
      "📦",
      "🏷️",
      "🔔",
      "🔕",
      "📢",
      "📣",
      "💬",
      "💭",
      "📎",
      "🖇️",
      "✂️",
      "📌",
      "📍",
      "🔒",
      "🔓",
      "🔑",
      "🗝️",
      "🔨",
      "🔧",
      "🔩",
      "⚙️",
      "🧱",
      "⚖️",
      "🔗",
      "🧲",
      "🛡️",
      "🔮",
      "🧪",
      "🧫",
      "🧬",
      "🌡️",
      "🩹",
      "🩺",
      "💉",
      "🩸",
      "💊",
      "💵",
      "💴",
      "💶",
      "💷",
      "🪙",
      "💸",
      "💳",
      "🧾",
      "💎",
      "🪓",
      "💣",
      "🏺",
      "🚬",
      "⚰️",
      "🪦",
    ],
  },
];

const EMOJI_NAMES = {
  // Smileys & People
  "😀": "Grinning Face",
  "😃": "Grinning Face with Big Eyes",
  "😄": "Grinning Face with Smiling Eyes",
  "😁": "Beaming Face with Smiling Eyes",
  "😆": "Grinning Squinting Face",
  "😅": "Grinning Face with Sweat",
  "😂": "Face with Tears of Joy",
  "🤣": "Rolling on the Floor Laughing",
  "😊": "Smiling Face with Smiling Eyes",
  "😇": "Smiling Face with Halo",
  "🙂": "Slightly Smiling Face",
  "🙃": "Upside-Down Face",
  "😉": "Winking Face",
  "😌": "Relieved Face",
  "😍": "Smiling Face with Heart-Eyes",
  "🥰": "Smiling Face with Hearts",
  "😘": "Face Blowing a Kiss",
  "😗": "Kissing Face",
  "😙": "Kissing Face with Smiling Eyes",
  "😚": "Kissing Face with Closed Eyes",
  "😋": "Face Savoring Food",
  "😛": "Face with Tongue",
  "😜": "Winking Face with Tongue",
  "🤪": "Zany Face",
  "😝": "Squinting Face with Tongue",
  "🤑": "Money-Mouth Face",
  "🤗": "Hugging Face",
  "🤭": "Face with Hand Over Mouth",
  "🤫": "Shushing Face",
  "🤔": "Thinking Face",
  "😐": "Neutral Face",
  "😑": "Expressionless Face",
  "😬": "Grimacing Face",
  "🤥": "Lying Face",
  "😴": "Sleeping Face",
  "🤢": "Nauseated Face",
  "🤮": "Face Vomiting",
  "🤧": "Sneezing Face",
  "🥵": "Hot Face",
  "🥶": "Cold Face",
  "🥴": "Woozy Face",
  "😵": "Dizzy Face",
  "🤯": "Exploding Head",
  "🤠": "Cowboy Hat Face",
  "🥳": "Partying Face",
  "😎": "Smiling Face with Sunglasses",
  "🤓": "Nerd Face",
  "🧐": "Face with Monocle",
  "😕": "Confused Face",
  "😟": "Worried Face",
  "🙁": "Slightly Frowning Face",
  "☹️": "Frowning Face",
  "😮": "Face with Open Mouth",
  "😯": "Hushed Face",
  "😲": "Astonished Face",
  "😳": "Flushed Face",
  "🥺": "Pleading Face",
  "😦": "Frowning Face with Open Mouth",
  "😧": "Anguished Face",
  "😨": "Fearful Face",
  "😰": "Anxious Face with Sweat",
  "😥": "Sad but Relieved Face",
  "😢": "Crying Face",
  "😭": "Loudly Crying Face",
  "😱": "Face Screaming in Fear",
  "😖": "Confounded Face",
  "😣": "Persevering Face",
  "😞": "Disappointed Face",
  "😓": "Downcast Face with Sweat",
  "😩": "Weary Face",
  "😫": "Tired Face",
  "🥱": "Yawning Face",
  "😤": "Face with Steam From Nose",
  "😡": "Pouting Face",
  "😠": "Angry Face",
  "🤬": "Face with Symbols on Mouth",
  "😈": "Smiling Face with Horns",
  "👿": "Angry Face with Horns",
  "💀": "Skull",
  "☠️": "Skull and Crossbones",
  "💩": "Pile of Poop",
  "🤡": "Clown Face",
  "👹": "Ogre",
  "👺": "Goblin",
  "👻": "Ghost",
  "👽": "Alien",
  "👾": "Alien Monster",
  "🤖": "Robot",
  "😺": "Grinning Cat",
  "😸": "Grinning Cat with Smiling Eyes",
  "😹": "Cat with Tears of Joy",
  "😻": "Smiling Cat with Heart-Eyes",
  "😼": "Cat with Wry Smile",
  "😽": "Kissing Cat",
  "🙀": "Weary Cat",
  "😿": "Crying Cat",
  "😾": "Pouting Cat",
  "👋": "Waving Hand",
  "🤚": "Raised Back of Hand",
  "🖐️": "Hand with Fingers Splayed",
  "✋": "Raised Hand",
  "🖖": "Vulcan Salute",
  "👌": "OK Hand",
  "🤌": "Pinched Fingers",
  "🤏": "Pinching Hand",
  "✌️": "Victory Hand",
  "🤞": "Crossed Fingers",
  "🤟": "Love-You Gesture",
  "🤘": "Sign of the Horns",
  "🤙": "Call Me Hand",
  "👈": "Backhand Index Pointing Left",
  "👉": "Backhand Index Pointing Right",
  "👆": "Backhand Index Pointing Up",
  "🖕": "Middle Finger",
  "👇": "Backhand Index Pointing Down",
  "☝️": "Index Pointing Up",
  "👍": "Thumbs Up",
  "👎": "Thumbs Down",
  "✊": "Raised Fist",
  "👊": "Oncoming Fist",
  "🤛": "Left-Facing Fist",
  "🤜": "Right-Facing Fist",
  "👏": "Clapping Hands",
  "🙌": "Raised Hands",
  "👐": "Open Hands",
  "🤲": "Palms Up Together",
  "🤝": "Handshake",
  "🙏": "Folded Hands",
  "✍️": "Writing Hand",
  "💅": "Nail Polish",
  "🤳": "Selfie",
  "💪": "Flexed Biceps",
  "🦾": "Mechanical Arm",
  "🦿": "Mechanical Leg",
  "🦵": "Leg",
  "🦶": "Foot",
  "👂": "Ear",
  "🦻": "Ear with Hearing Aid",
  "👃": "Nose",
  "🧠": "Brain",
  "🫀": "Anatomical Heart",
  "🫁": "Lungs",
  "🦷": "Tooth",
  "🦴": "Bone",
  "👀": "Eyes",
  "👁️": "Eye",
  "👅": "Tongue",
  "👄": "Mouth",
  "💋": "Kiss Mark",

  // Animals
  "🐶": "Dog Face",
  "🐱": "Cat Face",
  "🐭": "Mouse Face",
  "🐹": "Hamster Face",
  "🐰": "Rabbit Face",
  "🦊": "Fox Face",
  "🐻": "Bear Face",
  "🐼": "Panda Face",
  "🐨": "Koala",
  "🐯": "Tiger Face",
  "🦁": "Lion Face",
  "🐮": "Cow Face",
  "🐷": "Pig Face",
  "🐽": "Pig Nose",
  "🐸": "Frog Face",
  "🐵": "Monkey Face",
  "🐙": "Octopus",
  "🦀": "Crab",
  "🐝": "Honeybee",
  Scorpion: "Scorpion",
  "🐢": "Turtle",
  "🐍": "Snake",
  "🐬": "Dolphin",
  "🐳": "Spouting Whale",
  "🦈": "Shark",
  "🐊": "Crocodile",
  "🐘": "Elephant",

  // Food & Drink
  "🍏": "Green Apple",
  "🍎": "Red Apple",
  "🍐": "Pear",
  "🍊": "Tangerine",
  "🍋": "Lemon",
  "🍌": "Banana",
  "🍉": "Watermelon",
  "🍇": "Grapes",
  "🍓": "Strawberry",
  "🥑": "Avocado",
  "🍔": "Hamburger",
  "🍟": "French Fries",
  "🍕": "Pizza",
  "🌭": "Hot Dog",
  "🥪": "Sandwich",
  " taco": "Taco",
  " burrito": "Burrito",
  "🍳": "Cooking",
  "🍲": "Pot of Food",
  "🍿": "Popcorn",
  "🍩": "Donut",
  "🍪": "Cookie",
  "🎂": "Birthday Cake",
  "🍫": "Chocolate Bar",
  "🍯": "Honey Pot",
  "🥛": "Glass of Milk",
  "☕": "Hot Beverage",
  "🍵": "Teacup Without Handle",
  "🍷": "Wine Glass",
  "🍺": "Beer Mug",
  "🍻": "Clinking Beer Mugs",
  "🥤": "Cup with Straw",

  // Travel
  "🚗": "Automobile",
  "🚕": "Taxi",
  "🚙": "Sport Utility Vehicle",
  "🚌": "Bus",
  "🏎️": "Racing Car",
  "🚓": "Police Car",
  "🚑": "Ambulance",
  "🚒": "Fire Engine",
  "🚜": "Tractor",
  "🛵": "Motor Scooter",
  "🚲": "Bicycle",
  "⛵": "Sailboat",
  "✈️": "Airplane",
  "🚀": "Rocket",
  "🛸": "Flying Saucer",
  "🏠": "House",
  "🏢": "Office Building",
  "🏥": "Hospital",
  "🏦": "Bank",
  "🏫": "School",
  "🏰": "Castle",
  "🗼": "Tokyo Tower",
  "🗽": "Statue of Liberty",
  "⛲": "Fountain",
  "⛺": "Tent",
  "🌌": "Milky Way",
  "🔥": "Fire",
  "🌈": "Rainbow",
  "☀️": "Sun",
  "🌧️": "Rain",
  "🌨️": "Snow",
  "⚡": "High Voltage",

  // Activities & Sports
  "⚽": "Soccer Ball",
  "🏀": "Basketball",
  "🏈": "American Football",
  "⚾": "Baseball",
  "🥎": "Softball",
  "🎾": "Tennis",
  "🏐": "Volleyball",
  "🎳": "Bowling",
  "🎯": "Bullseye",
  "🎮": "Video Game",
  "🎲": "Game Die",
  "♟️": "Chess Pawn",
  "🎨": "Artist Palette",
  "🎸": "Guitar",
  "🎹": "Musical Keyboard",
  "🎬": "Clapper Board",

  // Objects
  "👕": "T-Shirt",
  "👖": "Jeans",
  "🧥": "Coat",
  "👔": "Necktie",
  "👗": "Dress",
  "👠": "High-Heeled Shoe",
  "👞": "Man’s Shoe",
  "👟": "Running Shoe",
  "👑": "Crown",
  "🎒": "Backpack",
  "🕶️": "Sunglasses",
  "💻": "Laptop",
  "🖥️": "Desktop Computer",
  "📷": "Camera",
  "📸": "Camera with Flash",
  "🔍": "Magnifying Glass Tilt Left",
  "💡": "Light Bulb",
  "📝": "Memo",
  "✉️": "Envelope",
  "📦": "Package",
  "🔔": "Bell",
  "💬": "Speech Balloon",
  "📎": "Paperclip",
  "🔒": "Locked",
  "🔓": "Unlocked",
  "🔑": "Key",
  "🔨": "Hammer",
  "🔧": "Wrench",
  "⚖️": "Balance Scale",
  "💊": "Pill",
  "💵": "Dollar Bill",
  "💳": "Credit Card",
  "💎": "Gem Stone",
  "💣": "Bomb",
};
