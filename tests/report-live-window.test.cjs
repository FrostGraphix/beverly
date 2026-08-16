"use strict";

const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalBaseUrl = process.env.LIVE_API_BASE_URL;
const originalToken = process.env.LIVE_API_BEARER_TOKEN;
const requests = [];

process.env.LIVE_API_BASE_URL = "https://live.example.test";
process.env.LIVE_API_BEARER_TOKEN = "test-token";
global.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        payments: [
          {
            amount: 2500,
            customerId: "customer-1",
            meterId: "meter-1",
            serialNumber: "station-serial",
            timestamp: "2026-07-12T08:30:00.000Z",
            transactionKwh: 7.5
          },
          {
            amount: 2500,
            customerId: "customer-2",
            meterId: "meter-2",
            serialNumber: "station-serial",
            timestamp: "2026-07-12T09:30:00.000Z",
            transactionKwh: 7.5
          }
        ],
        errors: []
      };
    }
  };
};

const { revenueReport, transactionReport } = require("../backend/src/services/report-service");

(async () => {
  try {
    const dateRange = {
      start: "2026-07-06T00:00:00.000Z",
      end: "2026-07-13T00:00:00.000Z"
    };
    const revenue = await revenueReport(dateRange);
    const transactions = await transactionReport(dateRange);

    assert.equal(requests.length, 10);
    assert.match(requests[0].url, /\/api\/token\/creditTokenRecord\/readMore\?/);
    assert.match(requests[0].url, /FROM=2026-07-06T00%3A00%3A00\.000Z/);
    assert.deepEqual(
      [...new Set(requests.map(({ url }) => new URL(url).searchParams.get("SITE_ID")))].sort(),
      ["KYAKALE", "MUSHA", "OGUFA", "TUNGA", "UMAISHA"]
    );
    assert.equal(revenue.rows.length, 1);
    assert.equal(revenue.summary.totalRevenue, 2500000);
    assert.equal(revenue.summary.meters, 10);
    assert.equal(revenue.summary.activeStations, 5);
    assert.equal(transactions.rows.length, 10);
    assert.equal(transactions.summary.totalAmount, 2500000);
    assert.equal(transactions.summary.uniqueMeters, 10);
    assert.deepEqual(
      [...new Set(transactions.rows.map((row) => row.station))].sort(),
      ["KYAKALE", "MUSHA", "OGUFA", "TUNGA", "UMAISHA"]
    );
    assert.equal(transactions.rows[0].kwh, 7.5);

    const stationRevenue = await revenueReport(dateRange, { stationId: "OGUFA" });
    assert.equal(requests.length, 11);
    assert.equal(new URL(requests.at(-1).url).searchParams.get("SITE_ID"), "OGUFA");
    assert.equal(stationRevenue.summary.meters, 2);
    assert.equal(stationRevenue.summary.activeStations, 1);
    assert.equal(stationRevenue.rows[0].station, "OGUFA");
  } finally {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.LIVE_API_BASE_URL;
    else process.env.LIVE_API_BASE_URL = originalBaseUrl;
    if (originalToken === undefined) delete process.env.LIVE_API_BEARER_TOKEN;
    else process.env.LIVE_API_BEARER_TOKEN = originalToken;
  }

  console.log(JSON.stringify({ status: "report live window passed" }, null, 2));
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
