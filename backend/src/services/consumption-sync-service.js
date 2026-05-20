"use strict";

const {
  collectionRowsFromPayload,
  dailyMeterStationStats,
  dailyMeterTableReport,
  writeDailyMeterRows,
} = require("./consumption-store");
const { stations: defaultStations } = require("./refresh-targets");

const dailyMeterPath = "/api/DailyDataMeter/read";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value, fallback = "") {
  const day = String(value || fallback).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function normalizeStations(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const stations = raw
    .map((station) => String(station || "").trim().toUpperCase())
    .filter(Boolean);
  return stations.length ? Array.from(new Set(stations)) : defaultStations;
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function liveBaseUrl() {
  return String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
}

function liveHeaders() {
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postLive(pathname, payload, options = {}) {
  const baseUrl = liveBaseUrl();
  if (!baseUrl) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
  const retries = positiveInteger(options.retries, positiveInteger(process.env.CONSUMPTION_SYNC_RETRIES, 4));
  const timeoutMs = positiveInteger(options.timeoutMs, positiveInteger(process.env.CONSUMPTION_SYNC_TIMEOUT_MS, 45000));
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: liveHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.reason || body.msg || body.error || `Live request failed: ${response.status}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(15000, attempt * attempt * 1000)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Live request failed");
}

function rowsDateBounds(rows) {
  let earliest = null;
  let latest = null;
  for (const row of rows) {
    const day = normalizeDate(row.currentDate || row.readingDate || row.createDate);
    if (!day) continue;
    if (!earliest || day < earliest) earliest = day;
    if (!latest || day > latest) latest = day;
  }
  return { earliest, latest };
}

function maxPagesForMode(mode, input) {
  const explicit = Number(input.maxPagesPerStation ?? input.maxPages);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  const envName = mode === "backfill" ? "CONSUMPTION_SYNC_BACKFILL_MAX_PAGES" : "CONSUMPTION_SYNC_INCREMENTAL_MAX_PAGES";
  const fallback = mode === "backfill" ? 0 : 20;
  return positiveInteger(process.env[envName], fallback);
}

function syncWindow(mode, stationStats, input) {
  const to = normalizeDate(input.to, today());
  if (mode === "backfill") {
    return {
      from: normalizeDate(input.from, process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01"),
      to,
      reason: "full_backfill",
    };
  }
  const latest = normalizeDate(stationStats?.latestReadingDate);
  const lookbackDays = Math.max(0, positiveInteger(input.lookbackDays, positiveInteger(process.env.CONSUMPTION_SYNC_LOOKBACK_DAYS, 0)));
  return {
    from: latest ? addDays(latest, -lookbackDays) : normalizeDate(input.from, process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01"),
    to,
    reason: latest ? "latest_reading" : "empty_station",
    latestReadingDate: latest || null,
  };
}

async function syncStation(stationId, stationStats, options) {
  const pageSize = positiveInteger(options.pageSize, positiveInteger(process.env.CONSUMPTION_SYNC_PAGE_SIZE, 500));
  const maxPages = maxPagesForMode(options.mode, options);
  const window = syncWindow(options.mode, stationStats, options);
  let pageNumber = 1;
  let fetchedRows = 0;
  let storedRows = 0;
  let pagesFetched = 0;
  let rawTotal = 0;
  let earliest = null;
  let latest = null;

  while (true) {
    if (maxPages > 0 && pagesFetched >= maxPages) break;
    const payload = {
      lang: "en",
      stationId,
      FROM: window.from,
      TO: window.to,
      pageNumber,
      pageSize,
    };
    const responsePayload = await postLive(dailyMeterPath, payload, options);
    const rows = collectionRowsFromPayload(responsePayload);
    if (!rows.length) break;

    const bounds = rowsDateBounds(rows);
    if (bounds.earliest && (!earliest || bounds.earliest < earliest)) earliest = bounds.earliest;
    if (bounds.latest && (!latest || bounds.latest > latest)) latest = bounds.latest;

    const stored = await writeDailyMeterRows({
      pathname: dailyMeterPath,
      requestPayload: payload,
      responsePayload,
    });

    fetchedRows += rows.length;
    storedRows += Number(stored.stored || 0);
    pagesFetched += 1;
    rawTotal = Number(responsePayload?.result?.total ?? responsePayload?.data?.total ?? rawTotal) || rawTotal;

    if (rows.length < pageSize) break;
    if (rawTotal && pageNumber * pageSize >= rawTotal) break;
    pageNumber += 1;
  }

  return {
    stationId,
    mode: options.mode,
    from: window.from,
    to: window.to,
    detection: window.reason,
    latestReadingDate: window.latestReadingDate || null,
    pagesFetched,
    fetchedRows,
    storedRows,
    rawTotal,
    complete: maxPages === 0 ? fetchedRows >= rawTotal : !rawTotal || fetchedRows >= rawTotal || pagesFetched < maxPages,
    sourceEarliestReadingDate: earliest,
    sourceLatestReadingDate: latest,
  };
}

async function runConsumptionSync(input = {}) {
  const mode = input.mode === "backfill" || input.full === true ? "backfill" : "incremental";
  const stationIds = normalizeStations(input.stations || input.stationId || process.env.CONSUMPTION_SYNC_STATIONS);
  const before = await dailyMeterStationStats(stationIds);
  if (!before.tableReady) throw new Error(before.error || "Supabase daily_meter_readings is not ready");

  const statsByStation = new Map(before.stations.map((station) => [station.station, station]));
  const stations = [];
  const failures = [];
  for (const stationId of stationIds) {
    try {
      stations.push(await syncStation(stationId, statsByStation.get(stationId), { ...input, mode }));
    } catch (error) {
      failures.push({
        stationId,
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const after = await dailyMeterTableReport(stationIds);
  return {
    ok: failures.length === 0,
    mode,
    stationCount: stationIds.length,
    syncedStations: stations.length,
    failedStations: failures.length,
    fetchedRows: stations.reduce((sum, station) => sum + station.fetchedRows, 0),
    storedRows: stations.reduce((sum, station) => sum + station.storedRows, 0),
    before,
    after,
    stations,
    failures,
  };
}

module.exports = {
  runConsumptionSync,
  syncWindow,
};
