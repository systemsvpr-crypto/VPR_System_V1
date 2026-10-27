import { useState, useRef, useEffect } from "react";
import {
  MoreVertical,
  Reply,
  Forward,
  Star,
  CheckSquare,
  Trash2,
  Check,
  CheckCheck,
  FileText,
  FileArchive,
  Download,
  Play,
  Pause,
  Maximize2,
  SmilePlus,
  CornerUpLeft,
  ExternalLink,
  Phone,
  Copy,
  MessageCircleReply,
  MapPin,
  Navigation,
  AlertTriangle,
  X,
  Code,
} from "lucide-react";
import {
  formatTime,
  QUICK_REACTIONS,
  handleDownload,
} from "../utils/chatUtils";

const FILE_ICON = {
  PDF: FileText,
  DOCX: FileText,
  ZIP: FileArchive,
};

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusTicks({ status, message }) {
  const stUpper = String(status || message?.latest_status || message?.status || "").toUpperCase();
  const errors = message?.metadata?.errors || (message?.metadata?.error_details ? [message.metadata.error_details] : []);
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);

  if (stUpper === "FAILED" || message?.metadata?.has_error) {
    const errCode = errors[0]?.code || "Err";
    const errMessage = errors[0]?.message || errors[0]?.title || "Message Delivery Failed";

    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowErrorTooltip((v) => !v);
          }}
          className="flex items-center gap-0.5 text-rose-300 hover:text-rose-100 transition-colors cursor-pointer"
          title={`Delivery Failed: ${errMessage}`}
        >
          <AlertTriangle size={14} className="text-rose-300 animate-pulse" />
        </button>

        {showErrorTooltip && (
          <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-rose-500/40 bg-slate-900 text-rose-100 p-2.5 text-xs shadow-xl z-50 text-left space-y-1">
            <div className="flex items-center justify-between border-b border-rose-500/30 pb-1 font-bold text-rose-400 text-[11px]">
              <span>⚠️ Send Failure</span>
              {errCode && <span className="font-mono">Code: {errCode}</span>}
            </div>
            <p className="text-[11px] leading-tight text-rose-200">{errMessage}</p>
          </div>
        )}
      </div>
    );
  }

  if (stUpper === "SENT") return <Check size={14} className="text-white/70" />;
  if (stUpper === "DELIVERED") return <CheckCheck size={14} className="text-white/70" />;
  if (stUpper === "READ") return <CheckCheck size={14} className="text-sky-300" />;
  return null;
}


