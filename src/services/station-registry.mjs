/**
 * station-registry.mjs
 *
 * Browser-side view of the canonical station estate.
 *
 * The station list used to be a literal repeated across the CRM bundle, the
 * table mapper, and StationConsumptionPage. Onboarding a station meant editing
 * each copy and shipping a release; anything missed left the new station absent
 * from the UI while the backend already knew about it.
 *
 * The estate is now served by `/api/system/stations`, which reads the same
 * `list_consumption_station_ids()` registry the backend uses. A station appears
 * here the moment its first reading lands — no redeploy.
 *
 * SEED_STATIONS is a rendering floor for first paint and offline failure, not
 * the estate. Never branch on it for correctness.
 */

export const SEED_STATIONS = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedStations = null;
let cachedAt = 0;
let inFlight = null;

export function canonicalStationId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalize(values) {
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = canonicalStationId(typeof value === "string" ? value : value?.stationId ?? value?.station_id);
    if (id) seen.add(id);
  }
  return [...seen].sort();
}

/**
 * Last known estate. Returns the seed until the first successful fetch, so
 * synchronous render paths always have something sensible to draw.
 */
export function stationsSync() {
  return cachedStations || SEED_STATIONS;
}

/** Current estate, refreshed from the API when the cache is cold. */
export async function fetchStations({ force = false } = {}) {
  if (!force && cachedStations && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStations;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch("/api/system/stations", {
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const body = await response.json();
        const stations = normalize(body?.stations ?? body?.data?.stations);
        if (stations.length) {
          cachedStations = stations;
          cachedAt = Date.now();
        }
      }
    } catch {
      // Offline or endpoint unavailable — keep the last known estate rather
      // than collapsing the UI to an empty station list.
    } finally {
      inFlight = null;
    }
    return cachedStations || SEED_STATIONS;
  })();

  return inFlight;
}

export function isKnownStation(stationId) {
  const id = canonicalStationId(stationId);
  return Boolean(id) && stationsSync().includes(id);
}

export function invalidateStations() {
  cachedStations = null;
  cachedAt = 0;
}
