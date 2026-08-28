const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/components/StationConsumptionPage.vue"), "utf8");
const shareOption = page.slice(page.indexOf("    shareOption()"), page.indexOf("    legacySharePieOption()"));
const seasonalityOption = page.slice(page.indexOf("    seasonalityOption()"), page.indexOf("    meterKpis()"));

assert(page.includes('class="scc-chart scc-chart--tall"'), "trend chart must keep the fixed chart shell");
assert(!page.includes("scc-periods"), "station consumption must not render preset range shortcuts");
assert(!page.includes("Last 30 Days"), "station consumption must not expose fixed range presets");
assert(!page.includes("pickPeriod"), "station consumption must not keep preset range handlers");
assert(page.includes(".scc-chart :deep(.echart-panel)"), "station charts must override global EChart min-height");
assert(page.includes("min-height: 0 !important;"), "chart shells must cancel dashboard min-height overflow");
assert(page.includes("overflow: hidden;"), "chart cards must clip chart animation overflow");
assert(page.includes('sampling: "lttb"'), "trend series must downsample dense station series");
assert(page.includes("clip: true"), "trend series must clip to the plotting area");
assert(!page.includes('stack: "load"'), "station comparison trend must not stack station lines");
assert(page.includes("hideOverlap: true"), "trend axis labels must hide overlap on mobile");
assert(shareOption.includes('type: "bar"'), "station load share must use compact mobile-safe bars");
assert(shareOption.includes("barMaxWidth: 16"), "station load share bars must fit the card height");
assert(shareOption.includes('overflow: "truncate"'), "station labels must truncate on mobile");
assert(shareOption.includes("slice(0, 6)"), "station load share must cap visible rows");
assert(seasonalityOption.includes("barMaxWidth: 28"), "weekly chart bars must fit mobile card width");
assert(seasonalityOption.includes("clip: true"), "weekly chart must clip bars to plotting area");
assert(seasonalityOption.includes("splitNumber: 3"), "weekly chart must reduce mobile y-axis density");
assert(page.includes("scc-table-wrap--league"), "league table must expose its responsive shell");
assert(page.includes("scc-table--league"), "league table must expose responsive column rules");
assert(!page.includes("scc-table-wrap--meters"), "top meters table must keep desktop table shell on mobile");
assert(!page.includes("scc-table--meters"), "top meters table must keep desktop table layout on mobile");
assert(!page.includes("scc-meter-id-cell"), "top meters meter id must remain a normal table cell");
assert(!page.includes('data-label="Active Periods"'), "top meters metric cells must not use mobile cards");

console.log(JSON.stringify({
  status: "station consumption chart contract passed",
  checks: 24
}, null, 2));
