"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminApi = fs.readFileSync(path.join(root, "apps/admin/src/lib/api.ts"), "utf8");
const adminEnvPath = path.join(root, "apps/admin/.env.local");
const adminEnv = fs.existsSync(adminEnvPath) ? fs.readFileSync(adminEnvPath, "utf8") : "";
const adminVite = fs.readFileSync(path.join(root, "apps/admin/vite.config.ts"), "utf8");
const adminShell = fs.readFileSync(path.join(root, "apps/admin/src/components/AppShell.vue"), "utf8");
const vendorCreate = fs.readFileSync(path.join(root, "apps/admin/src/views/VendorCreate.vue"), "utf8");
const legacyVendorAuth = fs.readFileSync(path.join(root, "src/components/vendor/VendorAuthPage.vue"), "utf8");

assert.match(
  adminVite,
  /proxy:\s*\{\s*'\/api':\s*\{\s*target:\s*`http:\/\/(localhost|127\.0\.0\.1):\$\{process\.env\.WALLET_PORT \|\| 4000\}`/,
  "admin dev server must proxy /api to the wallet backend"
);
assert.match(adminVite, /(const\s+base\s*=\s*|base:\s*)process\.env\.VITE_ADMIN_BASE \?\? \(command === 'build' \? '\/wallet-admin\/' : '\/'\)/, "admin build must mount under /wallet-admin/");
assert.match(adminVite, /outDir:\s*resolve\(__dirname, '\.\.\/\.\.\/dist\/wallet-admin'\)/, "admin build must emit into root dist/wallet-admin");

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
assert.match(adminApi, /function unwrapEnvelope<T>\(json: any\): T/, "admin API client must unwrap Vercel facade envelopes");
assert.match(adminApi, /function adminBasePath\(\): string/, "admin API redirects must be base-path aware");
assert.match(adminApi, /appUrl\('\/login'\)/, "admin auth redirects must stay inside the mounted admin app");
assert.match(adminShell, /import\.meta\.env\.VITE_CRM_URL \?\? defaultCrmBaseUrl/, "admin CRM backlinks must be configurable");
assert.match(vendorCreate, /import\.meta\.env\.VITE_CRM_URL \|\| window\.location\.origin/, "vendor onboarding links must use the current deployment by default");
assert.match(legacyVendorAuth, /href="\/#\/login"/, "legacy wallet auth backlinks must stay same-origin");

console.log(JSON.stringify({
  status: "admin app cors contract passed",
  checks: 12
}, null, 2));
