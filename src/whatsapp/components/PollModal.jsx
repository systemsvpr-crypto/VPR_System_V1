import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, BarChart2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendPollMessage } from "../services/whatsappApi";

const INPUT_CLS =
  "w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all";

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

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

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
    question.trim().length > 0 && options.filter((o) => o.trim().length > 0).length >= 2 && !loading;

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart2 size={17} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Create Poll</h2>
              <p className="text-xs text-slate-500">Sent as interactive list message</p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="poll-modal-close"
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Poll Question <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              id="poll-question-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which product size do you need?"
              maxLength={1024}
              className={INPUT_CLS}
            />
            <p className="text-[10px] text-slate-400 text-right">{question.length}/1024</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Options <span className="text-red-500">*</span>{" "}
                <span className="normal-case tracking-normal font-normal text-slate-400">(min 2, max 10)</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium">{options.length}/10</span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center select-none">
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
                    className={`flex-1 ${INPUT_CLS}`}
                  />
                  <button
                    onClick={() => removeOption(idx)}
                    disabled={options.length <= 2}
                    id={`poll-remove-option-${idx}`}
                    title="Remove option"
                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <Plus size={14} />
                Add Option
              </button>
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <span className="font-semibold">Note:</span> WhatsApp polls are sent as interactive list messages.
              Options longer than 24 characters will be truncated. Customers tap "Select Option" to respond.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-2">
          {error && <p className="text-xs text-red-600 font-medium text-center">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              id="poll-cancel-btn"
              className="h-9 px-4 text-xs font-medium text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              id="poll-send-btn"
              className="h-9 px-4 gap-2 text-xs font-medium hover:bg-primary/90"
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
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
