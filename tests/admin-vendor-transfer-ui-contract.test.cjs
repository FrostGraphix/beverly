"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const router = read("apps/admin/src/router/index.ts");
const shell = read("apps/admin/src/components/AppShell.vue");
const pagePath = path.join(root, "apps/admin/src/views/VendorTransfers.vue");
assert.ok(fs.existsSync(pagePath), "Vendor Transfers page must exist");
const page = fs.readFileSync(pagePath, "utf8");

assert.ok(router.includes("path: '/vendor-transfers'"), "admin transfer route missing");
assert.ok(router.includes("permission: 'wallet.vendor_transfers.manage'"), "route permission missing");
assert.ok(shell.includes("to: '/vendor-transfers'"), "Money navigation entry missing");

for (const contract of [
  "/api/v1/admin/vendor-transfers/vendors",
  "/api/v1/admin/vendor-transfers/preview",
  "/api/v1/admin/vendor-transfers",
  "Source vendor",
  "Destination vendor",
  "Available balance",
  "Review transfer",
  "Confirm and transfer",
  "Transfer completed",
  "What happened",
  "What to do next",
  ":role=\"feedback.tone === 'error' ? 'alert' : 'status'\"",
  "aria-live=\"polite\"",
  "Idempotency-Key",
]) assert.ok(page.includes(contract), `missing UI contract: ${contract}`);

assert.ok(!/<style[\s\S]*#[0-9a-f]{3,8}/i.test(page), "component CSS must not use raw hex colors");
assert.ok(page.includes("@media (max-width: 720px)"), "transfer experience must be responsive");
assert.ok(page.includes("let searchTimer"), "vendor search and transfer preview must use independent debounce timers");

console.log("admin vendor transfer UI contract passed");
