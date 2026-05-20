"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routeManifestSource = fs.readFileSync(path.join(root, "src/data/route-manifest.js"), "utf8");
const siteConsumptionPageSource = fs.readFileSync(path.join(root, "src/components/SiteConsumptionPage.vue"), "utf8");

function loadRouteHelpers() {
  const transformed = routeManifestSource
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    + "\nmodule.exports = { normalizeHash, findRoute };";

  const moduleShim = { exports: {} };
  const factory = new Function("module", "exports", transformed);
  factory(moduleShim, moduleShim.exports);
  return moduleShim.exports;
}

const { normalizeHash, findRoute } = loadRouteHelpers();

assert.equal(
  normalizeHash("#/prepay-report/site-consumption?view=fraud"),
  "#/prepay-report/site-consumption",
  "normalizeHash should strip the site-consumption subview query"
);

assert.equal(
  findRoute("#/prepay-report/site-consumption?view=consumption", "super-admin").hash,
  "#/prepay-report/site-consumption",
  "findRoute should resolve query-based site-consumption subviews"
);

assert.match(
  siteConsumptionPageSource,
  /parseViewFromHash\(hash\)/,
  "SiteConsumptionPage should parse the active subview from the hash"
);

assert.match(
  siteConsumptionPageSource,
  /parseStationFromHash\(hash\)/,
  "SiteConsumptionPage should parse the station from the hash"
);

assert.match(
  siteConsumptionPageSource,
  /buildHash\(view = this\.activeView, station = this\.activeStation\)/,
  "SiteConsumptionPage should build deep-link hashes centrally"
);

assert.match(
  siteConsumptionPageSource,
  /window\.location\.hash = nextHash/,
  "SiteConsumptionPage should push the rebuilt hash when view/station changes"
);

assert.match(
  siteConsumptionPageSource,
  /syncFromHash\(\)/,
  "SiteConsumptionPage should re-sync view and station when the hash changes"
);

console.log(JSON.stringify({
  status: "site consumption routing passed",
  checks: 7
}, null, 2));
