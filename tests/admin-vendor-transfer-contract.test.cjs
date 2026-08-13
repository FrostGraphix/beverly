"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const constants = read("backend/wallet/src/routes/admin-access-constants.ts");
const admin = read("backend/wallet/src/routes/admin.ts");
const policy = read("backend/wallet/src/contracts/route-policy.ts");
const auth = read("backend/wallet/src/plugins/auth.ts");
const env = read("backend/wallet/src/config/env.ts");
const service = read("backend/wallet/src/services/vendor-transfers.ts");
const migration = read("supabase/migrations/20260812145901_admin_vendor_balance_transfers.sql");

assert.ok(constants.includes("wallet.vendor_transfers.manage"), "critical transfer permission must be in the catalog");
assert.ok(constants.includes("developer: ['dev.console', 'wallet.vendor_transfers.manage']"), "developer defaults must be minimal and explicit");
assert.ok(auth.includes("'developer'"), "developer must resolve as a staff role from the database");
assert.ok(env.includes("FEATURE_VENDOR_BALANCE_TRANSFERS"), "environment gate must exist and default off");
assert.ok(admin.includes("await fastify.register(adminVendorTransferRoutes)"), "admin must register transfer routes inside its auth chain");

for (const mapping of [
  "'GET /vendor-transfers/vendors': 'wallet.vendor_transfers.manage'",
  "'POST /vendor-transfers/preview': 'wallet.vendor_transfers.manage'",
  "'GET /vendor-transfers': 'wallet.vendor_transfers.manage'",
  "'GET /vendor-transfers/:id': 'wallet.vendor_transfers.manage'",
  "'POST /vendor-transfers': 'wallet.vendor_transfers.manage'",
]) assert.ok(admin.includes(mapping), `missing route permission ${mapping}`);

for (const route of [
  "post('/api/v1/admin/vendor-transfers/preview')",
  "post('/api/v1/admin/vendor-transfers', { money: true })",
]) assert.ok(policy.includes(route), `missing mutation policy ${route}`);

assert.ok(!service.includes("select('*')"), "history and receipt queries must not expose internal transfer columns");
assert.ok(migration.includes("to_jsonb(v_existing) - 'request_fingerprint'"), "RPC responses must remove the internal request fingerprint");
assert.ok(migration.includes("source_vendor_name text not null"), "transfer receipts must snapshot the source vendor name");
assert.ok(migration.includes("destination_vendor_name text not null"), "transfer receipts must snapshot the destination vendor name");

console.log("admin vendor transfer integration contract passed");
