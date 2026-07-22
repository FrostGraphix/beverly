"use strict";

const { loadEnvFile } = require("./env-loader.cjs");
const { pageRows, postLive } = require("./consumption-live-dataset.cjs");

loadEnvFile();

const supabase = require("../backend/src/services/supabase-service");
const { syncAccountRows, syncTariffRows } = require("../backend/src/services/tariff-snapshot-service");
const { stations } = require("../backend/src/services/refresh-targets");

function monthRanges(from, to) {
  const ranges = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    const start = cursor.toISOString().slice(0, 10);
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const rangeEnd = new Date(Math.min(end.getTime(), next.getTime() - 86400000)).toISOString().slice(0, 10);
    ranges.push({ from: start, to: rangeEnd });
    cursor.setUTCFullYear(next.getUTCFullYear(), next.getUTCMonth(), 1);
  }
  return ranges;
}

async function readAll(pathname, pageSize = 500) {
  const rows = [];
  for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
    const payload = await postLive(pathname, { lang: "en", pageNumber, pageSize });
    const page = pageRows(payload);
    rows.push(...page);
    const total = Number(payload?.result?.total ?? payload?.data?.total ?? rows.length);
    if (!page.length || rows.length >= total || page.length < pageSize) break;
  }
  return rows;
}

async function runBackfill() {
  if (!supabase.serviceConfigured()) throw new Error("Supabase service role is not configured");
  const observedAt = new Date();
  const [accounts, tariffs] = await Promise.all([
    readAll("/api/account/read"),
    readAll("/api/tariff/read")
  ]);
  const accountResult = await syncAccountRows(accounts, { observedAt });
  const tariffResult = await syncTariffRows(tariffs, { observedAt });
  const refreshed = [];
  const ranges = monthRanges(process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01", new Date().toISOString().slice(0, 10));
  for (const stationId of stations) {
    for (const range of ranges) {
      console.log(JSON.stringify({ stage: "valuation", stationId, ...range }));
      await supabase.restRequest("/rpc/refresh_consumption_tariff_values_for_range", {
        method: "POST",
        body: { p_station_id: stationId, p_from: range.from, p_to: range.to }
      });
    }
    refreshed.push(stationId);
    console.log(JSON.stringify({ stage: "refreshed", stationId }));
  }
  return {
    accounts: accountResult.history,
    tariffs: tariffResult.history,
    refreshed
  };
}

if (require.main === module) {
  runBackfill()
    .then((result) => console.log(JSON.stringify({ ok: true, ...result })))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      process.exitCode = 1;
    });
}

module.exports = { monthRanges, readAll, runBackfill };
