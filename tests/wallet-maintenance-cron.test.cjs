"use strict";

const assert = require("node:assert");
const fs = require("node:fs");

const api = fs.readFileSync("api/reference.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260722180000_wallet_maintenance_cron.sql", "utf8");

assert.match(api, /pathname === "\/api\/cron\/wallet-maintenance"/);
assert.match(api, /cronAuthorized\(request\)/);
assert.match(api, /walletMaintenanceTasks\.has\(task\)/);
assert.match(api, /sweepPendingPayments/);
assert.match(migration, /vault\.decrypted_secrets/);
assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9_-]{16,}/);

for (const task of [
  "holds", "payments", "stuck-purchases", "remote-send", "reconciliation",
  "settlement", "fraud-baseline", "refund-expiry", "webhook-retention"
]) {
  assert.match(migration, new RegExp(`invoke_wallet_maintenance\\('${task}'\\)`));
}

console.log("wallet maintenance cron contract passed");
