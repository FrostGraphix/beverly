"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ledger = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "ledger.ts"), "utf8");
const vending = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "vending.ts"), "utf8");
const vendorRoutes = fs.readFileSync(path.join(root, "backend", "wallet", "src", "routes", "vendor.ts"), "utf8");
const adminRoutes = fs.readFileSync(path.join(root, "backend", "wallet", "src", "routes", "admin.ts"), "utf8");
const webhookRoutes = fs.readFileSync(path.join(root, "backend", "wallet", "src", "routes", "webhooks.ts"), "utf8");
const worker = fs.readFileSync(path.join(root, "backend", "wallet", "src", "worker.ts"), "utf8");

assert(ledger.includes("rpc('fn_create_hold'"), "holds must use the atomic database RPC");
assert(ledger.includes("rpc('fn_capture_hold'"), "capture must use the atomic database RPC");
assert(!ledger.includes("const bal = await getBalance(input.walletId)"), "holds must not pre-read availability");
assert(vending.includes("claimWalletIdempotency"), "vending must claim request idempotency");
assert(vending.includes("completeWalletIdempotency"), "vending must persist replay payloads");
assert(vending.includes("idempotency_payload_mismatch"), "vending must reject changed payload replays");
assert(vendorRoutes.includes("requireIdempotencyKey(req, reply)"), "vendor writes must require request keys");
assert(!vendorRoutes.includes("Date.now()}-${Math.random()}"), "vendor vending must not invent request keys");
assert(adminRoutes.includes("requireIdempotencyKey(req, reply)"), "staff meter orders must require request keys");
assert(webhookRoutes.includes("payload_digest"), "webhooks must persist a payload digest");
assert(webhookRoutes.includes("duplicate: true"), "duplicate webhooks must acknowledge safely");
assert(fs.readFileSync(path.join(root, "api", "reference.js"), "utf8").includes("/api/cron/wallet-maintenance"), "maintenance must expose the secured serverless scheduler endpoint");

console.log(JSON.stringify({ status: "wallet phase 2 contracts passed" }, null, 2));
