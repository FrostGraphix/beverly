"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");
const {
  fetchStationDataset,
  filterRowsByRange,
  numberArg,
  stringArg,
} = require("./consumption-live-dataset.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = process.env.SUPABASE_CONSUMPTION_STORE_ENABLED || "true";

const { writeDailyMeterRows, dailyMeterTableReport } = require("../backend/src/services/consumption-store");
const { stations } = require("../backend/src/services/refresh-targets");

const root = path.resolve(__dirname, "..");
const progressPath = path.join(root, "tmp", "consumption-backfill-progress.json");
const pageSize = numberArg("--page-size", Number(process.env.CONSUMPTION_BACKFILL_PAGE_SIZE || 500));
const maxPages = numberArg("--max-pages", Number(process.env.CONSUMPTION_BACKFILL_MAX_PAGES || 0));
const stationArg = stringArg("--station", "");
const force = process.argv.includes("--force");
const from = stringArg("--from", process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01");
const to = stringArg("--to", new Date().toISOString().slice(0, 10));
const timeoutMs = numberArg("--timeout-ms", Number(process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000));
const maxRetries = numberArg("--retries", Number(process.env.CONSUMPTION_BACKFILL_RETRIES || 4));
const selectedStations = stationArg
  ? stationArg.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
  : stations;

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(progressPath, "utf8"));
  } catch {
    return { stations: {} };
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
}

async function backfillStation(stationId, progress) {
  const state = force ? {} : (progress.stations[stationId] || {});
  if (state.complete) {
    console.log(JSON.stringify({ stationId, skipped: true, reason: "already complete" }));
    return;
  }
  const dataset = await fetchStationDataset(stationId, {
    from,
    to,
    pageSize,
    timeoutMs,
    maxRetries,
    onRetry: ({ payload, attempt, error, maxRetries: totalAttempts }) => {
      const delayMs = Math.min(15000, 1000 * attempt * attempt);
      console.warn(JSON.stringify({
        stationId: payload.stationId,
        pageNumber: payload.pageNumber,
        attempt,
        error,
        retryInMs: attempt < totalAttempts ? delayMs : 0,
      }));
    },
    onPage: ({ stationId: currentStation, pageNumber, rows, rawTotal }) => {
      console.log(JSON.stringify({
        stationId: currentStation,
        pageNumber,
        rows,
        rawTotal,
        mode: "full-station-crawl",
      }));
    },
  });
  const filteredRows = filterRowsByRange(dataset.uniqueRows, from, to);
  let storedRows = 0;
  let pagesThisRun = 0;

  for (let offset = 0; offset < filteredRows.length; offset += pageSize) {
    if (maxPages && pagesThisRun >= maxPages) break;
    const chunk = filteredRows.slice(offset, offset + pageSize);
    const requestPayload = {
      lang: "en",
      stationId,
      FROM: from,
      TO: to,
      pageNumber: pagesThisRun + 1,
      pageSize,
    };
    const responsePayload = {
      code: 0,
      result: {
        total: filteredRows.length,
        data: chunk,
      },
    };
    const stored = await writeDailyMeterRows({
      pathname: "/api/DailyDataMeter/read",
      requestPayload,
      responsePayload,
    });
    storedRows += Number(stored.stored || 0);
    pagesThisRun++;
  }

  const fetchedThrough = Math.min(filteredRows.length, pagesThisRun * pageSize);
  const complete = fetchedThrough >= filteredRows.length;
  progress.stations[stationId] = {
    stationId,
    from,
    to,
    pageSize,
    nextPage: pagesThisRun + 1,
    totalRows: filteredRows.length,
    storedRows,
    fetchedThrough,
    rawTotalRows: dataset.rawTotal,
    uniqueTotalRows: dataset.uniqueTotal,
    crawlPages: dataset.pagesFetched,
    sourceRangeTrusted: false,
    complete,
    updatedAt: new Date().toISOString(),
  };
  saveProgress(progress);

  console.log(JSON.stringify({
    stationId,
    rawTotalRows: dataset.rawTotal,
    uniqueTotalRows: dataset.uniqueTotal,
    filteredRows: filteredRows.length,
    storedRows,
    fetchedThrough,
    complete,
    mode: "client-filtered-backfill",
  }));
}

(async () => {
  const report = await dailyMeterTableReport();
  if (!report.tableReady) {
    throw new Error(`Supabase daily_meter_readings is not ready: ${report.error || "unknown error"}`);
  }

  const progress = loadProgress();
  for (const stationId of selectedStations) {
    await backfillStation(stationId, progress);
  }

  const finalReport = await dailyMeterTableReport();
  console.log(JSON.stringify({ status: "backfill run complete", report: finalReport }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
