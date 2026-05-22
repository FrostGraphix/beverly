const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routeManifest = fs.readFileSync(path.join(root, "src/data/route-manifest.js"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.vue"), "utf8");
const architecture = fs.readFileSync(path.join(root, "ARCHITECTURE.md"), "utf8");
const docsArchitecture = fs.readFileSync(path.join(root, "docs/ARCHITECTURE.md"), "utf8");
const componentPath = path.join(root, "src/components/SiteConsumptionPage.vue");

assert(!fs.existsSync(componentPath), "SiteConsumptionPage component must not exist");
assert(!routeManifest.includes("#/prepay-report/site-consumption"), "site consumption route must be removed");
assert(!routeManifest.includes('title: "Site Consumption"'), "site consumption menu item must be removed");
assert(!routeManifest.includes('customComponent: "SiteConsumptionPage"'), "site consumption custom component must not be wired");
assert(app.includes('"#/prepay-report/site-consumption"'), "retired URL must be explicitly handled");
assert(app.includes('"#/prepay-report/station-consumption"'), "retired URL must redirect to station consumption");
assert(!architecture.includes("SiteConsumptionPage.vue"), "canonical architecture must not reference removed page");
assert(!docsArchitecture.includes("SiteConsumptionPage.vue"), "legacy architecture must not reference removed page");

console.log(JSON.stringify({
  status: "site consumption removed",
  checks: 8
}, null, 2));
