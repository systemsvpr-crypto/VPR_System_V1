// In-browser camera capture for task proof photos. Calls onCapture(File)
// with a JPEG snapshot; supports switching front/back camera on phones.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";

const WebCameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [error, setError] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setError("");
    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError(e?.name === "NotAllowedError" ? "Camera permission denied." : "Unable to open the camera.");
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, facingMode, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopStream();
        onCapture?.(file);
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleClose = () => {
    stopStream();
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-black shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        >
          <X size={20} />
        </button>
        {error ? (
          <div className="flex h-72 items-center justify-center p-6 text-center text-sm text-white">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-[70vh] w-full object-contain" />
        )}
        <div className="flex items-center justify-center gap-6 bg-black/90 p-4">
          <button
            onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
            className="rounded-full bg-white/15 p-3 text-white hover:bg-white/25"
            title="Switch camera"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={handleCapture}
            disabled={!!error}
            className="rounded-full bg-white p-4 text-gray-900 shadow-lg hover:bg-gray-100 disabled:opacity-40"
            title="Capture"
          >
            <Camera size={26} />
          </button>
          <div className="w-11" />
        </div>
      </div>
    </div>
  );
};

export default WebCameraModal;
