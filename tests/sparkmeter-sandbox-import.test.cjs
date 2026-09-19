"use strict";

const assert = require("assert");
const { buildSparkMeterSandboxImportPlan, fetchWithRetries } = require("../tools/import-sparkmeter-sandbox.cjs");

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
  console.log(JSON.stringify({ status: "SparkMeter sandbox import contract passed" }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
