// Turns photo GPS coordinates into a human-readable address via
// OpenStreetMap Nominatim (free, no API key). Best-effort: any failure or
// timeout resolves to null so callers fall back to coordinates only.
//
// Nominatim's usage policy allows ~1 request/second, so results are cached
// per rounded coordinate and concurrent lookups for the same spot share one
// request.

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const cache = new Map();

const keyOf = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export const reverseGeocode = (latitude, longitude, timeoutMs = 6000) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);

  const key = keyOf(lat, lng);
  if (cache.has(key)) return cache.get(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    zoom: "18",
    addressdetails: "0",
    "accept-language": "en",
  });

  const request = fetch(`${ENDPOINT}?${params}`, { signal: controller.signal })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.display_name || null)
    .catch(() => null)
    .finally(() => clearTimeout(timer));

  cache.set(key, request);
  // Don't pin failures in the cache — a later view can retry.
  request.then((address) => {
    if (!address) cache.delete(key);
  });
  return request;
};
