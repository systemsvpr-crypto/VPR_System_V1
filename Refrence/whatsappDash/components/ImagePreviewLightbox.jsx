import { useEffect } from "react";
import { X, Download } from "lucide-react";
import { handleDownload } from "../utils/chatUtils";

// Full-screen WhatsApp-style image preview. Rendered at the ChatWindow root
// whenever an image bubble is clicked (see ChatWindow's `previewImage` state).
export default function ImagePreviewLightbox({ url, title, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3 md:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate pr-4 text-sm font-bold text-white/90">
          {title || "Image"}
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => handleDownload(url, title)}
            title="Download"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <Download size={17} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <img
          src={url}
          alt={title || "Preview"}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}
