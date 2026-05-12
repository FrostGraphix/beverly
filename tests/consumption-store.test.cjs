"use strict";

const assert = require("assert");

process.env.SESSION_STORE_MODE = "supabase";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

const supabase = require("../backend/src/services/supabase-service");
const store = require("../backend/src/services/consumption-store");

const requests = [];
const originalRestRequest = supabase.restRequest;
const originalRestRequestWithResponse = supabase.restRequestWithResponse;

(async () => {
  supabase.restRequest = async (pathname, options = {}) => {
    requests.push({ kind: "write", pathname, options });
    return [];
  };

  supabase.restRequestWithResponse = async (pathname, options = {}) => {
    requests.push({ kind: "read", pathname, options });
    if (pathname.includes("select=id")) {
      return {
        response: {
          headers: {
            get(name) {
              return String(name).toLowerCase() === "content-range" ? "0-0/12" : "";
            }
          }
        },
        body: [{ id: "row-1" }]
      };
    }
    if (pathname.includes("select=reading_date")) {
      return {
        response: {
          headers: {
            get() {
              return "";
            }
          }
        },
        body: [
          {
            reading_date: pathname.includes("order=reading_date.desc") ? "2026-05-09" : "2025-07-14"
          }
        ]
      };
    }
    if (pathname.includes("select=station_id")) {
      return {
        response: {
          headers: {
            get(name) {
              return String(name).toLowerCase() === "content-range" ? "0-1/2" : "";
            }
          }
        },
        body: [
          {
            station_id: "TUNGA",
            meter_id: "M-1",
            customer_id: "C-1",
            customer_name: "Ada",
            reading_date: "2026-05-06",
            total1: 110,
            remain1: 5
          },
          {
            station_id: "TUNGA",
            meter_id: "M-1",
            customer_id: "C-1",
            customer_name: "Ada",
            reading_date: "2026-05-07",
            total1: 115,
            remain1: 4
          }
        ]
      };
    }
    return {
      response: {
        headers: {
          get(name) {
            return String(name).toLowerCase() === "content-range" ? "0-0/1" : "";
          }
        }
      },
      body: [
        {
          row_json: {
            stationId: "TUNGA",
            meterId: "M-1",
            customerId: "C-1",
            currentDate: "2026-05-07",
            total1: 115
          }
        }
      ]
    };
  };

assert.strictEqual(store.storeEnabled(), true);

await store.writeDailyMeterRows({
  pathname: "/api/DailyDataMeter/read",
  requestPayload: { stationId: "TUNGA" },
  responsePayload: {
    code: 0,
    result: {
      total: 1,
      data: [
        {
          stationId: "TUNGA",
          meterId: "M-1",
          customerId: "C-1",
          customerName: "Ada",
          currentDate: "2026-05-07",
          total1: 115,
          remain1: 4
        }
      ]
    }
  }
});

const write = requests.find((request) => request.kind === "write");
assert(write.pathname.includes("/daily_meter_readings?on_conflict=station_id,meter_id,reading_date"));
assert.strictEqual(write.options.body[0].station_id, "TUNGA");
assert.strictEqual(write.options.body[0].meter_id, "M-1");
assert.strictEqual(write.options.body[0].reading_date, "2026-05-07");

const response = await store.readDailyMeterRows({
  pathname: "/api/DailyDataMeter/read",
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-07",
    TO: "2026-05-07",
    pageNumber: 1,
    pageSize: 20
  }
});

assert.strictEqual(response.status, 200);
assert.strictEqual(response.body._proxy.source, "supabase-consumption");
assert.strictEqual(response.body.result.total, 1);
assert.strictEqual(response.body.result.data[0].meterId, "M-1");
assert(requests.some((request) => request.kind === "read" && request.pathname.includes("reading_date=gte.2026-05-07")));

const report = await store.dailyMeterTableReport(["TUNGA"]);
assert.strictEqual(report.enabled, true);
assert.strictEqual(report.tableReady, true);
assert.strictEqual(report.totalRows, 12);
assert.strictEqual(report.stations[0].station, "TUNGA");

const stats = await store.dailyMeterStationStats(["TUNGA"]);
assert.strictEqual(stats.stations[0].earliestReadingDate, "2025-07-14");
assert.strictEqual(stats.stations[0].latestReadingDate, "2026-05-09");

const summary = await store.readDailyMeterSummary({
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-07",
    TO: "2026-05-07",
    BASELINE_FROM: "2026-05-06",
    granularity: "daily"
  }
});
assert.strictEqual(summary.status, 200);
assert.strictEqual(summary.body._proxy.source, "supabase-consumption-summary");
assert.strictEqual(summary.body.data.consumedKwh, 5);
assert.deepStrictEqual(summary.body.data.temporal.labels, ["2026-05-07"]);

supabase.restRequest = originalRestRequest;
supabase.restRequestWithResponse = originalRestRequestWithResponse;

  console.log(JSON.stringify({
    writes: requests.filter((request) => request.kind === "write").length,
    reads: requests.filter((request) => request.kind === "read").length,
    status: "consumption store passed"
  }, null, 2));
})().catch((error) => {
  supabase.restRequest = originalRestRequest;
  supabase.restRequestWithResponse = originalRestRequestWithResponse;
  throw error;
});
