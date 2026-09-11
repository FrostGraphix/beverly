"use strict";

const { loadEnvFile } = require("./env-loader.cjs");
const {
  filterRowsByRange,
  numberArg,
  pageRows,
  postLive,
  rowKey,
  stringArg,
} = require("./consumption-live-dataset.cjs");

loadEnvFile();

const supabase = require("../backend/src/services/supabase-service");
const { dailyMeterArchiveRecord } = require("../backend/src/services/consumption-store");
const {
  BUCKET,
  archivePartition,
  archiveProvidedRows,
  resolveOemForStation,
} = require("../backend/src/services/reading-archive-service");
const { syncWindow } = require("../backend/src/services/consumption-sync-service");

function previousDay(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const stationId = stringArg("--station", "").trim().toUpperCase();
if (!stationId || stationId.includes(",")) throw new Error("Exactly one --station is required");

const today = new Date().toISOString().slice(0, 10);
const hotFrom = syncWindow("backfill", {}, { to: today }).from;
const maximumColdTo = previousDay(hotFrom);
const from = stringArg("--from", process.env.CONSUMPTION_ARCHIVE_FROM || "2025-01-01");
const requestedTo = stringArg("--to", maximumColdTo);
const to = requestedTo < maximumColdTo ? requestedTo : maximumColdTo;
const pageSize = Math.min(500, Math.max(1, numberArg("--page-size", 500)));
const maxPages = numberArg("--max-pages", 0);
const timeoutMs = numberArg("--timeout-ms", Number(process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000));
const maxRetries = numberArg("--retries", Number(process.env.CONSUMPTION_BACKFILL_RETRIES || 4));

if (from > to) throw new Error(`No complete cold months exist between ${from} and ${to}`);

async function fetchColdRows() {
  const unique = new Map();
  let pageNumber = 1;
  let rawTotal = 0;
  let complete = false;

  while (!complete) {
    if (maxPages && pageNumber > maxPages) {
      throw new Error(`Cold archive stopped before completing ${stationId}`);
    }
    const payload = { lang: "en", stationId, FROM: from, TO: to, pageNumber, pageSize };
    const response = await postLive("/api/DailyDataMeter/read", payload, { timeoutMs, maxRetries });
    const rows = pageRows(response);
    rawTotal = Number(response?.result?.total ?? response?.data?.total ?? rawTotal) || rawTotal;
    for (const row of filterRowsByRange(rows, from, to, stationId)) {
      const record = dailyMeterArchiveRecord(row, stationId);
      if (record) unique.set(rowKey(stationId, row), record);
    }
    complete = rows.length === 0 || rows.length < pageSize || (rawTotal > 0 && pageNumber * pageSize >= rawTotal);
    pageNumber += 1;
  }
  return Array.from(unique.values());
}

function groupedByMonth(rows) {
  const groups = new Map();
  for (const row of rows) {
    const month = `${String(row.reading_date).slice(0, 7)}-01`;
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(row);
  }
  return groups;
}

(async () => {
  if (!supabase.serviceConfigured()) throw new Error("Supabase service role is required");
  if (!supabase.storageEnabled()) throw new Error("Supabase archive storage is required");
  await supabase.ensureStorageBuckets([BUCKET]);

  const rows = await fetchColdRows();
  const groups = groupedByMonth(rows);
  const oem = await resolveOemForStation(stationId);
  const archived = [];
  for (const [periodStart, monthRows] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    archived.push(await archiveProvidedRows({ stationId, periodStart, rows: monthRows, reportType: "readings", oem }));
  }

  const years = [...new Set([...groups.keys()].map((month) => month.slice(0, 4)))];
  for (const year of years) {
    await archivePartition({ stationId, periodStart: `${year}-01-01`, reportType: "readings", granularity: "yearly" });
  }

  console.log(JSON.stringify({
    ok: true,
    stationId,
    from,
    to,
    sourceRows: rows.length,
    archivedMonths: archived.length,
    archived,
  }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
