"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = "true";

const {
  dailyMeterStationStats,
  writeRawDuplicateRows,
} = require("../backend/src/services/consumption-store");
const { stations: defaultStations } = require("../backend/src/services/refresh-targets");

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const bearerToken = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
const pageSize = Number(process.env.CONSUMPTION_RAW_PAGE_SIZE || 500);
const lookbackDays = Number(process.env.CONSUMPTION_RAW_LOOKBACK_DAYS || 30);
const selectedStations = String(process.env.CONSUMPTION_RAW_STATIONS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const stations = selectedStations.length ? selectedStations : defaultStations;
const to = new Date().toISOString().slice(0, 10);

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function rowDay(row) {
  return String(row.currentDate || row.readingDate || row.createDate || "").slice(0, 10);
}

function rowKey(stationId, row) {
  return [
    stationId,
    String(row.meterId || row.customerId || "").trim().toUpperCase(),
    rowDay(row),
  ].join("|");
}

async function postLive(payload) {
  if (!baseUrl) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${baseUrl}/api/DailyDataMeter/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Live returned non-JSON ${response.status}: ${text.slice(0, 100)}`);
      }
      if (!response.ok) throw new Error(body.reason || body.msg || `Live request failed: ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, Math.min(15000, attempt * attempt * 1000)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Live request failed");
}

async function liveRawTotal(stationId) {
  const response = await postLive({ lang: "en", stationId, FROM: "2025-01-01", TO: to, pageNumber: 1, pageSize: 1 });
  return Number(response?.result?.total ?? response?.data?.total ?? 0);
}

async function archiveStation(stationId, stats) {
  const from = addDays(stats.latestReadingDate || to, -lookbackDays);
  const rawTotal = await liveRawTotal(stationId);
  const targetGap = Math.max(0, rawTotal - Number(stats.rows || 0) - Number(stats.rawDuplicateRows || 0));
  const seen = new Map();
  let pageNumber = 1;
  let fetched = 0;
  let duplicates = 0;
  let stored = 0;

  while (targetGap === 0 || duplicates < targetGap) {
    const response = await postLive({ lang: "en", stationId, FROM: "2025-01-01", TO: to, pageNumber, pageSize });
    const rows = response?.result?.data || response?.data?.data || [];
    if (!rows.length) break;
    fetched += rows.length;
    const duplicateRows = [];
    const days = [];
    rows.forEach((row, index) => {
      const day = rowDay(row);
      if (day) days.push(day);
      if (!day || day < from || day > to) return;
      const key = rowKey(stationId, row);
      const occurrence = (seen.get(key) || 0) + 1;
      seen.set(key, occurrence);
      if (occurrence > 1) {
        duplicateRows.push({
          row,
          duplicateIndex: occurrence - 1,
          sourcePage: pageNumber,
          sourceRow: index + 1,
        });
      }
    });
    if (duplicates + duplicateRows.length < targetGap) {
      rows.forEach((row, index) => {
        if (duplicates + duplicateRows.length >= targetGap) return;
        const day = rowDay(row);
        if (!day || day < from || day > to) return;
        duplicateRows.push({
          row,
          eventType: "raw-gap",
          duplicateIndex: duplicates + duplicateRows.length + 1,
          sourcePage: pageNumber,
          sourceRow: index + 1,
        });
      });
    }

    if (duplicateRows.length) {
      const result = await writeRawDuplicateRows({
        requestPayload: { stationId, FROM: from, TO: to },
        duplicateRows,
      });
      stored += Number(result.stored || 0);
      duplicates += duplicateRows.length;
    }

    days.sort();
    const minDay = days[0] || "";
    const maxDay = days[days.length - 1] || "";
    console.log(JSON.stringify({ stationId, pageNumber, rows: rows.length, duplicates: duplicateRows.length, minDay, maxDay, from, targetGap }));
    if (!maxDay || maxDay < from || rows.length < pageSize) break;
    pageNumber++;
  }

  return { stationId, rawTotal, targetGap, from, to, fetched, duplicates, stored };
}

(async () => {
  const before = await dailyMeterStationStats(stations);
  if (!before.tableReady) throw new Error(before.error || "Supabase daily meter table is not ready");
  const byStation = new Map(before.stations.map((station) => [station.station, station]));
  const summary = [];
  for (const stationId of stations) {
    summary.push(await archiveStation(stationId, byStation.get(stationId) || { station: stationId }));
  }
  const after = await dailyMeterStationStats(stations);
  console.log(JSON.stringify({ status: "raw gap archive complete", summary, before, after }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
