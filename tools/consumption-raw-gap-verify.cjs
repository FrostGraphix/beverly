"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = "true";

const { dailyMeterStationStats } = require("../backend/src/services/consumption-store");
const { stations: defaultStations } = require("../backend/src/services/refresh-targets");

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const bearerToken = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
const today = new Date().toISOString().slice(0, 10);
const from = process.env.CONSUMPTION_VERIFY_FROM || process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01";
const to = process.env.CONSUMPTION_VERIFY_TO || today;
const selectedStations = String(process.env.CONSUMPTION_VERIFY_STATIONS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const stations = selectedStations.length ? selectedStations : defaultStations;

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
        throw new Error(`Live returned non-JSON ${response.status}: ${text.slice(0, 120)}`);
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
  const body = await postLive({ lang: "en", stationId, FROM: from, TO: to, pageNumber: 1, pageSize: 1 });
  return Number(body?.result?.total ?? body?.data?.total ?? 0);
}

(async () => {
  const stats = await dailyMeterStationStats(stations);
  if (!stats.tableReady) throw new Error(stats.error || "Supabase daily meter store is not ready");

  const rows = [];
  for (const station of stats.stations) {
    const liveTotal = await liveRawTotal(station.station);
    const logicalRawRows = Number(station.logicalRawRows || station.rows || 0);
    const delta = logicalRawRows - liveTotal;
    const fresh = station.latestReadingDate === to || station.latestReadingDate === today;
    rows.push({
      station: station.station,
      canonicalRows: Number(station.rows || 0),
      rawDuplicateRows: Number(station.rawDuplicateRows || 0),
      logicalRawRows,
      liveRawRows: liveTotal,
      delta,
      earliestReadingDate: station.earliestReadingDate,
      latestReadingDate: station.latestReadingDate,
      fresh,
    });
  }

  const drift = rows.filter((row) => row.delta !== 0);
  const stale = rows.filter((row) => !row.fresh);
  const report = {
    status: drift.length || stale.length ? "raw gap verification failed" : "raw gap verification passed",
    from,
    to,
    generatedAt: new Date().toISOString(),
    rows,
    drift,
    stale,
  };

  console.log(JSON.stringify(report, null, 2));
  if (drift.length || stale.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
