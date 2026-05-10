"use strict";

const { loadEnvFile } = require("../tools/env-loader.cjs");

loadEnvFile();

const base = String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";

if (!base) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");

(async () => {
  const stationId = String(process.argv[2] || "TUNGA").toUpperCase();
  const from = String(process.argv[3] || "2025-01-01");
  const to = String(process.argv[4] || from);
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
      FROM: from,
      TO: to,
      pageNumber: 1,
      pageSize: 20,
    }),
  });
  const body = await response.json().catch(() => ({}));
  const rows = body?.result?.data || body?.data?.data || [];
  console.log(JSON.stringify({
    stationId,
    from,
    to,
    status: response.status,
    total: Number(body?.result?.total ?? body?.data?.total ?? rows.length),
    sampleDates: rows.map((row) => row.currentDate).slice(0, 20),
  }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
