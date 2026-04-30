"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "reference-contract.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reference-route-manifest.json"), "utf8"));

const endpointPaths = new Set(contract.endpoints.map((endpoint) => endpoint.path.toLowerCase()));

assert.strictEqual(contract.documentedTotal, 144, "Swagger overview endpoint count changed");
assert(contract.endpointCount >= 142, "Endpoint catalog line count changed");
assert(contract.liveWriteEndpointCount > 0, "No live write endpoints classified");
assert(contract.endpointCount >= contract.documentedTotal, "Published contract cannot drop below documented endpoint count");
assert(contract.coverage, "Missing coverage summary");
assert.strictEqual(contract.coverage.crawlMissingEndpointCount, 0, "Crawled endpoints missing from contract");
assert.strictEqual(contract.coverage.routeCount, manifest.length, "Route coverage count drifted");
assert.strictEqual(contract.coverage.fullyMappedRouteCount, manifest.length, "Not all visible routes are fully mapped");

for (const route of manifest) {
  for (const apiPath of route.apis) {
    assert(endpointPaths.has(apiPath.toLowerCase()), `Manifest endpoint missing from contract: ${apiPath}`);
  }
}

for (const required of [
  "/api/token/creditTokenRecord/readMore",
  "/api/DailyDataMeter/readHourly",
  "/API/PrepayReport/LongNonpurchaseSituation",
  "/API/RemoteMeterTask/CreateReadingTask",
  "/API/RemoteMeterTask/GetReadingTask"
]) {
  assert(endpointPaths.has(required.toLowerCase()), `Required endpoint missing: ${required}`);
}

for (const endpoint of contract.endpoints) {
  assert(Array.isArray(endpoint.casingVariants) && endpoint.casingVariants.length > 0, `Missing casing variants: ${endpoint.path}`);
  assert(typeof endpoint.writeRiskLevel === "string", `Missing write risk level: ${endpoint.path}`);
  assert(Array.isArray(endpoint.uiRouteConsumers), `Missing ui route consumer list: ${endpoint.path}`);
}

console.log(JSON.stringify({
  endpointCount: contract.endpointCount,
  observedEndpointCount: contract.observedEndpointCount,
  visibleEndpointCount: contract.visibleEndpointCount,
  routeCount: contract.coverage.routeCount,
  fullyMappedRouteCount: contract.coverage.fullyMappedRouteCount,
  crawlUniqueEndpointCount: contract.coverage.crawlUniqueEndpointCount,
  status: "contract test passed"
}, null, 2));
