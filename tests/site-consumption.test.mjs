import assert from "node:assert";
import {
  DAILY_METER_MAX_ROWS,
  DAILY_METER_PAGE_SIZE,
  SITE_CONSUMPTION_FIRST_DATA_DATE,
  fetchDailyMeterData,
  loadConsumptionData,
  periodRange,
  resolveFirstDataDate,
} from "../src/services/consumption-service.mjs";
import {
  buildConsumptionStationComparison,
  buildConsumptionTemporalSeries,
  buildMeterDeltaMap,
  splitRevenueGap,
  summarizeDeltaMap,
} from "../src/services/consumption-aggregator.mjs";

function jsonResponse(body) {
  return {
    ok: true,
    json: async () => body,
  };
}

const tokenRows = [
  {
    stationId: "TUNGA",
    customerId: "C-1",
    meterId: "M-1",
    customerName: "Ada",
    tariffId: "RESIDENTIAL",
    totalUnit: 10,
    totalPaid: 3500,
    createDate: "2026-05-02",
    vend: true,
  }
];

const priorTokenRows = [
  {
    stationId: "TUNGA",
    customerId: "C-1",
    meterId: "M-1",
    customerName: "Ada",
    tariffId: "RESIDENTIAL",
    totalUnit: 8,
    totalPaid: 2800,
    createDate: "2026-04-30",
    vend: true,
  }
];

const dailyRows = [
  { stationId: "TUNGA", meterId: "M-1", customerId: "C-1", currentDate: "2026-05-01", total1: 100, remain1: 15 },
  { stationId: "TUNGA", meterId: "M-1", customerId: "C-1", currentDate: "2026-05-02", total1: 105, remain1: 10 },
  { stationId: "TUNGA", meterId: "M-2", customerId: "C-2", currentDate: "2026-05-01", total1: 50, remain1: 8 },
  { stationId: "TUNGA", meterId: "M-2", customerId: "C-2", currentDate: "2026-05-02", total1: 57, remain1: 3 },
];

const tariffRows = [
  { tariffId: "RESIDENTIAL", price: 350, tax: 0 },
];

const accountRows = [
  { customerId: "C-1", customerName: "Ada", meterId: "M-1", tariffId: "RESIDENTIAL", stationId: "TUNGA" },
];

const deltaMap = buildMeterDeltaMap(dailyRows);
const summary = summarizeDeltaMap(deltaMap);
assert.strictEqual(summary.consumedKwh, 12);
assert.strictEqual(summary.meterCount, 2);

const consumptionSeries = buildConsumptionTemporalSeries(deltaMap, "daily");
assert.deepStrictEqual(consumptionSeries.labels, ["2026-05-01", "2026-05-02"]);
assert.deepStrictEqual(consumptionSeries.kwhSeries, [0, 12]);

const stationComparison = buildConsumptionStationComparison(new Map([["TUNGA", deltaMap]]));
assert.strictEqual(stationComparison[0].totalKwh, 12);
assert.strictEqual(stationComparison[0].meterBreakdown[0].meterId, "M-2");

const baseDate = new Date("2026-05-07T12:00:00");
assert.deepStrictEqual(periodRange("all", baseDate), {
  from: SITE_CONSUMPTION_FIRST_DATA_DATE,
  to: "2026-05-07",
  granularity: "monthly",
});
assert.deepStrictEqual(periodRange("day", baseDate), {
  from: "2026-05-07",
  to: "2026-05-07",
  granularity: "daily",
});
assert.deepStrictEqual(periodRange("month", baseDate), {
  from: "2026-05-01",
  to: "2026-05-07",
  granularity: "daily",
});
assert.deepStrictEqual(periodRange("year", baseDate), {
  from: "2026-01-01",
  to: "2026-05-07",
  granularity: "monthly",
});
assert.strictEqual(DAILY_METER_PAGE_SIZE, 1000);
assert.strictEqual(DAILY_METER_MAX_ROWS, 0);
assert.strictEqual(
  resolveFirstDataDate(tokenRows, new Map([["TUNGA", dailyRows]]), SITE_CONSUMPTION_FIRST_DATA_DATE),
  "2026-05-01"
);

assert.deepStrictEqual(splitRevenueGap(-1750), {
  netGap: -1750,
  shortfallGap: 0,
  creditGap: 1750,
});

const originalFetch = global.fetch;
const calls = [];