export default function MessageBubble({
  message,
  isOutbound,
  parentMessage,
  isMultiSelectMode,
  isSelected,
  onToggleSelect,
  onReply,
  onForward,
  onStar,
  onDelete,
  onReact,
  onJumpToMessage,
  highlighted,
  onPreviewImage,
  onPreviewVideo,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionDrawerOpen, setReactionDrawerOpen] = useState(false);
  const [openDownward, setOpenDownward] = useState(false);
  const triggerRef = useRef(null);

  const longPressTimer = useRef(null);
  const isLongPressTriggered = useRef(false);
  const touchStartCoords = useRef({ x: 0, y: 0 });

  const typeUpper = (message.message_type || message.type || "").toUpperCase();
  if (typeUpper === "SYSTEM") {
    return <SystemMessage message={message} />;
  }

  const handleMenuClick = () => {
    if (!menuOpen) {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        // Drop downward if the button is within 250px of the top viewport edge (collides with sticky header)
        if (rect.top < 250) {
          setOpenDownward(true);
        } else {
          setOpenDownward(false);
        }
      }
    }
    setMenuOpen((v) => !v);
  };

  const startPress = (e) => {
    if (isMultiSelectMode) return;
    if (e.type === "mousedown" && e.button !== 0) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartCoords.current = { x: clientX, y: clientY };
    isLongPressTriggered.current = false;

    longPressTimer.current = setTimeout(() => {
      onToggleSelect(message.id, true);
      isLongPressTriggered.current = true;
      if (window.navigator?.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const endPress = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isMultiSelectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(message.id);
    } else if (isLongPressTriggered.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const movePress = (e) => {
    if (!longPressTimer.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const diffX = Math.abs(clientX - touchStartCoords.current.x);
    const diffY = Math.abs(clientY - touchStartCoords.current.y);

    if (diffX > 10 || diffY > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const bubbleAlign = isOutbound ? "items-end" : "items-start";
  const bubbleColor = isOutbound
    ? "bg-emerald-600 text-white"
    : "bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 border border-gray-100 dark:border-slate-700";

  const handleAction = (fn) => {
    setMenuOpen(false);
    fn && fn(message);
  };

  return (
    <div
      id={`msg-${message.id}`}
      style={isSelected ? { backgroundColor: "rgba(0, 168, 132, 0.12)" } : undefined}
      className={`group flex w-full gap-2 px-2 py-1 transition-colors duration-200 ${isOutbound ? "flex-row-reverse" : "flex-row"} ${
        highlighted ? "animate-pulse" : ""
      }`}
    >
      {isMultiSelectMode && (
        <button
          onClick={() => onToggleSelect(message.id)}
          className="flex-shrink-0 self-center flex items-center justify-center h-12 w-12 cursor-pointer active:scale-90 transition-transform"
        >
          <div
            className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-emerald-600 border-emerald-600"
                : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
            }`}
          >
            {isSelected && (
              <Check size={13} className="text-white" strokeWidth={3} />
            )}
          </div>
        </button>
      )}

      <div className={`flex max-w-[80%] md:max-w-[65%] min-w-0 flex-col ${bubbleAlign}`}>
        {!isOutbound && message.senderName && (
          <span className="mb-0.5 ml-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {message.senderName}
          </span>
        )}

        <div
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          onTouchMove={movePress}
          onClick={(e) => {
            if (isMultiSelectMode) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className={`relative rounded-2xl px-3 py-2 shadow-sm ${bubbleColor} ${
            isOutbound ? "rounded-tr-md" : "rounded-tl-md"
          } ${highlighted ? "ring-2 ring-amber-400" : ""} ${isMultiSelectMode ? "cursor-pointer select-none" : ""}`}
        >
          {/* Hover contextual actions menu */}
          <div
            className={`absolute top-1 ${isOutbound ? "-left-[72px]" : "-right-[72px]"} flex md:hidden md:group-hover:flex items-center gap-1.5`}
          >
            {/* Quick Reaction button */}
            <div className="relative">
              <button
                onClick={() => setReactionDrawerOpen((v) => !v)}
                className="h-7 w-7 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow flex items-center justify-center text-gray-500 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <SmilePlus size={13} />
              </button>
              {reactionDrawerOpen && (
                <div
                  className={`absolute z-30 bottom-full mb-1.5 flex items-center gap-1 rounded-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 shadow-lg ${
                    isOutbound ? "left-0" : "right-0"
                  }`}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReact(message.id, emoji);
                        setReactionDrawerOpen(false);
                      }}
                      className="text-base hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Triple dot More Options button */}
            <div className="relative">
              <button
                ref={triggerRef}
                onClick={handleMenuClick}
                className="h-7 w-7 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow flex items-center justify-center text-gray-500 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <MoreVertical size={14} />
              </button>
              {menuOpen && (
                <div
                  className={`absolute z-20 w-40 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 ${
                    openDownward ? "top-full mt-1.5" : "bottom-full mb-1.5"
                  } ${isOutbound ? "right-0" : "left-0"}`}
                >
                  <MenuItem
                    icon={Reply}
                    label="Reply"
                    onClick={() => handleAction(onReply)}
                  />
                  <MenuItem
                    icon={Forward}
                    label="Forward"
                    onClick={() => handleAction(onForward)}
                  />
                  <MenuItem
                    icon={Star}
                    label="Star"
                    onClick={() => handleAction(onStar)}
                  />
                  <MenuItem
                    icon={CheckSquare}
                    label="Select"
                    onClick={() =>
                      handleAction(() => onToggleSelect(message.id, true))
                    }
                  />
                  <MenuItem
                    icon={Trash2}
                    label="Delete"
                    danger
                    onClick={() => handleAction(onDelete)}
                  />
                </div>
              )}
            </div>
          </div>

          {message.metadata?.referral && (
            <ReferralBanner referral={message.metadata.referral} />
          )}

          {message.isForwarded && (
            <p className="mb-1 flex items-center gap-1 text-[11px] italic opacity-75">
              <Forward size={11} /> Forwarded
            </p>
          )}

           {parentMessage && (
            <button
              onClick={() => onJumpToMessage(parentMessage.id)}
              className={`mb-1.5 flex w-full min-w-0 flex-col overflow-hidden rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs transition-colors ${
                isOutbound
                  ? "bg-black/15 hover:bg-black/25 text-white"
                  : "bg-gray-100/80 hover:bg-gray-200/80 dark:bg-slate-900/60 dark:hover:bg-slate-900/80 text-gray-800 dark:text-slate-200"
              } ${
                parentMessage.direction === "OUTBOUND"
                  ? "border-emerald-500 dark:border-emerald-400"
                  : "border-sky-500 dark:border-sky-400"
              }`}
            >
              <span
                className={`font-black text-[11px] mb-0.5 ${
                  parentMessage.direction === "OUTBOUND"
                    ? "text-emerald-500 dark:text-emerald-400"
                    : "text-sky-500 dark:text-sky-400"
                }`}
              >
                {parentMessage.direction === "OUTBOUND" ? "You" : "Customer"}
              </span>
              <span className="line-clamp-2 w-full block text-xs whitespace-pre-wrap break-words opacity-80">
                {parentMessage.body}
              </span>
            </button>
          )}

          <MessageBody message={message} onPreviewImage={onPreviewImage} onPreviewVideo={onPreviewVideo} />

          {message.type !== "POLL" &&
            message.message_type !== "poll" &&
            !message.metadata?.poll_data &&
            message.metadata?.raw?.unsupported?.type !== "poll_creation" && (
              <div
                className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                  isOutbound ? "text-white/70" : "text-gray-400 dark:text-slate-500"
                }`}
              >
                <span>{formatTime(message.timestamp)}</span>
                {message.metadata?.is_edited && (
                  <span className="text-[9px] italic opacity-75 font-semibold">(edited)</span>
                )}
                {isOutbound && <StatusTicks status={message.status} message={message} />}
              </div>
            )}

          {/* Reactions row */}
          {message.reactions && message.reactions.length > 0 && (
            <div
              className="absolute -bottom-3 right-2 flex items-center gap-1 rounded-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 shadow-sm z-10"
            >
              {message.reactions.map((r) => (
                <span key={r.emoji} className="text-[11px] leading-none">
                  {r.emoji} {r.count > 1 ? r.count : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_BUTTON_ICON = {
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  QUICK_REPLY: MessageCircleReply,
  COPY_CODE: Copy,
};

// Mirrors how Meta renders template BUTTONS — a divider-separated row
// beneath the body, matching the WhatsApp client's own template preview.
function TemplateButton({ button }) {
  const Icon = TEMPLATE_BUTTON_ICON[button.type] || ExternalLink;
  const content = (
    <span className="text-[14px] font-medium text-white/90 tracking-wide flex items-center justify-center gap-2">
      {button.text}
      <Icon size={14} stroke="currentColor" opacity="0.8" />
    </span>
  );

  const buttonClass =
    "w-full bg-black/5 hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center py-2.5 flex-1";

  if (button.type === "URL" && button.url) {
    return (
      <a
        href={button.url}
        target="_blank"
        rel="noreferrer"
        className={buttonClass}
      >
        {content}
      </a>
    );
  }
  if (button.type === "PHONE_NUMBER" && button.phone_number) {
    return (
      <a href={`tel:${button.phone_number}`} className={buttonClass}>
        {content}
      </a>
    );
  }
  return <div className={buttonClass}>{content}</div>;
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
        danger
          ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ImageMessage — WhatsApp-style blurred preview with center download pill button
// ---------------------------------------------------------------------------
function ImageMessage({ message, onPreviewImage }) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [fileSizeStr, setFileSizeStr] = useState(null);

  useEffect(() => {
    let rawSize =
      message.metadata?.raw?.image?.file_size ||
      message.metadata?.file_size ||
      message.fileSize;
    if (rawSize) {
      setFileSizeStr(formatFileSize(rawSize));
    } else if (message.mediaUrl) {
      fetch(message.mediaUrl, { method: "HEAD" })
        .then((res) => {
          const cl = res.headers.get("content-length");
          if (cl) setFileSizeStr(formatFileSize(parseInt(cl, 10)));
        })
        .catch(() => {});
    }
  }, [message]);

  const handleRevealMedia = (e) => {
    e.stopPropagation();
    setIsDownloaded(true);
  };

  return (
    <div className="space-y-1">
      <div
        onClick={() => {
          if (!isDownloaded) {
            setIsDownloaded(true);
          } else {
            onPreviewImage?.(message.mediaUrl, message.body);
          }
        }}
        className="group/img relative aspect-video w-64 max-w-full cursor-pointer overflow-hidden rounded-lg bg-slate-900/20 dark:bg-slate-900/60"
      >
        <img
          src={message.mediaUrl}
          alt="attachment"
          className={`h-full w-full object-cover transition-all duration-300 ${
            !isDownloaded
              ? "filter blur-md opacity-60 scale-105 select-none"
              : "group-hover/img:scale-105"
          }`}
        />

        {/* Center Download/Reveal Pill button (WhatsApp UI) */}
        {!isDownloaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <button
              type="button"
              onClick={handleRevealMedia}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white text-xs font-extrabold shadow-lg border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download size={14} className="text-white" />
              <span>{fileSizeStr ? `${fileSizeStr}` : "Load Media"}</span>
            </button>
          </div>
        ) : (
          /* Top-right controls visible on hover once unblurred */
          <div
            className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleDownload(message.mediaUrl, message.body || "whatsapp-image.jpg")}
              title="Download Image File"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Download size={13} />
            </button>
          </div>
        )}
      </div>
      {message.body && <p className="text-sm leading-snug">{message.body}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoMessage — WhatsApp-style blurred preview with center download pill button
// ---------------------------------------------------------------------------
function VideoMessage({ message, onPreviewVideo }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [fileSizeStr, setFileSizeStr] = useState(null);

  useEffect(() => {
    let rawSize =
      message.metadata?.raw?.video?.file_size ||
      message.metadata?.file_size ||
      message.fileSize;
    if (rawSize) {
      setFileSizeStr(formatFileSize(rawSize));
    } else if (message.mediaUrl) {
      fetch(message.mediaUrl, { method: "HEAD" })
        .then((res) => {
          const cl = res.headers.get("content-length");
          if (cl) setFileSizeStr(formatFileSize(parseInt(cl, 10)));
        })
        .catch(() => {});
    }
  }, [message]);

  const handleRevealMedia = (e) => {
    e.stopPropagation();
    setIsDownloaded(true);
  };

  const handlePlay = (e) => {
    e.stopPropagation();
    setIsDownloaded(true);
    setPlaying(true);
    videoRef.current?.play().catch(() => {});
  };

  const handleVideoClick = (e) => {
    if (!isDownloaded) {
      handleRevealMedia(e);
      return;
    }
    if (playing) return;
    handlePlay(e);
  };

  return (
    <div className="space-y-1">
      <div
        className="group/vid relative aspect-video w-64 max-w-full overflow-hidden rounded-lg bg-black cursor-pointer"
        onClick={handleVideoClick}
      >
        <video
          ref={videoRef}
          src={message.mediaUrl}
          preload="metadata"
          controls={playing && isDownloaded}
          playsInline
          className={`h-full w-full object-cover transition-all duration-300 ${
            !isDownloaded ? "filter blur-md opacity-60 scale-105 select-none" : ""
          }`}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Center Download/Reveal Pill button (WhatsApp UI) */}
        {!isDownloaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <button
              type="button"
              onClick={handleRevealMedia}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white text-xs font-extrabold shadow-lg border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download size={14} className="text-white" />
              <span>{fileSizeStr ? `${fileSizeStr}` : "Load Media"}</span>
            </button>
          </div>
        ) : (
          !playing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity">
              <div
                onClick={handlePlay}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 transition-colors"
              >
                <Play size={20} className="text-white ml-0.5" fill="white" />
              </div>
            </div>
          )
        )}

        {/* Top-right controls — fullscreen + download (visible on hover) */}
        {isDownloaded && (
          <div
            className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 group-hover/vid:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onPreviewVideo?.(message.mediaUrl, message.body || "Video")}
              title="Fullscreen"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleDownload(message.mediaUrl, message.body || "whatsapp-video.mp4")}
              title="Download Video File"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Download size={13} />
            </button>
          </div>
        )}
      </div>
      {message.body && <p className="text-sm leading-snug">{message.body}</p>}
    </div>
  );
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const onTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };

  const onLoadedMetadata = () => {
    setDuration(audioRef.current?.duration || 0);
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const toggleSpeed = () => {
    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatAudioTime = (time) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 w-72 max-w-full text-current">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onAudioEnded}
      />

      <button
        onClick={togglePlay}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-current transition-colors cursor-pointer"
      >
        {isPlaying ? (
          <Pause size={16} className="fill-current" />
        ) : (
          <Play size={16} className="fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 bg-current/20"
        />
        <div className="flex justify-between items-center mt-1 text-[10px] opacity-75">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>

      <button
        onClick={toggleSpeed}
        className="px-2 py-0.5 rounded-md text-[10px] font-black border border-current/30 hover:bg-white/15 transition-colors cursor-pointer select-none"
      >
        {playbackRate}x
      </button>
    </div>
  );
}

function LocationMessage({ message }) {
  const loc = message.metadata?.location || {};
  const { latitude, longitude, name, address } = loc;

  let googleMapsUrl = "";
  let parsedLat = latitude;
  let parsedLng = longitude;

  if (latitude != null && longitude != null) {
    googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  } else if (message.body) {
    const match = message.body.match(/https:\/\/maps\.google\.com\S+/);
    if (match) {
      googleMapsUrl = match[0];
      const qMatch = googleMapsUrl.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (qMatch) {
        parsedLat = parseFloat(qMatch[1]);
        parsedLng = parseFloat(qMatch[2]);
      }
    }
  }

  return (
    <div className="w-64 max-w-full space-y-2.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-emerald-50 dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 flex items-center justify-center">
        <MapPin className="text-emerald-600 dark:text-emerald-400 h-10 w-10 animate-bounce" />
        {parsedLat != null && parsedLng != null && (
          <span className="absolute bottom-1 right-2 text-[9px] font-mono opacity-70 bg-black/10 dark:bg-black/35 px-1.5 py-0.5 rounded text-current">
            {parsedLat?.toFixed(4)}, {parsedLng?.toFixed(4)}
          </span>
        )}
      </div>

      <div className="space-y-1 text-left text-current">
        {name && <h4 className="text-sm font-extrabold leading-tight">{name}</h4>}
        {address && <p className="text-xs leading-snug opacity-85">{address}</p>}
        {!name && !address && parsedLat != null && (
          <p className="text-xs italic opacity-75 font-mono">
            Lat: {parsedLat}, Lng: {parsedLng}
          </p>
        )}
      </div>

      {googleMapsUrl ? (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold rounded-lg border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors"
        >
          <Navigation size={13} className="rotate-45" /> Open in Google Maps ↗
        </a>
      ) : null}
    </div>
  );
}

function ContactMessage({ message }) {
  const contacts = message.metadata?.contacts || [];
  let name = "Unknown Contact";
  let phone = "";
  let org = "";

  if (contacts.length > 0) {
    const contact = contacts[0];
    name = contact.name?.formatted_name || 
      [contact.name?.first_name, contact.name?.last_name].filter(Boolean).join(" ") || 
      "Unknown Contact";
    phone = contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id || "";
    org = contact.org?.company || "";
  } else if (message.body) {
    const match = message.body.match(/Contact Card:\s*(.+?)(?:\s*\(([^)]+)\))?$/);
    if (match) {
      name = match[1] || "Contact Card";
      phone = match[2] || "";
    } else {
      name = message.body;
    }
  }

  const handleCopyNumber = (e) => {
    e.stopPropagation();
    if (phone) {
      navigator.clipboard.writeText(phone);
    }
  };

  return (
    <div className="w-64 max-w-full border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-900/40 overflow-hidden shadow-sm text-gray-800 dark:text-slate-200">
      <div className="p-3.5 flex items-center gap-3 border-b border-gray-200 dark:border-slate-700/50">
        <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h4 className="text-sm font-black truncate">{name}</h4>
          {org && <p className="text-[11px] opacity-75 truncate">{org}</p>}
          {phone && <p className="text-[11px] opacity-60 truncate font-mono">{phone}</p>}
        </div>
      </div>

      <div className="flex divide-x divide-gray-200 dark:divide-slate-700/50">
        <button
          onClick={handleCopyNumber}
          disabled={!phone}
          className="flex-1 py-2 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/5 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Copy size={13} className="text-emerald-500" /> Copy Number
        </button>
      </div>
    </div>
  );
}

function StickerMessage({ message }) {
  if (message.mediaUrl) {
    return (
      <div className="w-36 h-36 max-w-full p-1 flex items-center justify-center">
        <img
          src={message.mediaUrl}
          alt="Sticker"
          className="max-h-full max-w-full object-contain hover:scale-105 transition-transform"
        />
      </div>
    );
  }
  return <p className="text-sm font-medium italic opacity-80">[Sticker]</p>;
}

function UnsupportedMessage({ message }) {
  const [showInspector, setShowInspector] = useState(false);
  const subType = message.metadata?.raw?.unsupported?.type;
  const isPollCreation = subType === "poll_creation" || subType === "poll" || message.body?.includes("WhatsApp Poll");
  const isEvent = subType === "event" || message.body?.includes("WhatsApp Event");
  const rawPayload = message.metadata?.raw;

  if (isPollCreation) {
    return (
      <div className="w-72 max-w-full rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/90 dark:bg-violet-950/40 p-3.5 text-left space-y-1.5 shadow-xs">
        <div className="flex items-start gap-2 text-violet-900 dark:text-violet-200">
          <span className="text-base">📊</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Consumer WhatsApp Poll
            </p>
            <p className="text-xs font-bold leading-snug mt-0.5">
              Native user-created polls are not delivered by Meta Cloud API.
            </p>
            <p className="text-[11px] mt-1 text-violet-600/90 dark:text-violet-400/90 leading-normal">
              Ask customer for options in plain text, or send a business poll from your side using (+) Create Poll.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isEvent) {
    return (
      <div className="w-72 max-w-full rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/40 p-3.5 text-left space-y-1.5 shadow-xs">
        <div className="flex items-start gap-2 text-emerald-900 dark:text-emerald-200">
          <span className="text-base">📅</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Consumer WhatsApp Event
            </p>
            <p className="text-xs font-bold leading-snug mt-0.5">
              Native user-created events are not delivered by Meta Cloud API.
            </p>
            <p className="text-[11px] mt-1 text-emerald-600/90 dark:text-emerald-400/90 leading-normal">
              Ask customer for event date & details as plain text.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-64 max-w-full rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-left space-y-2">
        <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold leading-tight">
              {message.body || "⚠️ Received unsupported format"}
            </p>
            <p className="text-[11px] mt-1 text-amber-700/80 dark:text-amber-400/80 leading-normal">
              Ask customer to send details as plain text or standard photo.
            </p>
          </div>
        </div>

        {rawPayload && (
          <div className="pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40 flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowInspector(true);
              }}
              className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Code size={12} /> Inspect Payload
            </button>
          </div>
        )}
      </div>

      {showInspector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            setShowInspector(false);
          }}
        >
          <div
            className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 text-slate-100 shadow-2xl border border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Code size={14} className="text-amber-400" /> Raw Meta Webhook Payload Inspector
              </span>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 font-mono text-xs text-amber-300 bg-slate-950/90 select-text">
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(rawPayload, null, 2)}
              </pre>
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(rawPayload, null, 2));
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ButtonReplyMessage({ message }) {
  const buttonData = message.metadata?.button_reply || {};
  const title = buttonData.title || message.body || "Button Clicked";

  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 text-current border border-emerald-500/30 text-xs font-bold shadow-xs">
      <span className="text-sm">🔘</span>
      <span className="font-extrabold tracking-wide">{title}</span>
    </div>
  );
}

function ListReplyMessage({ message }) {
  const listData = message.metadata?.list_reply || {};
  const title = listData.title || message.body || "List Selection";
  const description = listData.description;

  return (
    <div className="w-64 max-w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left space-y-1 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
        <span>📋</span>
        <span className="uppercase text-[10px] tracking-wider font-black opacity-80">List Selection</span>
      </div>
      <p className="text-sm font-extrabold text-gray-900 dark:text-slate-100">{title}</p>
      {description && <p className="text-xs opacity-75 leading-snug">{description}</p>}
    </div>
  );
}

function FlowResponseMessage({ message }) {
  const flowData = message.metadata?.flow_response || {};
  const responseJson = flowData.response_json || {};

  const entries = typeof responseJson === "object" && responseJson !== null 
    ? Object.entries(responseJson) 
    : [];

  return (
    <div className="w-72 max-w-full rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/80 dark:bg-purple-950/40 p-3.5 text-left space-y-2.5 shadow-xs">
      <div className="flex items-center gap-2 border-b border-purple-200/60 dark:border-purple-800/50 pb-2">
        <div className="p-1 rounded-lg bg-purple-600 text-white">
          <FileText size={14} />
        </div>
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
            {flowData.name || "WhatsApp Flow Submission"}
          </h4>
          <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Form Response Summary</p>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-1.5 text-xs">
          {entries.map(([key, val]) => (
            <div key={key} className="flex justify-between items-start gap-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-xl border border-purple-100 dark:border-purple-900/40">
              <span className="font-bold text-gray-600 dark:text-slate-400 capitalize text-[11px] min-w-[70px]">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="font-extrabold text-gray-900 dark:text-slate-100 text-right truncate">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs font-medium text-purple-800 dark:text-purple-300 italic">
          {message.body || "Form submitted successfully"}
        </p>
      )}
    </div>
  );
}

function OrderMessage({ message }) {
  const order = message.metadata?.order || {};
  const items = order.product_items || [];
  const currency = items[0]?.currency || "INR";
  const totalSum = items.reduce((acc, item) => acc + (item.quantity * item.item_price), 0);

  return (
    <div className="w-72 max-w-full rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 p-3.5 text-left space-y-3 shadow-xs">
      <div className="flex items-center justify-between border-b border-emerald-200/60 dark:border-emerald-800/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🛒</span>
          <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
            Order Receipt
          </h4>
        </div>
        {order.catalog_id && (
          <span className="text-[9px] font-mono opacity-60">ID: {order.catalog_id}</span>
        )}
      </div>

      {order.text && (
        <p className="text-xs text-gray-700 dark:text-slate-300 font-medium italic">
          "{order.text}"
        </p>
      )}

      {items.length > 0 ? (
        <div className="space-y-1.5 divide-y divide-emerald-200/40 dark:divide-emerald-800/40">
          {items.map((item, idx) => (
            <div key={idx} className="pt-1.5 flex justify-between items-center text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-slate-100 truncate">
                  {item.product_retailer_id || `Item #${idx + 1}`}
                </p>
                <p className="text-[10px] text-gray-500 font-mono">Qty: {item.quantity}</p>
              </div>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {currency} {(item.item_price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic">No item details</p>
      )}

      <div className="pt-2 border-t border-emerald-300/60 dark:border-emerald-800 flex justify-between items-center text-xs font-black">
        <span className="uppercase text-[11px] text-emerald-900 dark:text-emerald-300">Total Sum</span>
        <span className="font-mono text-sm text-emerald-700 dark:text-emerald-400">
          {currency} {totalSum.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
  const bodyText = message.metadata?.system?.body || message.body || "System event notification";
  return (
    <div className="my-2 flex justify-center w-full">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-[11px] font-semibold border border-gray-200 dark:border-slate-700/80 shadow-2xs">
        <span>ℹ️</span>
        <span>{bodyText}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PollMessage — renders an interactive poll bubble with animated vote bars
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PollMessage — Native WhatsApp Poll Layout
// ---------------------------------------------------------------------------
function PollMessage({ message, isOutbound }) {
  const pollData = message.metadata?.poll_data || {
    question: message.body && !message.body.includes("WhatsApp Poll") ? message.body : "Poll",
    options: [
      { id: "1", text: "Option A", votes: 0 },
      { id: "2", text: "Option B", votes: 0 }
    ],
    allow_multiple: true
  };

  const question = pollData.question || message.body || "Poll";
  const options = Array.isArray(pollData.options) ? pollData.options : [];
  const allow_multiple = Boolean(pollData.allow_multiple);
  const totalVotes = options.reduce((sum, opt) => sum + (opt.votes || 0), 0);

  return (
    <div className="w-72 min-w-[240px] max-w-full text-current">
      {/* A. Poll Header Section */}
      <h3 className="font-semibold text-base mb-1 leading-snug break-words">
        {question}
      </h3>
      <div className="text-xs opacity-75 mb-3 flex items-center gap-1 font-medium">
        <CheckCheck size={14} className="opacity-80 flex-shrink-0" />
        <span>{allow_multiple ? "Select one or more" : "Select one"}</span>
      </div>

      {/* B. Poll Options List */}
      <div className="space-y-3">
        {options.map((opt, idx) => {
          const votesCount = opt.votes || 0;
          const pct = totalVotes > 0 ? (votesCount / totalVotes) * 100 : 0;

          return (
            <div key={opt.id || idx} className="space-y-1">
              <div className="flex items-center gap-3">
                {/* Left side circle indicator */}
                <div className="w-5 h-5 rounded-full border-2 border-current flex-shrink-0" />
                {/* Middle option text */}
                <span className="text-sm font-medium flex-1 break-words leading-tight">
                  {opt.text}
                </span>
                {/* Right side vote count */}
                <span className="text-sm font-medium tabular-nums opacity-90">
                  {votesCount}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full bg-black/10 dark:bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-current rounded-full transition-all duration-300 opacity-70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* C. Message Metadata & Timestamp */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] opacity-70">
        <span>{formatTime(message.timestamp)}</span>
        {message.metadata?.is_edited && (
          <span className="text-[9px] italic opacity-75 font-semibold">(edited)</span>
        )}
        {isOutbound && <StatusTicks status={message.status} message={message} />}
      </div>

      {/* D. Bottom Action Footer Button */}
      <div className="border-t border-black/10 dark:border-white/15 mt-2 pt-2 text-center">
        <button
          type="button"
          className="text-sm font-medium text-center py-1 cursor-pointer opacity-90 hover:opacity-100 w-full active:scale-98 transition-all"
        >
          View votes
        </button>
      </div>
    </div>
  );
}

function ReferralBanner({ referral }) {
  if (!referral) return null;
  const { headline, body, source_url, image_url, video_url, ad_id } = referral;

  return (
    <div className="mb-2 w-64 max-w-full rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/90 dark:bg-sky-950/50 p-2.5 text-left space-y-1.5 shadow-xs text-gray-800 dark:text-slate-200">
      <div className="flex items-center justify-between border-b border-sky-200/60 dark:border-sky-900/50 pb-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300 flex items-center gap-1">
          <span>📢</span> Click-to-WhatsApp Ad Lead
        </span>
        {ad_id && <span className="text-[9px] font-mono opacity-60">Ad ID: {ad_id}</span>}
      </div>

      {(image_url || video_url) && (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/10">
          <img src={image_url || video_url} alt="Ad media" className="h-full w-full object-cover" />
        </div>
      )}

      {headline && <h4 className="text-xs font-bold leading-tight text-sky-950 dark:text-sky-100">{headline}</h4>}
      {body && <p className="text-[11px] opacity-80 leading-snug line-clamp-2">{body}</p>}

      {source_url && (
        <a
          href={source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline pt-0.5"
        >
          View Source Ad ↗
        </a>
      )}
    </div>
  );
}

function ProductInquiryMessage({ message }) {
  const pi = message.metadata?.product_inquiry || {};
  const catalogId = pi.catalog_id;
  const sku = pi.product_retailer_id || "Product";

  return (
    <div className="w-64 max-w-full rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/80 dark:bg-teal-950/40 p-3 text-left space-y-2 shadow-xs">
      <div className="flex items-center justify-between border-b border-teal-200/60 dark:border-teal-800/50 pb-1.5">
        <span className="text-xs font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1">
          🛍️ <span className="uppercase text-[10px] font-black tracking-wider">Product Inquiry</span>
        </span>
        {catalogId && <span className="text-[9px] font-mono opacity-60">Catalog: {catalogId}</span>}
      </div>

      <div className="space-y-0.5">
        <p className="text-xs font-extrabold text-gray-900 dark:text-slate-100">SKU / Item: {sku}</p>
        {message.body && message.body !== `🛍️ Product Inquiry [SKU: ${sku}]` && (
          <p className="text-xs opacity-80 italic">"{message.body}"</p>
        )}
      </div>
    </div>
  );
}

function EventMessageCard({ message }) {
  const eventData = message.metadata?.event || {};
  const isOutbound = message.direction === "OUTBOUND";
  const name = eventData.name || message.body?.replace(/^📅 Event:\s*/, "") || "Scheduled Event";
  const description = eventData.description;
  const locationName = eventData.location_name;
  const isCanceled = Boolean(eventData.is_canceled);

  let formattedTime = "";
  if (eventData.start_time) {
    try {
      const startNum = Number(eventData.start_time);
      if (startNum && !isNaN(startNum)) {
        const dateObj = new Date(startNum * 1000);
        formattedTime = dateObj.toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      formattedTime = "";
    }
  }

  return (
    <div
      className={`w-72 max-w-full rounded-2xl border p-3.5 text-left space-y-2.5 shadow-xs transition-all ${
        isOutbound
          ? "border-emerald-700/60 bg-emerald-800/80 text-white"
          : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/50 text-gray-900 dark:text-slate-100"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600/30 text-emerald-600 dark:text-emerald-300 font-bold">
            <span>📅</span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              WhatsApp Event
            </span>
          </div>
        </div>
        {isCanceled && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-xs">
            🚫 Canceled
          </span>
        )}
      </div>

      {/* Event Title & Details */}
      <div className="space-y-1">
        <h4 className={`text-sm font-extrabold leading-snug ${isCanceled ? "line-through opacity-70" : ""}`}>
          {name}
        </h4>
        {formattedTime && (
          <div className="flex items-center gap-1.5 text-xs opacity-90 font-semibold text-emerald-700 dark:text-emerald-300 pt-0.5">
            <span>🕒</span>
            <span>{formattedTime}</span>
          </div>
        )}
        {locationName && (
          <div className="flex items-center gap-1.5 text-xs opacity-90 font-medium">
            <span>📍</span>
            <span>{locationName}</span>
          </div>
        )}
        {description && (
          <p className="text-xs opacity-80 pt-1.5 leading-relaxed border-t border-emerald-500/20 mt-1.5">
            {description}
          </p>
        )}
      </div>

      {/* Footer Action Indicator */}
      <div className="border-t border-emerald-500/20 pt-2 flex items-center justify-between text-[11px] font-semibold opacity-90">
        <span className="text-emerald-700 dark:text-emerald-300">
          {isCanceled ? "🚫 Event Canceled" : "📅 Scheduled Calendar Event"}
        </span>
      </div>
    </div>
  );
}

function MediaAlbumMessage({ message, onPreviewImage, onPreviewVideo }) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const items = message.mediaItems || [];
  const count = items.length;

  if (count === 0) return null;

  const visibleItems = items.slice(0, 4);
  const remainingCount = count > 4 ? count - 4 : 0;

  const handleRevealMedia = (e) => {
    e.stopPropagation();
    setIsDownloaded(true);
  };

  return (
    <div className="w-72 max-w-full space-y-1.5">
      <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-1">
        <div className="grid grid-cols-2 gap-1">
          {visibleItems.map((item, idx) => {
            const isFourthAndOverflow = idx === 3 && remainingCount > 0;
            const isVideo = item.type === "VIDEO" || item.message_type === "video";
            const mediaUrl = item.mediaUrl || item.media_url;

            const itemSpanClass =
              count === 3 && idx === 0
                ? "col-span-2 aspect-[2/1]"
                : count === 1
                ? "col-span-2 aspect-[4/3]"
                : "aspect-square";

            return (
              <div
                key={item.id || idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDownloaded) {
                    setIsDownloaded(true);
                    return;
                  }
                  if (isVideo) {
                    onPreviewVideo?.(mediaUrl);
                  } else {
                    onPreviewImage?.(mediaUrl, item.body || `Photo ${idx + 1}`);
                  }
                }}
                className={`relative overflow-hidden rounded-xl bg-black/10 dark:bg-slate-800 cursor-pointer group ${itemSpanClass}`}
              >
                {isVideo ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black/40">
                    <video
                      src={mediaUrl}
                      className={`w-full h-full object-cover transition-all duration-300 ${
                        !isDownloaded ? "filter blur-md opacity-60 scale-105 select-none" : ""
                      }`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                      <div className="h-9 w-9 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-md">
                        <Play size={16} className="fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={mediaUrl}
                    alt={`Album item ${idx + 1}`}
                    className={`w-full h-full object-cover transition-all duration-300 ${
                      !isDownloaded
                        ? "filter blur-md opacity-60 scale-105 select-none"
                        : "group-hover:scale-105"
                    }`}
                    loading="lazy"
                  />
                )}

                {isFourthAndOverflow && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xl font-black tracking-wider">
                    +{remainingCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Center Download/Reveal Pill Button (WhatsApp UI) */}
        {!isDownloaded && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer"
            onClick={handleRevealMedia}
          >
            <button
              type="button"
              onClick={handleRevealMedia}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white text-xs font-extrabold shadow-lg border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download size={14} className="text-white" />
              <span>Load Media ({count} items)</span>
            </button>
          </div>
        )}
      </div>

      {message.body && (
        <p className="text-xs leading-snug whitespace-pre-wrap px-1 pt-0.5">
          {message.body}
        </p>
      )}
    </div>
  );
}

function MessageBody({ message, onPreviewImage, onPreviewVideo }) {
  const typeUpper = (message.message_type || message.type || "").toUpperCase();

  if (typeUpper === "MEDIA_ALBUM") {
    return (
      <MediaAlbumMessage
        message={message}
        onPreviewImage={onPreviewImage}
        onPreviewVideo={onPreviewVideo}
      />
    );
  }

  if (typeUpper === "PRODUCT_INQUIRY" || message.metadata?.product_inquiry) {
    return <ProductInquiryMessage message={message} />;
  }

  if (typeUpper === "EVENT" || message.metadata?.event) {
    return <EventMessageCard message={message} />;
  }

  if (typeUpper === "BUTTON_REPLY" || typeUpper === "BUTTON") {
    return <ButtonReplyMessage message={message} />;
  }

  if (typeUpper === "LIST_REPLY") {
    return <ListReplyMessage message={message} />;
  }

  if (typeUpper === "FLOW_RESPONSE") {
    return <FlowResponseMessage message={message} />;
  }

  if (typeUpper === "ORDER") {
    return <OrderMessage message={message} />;
  }

  if (typeUpper === "SYSTEM") {
    return <SystemMessage message={message} />;
  }

  if (typeUpper === "IMAGE" || message.type === "IMAGE") {
    return <ImageMessage message={message} onPreviewImage={onPreviewImage} />;
  }

  if (message.type === "VIDEO") {
    return <VideoMessage message={message} onPreviewVideo={onPreviewVideo} />;
  }

  if (message.type === "AUDIO") {
    if (message.mediaUrl) {
      return (
        <div className="py-1">
          <audio controls src={message.mediaUrl} className="w-64 max-w-full rounded-lg" />
        </div>
      );
    }
    return <AudioPlayer src={message.mediaUrl} />;
  }

  if (message.type === "LOCATION") {
    return <LocationMessage message={message} />;
  }

  if (message.type === "CONTACT") {
    return <ContactMessage message={message} />;
  }

  if (message.type === "STICKER") {
    return <StickerMessage message={message} />;
  }

  if (
    message.type === "POLL" ||
    typeUpper === "POLL" ||
    message.message_type === "poll" ||
    message.metadata?.poll_data ||
    message.metadata?.raw?.unsupported?.type === "poll_creation"
  ) {
    return <PollMessage message={message} isOutbound={message.direction === "OUTBOUND"} />;
  }

  if (message.type === "UNSUPPORTED") {
    return <UnsupportedMessage message={message} />;
  }

  if (message.type === "DOCUMENT") {
    const Icon = FILE_ICON[message.fileType] || FileText;
    return (
      <div
        onClick={() => handleDownload(message.mediaUrl, message.body)}
        className="flex w-56 max-w-full cursor-pointer items-center gap-2.5 rounded-lg bg-black/5 dark:bg-white/5 p-2.5"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/90 text-white">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-bold">{message.body}</p>
          <p className="text-[10px] opacity-70">
            {message.fileType} · {message.fileSize}
          </p>
        </div>
        <span className="flex-shrink-0 rounded-full p-1.5 hover:bg-black/10 dark:hover:bg-white/10">
          <Download size={14} />
        </span>
      </div>
    );
  }

  if (message.type === "TEMPLATE") {
    const header = message.templateHeader;
    return (
      <div className="space-y-1.5 text-left">
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider opacity-75">
          <CornerUpLeft size={10} className="rotate-180" />
          Template Message
        </p>

        {header?.type === "IMAGE" && header.mediaUrl && (
          <div className="aspect-video w-64 max-w-full overflow-hidden rounded-lg">
            <img
              src={header.mediaUrl}
              alt="header"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {header?.type === "VIDEO" && header.mediaUrl && (
          <div className="relative aspect-video w-64 max-w-full overflow-hidden rounded-lg bg-black">
            <video
              src={header.mediaUrl}
              className="h-full w-full object-cover"
              controls
            />
          </div>
        )}

        {header?.type === "DOCUMENT" && header.mediaUrl && (
          <a
            href={header.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="flex w-56 max-w-full items-center gap-2.5 rounded-lg bg-black/5 dark:bg-white/5 p-2.5"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/90 text-white">
              <FileText size={18} />
            </div>
            <p className="min-w-0 flex-1 truncate text-xs font-bold text-left">
              {header.fileName || "Document"}
            </p>
            <Download size={14} className="flex-shrink-0" />
          </a>
        )}

        {header?.type === "TEXT" && header.text && (
          <p className="text-sm font-black leading-snug">{header.text}</p>
        )}

        <p className="text-sm leading-snug whitespace-pre-wrap">
          {message.body}
        </p>

        {message.templateFooter && (
          <p className="text-xs opacity-60">{message.templateFooter}</p>
        )}

        {message.templateButtons && message.templateButtons.length > 0 && (
          <div className="-mx-3 -mb-2 mt-2 border-t border-white/10 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden rounded-b-[inherit]">
            {message.templateButtons.map((btn, idx) => (
              <TemplateButton key={idx} button={btn} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (message.body && message.body.trim()) {
    return (
      <p className="text-sm leading-snug whitespace-pre-wrap">
        {message.body}
      </p>
    );
  }

  if (message.metadata?.is_placeholder || message.latest_status === "failed" || message.metadata?.has_error) {
    const errDetails = message.metadata?.error_details || message.metadata?.errors?.[0];
    const errMessage = errDetails?.message || errDetails?.title || "Message delivery failed";
    return (
      <div className="space-y-0.5 text-left">
        <p className="text-xs font-bold leading-tight flex items-center gap-1">
          <span>⚠️</span> Message Delivery Failed
        </p>
        <p className="text-[11px] opacity-80 leading-snug">
          {errMessage}
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm leading-snug whitespace-pre-wrap">
      ⚠️ Unsupported message format (or content empty)
    </p>
  );
}
