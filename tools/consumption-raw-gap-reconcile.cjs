"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = "true";

const supabase = require("../backend/src/services/supabase-service");
const {
  dailyMeterStationStats,
  writeRawDuplicateRows,
} = require("../backend/src/services/consumption-store");
const { stations: defaultStations } = require("../backend/src/services/refresh-targets");

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const bearerToken = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
const pageSize = Number(process.env.CONSUMPTION_RAW_PAGE_SIZE || 500);
const from = process.env.CONSUMPTION_VERIFY_FROM || process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01";
const to = process.env.CONSUMPTION_VERIFY_TO || new Date().toISOString().slice(0, 10);
const selectedStations = String(process.env.CONSUMPTION_RAW_STATIONS || process.env.CONSUMPTION_VERIFY_STATIONS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const stations = selectedStations.length ? selectedStations : defaultStations;

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

async function livePage(stationId, pageNumber) {
  const body = await postLive({ lang: "en", stationId, FROM: from, TO: to, pageNumber, pageSize });
  return {
    total: Number(body?.result?.total ?? body?.data?.total ?? 0),
    rows: body?.result?.data || body?.data?.data || [],
  };
}

async function clearStationRaw(stationId) {
  await supabase.restRequest(`/daily_meter_raw_duplicates?station_id=eq.${encodeURIComponent(stationId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

async function collectRawExtras(stationId, targetGap) {
  if (targetGap <= 0) return { liveTotal: 0, extras: [] };
  const extras = [];
  let pageNumber = 1;
  let liveTotal = 0;
  while (extras.length < targetGap) {
    const page = await livePage(stationId, pageNumber);
    liveTotal = page.total;
    if (!page.rows.length) break;
    page.rows.forEach((row, index) => {
      if (extras.length >= targetGap) return;
      extras.push({
        row,
        duplicateIndex: extras.length + 1,
        eventType: "raw-gap",
        sourcePage: pageNumber,
        sourceRow: index + 1,
      });
    });
    if (page.rows.length < pageSize) break;
    pageNumber++;
  }

  return { liveTotal, extras };
}

(async () => {
  const before = await dailyMeterStationStats(stations);
  if (!before.tableReady) throw new Error(before.error || "Supabase daily meter table is not ready");
  const summary = [];

  for (const station of before.stations) {
    const firstPage = await livePage(station.station, 1);
    const targetGap = Math.max(0, firstPage.total - Number(station.rows || 0));
    await clearStationRaw(station.station);
    const { extras } = await collectRawExtras(station.station, targetGap);
    const stored = extras.length
      ? await writeRawDuplicateRows({
        requestPayload: { stationId: station.station, FROM: from, TO: to },
        duplicateRows: extras,
      })
      : { stored: 0 };
    summary.push({
      station: station.station,
      canonicalRows: Number(station.rows || 0),
      liveRawRows: firstPage.total,
      targetGap,
      storedRawExtras: Number(stored.stored || 0),
    });
  }

  const after = await dailyMeterStationStats(stations);
  console.log(JSON.stringify({
    status: "raw gap reconciliation complete",
    from,
    to,
    summary,
    after,
  }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
