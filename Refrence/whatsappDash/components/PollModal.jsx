import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, BarChart2, Send, Loader2 } from "lucide-react";
import { sendPollMessage } from "../services/whatsappApi";

/**
 * PollModal — modal form for creating and sending a WhatsApp interactive poll.
 *
 * Props:
 *   conversationId {string}  — active conversation UUID
 *   onClose        {fn}      — close without sending
 *   onSent         {fn(msg)} — called with the saved message on success
 */
export default function PollModal({ conversationId, onClose, onSent }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);
  const firstInputRef = useRef(null);

  // Focus question input on open
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const updateOption = (idx, value) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const addOption = () => {
    if (options.length < 10) setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit =
    question.trim().length > 0 &&
    options.filter((o) => o.trim().length > 0).length >= 2 &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    const filteredOptions = options.map((o) => o.trim()).filter(Boolean);

    try {
      const msg = await sendPollMessage({
        conversationId,
        pollQuestion: question.trim(),
        pollOptions: filteredOptions,
        allowMultipleAnswers: false,
      });
      onSent?.(msg);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to send poll. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
              <BarChart2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 dark:text-white">Create Poll</h2>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                Sent as interactive list message
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="poll-modal-close"
            className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Question */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">
              Poll Question <span className="text-rose-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              id="poll-question-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What pipe material do you need?"
              maxLength={1024}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
            />
            <p className="text-[10px] text-gray-400 dark:text-slate-500 text-right">
              {question.length}/1024
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Options <span className="text-rose-500">*</span>{" "}
                <span className="normal-case text-gray-400 font-semibold">(min 2, max 10)</span>
              </label>
              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold">
                {options.length}/10
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-black flex items-center justify-center select-none">
                    {idx + 1}
                  </span>
                  <input
                    id={`poll-option-${idx}`}
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (idx === options.length - 1) addOption();
                      }
                    }}
                    placeholder={`Option ${idx + 1}`}
                    maxLength={24}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3.5 py-2 text-sm text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                  />
                  <button
                    onClick={() => removeOption(idx)}
                    disabled={options.length <= 2}
                    id={`poll-remove-option-${idx}`}
                    title="Remove option"
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {options.length < 10 && (
              <button
                onClick={addOption}
                id="poll-add-option"
                className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer mt-1"
              >
                <Plus size={14} />
                Add Option
              </button>
            )}
          </div>

          {/* Info note */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-2.5">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <span className="font-black">Note:</span> WhatsApp polls are sent as interactive list
              messages. Options longer than 24 characters will be truncated. Customers tap
              "Select Option" to respond.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 flex-shrink-0 space-y-2">
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold text-center">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              id="poll-cancel-btn"
              className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              id="poll-send-btn"
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 text-sm font-black text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send Poll
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
