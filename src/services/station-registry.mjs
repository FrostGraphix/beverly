/**
 * Browser-side station directory.
 *
 * The directory aggregates every active OEM's live station API.
 */

import { postApi } from "./api.js";
import { normalizeCollection } from "./response-normalizers.mjs";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedOptions = null;
let cachedAt = 0;
let inFlight = null;

export function canonicalStationId(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function formatStationDisplayLabel(stationId, rawLabel = "") {
  const normId = String(stationId || "").trim();
  const normLabel = String(rawLabel || "").trim();
  const target = normLabel || normId;
  if (!target) return "";
  const upper = target.toUpperCase();
  if (upper === "MILE 9" || upper === "MILE_9" || upper === "MILE 9 & 10" || upper === "MILE 9 AND 10") {
    return "Mile 9 & 10";
  }
  if (target === upper && target.length > 1 && !/^\d+$/.test(target)) {
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
  }
  return target;
}

function normalize(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const stationId = canonicalStationId(
      typeof row === "string" ? row : row?.stationId ?? row?.station_id ?? row?.id
    );
    if (!stationId || stationId === "ADMIN") continue;
    const name = String(
      typeof row === "string" ? row : row?.name ?? row?.stationName ?? row?.station_name ?? stationId
    ).trim();
    const oemId = String(typeof row === "string" ? "" : row?.oemId ?? row?.oem_id ?? "").trim();
    const oemName = String(typeof row === "string" ? "" : row?.oemName ?? row?.oem_name ?? "").trim();
    byId.set(`${oemId}:${stationId}`, {
      stationId,
      name: name || stationId,
      label: oemName ? `${name || stationId} · ${oemName}` : name || stationId,
      oemId,
      oemSlug: String(typeof row === "string" ? "" : row?.oemSlug ?? row?.oem_slug ?? "").trim(),
      oemName,
      status: String(typeof row === "string" ? "active" : row?.status ?? "active").trim().toLowerCase(),
    });
  }
  return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label));
}

/** Last successful API result. */
export function stationsSync() {
  return (cachedOptions || []).map((station) => station.stationId);
}

export function stationOptionsSync() {
  return cachedOptions || [];
}

/** Current multi-OEM station directory. */
export async function fetchStationOptions({ force = false } = {}) {
  if (!force && cachedOptions && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedOptions;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await postApi("/api/local/stations", {});
      const options = normalize(normalizeCollection(response).rows);
      if (!options.length) throw new Error("Station API returned no stations");
      cachedOptions = options;
      cachedAt = Date.now();
      return cachedOptions;
    } catch (error) {
      if (cachedOptions) return cachedOptions;
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function fetchStations(options = {}) {
  return (await fetchStationOptions(options)).map((station) => station.stationId);
}

export function isKnownStation(stationId) {
  const id = canonicalStationId(stationId);
  return Boolean(id) && stationsSync().includes(id);
}

const mutationListeners = new Set();

export function onStationMutation(listener) {
  if (typeof listener === "function") {
    mutationListeners.add(listener);
    return () => mutationListeners.delete(listener);
  }
  return () => {};
}

export function invalidateStations() {
  cachedOptions = null;
  cachedAt = 0;
}

export function notifyStationMutation() {
  invalidateStations();
  for (const listener of mutationListeners) {
    try {
      listener();
    } catch {
      // Ignore listener error
    }
  }
}
