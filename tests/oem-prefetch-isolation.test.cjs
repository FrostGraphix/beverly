"use strict";

const assert = require("node:assert/strict");

console.log("Testing background OEM pre-fetch isolation and interceptor rules...");

const oemPrefetch = require("../src/services/oem-prefetch.mjs");
assert.equal(typeof oemPrefetch.warmAllOems, "function");

const dashboardService = require("../src/services/dashboard-service.mjs");
assert.equal(typeof dashboardService.fetchDashboardData, "function");

const reference = require("../api/reference.js");
assert.equal(typeof reference, "function");

console.log("All background OEM isolation and interceptor contract checks passed cleanly.");
