"use strict";

const axios = require("axios");
const consumptionStore = require("./consumption-store");
const supabase = require("./supabase-service");

const STATIONS = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];

function getUpstreamConfig() {
  const url = process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "";
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  return { url, token };
}

// ─── Upstream API Fetching ───────────────────────────────────────────────────

async function fetchUpstreamPage(stationId, pageNumber, pageSize = 1000, dateRange = null) {
  const { url, token } = getUpstreamConfig();
  if (!url) throw new Error("Upstream API URL is not configured");

  const payload = { stationId, lang: "en", pageNumber, pageSize };
  if (dateRange) {
    payload.FROM = dateRange.from;
    payload.TO = dateRange.to;
  }

  try {
    const res = await axios.post(`${url}/api/DailyDataMeter/read`, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 20000
    });
    const rows = res?.data?.data?.data || res?.data?.result?.data || res?.data?.data || [];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error(`[consumption-sync] fetchPage FAIL ${stationId} p${pageNumber}:`, err.message);
    return [];
  }
}

async function fetchAllPages(stationId, dateRange = null, maxPages = 100) {
  const allRows = [];
  const batchSize = 6;

  const page1 = await fetchUpstreamPage(stationId, 1, 1000, dateRange);
  if (!page1.length) return allRows;
  allRows.push(...page1);

  for (let startPage = 2; startPage <= maxPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, maxPages);
    const promises = [];
    for (let p = startPage; p <= endPage; p++) {
      promises.push(fetchUpstreamPage(stationId, p, 1000, dateRange));
    }
    const results = await Promise.all(promises);
    let emptyCount = 0;
    for (const rows of results) {
      if (rows.length) {
        allRows.push(...rows);
      } else {
        emptyCount++;
      }
    }
    if (emptyCount === promises.length) break;
  }

  return allRows;
}

// ─── Supabase Intelligence ───────────────────────────────────────────────────

async function getLatestReadingDate(stationId) {
  if (!consumptionStore.storeEnabled()) return null;
  try {
    const query = [
      "select=reading_date",
      `station_id=eq.${encodeURIComponent(stationId)}`,
      "order=reading_date.desc",
      "limit=1"
    ].join("&");
    const { body } = await supabase.restRequestWithResponse(`/daily_meter_readings?${query}`, {});
    const row = Array.isArray(body) ? body[0] : null;
    return row?.reading_date || null;
  } catch (err) {
    console.error(`[consumption-sync] getLatestReadingDate FAIL ${stationId}:`, err.message);
    return null;
  }
}

async function getRowCount(stationId = null) {
  if (!consumptionStore.storeEnabled()) return 0;
  try {
    const filters = ["select=id"];
    if (stationId) filters.push(`station_id=eq.${encodeURIComponent(stationId)}`);
    const { response } = await supabase.restRequestWithResponse(`/daily_meter_readings?${filters.join("&")}`, {
      headers: { Prefer: "count=exact", Range: "0-0" }
    });
    const match = String(response.headers.get("content-range") || "").match(/\/(\d+)$/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

// ─── Sync Modes ──────────────────────────────────────────────────────────────

/**
 * INCREMENTAL SYNC
 * For each station, checks Supabase for the latest reading date.
 * Then only fetches data from (latestDate - 2 days) forward to catch any
 * late-arriving readings. Very fast, only a few pages per station.
 */
async function runIncrementalSync() {
  const startTime = Date.now();
  const results = [];
  let totalStored = 0;

  for (const stationId of STATIONS) {
    const stationStart = Date.now();
    try {
      const latestDate = await getLatestReadingDate(stationId);
      let fromDate;

      if (latestDate) {
        // Go back 2 days from the latest date to catch late-arriving data
        const d = new Date(`${latestDate}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - 2);
        fromDate = d.toISOString().slice(0, 10);
      } else {
        // No data at all — pull last 30 days as initial seed
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 30);
        fromDate = d.toISOString().slice(0, 10);
      }

      const toDate = new Date().toISOString().slice(0, 10);
      console.log(`[consumption-sync] INCREMENTAL ${stationId}: ${fromDate} → ${toDate}`);

      const rows = await fetchAllPages(stationId, { from: fromDate, to: toDate }, 20);

      let stored = 0;
      if (rows.length > 0) {
        const dbResult = await consumptionStore.writeDailyMeterRows({
          pathname: "/api/DailyDataMeter/read",
          requestPayload: { stationId },
          responsePayload: { data: rows }
        });
        stored = dbResult?.stored || 0;
      }

      totalStored += stored;
      results.push({
        stationId,
        status: "success",
        latestDateBefore: latestDate,
        fetchedFrom: fromDate,
        rowsFetched: rows.length,
        rowsStored: stored,
        durationMs: Date.now() - stationStart
      });
    } catch (err) {
      console.error(`[consumption-sync] INCREMENTAL FAIL ${stationId}:`, err.message);
      results.push({
        stationId,
        status: "error",
        error: err.message,
        durationMs: Date.now() - stationStart
      });
    }
  }

  return {
    mode: "incremental",
    success: results.some(r => r.status === "success"),
    totalStored,
    stations: results,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString()
  };
}

/**
 * FULL BACKFILL
 * Pulls ALL historical data for every station (up to maxPages).
 * Run this once to seed the database, then rely on incremental sync.
 */
async function runFullBackfill(maxPagesPerStation = 100) {
  const startTime = Date.now();
  const results = [];
  let totalStored = 0;

  for (const stationId of STATIONS) {
    const stationStart = Date.now();
    try {
      const rowsBefore = await getRowCount(stationId);
      console.log(`[consumption-sync] BACKFILL ${stationId}: pulling up to ${maxPagesPerStation} pages (${rowsBefore} rows already in DB)`);

      // No date range = fetch everything the upstream API has
      const rows = await fetchAllPages(stationId, null, maxPagesPerStation);

      let stored = 0;
      if (rows.length > 0) {
        const dbResult = await consumptionStore.writeDailyMeterRows({
          pathname: "/api/DailyDataMeter/read",
          requestPayload: { stationId },
          responsePayload: { data: rows }
        });
        stored = dbResult?.stored || 0;
      }

      const rowsAfter = await getRowCount(stationId);
      totalStored += stored;

      results.push({
        stationId,
        status: "success",
        rowsBefore,
        rowsFetched: rows.length,
        rowsUpserted: stored,
        rowsAfter,
        newRows: rowsAfter - rowsBefore,
        durationMs: Date.now() - stationStart
      });
    } catch (err) {
      console.error(`[consumption-sync] BACKFILL FAIL ${stationId}:`, err.message);
      results.push({
        stationId,
        status: "error",
        error: err.message,
        durationMs: Date.now() - stationStart
      });
    }
  }

  return {
    mode: "backfill",
    success: results.some(r => r.status === "success"),
    totalStored,
    stations: results,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString()
  };
}

/**
 * STATUS CHECK
 * Returns a quick summary of what data is currently in Supabase.
 */
async function syncStatus() {
  const stationStats = [];
  let totalRows = 0;

  for (const stationId of STATIONS) {
    const count = await getRowCount(stationId);
    const latestDate = await getLatestReadingDate(stationId);
    totalRows += count;
    stationStats.push({ stationId, rows: count, latestReadingDate: latestDate });
  }

  return {
    enabled: consumptionStore.storeEnabled(),
    totalRows,
    stations: stationStats,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  runIncrementalSync,
  runFullBackfill,
  syncStatus,
  STATIONS
};