global.fetch = async (path, options = {}) => {
  const payload = JSON.parse(options.body || "{}");
  calls.push({ path, payload });

  if (path === "/api/token/creditTokenRecord/read") {
    const isPrior = payload.FROM === "2026-04-29";
    return jsonResponse({
      code: 0,
      result: {
        total: 1,
        data: isPrior ? priorTokenRows : tokenRows,
      },
    });
  }

  if (path === "/api/tariff/read") {
    return jsonResponse({
      code: 0,
      result: {
        total: 1,
        data: tariffRows,
      },
    });
  }

  if (path === "/api/DailyDataMeter/read") {
    assert.strictEqual(payload.compact, true);
    return jsonResponse({
      code: 0,
      result: {
        total: dailyRows.length,
        data: dailyRows,
      },
    });
  }

  if (path === "/api/local/consumption/summary") {
    if (payload.FROM === "2026-05-01") assert.strictEqual(payload.BASELINE_FROM, "2026-04-30");
    return jsonResponse({
      code: 0,
      data: {
        consumedKwh: 12,
        stationBar: [{ station: "TUNGA", totalKwh: 12, meterCount: 2, meterBreakdown: [] }],
        temporal: { labels: ["2026-05-01", "2026-05-02"], kwhSeries: [0, 12] },
        meta: { meterCount: 2, metersWithConsumption: 2, readingDayCount: 4 },
      },
    });
  }

  if (path === "/api/account/read") {
    return jsonResponse({
      code: 0,
      result: {
        total: accountRows.length,
        data: accountRows,
      },
    });
  }

  throw new Error(`Unexpected path ${path}`);
};

const progressValues = [];
let salesKpi = null;
let consumptionKpi = null;
let chartsPayload = null;
let ledgerPayload = null;

await loadConsumptionData(
  {
    stationId: "TUNGA",
    from: "2026-05-01",
    to: "2026-05-02",
    granularity: "daily",
  },
  {
    onKpiReady(value) {
      salesKpi = value;
    },
    onConsumptionReady(value) {
      consumptionKpi = value;
    },
    onChartsReady(value) {
      chartsPayload = value;
    },
    onLedgerProgress(loaded) {
      progressValues.push(loaded);
    },
    onLedgerReady(value) {
      ledgerPayload = value;
    },
    onError(error) {
      throw error;
    },
  }
);

assert.strictEqual(salesKpi.purchasedKwh, 10);
assert.strictEqual(salesKpi.totalRevenue, 3500);
assert.strictEqual(salesKpi.priorPurchasedKwh, 8);
assert.strictEqual(consumptionKpi.consumedKwh, 12);
assert.strictEqual(consumptionKpi.avgDailyConsumedKwh, 6);
assert.strictEqual(chartsPayload.sales.stationBar[0].totalKwh, 10);
assert.strictEqual(chartsPayload.consumption.stationBar[0].totalKwh, 12);
assert(
  calls.every((call) => call.path !== "/api/DailyDataMeter/read" || call.payload.pageSize <= DAILY_METER_PAGE_SIZE),
  "Daily meter reads must use bounded page sizes"
);
assert(
  calls.some((call) => call.path === "/api/DailyDataMeter/read" && call.payload.FROM === "2026-04-30"),
  "Daily meter reads must include a baseline day before the selected period"
);
assert(
  calls.some((call) => call.path === "/api/local/consumption/summary"),
  "Site consumption must read Supabase summary first"
);
assert.deepStrictEqual(progressValues, [1, 2]);
assert.strictEqual(ledgerPayload.ledger.length, 1);
assert.strictEqual(ledgerPayload.kpiUpdate.creditBalance, 1750);
assert.strictEqual(ledgerPayload.kpiUpdate.revenueShortfall, 0);
assert.strictEqual(ledgerPayload.kpiUpdate.matchedMeters, 1);
assert.strictEqual(ledgerPayload.kpiUpdate.unmatchedMeters, 1);
assert.strictEqual(ledgerPayload.accountCounts.TUNGA, 1);
assert.strictEqual(calls.filter((call) => call.path === "/api/token/creditTokenRecord/read").length, 2);

calls.length = 0;
await loadConsumptionData(
  {
    stationId: "TUNGA",
    from: SITE_CONSUMPTION_FIRST_DATA_DATE,
    to: "2026-05-02",
    granularity: "monthly",
  },
  {
    onKpiReady() {},
    onConsumptionReady() {},
    onChartsReady() {},
    onLedgerProgress() {},
    onLedgerReady() {},
    onError(error) {
      throw error;
    },
  }
);

assert.strictEqual(
  calls.filter((call) => call.path === "/api/token/creditTokenRecord/read").length,
  1,
  "All Data default should skip wasteful prior-period token fetch"
);

global.fetch = originalFetch;

global.fetch = async (path, options = {}) => {
  const payload = JSON.parse(options.body || "{}");
  calls.push({ path, payload });
  if (path !== "/api/DailyDataMeter/read") throw new Error(`Unexpected partial path ${path}`);
  if (payload.pageNumber === 1) {
    return jsonResponse({
      code: 0,
      result: {
        total: 2000,
        data: dailyRows.slice(0, 2),
      },
    });
  }
  const error = new Error("signal is aborted without reason");
  error.name = "AbortError";
  throw error;
};

const partialDailyRows = await fetchDailyMeterData("OGUFA", "2025-11-07", "2026-05-08");
assert.strictEqual(partialDailyRows.length, 2);

global.fetch = originalFetch;

console.log(JSON.stringify({
  consumedKwh: consumptionKpi.consumedKwh,
  matchedMeters: ledgerPayload.kpiUpdate.matchedMeters,
  progressSteps: progressValues.length,
  status: "site consumption passed"
}, null, 2));
