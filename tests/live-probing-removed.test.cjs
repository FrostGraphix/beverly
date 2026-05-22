const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routeManifest = fs.readFileSync(path.join(root, "src/data/route-manifest.js"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.vue"), "utf8");
const architecture = fs.readFileSync(path.join(root, "ARCHITECTURE.md"), "utf8");
const componentPath = path.join(root, "src/components/LiveProbingPage.vue");

assert(!fs.existsSync(componentPath), "LiveProbingPage component must not exist");
assert(!routeManifest.includes("#/system/live-probing"), "live probing route must be removed");
assert(!routeManifest.includes('title: "Live Probing & Sync"'), "live probing menu item must be removed");
assert(!routeManifest.includes('customComponent: "LiveProbingPage"'), "live probing custom component must not be wired");
assert(app.includes('"#/system/live-probing"'), "retired live probing URL must be explicitly handled");
assert(app.includes('"#/system/automation-command"'), "retired live probing URL must redirect to automation command");
assert(architecture.includes("#/system/live-probing"), "architecture must document retired live probing route");

console.log(JSON.stringify({
  status: "live probing removed",
  checks: 7
}, null, 2));
