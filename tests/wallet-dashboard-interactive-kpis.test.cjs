const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");

assert(page.includes("activeDashboardKpi"), "wallet dashboard must track the active KPI card");
assert(page.includes("dashboardKpis()"), "wallet dashboard must model KPI cards as interactive data");
assert(page.includes("@select=\"selectDashboardKpi(card.id)\""), "KPI cards must emit selection events");
assert(page.includes("aria-pressed"), "KPI cards must expose active state to assistive tech");
assert(page.includes("kpi-drilldown"), "wallet dashboard must render KPI drilldown detail");
assert(page.includes("activeDashboardKpiDetail.chartTitle"), "KPI selection must update chart context");
assert(page.includes("activityMap"), "KPI selection must filter recent activity context");
assert(page.includes("kpi-card--active"), "KPI cards must render active styling");
assert(page.includes("recentActivities"), "wallet dashboard must provide rich recent activity rows");
assert(page.includes("activeActivityType"), "recent activity must support type tabs");
assert(page.includes("activityStationFilter"), "recent activity must support station filtering");
assert(page.includes("pagedRecentActivities"), "recent activity must support dashboard pagination");
assert(page.includes("operational-queues-panel"), "operational queues must render as a dashboard panel");
assert(page.includes("queue-card"), "operational queues must render actionable queue cards");
assert(page.includes("operations-grid"), "wallet dashboard must include the operations support grid");
assert(page.includes("livePulse"), "wallet dashboard must include the live pulse feed");
assert(page.includes("topVendors"), "wallet dashboard must include top vendor ranking");
assert(page.includes("attentionItems"), "wallet dashboard must include attention triage items");
assert(page.includes("recent-activity-panel"), "recent activity must be a dedicated dashboard panel");

console.log("wallet dashboard interactive KPIs passed");
