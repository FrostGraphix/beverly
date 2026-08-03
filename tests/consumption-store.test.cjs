"use strict";

const assert = require("assert");

process.env.SESSION_STORE_MODE = "supabase";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

const supabase = require("../backend/src/services/supabase-service");
const store = require("../backend/src/services/consumption-store");

const requests = [];
let forceRawAnalytics = false;
let forceRpcAnalytics = false;
const originalRestRequest = supabase.restRequest;
const originalRestRequestWithResponse = supabase.restRequestWithResponse;

(async () => {
  supabase.restRequest = async (pathname, options = {}) => {
    requests.push({ kind: "write", pathname, options });
    return [];
  };

  supabase.restRequestWithResponse = async (pathname, options = {}) => {
    requests.push({ kind: "read", pathname, options });
    if (forceRpcAnalytics && pathname === "/rpc/get_station_consumption_analytics") {
      return {
        response: { headers: { get: () => "" } },
        body: {
          sourceRows: 2,
          customerCount: 1,
          valuation: { valueNgn: 7000, pricedKwh: 20, unpricedKwh: 0, totalKwh: 20, coveragePct: 100, complete: true, basis: "historical-snapshot" },
          stations: [{ station_id: "TUNGA", total_kwh: 20, prior_kwh: 10, meter_count: 1, customer_count: 1, active_meter_count: 1, reading_count: 2 }],
          temporal: [{ station_id: "TUNGA", period_start: "2026-05-07", kwh_total: 20 }],
          tariffBreakdown: [{ tariff_id: "RESIDENTIAL", total_kwh: 20 }],
          topMeters: [{ station_id: "TUNGA", meter_id: "M-1", customer_id: "C-1", customer_name: "Ada", tariff_id: "RESIDENTIAL", total_kwh: 20, active_periods: 2 }],
          rollups: [{ station_id: "TUNGA", latest_odometer_kwh: 115, meters_with_latest: 1, latest_reading: "2026-05-07" }]
        }
      };
    }
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
    if (pathname.startsWith("/meter_consumption_aggregates")) {
      if (forceRawAnalytics) {
        return {
          response: { headers: { get: () => "*/0" } },
          body: []
        };
      }
      if (pathname.includes("period_start=gte.2026-05-25")) {
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
              period_type: "day",
              period_start: "2026-05-26",
              kwh_total: 8,
              reading_count: 1
            },
            {
              station_id: "TUNGA",
              meter_id: "M-1",
              customer_id: "C-1",
              customer_name: "Ada",
              period_type: "day",
              period_start: "2026-06-03",
              kwh_total: 12,
              reading_count: 1
            }
          ]
        };
      }
      if (pathname.includes("period_type=eq.month")) {
        const includesExactWindow = pathname.includes("period_start=gte.2026-05-01");
        return {
          response: {
            headers: {
              get(name) {
                return String(name).toLowerCase() === "content-range" ? (includesExactWindow ? "0-1/2" : "0-2/3") : "";
              }
            }
          },
          body: (includesExactWindow ? [] : [
            {
              station_id: "TUNGA",
              meter_id: "M-1",
              customer_id: "C-1",
              customer_name: "Ada",
              period_type: "month",
              period_start: "2026-04-01",
              kwh_total: 700,
              reading_count: 30
            }
          ]).concat([
            {
              station_id: "TUNGA",
              meter_id: "M-1",
              customer_id: "C-1",
              customer_name: "Ada",
              period_type: "month",
              period_start: "2026-05-01",
              kwh_total: 800,
              reading_count: 31
            },
            {
              station_id: "TUNGA",
              meter_id: "M-1",
              customer_id: "C-1",
              customer_name: "Ada",
              period_type: "month",
              period_start: "2026-06-01",
              kwh_total: 900,
              reading_count: 30
            }
          ])
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
            station_id: "TUNGA",
            meter_id: "M-1",
            customer_id: "C-1",
            customer_name: "Ada",
            period_type: "day",
            period_start: "2026-05-07",
            kwh_total: 5,
            reading_count: 1
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
// readDailyMeterRows no longer selects row_json in any mode. It used to, for
// non-compact reads, but the nightly retention job blanks row_json after 7
// days, so those reads returned zero rows for ~89% of the table and silently
// fell through to the upstream proxy. Both modes now project the persisted
// scalar columns, which are populated for every row regardless of age — so
// this read resolves against the same two-row fixture the compact path uses.
assert.strictEqual(response.body.result.total, 2);
assert.strictEqual(response.body.result.data[0].meterId, "M-1");
assert(requests.some((request) => request.kind === "read" && request.pathname.includes("reading_date=gte.2026-05-07")));
// Regression guard: no read path may request row_json again.
assert(
  !requests.some((request) => request.kind === "read" && request.pathname.includes("select=row_json")),
  "readDailyMeterRows must not select row_json — the column is retention-blanked and being retired"
);

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
assert.strictEqual(summary.body._proxy.source, "supabase-consumption-summary-agg");
assert.strictEqual(summary.body.data.consumedKwh, 5);
assert.deepStrictEqual(summary.body.data.temporal.labels, ["2026-05-07"]);

requests.length = 0;
const partialMonthlyAnalytics = await store.readStationConsumptionAnalytics({
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-25",
    TO: "2026-06-21",
    granularity: "monthly",
    topMeters: 10
  }
});
assert.strictEqual(partialMonthlyAnalytics.status, 200);
assert.strictEqual(partialMonthlyAnalytics.body.data.range.granularity, "monthly");
assert.deepStrictEqual(partialMonthlyAnalytics.body.data.temporal.labels, ["2026-05", "2026-06"]);
assert.strictEqual(partialMonthlyAnalytics.body.data.totals.consumedKwh, 20);
assert(requests.some((request) => request.kind === "read" && request.pathname.includes("period_type=eq.day")));
assert(!requests.some((request) => request.kind === "read" && request.pathname.includes("period_type=eq.month")));

requests.length = 0;
const exactMonthlyAnalytics = await store.readStationConsumptionAnalytics({
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-01",
    TO: "2026-06-30",
    granularity: "monthly",
    topMeters: 10
  }
});
assert.strictEqual(exactMonthlyAnalytics.status, 200);
assert.deepStrictEqual(exactMonthlyAnalytics.body.data.temporal.labels, ["2026-05", "2026-06"]);
assert.strictEqual(exactMonthlyAnalytics.body.data.totals.consumedKwh, 1700);
assert(requests.some((request) => request.kind === "read" && request.pathname.includes("period_type=eq.month")));
assert(requests.some((request) => request.kind === "read" && request.pathname.includes("period_start=gte.2026-05-01")));
assert(!requests.some((request) => request.kind === "read" && request.pathname.includes("period_start=gte.2026-03-31")));

requests.length = 0;
forceRawAnalytics = true;
const rawAnalytics = await store.readStationConsumptionAnalytics({
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-06",
    TO: "2026-05-07",
    granularity: "daily"
  }
});
assert.strictEqual(rawAnalytics.status, 200);
assert(requests.some((request) => request.options?.headers?.Prefer === "count=planned"));
assert(!requests.some((request) => request.options?.headers?.Prefer === "count=exact"));

