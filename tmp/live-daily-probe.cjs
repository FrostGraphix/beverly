"use strict";

const { loadEnvFile } = require("../tools/env-loader.cjs");

loadEnvFile();

const base = String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";

if (!base) {
  throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
}

async function readPage(stationId, pageNumber = 1, pageSize = 20) {
  const response = await fetch(`${base}/api/DailyDataMeter/read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      lang: "en",
      stationId,
      FROM: "2025-01-01",
      TO: new Date().toISOString().slice(0, 10),
      pageNumber,
      pageSize,
    }),
  });
  const body = await response.json().catch(() => ({}));
  const rows = body?.result?.data || body?.data?.data || [];
  return {
    status: response.status,
    total: Number(body?.result?.total ?? body?.data?.total ?? rows.length),
    rows,
  };
}

(async () => {
  const stationId = String(process.argv[2] || "TUNGA").toUpperCase();
  const first = await readPage(stationId, 1, 20);
  const lastPage = Math.max(1, Math.ceil(first.total / 20));
  const tail = await readPage(stationId, lastPage, 20);
  const key = (row) => `${String(row.stationId || stationId).toUpperCase()}|${String(row.meterId || row.customerId || "").toUpperCase()}|${String(row.currentDate || "").slice(0, 10)}`;
  console.log(JSON.stringify({
    stationId,
    total: first.total,
    firstPageDates: first.rows.map((row) => row.currentDate),
    lastPageDates: tail.rows.map((row) => row.currentDate),
    firstPageUniqueKeys: new Set(first.rows.map(key)).size,
    firstPageRowCount: first.rows.length,
    lastPageUniqueKeys: new Set(tail.rows.map(key)).size,
    lastPageRowCount: tail.rows.length,
  }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
