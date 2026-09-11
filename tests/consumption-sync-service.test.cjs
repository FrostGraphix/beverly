"use strict";

const assert = require("node:assert/strict");

process.env.SESSION_STORE_MODE = "supabase";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.LIVE_API_BASE_URL = "https://live.example.test";
process.env.LIVE_API_BEARER_TOKEN = "live-token";
process.env.CONSUMPTION_SYNC_LOOKBACK_DAYS = "0";
process.env.DATABASE_QUOTA_MB = "500";

const supabase = require("../backend/src/services/supabase-service");
const originalFetch = global.fetch;
const originalRestRequest = supabase.restRequest;
const originalRestRequestWithResponse = supabase.restRequestWithResponse;

const writes = [];
const liveCalls = [];
const rpcCalls = [];

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
    if (pathname === "/rpc/consumption_database_usage") return { megabytes: 300, bytes: 314572800 };
    return [];
  };

  supabase.restRequestWithResponse = async (pathname) => {
    rpcCalls.push(pathname);
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

  const { runConsumptionSync, stationAttemptsForMode, syncWindow } = require("../backend/src/services/consumption-sync-service");

  const incrementalWindow = syncWindow("incremental", { latestReadingDate: "2026-05-10" }, { to: "2026-05-12" });
  assert.equal(incrementalWindow.from, "2026-05-10");
  assert.equal(incrementalWindow.reason, "latest_reading");

  const backfillWindow = syncWindow("backfill", {}, { from: "2025-01-01", to: "2026-05-12" });
  assert.equal(backfillWindow.from, "2026-01-01");
  assert.equal(backfillWindow.reason, "hot_backfill");
  assert.equal(stationAttemptsForMode("backfill", {}), 3);
  const emptyWindow = syncWindow("incremental", {}, { from: "2025-01-01", to: "2026-05-12" });
  assert.equal(emptyWindow.from, "2026-01-01", "empty stations must bridge the retention month");
  assert.equal(emptyWindow.reason, "empty_station");

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
  assert(writes.some((write) => write.pathname === "/consumption_sync_runs"), "sync must record durable run starts");
  assert(writes.some((write) => write.pathname.includes("/consumption_sync_runs?id=eq.")), "sync must record durable run outcomes");
  assert(writes.some((write) => write.pathname.includes("/consumption_sync_station_state?on_conflict=station_id")), "sync must persist station cursors");
  assert(rpcCalls.includes("/rpc/refresh_meter_reading_aggregates_for_station"), "sync must refresh station aggregates");

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
  assert.equal(liveCalls[0].payload.FROM, "2026-01-01");
  assert.equal(backfill.storedRows, 2);
  assert.equal(backfill.partialStations, 1);
  assert.equal(backfill.ok, false, "partial syncs must not report completion");
  const partialRun = writes.find((write) => write.pathname.includes("/consumption_sync_runs?id=eq."));
  assert.equal(partialRun.options.body.status, "partial", "page-limited runs must stay partial");

  let failedOnce = false;
  global.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body || "{}"));
    liveCalls.push({ url, payload });
    if (!failedOnce) {
      failedOnce = true;
      throw new TypeError("fetch failed");
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          result: {
            total: 1,
            data: [{ stationId: payload.stationId, meterId: "M-9", customerId: "C-9", currentDate: payload.FROM, total1: 900 }],
          },
        };
      },
    };
  };
  const retried = await runConsumptionSync({
    mode: "backfill",
    stations: "KYAKALE",
    from: "2025-01-01",
    to: "2026-05-12",
    pageSize: 2,
    maxPages: 1,
    stationAttempts: 2,
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.syncedStations, 1);

  liveCalls.length = 0;
  writes.length = 0;
  global.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body || "{}"));
    liveCalls.push({ url, payload });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          result: {
            total: 4,
            data: [
              { stationId: payload.stationId, meterId: "M-OLD", currentDate: "2026-05-09", total1: 10 },
              { stationId: payload.stationId, meterId: "M-IN", currentDate: "2026-05-11", total1: 20 },
              { stationId: "TUNGA", meterId: "M-WRONG", currentDate: "2026-05-11", total1: 25 },
              { stationId: payload.stationId, meterId: "M-FUTURE", currentDate: "2026-05-13", total1: 30 },
            ],
          },
        };
      },
    };
  };
  const bounded = await runConsumptionSync({
    mode: "incremental",
    stations: "OFEMILI",
    from: "2026-05-10",
    to: "2026-05-12",
    pageSize: 4,
    maxPages: 1,
  });
  const readingWrite = writes.find((write) => write.pathname.includes("/daily_meter_readings?"));
  assert.equal(bounded.storedRows, 1, "sync must store only requested dates");
  assert.deepEqual(readingWrite.options.body.map((row) => row.reading_date), ["2026-05-11"]);

  liveCalls.length = 0;
  writes.length = 0;
  global.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body || "{}"));
    liveCalls.push({ url, payload });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          result: {
            total: 100,
            data: [
              { stationId: payload.stationId, meterId: "M-IN", currentDate: "2026-05-10", total1: 20 },
              { stationId: payload.stationId, meterId: "M-OLD-1", currentDate: "2026-05-09", total1: 10 },
              { stationId: payload.stationId, meterId: "M-OLD-2", currentDate: "2026-05-08", total1: 5 },
            ],
          },
        };
      },
    };
  };
  const cursorStopped = await runConsumptionSync({
    mode: "incremental",
    stations: "OFEMILI",
    from: "2026-05-10",
    to: "2026-05-12",
    pageSize: 3,
    maxPages: 4,
  });
  assert.equal(liveCalls.length, 1, "sync must stop after crossing its cursor");
  assert.equal(cursorStopped.stations[0].stopReason, "cursor_crossed");

  liveCalls.length = 0;
  writes.length = 0;
  supabase.restRequest = async (pathname, options = {}) => {
    writes.push({ pathname, options });
    if (pathname === "/rpc/consumption_database_usage") return { megabytes: 300, bytes: 314572800 };
    if (pathname === "/rpc/claim_consumption_sync_station") return "OFEMILI";
    return [];
  };
  global.fetch = async (url, init) => {
    const payload = JSON.parse(String(init.body || "{}"));
    liveCalls.push({ url, payload });
    if (url.endsWith("/api/station/read")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { code: 0, result: { data: [{ stationId: "TUNGA" }, { stationId: "OFEMILI" }] } };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          result: {
            total: 1,
            data: [{ stationId: payload.stationId, meterId: "M-CLAIMED", currentDate: "2026-05-11", total1: 40 }],
          },
        };
      },
    };
  };
  const claimed = await runConsumptionSync({
    mode: "incremental",
    from: "2026-05-10",
    to: "2026-05-12",
    pageSize: 10,
  });
  const meterCalls = liveCalls.filter((call) => call.url.endsWith("/api/DailyDataMeter/read"));
  assert.equal(claimed.stationCount, 1, "automatic runs must isolate one station");
  assert.deepEqual(meterCalls.map((call) => call.payload.stationId), ["OFEMILI"]);

  liveCalls.length = 0;
  await runConsumptionSync({
    mode: "incremental",
    stations: "OFEMILI",
    from: "2026-05-10",
    to: "2026-05-12",
    pageSize: 5000,
    maxPages: 1,
  });
  assert.equal(
    liveCalls.find((call) => call.url.endsWith("/api/DailyDataMeter/read")).payload.pageSize,
    500,
    "sync page sizes must remain bounded"
  );

  liveCalls.length = 0;
  writes.length = 0;
  supabase.restRequest = async (pathname, options = {}) => {
    writes.push({ pathname, options });
    if (pathname === "/rpc/consumption_database_usage") return { megabytes: 430, bytes: 450887680 };
    return [];
  };
  const quotaPaused = await runConsumptionSync({
    mode: "backfill",
    stations: "OFEMILI",
    from: "2025-01-01",
    to: "2026-05-12",
  });
  assert.equal(quotaPaused.quotaPaused, true, "backfills must pause above eighty-five percent");
  assert.equal(liveCalls.filter((call) => call.url.endsWith("/api/DailyDataMeter/read")).length, 0);
  assert(writes.some((write) => write.pathname === "/consumption_sync_runs" && write.options.body.status === "quota_paused"), "quota pauses must remain durable");

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
