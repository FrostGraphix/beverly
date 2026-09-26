"use strict";

const assert = require("assert");
const { buildSparkMeterSandboxImportPlan, fetchWithRetries, fetchSparkMeterCustomers } = require("../tools/import-sparkmeter-sandbox.cjs");

const installationId = "ed0eefb2-f017-43ad-a52e-82169684803b";
const manufacturerId = "e1532892-e09d-44f9-a9cb-b99b5c9ebecf";

const plan = buildSparkMeterSandboxImportPlan({
  installationId,
  manufacturerId,
  customers: [
    {
      id: "customer-with-meter",
      code: "ACOB-001",
      name: "Metered Customer",
      phone_number: "+2348000000000",
      service_area_id: "service-area-1",
      site_id: "site-1",
      meters: [
        {
          id: "meter-1",
          serial: "SERIAL-1",
          tariff_id: "tariff-1",
          meter_phase: "single_phase"
        }
      ]
    },
    {
      id: "customer-without-meter",
      code: "ACOB-002",
      name: "Unmetered Customer",
      phone_number: "+2348111111111",
      service_area_id: "service-area-2",
      site_id: "site-2",
      meters: []
    }
  ]
});

assert.strictEqual(plan.customers.length, 1, "meterless customers must remain untouched");
assert.strictEqual(plan.meters.length, 1, "one meter must create one internal meter record");
assert.strictEqual(plan.mappings.length, 2, "customer and meter mappings are required");
assert.strictEqual(plan.skippedWithoutMeters, 1, "meterless customers must be counted");
assert.strictEqual(plan.customers[0].externalId, "customer-with-meter");
assert.strictEqual(plan.meters[0].externalId, "meter-1");
assert.strictEqual(plan.meters[0].customerExternalId, "customer-with-meter");
assert.strictEqual(plan.mappings[0].installationId, installationId);
assert.strictEqual(plan.mappings[0].manufacturerId, undefined, "mappings belong to installations only");
assert.strictEqual(plan.mappings[1].resourceType, "meter");

assert.throws(
  () =>
    buildSparkMeterSandboxImportPlan({
      installationId,
      manufacturerId,
      customers: [
        {
          id: "bad-meter",
          name: "Bad Meter Customer",
          meters: [{ id: "meter-without-serial" }]
        }
      ]
    }),
  /serial/i,
  "a meter without a serial must fail closed"
);

(async () => {
  assert.throws(() => buildSparkMeterSandboxImportPlan({
    installationId, manufacturerId,
    customers: [{ id: "malformed-customer", name: "Malformed", meters: null }]
  }), /meters.*array/i, "missing meters must not be silently classified as meterless");
  let calls = 0;
  let sawAbortSignal = false;
  const response = await fetchWithRetries(
    "https://example.invalid/customers",
    {},
    async (_url, init) => {
      calls += 1;
      sawAbortSignal = Boolean(init.signal);
      if (calls === 1) throw new TypeError("network timeout");
      return new Response("{}", { status: 200 });
    },
    0
  );
  assert.strictEqual(response.status, 200, "safe reads must retry transient network failures");
  assert.strictEqual(calls, 2, "safe reads must stop after a successful retry");
  assert.strictEqual(sawAbortSignal, true, "safe reads must have a bounded request signal");
  await assert.rejects(() => fetchSparkMeterCustomers({
    apiKey: "test-key", apiSecret: "test-secret", delayMs: 0,
    request: async () => new Response(JSON.stringify({ data: [], next_cursor: "repeated" }), { status: 200 })
  }), /cursor.*repeat/i, "cyclic pagination must terminate without accepting a partial inventory");
  for (const body of [
    { data: [], next_cursor: 42 },
    { data: [], errors: [{ title: "Read failed" }], next_cursor: null }
  ]) {
    await assert.rejects(() => fetchSparkMeterCustomers({
      apiKey: "test-key", apiSecret: "test-secret", delayMs: 0,
      request: async () => new Response(JSON.stringify(body), { status: 200 })
    }), /response|cursor/i, "malformed cursor and provider errors must not look like completed inventory");
  }
  const delays = [];
  let throttledCalls = 0;
  await fetchWithRetries("https://example.invalid/customers", {}, async (_url, init) => {
    assert.strictEqual(init.redirect, "error", "credentials must never follow redirects");
    throttledCalls += 1;
    return throttledCalls === 1
      ? new Response("{}", { status: 429, headers: { "Retry-After": "2" } })
      : new Response("{}", { status: 200 });
  }, 1, async (delay) => { delays.push(delay); });
  assert.deepStrictEqual(delays, [2000], "provider retry delay must be respected");
  const pages = await fetchSparkMeterCustomers({
    apiKey: "test-key", apiSecret: "test-secret", delayMs: 0,
    request: async (url) => {
      const next = new URL(url).searchParams.get("cursor");
      return new Response(JSON.stringify({
        data: [{ id: next ? "second" : "first", name: "Fixture", meters: [] }],
        errors: [], next_cursor: next ? null : "opaque/page+2"
      }), { status: 200 });
    }
  });
  assert.deepStrictEqual(pages.map((customer) => customer.id), ["first", "second"]);
  await assert.rejects(() => fetchSparkMeterCustomers({
    apiKey: "test-key", apiSecret: "test-secret", delayMs: 0, maxPages: 1,
    request: async () => new Response(JSON.stringify({ data: [], next_cursor: "next" }), { status: 200 })
  }), /page limit/, "page budget exhaustion must reject partial results");
  let failedCalls = 0;
  await assert.rejects(() => fetchWithRetries("https://example.invalid/customers", {}, async () => {
    failedCalls += 1;
    throw new Error("sensitive-provider-payload");
  }, 0), (error) => !error.message.includes("sensitive-provider-payload"));
  assert.strictEqual(failedCalls, 3, "transport retries must remain bounded");
  await assert.rejects(() => fetchSparkMeterCustomers({
    apiKey: "test-key", apiSecret: "test-secret", delayMs: 0,
    request: async () => new Response("private-provider-payload", { status: 200 })
  }), (error) => error.message === "SparkMeter customer response is not valid JSON",
  "invalid JSON errors must not disclose upstream body snippets");
  console.log(JSON.stringify({ status: "SparkMeter sandbox import contract passed" }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
