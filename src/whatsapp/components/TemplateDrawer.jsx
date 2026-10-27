import { useState } from "react";
import { X, FileStack, ChevronLeft, Send, Image, Video, FileText, Loader2, Paperclip } from "lucide-react";
import { extractTemplateVariables, parseTemplateBody } from "../utils/chatUtils";
import { uploadWhatsappMedia } from "../services/whatsappApi";
import { useWaToast } from "../utils/toast";

const CATEGORY_COLOR = {
  MARKETING: "bg-violet-50 text-violet-700 border-violet-200",
  UTILITY: "bg-blue-50 text-blue-700 border-blue-200",
  AUTHENTICATION: "bg-amber-50 text-amber-700 border-amber-200",
};

const HEADER_MEDIA_ICON = { IMAGE: Image, VIDEO: Video, DOCUMENT: FileText };

const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

export default function TemplateDrawer({ templates, onClose, onDispatch }) {
  const { showToast } = useWaToast();
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
      showToast(err.message || "Failed to upload header media", "error");
    } finally {
      setIsUploadingHeader(false);
    }
  };

  const previewText = selected
    ? parseTemplateBody(
        selected.bodyText,
        variableTokens.map((t) => variables[t] || "")
      )
    : "";

  const canSend =
    selected &&
    variableTokens.every((t) => variables[t] && variables[t].trim()) &&
    (!needsHeaderMedia || !!headerMediaUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                title="Back to templates"
              >
                <ChevronLeft size={17} />
              </button>
            )}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileStack size={16} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 truncate">
              {selected ? "Fill Template Variables" : "Meta Business Templates"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={17} />
          </button>
        </div>

        {!selected ? (
          <div className="max-h-[440px] overflow-y-auto custom-scrollbar p-3 space-y-2">
            {templates.length === 0 && (
              <p className="py-10 text-center text-xs text-slate-400">
                No approved templates. Use the sync button in the sidebar to fetch them.
              </p>
            )}
            {templates.map((tpl) => {
              const HeaderIcon = HEADER_MEDIA_ICON[tpl.headerType];
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelect(tpl)}
                  className="w-full rounded-xl border border-slate-200 p-3.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate">
                      {HeaderIcon && <HeaderIcon size={13} className="shrink-0 text-slate-400" />}
                      {tpl.elementName}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        CATEGORY_COLOR[tpl.category] || "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-line">{tpl.bodyText}</p>
                  {tpl.buttons?.length > 0 && (
                    <p className="mt-1 text-[10px] font-semibold text-primary">
                      {tpl.buttons.length} button{tpl.buttons.length > 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar p-5 space-y-4">
            <div className="rounded-xl bg-[#efeae2] border border-slate-200 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live Preview</p>
              <div className="rounded-lg bg-white shadow-xs p-3 space-y-1.5">
                {selected.headerType === "TEXT" && selected.headerText && (
                  <p className="text-sm font-semibold text-slate-800 mb-1">{selected.headerText}</p>
                )}
                {headerMediaUrl && selected.headerType === "IMAGE" && (
                  <img src={headerMediaUrl} alt="header" className="w-full max-h-44 object-cover rounded-md mb-1.5" />
                )}
                {headerMediaUrl && selected.headerType === "VIDEO" && (
                  <div className="relative bg-black w-full rounded-md overflow-hidden mb-1.5">
                    <video src={headerMediaUrl} className="w-full max-h-44 object-cover" preload="metadata" controls />
                  </div>
                )}
                {headerMediaUrl && selected.headerType === "DOCUMENT" && (
                  <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-2.5 rounded-md border border-slate-200 mb-1.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
                      <FileText size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{headerFileName || "Document"}</p>
                      <p className="text-[10px] text-slate-400">PDF · Tap to open</p>
                    </div>
                  </div>
                )}
                {needsHeaderMedia && !headerMediaUrl && (
                  <p className="flex items-center gap-1 text-xs font-medium text-slate-400">
                    {(() => {
                      const Icon = HEADER_MEDIA_ICON[selected.headerType];
                      return Icon ? <Icon size={12} /> : null;
                    })()}
                    {selected.headerType} header — attach below
                  </p>
                )}
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{previewText}</p>
                {selected.footerText && <p className="text-xs text-slate-400">{selected.footerText}</p>}
                {selected.buttons?.length > 0 && (
                  <div className="pt-1.5 space-y-1 border-t border-slate-100 mt-1.5">
                    {selected.buttons.map((btn, idx) => (
                      <p key={idx} className="text-xs font-semibold text-sky-600 text-center">
                        {btn.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {needsHeaderMedia && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Header {selected.headerType.toLowerCase()} <span className="text-red-500">*</span>
                </label>
                {headerMediaUrl ? (
                  <div className="flex items-center gap-2.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                    <Paperclip size={13} className="text-primary shrink-0" />
                    <span className="truncate text-xs font-medium text-slate-700 flex-1">{headerFileName}</span>
                    <button
                      onClick={() => {
                        setHeaderMediaUrl(null);
                        setHeaderFileName(null);
                      }}
                      className="text-slate-400 hover:text-red-500"
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50/50 py-3 text-xs font-medium text-slate-500 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors">
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
                        selected.headerType === "IMAGE"
                          ? "image/*"
                          : selected.headerType === "VIDEO"
                            ? "video/*"
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
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Variable {token}
                  </label>
                  <input
                    value={variables[token] || ""}
                    onChange={(e) => setVariables((v) => ({ ...v, [token]: e.target.value }))}
                    placeholder={`Value for ${token}`}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
              ))}
              {variableTokens.length === 0 && (
                <p className="text-xs text-slate-400">This template has no dynamic variables.</p>
              )}
            </div>

            <button
              disabled={!canSend}
              onClick={() =>
                onDispatch(
                  selected,
                  variableTokens.map((t) => variables[t]),
                  headerMediaUrl,
                  headerFileName
                )
              }
              className="flex w-full h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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
