// Photo helpers for task-completion uploads: shrink camera/gallery images
// before upload, and capture where the photo was submitted from via the
// browser's Geolocation API, plus a best-effort street address from
// reverseGeocode (null when the lookup fails — coordinates are the proof).
//
// getImageLocationMeta throws when location is denied/unavailable; callers
// catch that and show LocationPermissionModal, cancelling the upload.
import { reverseGeocode } from "./reverseGeocode";

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

// Returns a JPEG File no larger than maxDim on its longest side. Non-images
// and images already within bounds (and already JPEG) pass through as-is.
export const compressImageFile = async (file, maxDim = 1600, quality = 0.82) => {
  if (!file || !file.type?.startsWith("image/")) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale === 1 && file.type === "image/jpeg") return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
};

const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  });

export const getImageLocationMeta = async (file, sourceHint = "upload") => {
  let pos;
  try {
    pos = await getPosition();
  } catch (err) {
    const denied = err?.code === 1;
    throw new Error(
      denied
        ? "Location permission denied. Please allow location access to upload photos."
        : err?.message || "Unable to get your current location.",
    );
  }

  const { latitude, longitude, accuracy } = pos.coords;
  const address = await reverseGeocode(latitude, longitude);
  return {
    latitude,
    longitude,
    accuracy: Math.round(accuracy),
    address,
    captured_at: new Date().toISOString(),
    source: sourceHint,
    file_name: file?.name || null,
    maps_url: `https://www.google.com/maps?q=${latitude},${longitude}`,
  };
};
