"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminApi = fs.readFileSync(path.join(root, "apps/admin/src/lib/api.ts"), "utf8");
const adminEnv = fs.readFileSync(path.join(root, "apps/admin/.env.local"), "utf8");
const adminVite = fs.readFileSync(path.join(root, "apps/admin/vite.config.ts"), "utf8");

assert.match(
  adminVite,
  /proxy:\s*\{\s*'\/api':\s*\{\s*target:\s*'http:\/\/localhost:4000'/,
  "admin dev server must proxy /api to the wallet backend"
);

assert.doesNotMatch(
  adminEnv,
  /^VITE_API_BASE=http:\/\/localhost:4000\s*$/m,
  "admin local env must not force browser fetches directly to localhost:4000"
);

assert.match(
  adminApi,
  /function normalizeBaseUrl\(rawBase: unknown\): string/,
  "admin API client must normalize configured API bases"
);

assert.match(
  adminApi,
  /isLocalApi && isLocalPage && apiUrl\.origin !== pageUrl\.origin[\s\S]*return '';/,
  "admin API client must collapse cross-port local API bases to same-origin proxy calls"
);

console.log(JSON.stringify({
  status: "admin app cors contract passed",
  checks: 4
}, null, 2));
