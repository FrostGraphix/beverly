"use strict";

// Locks the Phase 5-6 decomposition so the extracted modules cannot silently
// collapse back into the files they were pulled out of.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function lineCount(rel) {
  return read(rel).split("\n").length;
}

// ── Wallet admin router split ────────────────────────────────────────────────
const admin = read("backend/wallet/src/routes/admin.ts");
const adminDev = read("backend/wallet/src/routes/admin-dev.ts");
const adminConstants = read("backend/wallet/src/routes/admin-access-constants.ts");

assert.ok(
  lineCount("backend/wallet/src/routes/admin.ts") < 3600,
  "admin.ts must stay under 3600 lines — extract new route groups instead of growing it"
);
assert.ok(
  admin.includes("await fastify.register(adminDevRoutes)"),
  "admin.ts must register the dev console plugin so /dev routes inherit its preHandler chain"
);
assert.ok(
  !/fastify\.(get|post|patch|put|delete)\('\/dev\//.test(admin),
  "dev console handlers belong in admin-dev.ts, not admin.ts"
);
assert.ok(
  /fastify\.(get|post|patch|put|delete)\('\/dev\//.test(adminDev),
  "admin-dev.ts must own the dev console handlers"
);

// The dev plugin must not re-implement its own auth — it inherits admin's chain.
assert.ok(
  !adminDev.includes("requireStaff()"),
  "admin-dev.ts must inherit auth from the admin plugin, not re-declare it"
);

// Access-control catalog is shared, single-source.
for (const symbol of ["PERMISSION_CATALOG", "DEFAULT_ROLE_PERMISSIONS", "ROLE_LABELS", "ROLE_LEGACY_NAMES", "SYSTEM_ROLE_KEYS"]) {
  assert.ok(
    adminConstants.includes(`export const ${symbol}`),
    `admin-access-constants.ts must export ${symbol}`
  );
  assert.ok(
    !new RegExp(`^const ${symbol}\\b`, "m").test(admin),
    `${symbol} must be imported from admin-access-constants.ts, not redefined in admin.ts`
  );
}
assert.ok(
  admin.includes("from './admin-access-constants.js'"),
  "admin.ts must import the shared access catalog"
);
assert.ok(
  adminDev.includes("from './admin-access-constants.js'"),
  "admin-dev.ts must import the shared access catalog"
);
assert.ok(
  adminConstants.includes("'dev.console'"),
  "shared catalog must retain the dev.console permission key"
);

// ── CRM shell split ──────────────────────────────────────────────────────────
const appVue = read("src/App.vue");
const shellChrome = read("src/data/shell-chrome.mjs");

assert.ok(
  lineCount("src/App.vue") < 1100,
  "App.vue must stay under 1100 lines — extract chrome/composables instead of growing it"
);
for (const symbol of ["groupIcons", "sidebarSectionLabels", "routeIconPaths", "routeIconOverrides"]) {
  assert.ok(
    shellChrome.includes(`export const ${symbol}`),
    `shell-chrome.mjs must export ${symbol}`
  );
  assert.ok(
    !new RegExp(`^const ${symbol}\\s*=`, "m").test(appVue),
    `${symbol} must live in shell-chrome.mjs, not App.vue`
  );
}
assert.ok(
  appVue.includes('from "./data/shell-chrome.mjs"'),
  "App.vue must import sidebar chrome from shell-chrome.mjs"
);

// ── Money-path type gating ───────────────────────────────────────────────────
for (const rel of [
  "src/services/guarded-write.mjs",
  "src/services/write-helpers.mjs",
  "src/services/upload-policy.mjs"
]) {
  assert.ok(
    read(rel).startsWith("// @ts-check"),
    `${rel} guards money/write paths and must keep its // @ts-check pragma`
  );
}
const tsconfig = JSON.parse(read("tsconfig.json"));
assert.ok(
  tsconfig.include.includes("src/services/**/*.mjs"),
  "tsconfig must typecheck src/services/**/*.mjs so @ts-check pragmas are enforced by npm run typecheck"
);

console.log(JSON.stringify({
  status: "module boundaries passed",
  appVue: lineCount("src/App.vue"),
  adminRouter: lineCount("backend/wallet/src/routes/admin.ts"),
  adminDev: lineCount("backend/wallet/src/routes/admin-dev.ts")
}, null, 2));
