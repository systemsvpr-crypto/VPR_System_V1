import { useState } from "react";
import { X, FileStack, ChevronLeft, Send, Image, Video, FileText, Loader2, Paperclip } from "lucide-react";
import { extractTemplateVariables, parseTemplateBody } from "../utils/chatUtils";
import { uploadWhatsappMedia } from "../services/whatsappApi";

const CATEGORY_COLOR = {
  MARKETING: "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400",
  UTILITY: "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400",
  AUTHENTICATION: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400",
};

const HEADER_MEDIA_ICON = { IMAGE: Image, VIDEO: Video, DOCUMENT: FileText };

const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

export default function TemplateDrawer({ templates, onClose, onDispatch }) {
  const [selected, setSelected] = useState(null);
  const [variables, setVariables] = useState({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState(null);
  const [headerFileName, setHeaderFileName] = useState(null);
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);

  const variableTokens = selected ? extractTemplateVariables(selected.bodyText) : [];
  const needsHeaderMedia = selected && MEDIA_HEADER_TYPES.includes(selected.headerType);

  const handleSelect = (tpl) => {
    setSelected(tpl);
    setVariables({});
    setHeaderMediaUrl(null);
    setHeaderFileName(null);
  };

  const handleHeaderFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingHeader(true);
    try {
      const publicUrl = await uploadWhatsappMedia(file, "whatsapp_header");
      setHeaderMediaUrl(publicUrl);
      setHeaderFileName(file.name);
    } catch (err) {
      console.error("Failed to upload header media:", err);
    } finally {
      setIsUploadingHeader(false);
    }
  };

  const previewText = selected
    ? parseTemplateBody(
        selected.bodyText,
        variableTokens.map((t) => variables[t] || ""),
      )
    : "";

  const canSend =
    selected &&
    variableTokens.every((t) => variables[t] && variables[t].trim()) &&
    (!needsHeaderMedia || !!headerMediaUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <FileStack size={18} className="text-emerald-600" />
            <h3 className="text-sm font-black text-gray-900 dark:text-white">
              {selected ? "Fill Template Variables" : "Meta Business Templates"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {!selected ? (
          <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
            {templates.map((tpl) => {
              const HeaderIcon = HEADER_MEDIA_ICON[tpl.headerType];
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelect(tpl)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3.5 text-left hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white truncate">
                      {HeaderIcon && <HeaderIcon size={13} className="flex-shrink-0 text-gray-400" />}
                      {tpl.elementName}
                    </span>
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${CATEGORY_COLOR[tpl.category]}`}
                    >
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">
                    {tpl.bodyText}
                  </p>
                  {tpl.buttons?.length > 0 && (
                    <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {tpl.buttons.length} button{tpl.buttons.length > 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-3.5 space-y-1.5">
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                Live Preview
              </p>
              {/* TEXT header type */}
              {selected.headerType === "TEXT" && selected.headerText && (
                <p className="text-sm font-black text-gray-800 dark:text-slate-200 mb-1">{selected.headerText}</p>
              )}
              {/* ── HEADER MEDIA SAMPLE in preview ── */}
              {/* If media is uploaded, show actual media */}

              {headerMediaUrl && selected.headerType === "IMAGE" && (
                <img
                  src={headerMediaUrl}
                  alt="header"
                  className="w-full max-h-44 object-cover rounded-lg mb-1.5"
                />
              )}
              {headerMediaUrl && selected.headerType === "VIDEO" && (
                <div className="relative bg-black w-full rounded-lg overflow-hidden mb-1.5">
                  <video
                    src={headerMediaUrl}
                    className="w-full max-h-44 object-cover"
                    preload="metadata"
                    controls
                  />
                </div>
              )}
              {headerMediaUrl && selected.headerType === "DOCUMENT" && (
                <div className="flex items-center gap-2.5 bg-red-50/60 dark:bg-red-950/20 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40 mb-1.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/90 text-white">
                    <FileText size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-gray-800 dark:text-slate-200">{headerFileName || "Document"}</p>
                    <p className="text-[10px] text-gray-400">PDF · Tap to open</p>
                  </div>
                </div>
              )}
              {/* If not yet uploaded but needed, show placeholder */}
              {needsHeaderMedia && !headerMediaUrl && (
                <p className="flex items-center gap-1 text-xs font-bold text-gray-400 dark:text-slate-500">
                  {(() => {
                    const Icon = HEADER_MEDIA_ICON[selected.headerType];
                    return Icon ? <Icon size={12} /> : null;
                  })()}
                  {selected.headerType} header — attach below
                </p>
              )}
              <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap">
                {previewText}
              </p>
              {selected.footerText && (
                <p className="text-xs text-gray-400">{selected.footerText}</p>
              )}
              {selected.buttons?.length > 0 && (
                <div className="pt-1 space-y-1 border-t border-gray-200 dark:border-slate-800 mt-1.5">
                  {selected.buttons.map((btn, idx) => (
                    <p key={idx} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">
                      {btn.text}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {needsHeaderMedia && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-400">
                  Header {selected.headerType.toLowerCase()} <span className="text-red-400">*</span>
                </label>
                {headerMediaUrl ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
                    <Paperclip size={13} className="text-emerald-600 flex-shrink-0" />
                    <span className="truncate text-xs font-bold text-emerald-800 dark:text-emerald-300 flex-1">
                      {headerFileName}
                    </span>
                    <button
                      onClick={() => { setHeaderMediaUrl(null); setHeaderFileName(null); }}
                      className="text-emerald-500 hover:text-emerald-700"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-slate-700 py-3 text-xs font-bold text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                    {isUploadingHeader ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <Paperclip size={14} /> Choose {selected.headerType.toLowerCase()} file
                      </>
                    )}
                    <input
                      type="file"
                      accept={
                        selected.headerType === "IMAGE" ? "image/*"
                          : selected.headerType === "VIDEO" ? "video/*"
                          : undefined
                      }
                      className="hidden"
                      disabled={isUploadingHeader}
                      onChange={handleHeaderFileChange}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="space-y-3">
              {variableTokens.map((token) => (
                <div key={token}>
                  <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-slate-400">
                    Variable {token}
                  </label>
                  <input
                    value={variables[token] || ""}
                    onChange={(e) =>
                      setVariables((v) => ({ ...v, [token]: e.target.value }))
                    }
                    placeholder={`Value for ${token}`}
                    className="w-full rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </div>
              ))}
              {variableTokens.length === 0 && (
                <p className="text-xs text-gray-400">
                  This template has no dynamic variables.
                </p>
              )}
            </div>

            <button
              disabled={!canSend}
              onClick={() =>
                onDispatch(selected, variableTokens.map((t) => variables[t]), headerMediaUrl, headerFileName)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={15} />
              Dispatch Template Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
