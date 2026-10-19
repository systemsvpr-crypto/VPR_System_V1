// Caption over a lightbox image showing where/when a task photo was taken.
// `locationMeta` may arrive as an object or as the JSON string stored in DB.
// Photos saved before addresses were captured get theirs looked up here.
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { formatLocationLines } from "../utils/bakeLocationWatermark";
import { reverseGeocode } from "../utils/reverseGeocode";

const parseMeta = (meta) => {
  if (!meta) return null;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return meta;
};

const PhotoLocationOverlay = ({ locationMeta }) => {
  const meta = parseMeta(locationMeta);
  const lat = meta?.latitude ?? meta?.lat;
  const lng = meta?.longitude ?? meta?.lng;
  const storedAddress = meta?.address || null;

  const [lookedUp, setLookedUp] = useState({ key: null, address: null });
  const key = `${lat},${lng}`;
  useEffect(() => {
    if (storedAddress || lat == null || lng == null) return;
    let active = true;
    reverseGeocode(lat, lng).then((address) => {
      if (active) setLookedUp({ key, address });
    });
    return () => {
      active = false;
    };
  }, [storedAddress, lat, lng, key]);

  if (!meta) return null;
  const address = storedAddress || (lookedUp.key === key ? lookedUp.address : null);
  const lines = formatLocationLines({ ...meta, address });
  if (lines.length === 0) return null;

  const mapsUrl = meta.maps_url || (lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null);

  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-start gap-2 rounded-xl bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
      <MapPin size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {lines.map((l) => (
          <div key={l} className={l === address ? "line-clamp-2 break-words opacity-90" : "truncate"}>
            {l}
          </div>
        ))}
      </div>
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-white/20 px-2 py-1 font-semibold hover:bg-white/30"
          onClick={(e) => e.stopPropagation()}
        >
          Map
        </a>
      )}
    </div>
  );
};

export default PhotoLocationOverlay;
