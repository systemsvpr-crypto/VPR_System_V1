// Shown when a photo upload is cancelled because the browser refused or
// couldn't provide the device location that task proofs require.
import { MapPin, X } from "lucide-react";

const LocationPermissionModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <MapPin size={22} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Location access needed</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-gray-600">
          Task photos are stamped with where they were taken. Please allow location access and try again:
        </p>
        <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>Click the lock / site-settings icon in the browser address bar.</li>
          <li>Set <strong>Location</strong> to <strong>Allow</strong>.</li>
          <li>Make sure device location (GPS) is switched on, then upload again.</li>
        </ol>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default LocationPermissionModal;
