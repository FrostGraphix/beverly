"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const matrixPath = path.join(root, "contracts", "live-route-matrix.json");

const report = spawnSync(process.execPath, [path.join(root, "tools", "live-read-report.cjs")], {
  cwd: root,
  encoding: "utf8"
});

assert.strictEqual(report.status, 0, report.stderr || report.stdout);

const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const visibleRoutes = matrix.routes.filter((route) => route.visibleReference);
const liveRoutes = visibleRoutes.filter((route) => route.source === "live-ready" || route.source === "live-derived");
const visibleBlocked = visibleRoutes.filter((route) => route.source !== "live-ready" && route.source !== "live-derived");
const dashboardRoute = matrix.routes.find((route) => route.hash === "#/dashboard");

assert.strictEqual(visibleRoutes.length, 23);
assert.strictEqual(visibleBlocked.length, 0);
assert.strictEqual(liveRoutes.length, 23);
assert(matrix.routes.some((route) => route.hash === "#/prepay-report/consumption-statistics" && route.source === "live-derived"));
assert(dashboardRoute, "dashboard route missing");
assert.deepStrictEqual(dashboardRoute.declaredEndpoints, [
  "/api/dashboard/readPanelGroup",
  "/api/dashboard/readLineChart"
]);

console.log(JSON.stringify({
  visibleRoutes: visibleRoutes.length,
  liveRoutes: liveRoutes.length,
  status: "live route smoke passed"
}, null, 2));
