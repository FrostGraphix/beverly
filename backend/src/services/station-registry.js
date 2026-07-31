"use strict";

/**
 * Station registry — the single source of truth for "which stations does
 * Beverly operate?".
 *
 * The estate used to be a hardcoded array repeated across a dozen modules, so
 * onboarding a sixth station meant editing every one of them and shipping a
 * release. Anything missed left that station silently absent from analytics,
 * refreshes, or gateway health.
 *
 * The database already answers this correctly. `list_consumption_station_ids()`
 * unions every station that has readings, has aggregates, or is registered in
 * `public.consumption_stations`, then filters by `consumption_stations.is_active`
 * — defaulting to active unless the id looks like a fixture (all-numeric, or
 * containing TEST / SMOKE). A newly onboarded station therefore appears the
 * moment its first reading lands, with no code change and no configuration.
 *
 * This module is the JavaScript-side cache over that RPC.
 *
 *   await getStations()   -> refreshes from the database when the cache is cold
 *   getStationsSync()     -> last known good list; SEED_STATIONS until warm
 *
 * SEED_STATIONS is a last-resort floor, not the estate. It exists so that a
 * registry outage degrades to "refresh the original five" rather than
 * "refresh nothing".
 */

const supabase = require("./supabase-service");

const SEED_STATIONS = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];
const CACHE_TTL_MS = Number(process.env.STATION_REGISTRY_TTL_MS || 5 * 60 * 1000);

let cachedStations = null;
let cachedAt = 0;
let inFlight = null;

function canonical(stationId) {
  return String(stationId ?? "").trim().toUpperCase();
}

function normalizeList(values) {
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = canonical(typeof value === "string" ? value : value?.station_id);
    if (id) seen.add(id);
  }
  return [...seen].sort();
}

function cacheIsFresh() {
  return Array.isArray(cachedStations) && Date.now() - cachedAt < CACHE_TTL_MS;
}

async function fetchFromDatabase() {
  const rows = await supabase.restRequest("/rpc/list_consumption_station_ids", {
    method: "POST",
    body: {},
  });
  return normalizeList(rows);
}

/**
 * Current station estate. Falls back to the last known good list, then to the
 * seed, so a registry outage never collapses the estate to empty.
 */
async function getStations({ force = false } = {}) {
  if (!force && cacheIsFresh()) return cachedStations;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const stations = await fetchFromDatabase();
      if (stations.length) {
        cachedStations = stations;
        cachedAt = Date.now();
      }
    } catch (error) {
      console.error(
        "[station-registry] discovery failed, using last known list:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      inFlight = null;
    }
    return cachedStations || SEED_STATIONS;
  })();

  return inFlight;
}

/**
 * Synchronous accessor for call sites that cannot await (pure mappers, config
 * builders). Returns the last known good list, or the seed if nothing has been
 * fetched yet. Callers that can await should prefer getStations().
 */
function getStationsSync() {
  return cachedStations || SEED_STATIONS;
}

/** True when `stationId` is part of the live estate. */
async function isKnownStation(stationId) {
  const id = canonical(stationId);
  if (!id) return false;
  return (await getStations()).includes(id);
}

function isKnownStationSync(stationId) {
  const id = canonical(stationId);
  return Boolean(id) && getStationsSync().includes(id);
}

/** Warm the cache at process start so sync callers are correct immediately. */
async function primeStationRegistry() {
  try {
    await getStations({ force: true });
  } catch {
    // getStations already logs and degrades; priming is best-effort.
  }
  return getStationsSync();
}

function invalidateStationRegistry() {
  cachedStations = null;
  cachedAt = 0;
}

module.exports = {
  SEED_STATIONS,
  canonical,
  getStations,
  getStationsSync,
  invalidateStationRegistry,
  isKnownStation,
  isKnownStationSync,
  primeStationRegistry,
};
