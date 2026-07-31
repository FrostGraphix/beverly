"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "apps", "vendor", "src", "views", "Consumption.vue"),
  "utf8",
);

assert(source.includes('<AppShell title="Consumption">'));
assert(source.includes(':aria-busy="loading"'));
assert(source.includes('aria-controls="consumption-results"'));
assert(source.includes('role="region" aria-label="Consumption results" tabindex="0"'));
assert(source.includes('scope="col"'));
assert(source.includes('class="retry" @click="load"'));
assert(source.includes('requestId !== loadRequestId'));
assert(!source.includes("var(--accent"));
assert(!source.includes("#2f6feb"));

console.log("vendor consumption UI contract passed");
