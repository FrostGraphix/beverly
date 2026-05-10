"use strict";

const { loadEnvFile } = require("./env-loader.cjs");
const {
  fetchStationDataset,
  filterRowsByRange,
  numberArg,
  stringArg,
} = require("./consumption-live-dataset.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = process.env.SUPABASE_CONSUMPTION_STORE_ENABLED || "true";

const { writeDailyMeterRows } = require("../backend/src/services/consumption-store");
const { stations } = require("../backend/src/services/refresh-targets");

const pageSize = numberArg("--page-size", Number(process.env.CONSUMPTION_BACKFILL_PAGE_SIZE || 500));
const timeoutMs = numberArg("--timeout-ms", Number(process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000));
const maxRetries = numberArg("--retries", Number(process.env.CONSUMPTION_BACKFILL_RETRIES || 4));
const stationArg = stringArg("--station", "");
const from = stringArg("--from", process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01");
const to = stringArg("--to", new Date().toISOString().slice(0, 10));
const windowDays = numberArg("--window-days", 31);
const selectedStations = stationArg
  ? stationArg.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
  : stations;

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function minDay(left, right) {
  return left <= right ? left : right;
}

function windowsBetween(start, end, spanDays) {
  const windows = [];
  let cursor = start;
  while (cursor <= end) {
    const windowEnd = minDay(addDays(cursor, spanDays - 1), end);
    windows.push({ from: cursor, to: windowEnd });
    cursor = addDays(windowEnd, 1);
  }
  return windows;
}

async function backfillWindow(stationId, dataset, range) {
  const filteredRows = filterRowsByRange(dataset.uniqueRows, range.from, range.to);
  let storedRows = 0;
  let pageNumber = 1;
  for (let offset = 0; offset < filteredRows.length; offset += pageSize) {
    const chunk = filteredRows.slice(offset, offset + pageSize);
    const payload = {
      lang: "en",
      stationId,
      FROM: range.from,
      TO: range.to,
      pageNumber,
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
      requestPayload: payload,
      responsePayload,
    });
    storedRows += Number(stored.stored || 0);
    console.log(JSON.stringify({
      stationId,
      from: range.from,
      to: range.to,
      pageNumber,
      rows: chunk.length,
      stored: stored.stored,
      totalRows: filteredRows.length,
      mode: "client-filtered-window",
    }));
    pageNumber++;
  }
  return { totalRows: filteredRows.length, storedRows };
}

(async () => {
  const ranges = windowsBetween(from, to, windowDays);
  for (const stationId of selectedStations) {
    const dataset = await fetchStationDataset(stationId, {
      from,
      to,
      pageSize,
      timeoutMs,
      maxRetries,
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
    for (const range of ranges) {
      await backfillWindow(stationId, dataset, range);
    }
  }
  console.log(JSON.stringify({ status: "windowed backfill complete", stations: selectedStations, windows: ranges.length }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
