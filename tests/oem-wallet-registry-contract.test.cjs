"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const registry = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "oem-registry.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "token-engine.ts"), "utf8");

assert(!registry.includes(".eq('station_id'"), "legacy credentials have no station_id column");
assert(!registry.includes("stationId?: string | null"), "manufacturer resolver must not imply installation scope");
assert.match(registry, /\.from\('oem_credentials'\)[\s\S]*?\.eq\('oem_id', manufacturer\.id\)/, "legacy Calinmeter credentials remain manufacturer-scoped");
assert(!engine.includes("resolveOemConfig(oemId, stationId)"), "token engine must not request imaginary station credentials");

console.log(JSON.stringify({ status: "wallet OEM registry contract passed" }, null, 2));
