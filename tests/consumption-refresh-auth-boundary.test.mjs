import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return {
    ok: true,
    status: 200,
    async json() {
      return { ok: true, refreshedStations: 1, failedStations: 0 };
    },
  };
};

try {
  const { triggerMeterAggregateRefresh } = await import("../src/services/consumption-service.mjs");
  const result = await triggerMeterAggregateRefresh(["OFEMILI"]);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/local/consumption/refresh-aggregates");
  assert.deepEqual(JSON.parse(calls[0].init.body), { stationIds: ["OFEMILI"] });
  console.log("consumption refresh authentication boundary passed");
} finally {
  globalThis.fetch = originalFetch;
}