requests.length = 0;
forceRawAnalytics = false;
forceRpcAnalytics = true;
const rpcAnalytics = await store.readStationConsumptionAnalytics({
  requestPayload: {
    stationId: "TUNGA",
    FROM: "2026-05-06",
    TO: "2026-05-07",
    granularity: "daily"
  }
});
assert.strictEqual(rpcAnalytics.status, 200);
assert.strictEqual(rpcAnalytics.body._proxy.source, "supabase-station-analytics-rpc");
assert.strictEqual(rpcAnalytics.body.data.totals.consumedKwh, 20);
assert.strictEqual(rpcAnalytics.body.data.totals.customerCount, 1);
assert.deepStrictEqual(rpcAnalytics.body.data.valuation, { valueNgn: 7000, pricedKwh: 20, unpricedKwh: 0, totalKwh: 20, coveragePct: 100, complete: true, basis: "historical-snapshot" });
assert.deepStrictEqual(rpcAnalytics.body.data.tariffBreakdown, [{ tariffId: "RESIDENTIAL", totalKwh: 20 }]);
assert.strictEqual(rpcAnalytics.body.data.topMeters[0].tariffId, "RESIDENTIAL");
assert.deepStrictEqual(rpcAnalytics.body.data.temporal.labels, ["2026-05-07"]);
assert(requests.some((request) => request.pathname === "/rpc/get_station_consumption_analytics"));

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
