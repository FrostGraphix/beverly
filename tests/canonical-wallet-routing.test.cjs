"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const reference = fs.readFileSync(path.join(root, "api", "reference.js"), "utf8");
const server = fs.readFileSync(path.join(root, "backend", "wallet", "src", "server.ts"), "utf8");
const worker = fs.readFileSync(path.join(root, "backend", "wallet", "src", "worker.ts"), "utf8");
const dockerfile = fs.readFileSync(path.join(root, "backend", "wallet", "Dockerfile"), "utf8");
const compose = fs.readFileSync(path.join(root, "backend", "wallet", "compose.yml"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const preview = JSON.parse(fs.readFileSync(path.join(root, "vercel.preview.json"), "utf8"));

assert(reference.includes("WALLET_API_BASE_URL"), "reference facade must use the canonical wallet backend URL");
assert(reference.includes("WALLET_PROXY_MONEY_WRITES_ENABLED"), "canonical money writes must require a dedicated proxy flag");
assert(reference.includes("proxyCanonicalWallet"), "reference facade must proxy canonical wallet requests");
assert(reference.includes("isLegacyFinancialMutation"), "legacy wallet mutations must be isolated");
assert(server.includes("MONEY_WRITES_ENABLED"), "wallet backend must gate money mutations");
assert(!server.includes("startScheduler();"), "wallet API process must not start the scheduler");
assert(reference.includes("/api/cron/wallet-maintenance"), "Vercel must expose the authenticated wallet maintenance endpoint");
assert(reference.includes("sweepPendingPayments"), "wallet maintenance must reuse the canonical payment sweeper");
assert(dockerfile.includes("COPY --from=build /app/dist ./dist"), "wallet image must include built worker output");
assert(compose.includes("worker:"), "wallet compose stack must define the worker service");
assert(!vercel.env?.ALLOW_LIVE_WRITES, "Vercel production config must keep writes disabled");
assert(!preview.env?.ALLOW_LIVE_WRITES, "Vercel preview config must keep writes disabled");
assert(
  preview.rewrites.some((entry) => entry.source === "/wallet-vendor/:path*" && entry.destination === "/wallet-vendor/index.html"),
  "Vercel preview config must route vendor wallet subpaths"
);
assert(
  preview.rewrites.some((entry) => entry.source === "/wallet-customer/:path*" && entry.destination === "/wallet-customer/index.html"),
  "Vercel preview config must route customer wallet subpaths"
);
for (const [host, destination] of [
  ["admin-acob-beverly.vercel.app", "/wallet-admin/index.html"],
  ["vendor-acob-beverly.vercel.app", "/wallet-vendor/index.html"],
  ["customer-acob-beverly.vercel.app", "/wallet-customer/index.html"],
]) {
  assert(
    preview.rewrites.some((entry) =>
      entry.destination === destination &&
      Array.isArray(entry.has) &&
      entry.has.some((condition) => condition.type === "host" && condition.value === host)
    ),
    `Vercel preview config must route ${host} to ${destination}`
  );
}

console.log(JSON.stringify({ status: "canonical wallet routing passed" }, null, 2));
