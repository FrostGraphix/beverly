const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("phase 8 runner covers migration, database, financial, and drill gates", () => {
  const runner = read("tools/phase8-verification-suite.cjs");

  assert.match(runner, /staticMigrationChecks/);
  assert.match(runner, /financialScenarioChecks/);
  assert.match(runner, /deploymentDrillChecks/);
  assert.match(runner, /liveDatabaseChecks/);
  assert.match(runner, /walletRaceDrill/);
  assert.match(runner, /relrowsecurity/);
  assert.match(runner, /fn_create_hold/);
  assert.match(runner, /fn_capture_hold/);
  assert.match(runner, /purge_expired_payment_webhooks/);
  assert.match(runner, /PHASE8_VERIFICATION_REPORT_2026-06-25\.json/);
});

test("phase 8 acceptance scenarios remain enumerated", () => {
  const runner = read("tools/phase8-verification-suite.cjs");
  const required = [
    "manual funding approval",
    "Paystack vendor funding",
    "customer wallet funding",
    "vendor token vending",
    "customer direct payment",
    "remote-send delivery",
    "three-phase meter vending",
    "VAT-inclusive receipt generation",
    "failed vend hold release",
    "unknown delivery reconciliation",
    "refund approval and reversal",
    "duplicate request replay",
  ];

  for (const scenario of required) {
    assert.match(runner, new RegExp(scenario.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
