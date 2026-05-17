const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");

assert(
  /\.kpi-grid--six\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(page),
  "wallet dashboard six KPI cards must render as 3 columns by 2 rows"
);

console.log("wallet dashboard KPI grid passed");
