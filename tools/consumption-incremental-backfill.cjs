"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = "true";

const { dailyMeterStationStats, writeDailyMeterRows } = require("../backend/src/services/consumption-store");
const { stations: defaultStations } = require("../backend/src/services/refresh-targets");

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const bearerToken = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
const pageSize = Number(process.env.CONSUMPTION_INCREMENTAL_PAGE_SIZE || 500);
const lookbackDays = Number(process.env.CONSUMPTION_INCREMENTAL_LOOKBACK_DAYS || 7);
const to = new Date().toISOString().slice(0, 10);
const stations = String(process.env.CONSUMPTION_INCREMENTAL_STATIONS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const selectedStations = stations.length ? stations : defaultStations;

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function rowDay(row) {
  return String(row.currentDate || row.readingDate || row.createDate || "").slice(0, 10);
}

async function postLive(pathname, payload) {
  if (!baseUrl) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
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

async function backfillStation(stationId, latestReadingDate) {
  const from = addDays(latestReadingDate || to, -lookbackDays);
  let pageNumber = 1;
  let fetched = 0;
  let kept = 0;
  let stored = 0;

  while (true) {
    const payload = {
      lang: "en",
      stationId,
      FROM: "2025-01-01",
      TO: to,
      pageNumber,
      pageSize,
    };
    const response = await postLive("/api/DailyDataMeter/read", payload);
    const rows = response?.result?.data || response?.data?.data || [];
    if (!rows.length) break;

    const wanted = rows.filter((row) => {
      const day = rowDay(row);
      return day >= from && day <= to;
    });
    fetched += rows.length;
    kept += wanted.length;

    if (wanted.length) {
      const result = await writeDailyMeterRows({
        pathname: "/api/DailyDataMeter/read",
        requestPayload: { stationId, FROM: from, TO: to },
        responsePayload: { code: 0, result: { total: wanted.length, data: wanted } },
      });
      stored += Number(result.stored || 0);
    }

    const days = rows.map(rowDay).filter(Boolean).sort();
    const minDay = days[0] || "";
    const maxDay = days[days.length - 1] || "";
    console.log(JSON.stringify({ stationId, pageNumber, rows: rows.length, kept: wanted.length, minDay, maxDay, from }));
    if (!maxDay || maxDay < from || rows.length < pageSize) break;
    pageNumber++;
  }

  return { stationId, from, to, pages: pageNumber, fetched, kept, stored };
}

(async () => {
  const before = await dailyMeterStationStats(selectedStations);
  if (!before.tableReady) throw new Error(before.error || "Supabase daily meter table is not ready");
  const latest = new Map(before.stations.map((station) => [station.station, station.latestReadingDate]));
  const summary = [];
  const failures = [];
  for (const stationId of selectedStations) {
    try {
      summary.push(await backfillStation(stationId, latest.get(stationId)));
    } catch (error) {
      failures.push({
        stationId,
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn(JSON.stringify({ stationId, failed: true, error: failures[failures.length - 1].error }));
    }
  }
  const after = await dailyMeterStationStats(selectedStations);
  console.log(JSON.stringify({ status: failures.length ? "incremental backfill partial" : "incremental backfill complete", summary, failures, before, after }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
