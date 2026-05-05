import assert from "node:assert";
import { loadConsumptionData } from "../src/services/consumption-service.mjs";
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
    return jsonResponse({
      code: 0,
      result: {
        total: dailyRows.length,
        data: dailyRows,
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

global.fetch = originalFetch;

assert.strictEqual(salesKpi.purchasedKwh, 10);
assert.strictEqual(salesKpi.totalRevenue, 3500);
assert.strictEqual(salesKpi.priorPurchasedKwh, 8);
assert.strictEqual(consumptionKpi.consumedKwh, 12);
assert.strictEqual(consumptionKpi.avgDailyConsumedKwh, 6);
assert.strictEqual(chartsPayload.sales.stationBar[0].totalKwh, 10);
assert.strictEqual(chartsPayload.consumption.stationBar[0].totalKwh, 12);
assert.deepStrictEqual(progressValues, [1, 2]);
assert.strictEqual(ledgerPayload.ledger.length, 1);
assert.strictEqual(ledgerPayload.kpiUpdate.creditBalance, 1750);
assert.strictEqual(ledgerPayload.kpiUpdate.revenueShortfall, 0);
assert.strictEqual(ledgerPayload.kpiUpdate.matchedMeters, 1);
assert.strictEqual(ledgerPayload.kpiUpdate.unmatchedMeters, 1);
assert.strictEqual(ledgerPayload.accountCounts.TUNGA, 1);
assert.strictEqual(calls.filter((call) => call.path === "/api/token/creditTokenRecord/read").length, 2);

console.log(JSON.stringify({
  consumedKwh: consumptionKpi.consumedKwh,
  matchedMeters: ledgerPayload.kpiUpdate.matchedMeters,
  progressSteps: progressValues.length,
  status: "site consumption passed"
}, null, 2));
