"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const facade = read("api/reference.js");
const registry = read("src/services/station-registry.mjs");
const engine = read("backend/wallet/src/services/token-engine.ts");
const admin = read("backend/wallet/src/routes/admin.ts");

assert.match(facade, /fetchLiveStationDirectory/);
assert.match(facade, /pathname === "\/api\/local\/stations"/);
for (const field of ["stationId", "name", "oemId", "status"]) {
  assert.match(facade, new RegExp(`\\b${field}\\b`));
}
assert.match(registry, /postApi\("\/api\/local\/stations"/);
assert.match(registry, /`\$\{oemId\}:\$\{stationId\}`/);
assert.match(engine, /listStationDirectory/);
assert.match(engine, /\.eq\('status', 'active'\)/);
assert.match(engine, /if \(oemId\) throw new TokenEngineError/);
assert.match(admin, /await listStationDirectory\(\{ force \}\)/);

console.log("station directory contract passed");
