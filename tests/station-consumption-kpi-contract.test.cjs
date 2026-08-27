"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const page = fs.readFileSync(path.join(__dirname, "..", "src", "components", "StationConsumptionPage.vue"), "utf8");

assert.match(page, /<div class="scc-kpis" role="list"/);
assert.match(page, /<article v-for="k in kpiCards"/);
assert.match(page, /calendar day/);
assert.match(page, /meters · as of/);
assert.match(page, /meterReadComplete/);
assert.doesNotMatch(page, /return "Tariff value unavailable"/);
assert.match(page, /\.scc-kpi-label \{ font-size: 11px/);
assert.doesNotMatch(page, /\.scc-kpi-value \{ font-size: 14px/);

console.log("station consumption KPI UI contract passed");
