const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");
const dashboardGrid = page.match(/<div class="dashboard-grid">[\s\S]*?<\/div>\s*<article class="panel recent-activity-panel"/)?.[0] || "";

assert(
  !page.includes("Success vs Failure"),
  "wallet dashboard must not render the Success vs Failure chart"
);

assert(
  /\.dashboard-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*300px/s.test(page),
  "wallet dashboard panels must keep trend and queues on one row"
);

assert(
  !dashboardGrid.includes('class="panel panel--wide"'),
  "wallet dashboard trend panel must not span over the queue panel"
);

console.log("wallet dashboard panels passed");
