const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");

assert(page.includes('import EChartPanel from "../EChartPanel.vue";'), "wallet trend must use Beverly chart renderer");
assert(page.includes("createBarOption"), "wallet trend must use Beverly bar chart option factory");
assert(page.includes("<EChartPanel :option=\"walletTrendOption\" />"), "wallet trend must render as Beverly bar chart");
assert(!page.includes("area-chart"), "wallet trend must not use custom area chart markup");
assert(!page.includes("Success vs Failure"), "wallet dashboard must not restore removed success chart");
assert(!/--border-color:\s*#|--bg-card:\s*#|--bg-page:\s*#|--primary-light:\s*#|--success-bg:\s*#|--warning-bg:\s*#|--danger-bg:\s*#|--info-bg:\s*#/.test(page), "wallet shell must not lock theme variables to literal colors");
assert(page.includes("background: var(--bg-page);"), "wallet shell must use theme page background");
assert(page.includes("tooltip: \"var(--bg-card)\""), "wallet chart tooltip must be theme aware");

console.log("wallet theme chart passed");
