"use strict";

const assert = require("node:assert/strict");

process.env.SESSION_STORE_MODE = "supabase";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.LIVE_API_BASE_URL = "https://live.example.test";
process.env.LIVE_API_BEARER_TOKEN = "live-token";
process.env.CONSUMPTION_SYNC_LOOKBACK_DAYS = "0";

const supabase = require("../backend/src/services/supabase-service");
const originalFetch = global.fetch;
const originalRestRequest = supabase.restRequest;
const originalRestRequestWithResponse = supabase.restRequestWithResponse;

const writes = [];
const liveCalls = [];

function responseWithCount(total, body = [{ id: "row" }]) {
  return {
    response: {
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-range" ? `0-0/${total}` : "";
        },
      },
    },
    body,
  };
}

(async () => {
  supabase.restRequest = async (pathname, options = {}) => {
    writes.push({ pathname, options });
    return [];
  };

  supabase.restRequestWithResponse = async (pathname) => {
    if (pathname.includes("select=id")) return responseWithCount(2);
    if (pathname.includes("order=reading_date.asc")) return responseWithCount(1, [{ reading_date: "2026-05-01" }]);
    if (pathname.includes("order=reading_date.desc")) return responseWithCount(1, [{ reading_date: "2026-05-10" }]);
    return responseWithCount(0, []);
  };

  global.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body || "{}"));
    liveCalls.push({ url, payload });
    assert.equal(url, "https://live.example.test/api/DailyDataMeter/read");
    assert.equal(init.headers.Authorization, "Bearer live-token");
    const pageRows = payload.pageNumber === 1
      ? [
          { stationId: payload.stationId, meterId: "M-1", customerId: "C-1", currentDate: payload.FROM, total1: 100 },
          { stationId: payload.stationId, meterId: "M-2", customerId: "C-2", currentDate: payload.FROM, total1: 200 },
        ]
      : [
          { stationId: payload.stationId, meterId: "M-3", customerId: "C-3", currentDate: payload.TO, total1: 300 },
        ];
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          result: {
            total: 3,
            data: pageRows,
          },
        };
      },
    };
  };

  const { runConsumptionSync, syncWindow } = require("../backend/src/services/consumption-sync-service");

  const incrementalWindow = syncWindow("incremental", { latestReadingDate: "2026-05-10" }, { to: "2026-05-12" });
  assert.equal(incrementalWindow.from, "2026-05-10");
  assert.equal(incrementalWindow.reason, "latest_reading");

  const backfillWindow = syncWindow("backfill", {}, { from: "2025-01-01", to: "2026-05-12" });
  assert.equal(backfillWindow.from, "2025-01-01");
  assert.equal(backfillWindow.reason, "full_backfill");

  const incremental = await runConsumptionSync({
    mode: "incremental",
    stations: "TUNGA",
    to: "2026-05-12",
    pageSize: 2,
    maxPages: 4,
  });
  assert.equal(incremental.ok, true);
  assert.equal(incremental.mode, "incremental");
  assert.equal(incremental.storedRows, 3);
  assert.equal(liveCalls[0].payload.FROM, "2026-05-10");
  assert.equal(liveCalls[0].payload.TO, "2026-05-12");
  assert(writes.some((write) => write.pathname.includes("/daily_meter_readings?on_conflict=station_id,meter_id,reading_date")));

  liveCalls.length = 0;
  writes.length = 0;
  const backfill = await runConsumptionSync({
    mode: "backfill",
    stations: "TUNGA",
    from: "2025-01-01",
    to: "2026-05-12",
    pageSize: 2,
    maxPages: 1,
  });
  assert.equal(backfill.mode, "backfill");
  assert.equal(liveCalls[0].payload.FROM, "2025-01-01");
  assert.equal(backfill.storedRows, 2);

  console.log(JSON.stringify({
    status: "consumption sync service passed",
    incrementalRows: incremental.storedRows,
    backfillRows: backfill.storedRows,
  }, null, 2));
})().finally(() => {
  global.fetch = originalFetch;
  supabase.restRequest = originalRestRequest;
  supabase.restRequestWithResponse = originalRestRequestWithResponse;
});
