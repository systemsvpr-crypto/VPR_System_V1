import { useEffect, useRef } from "react";
import { X, Download } from "lucide-react";
import { handleDownload } from "../utils/chatUtils";

// Full-screen WhatsApp-style video preview. Rendered at the ChatWindow root
// whenever a video bubble's fullscreen button is clicked (see ChatWindow's
// `previewVideo` state). Auto-plays on mount; Escape closes it.
export default function VideoPreviewLightbox({ url, title, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    videoRef.current?.play().catch(() => {});
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3 md:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate pr-4 text-sm font-bold text-white/90">
          {title || "Video"}
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => handleDownload(url, title || "whatsapp-video.mp4")}
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

      {/* Video area */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={url}
          controls
          autoPlay
          className="max-h-full max-w-full rounded-lg shadow-2xl"
          style={{ maxHeight: "calc(100vh - 88px)" }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}
