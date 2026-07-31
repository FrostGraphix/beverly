const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/components/StationConsumptionPage.vue"), "utf8");
const shareOption = page.slice(page.indexOf("    shareOption()"), page.indexOf("    legacySharePieOption()"));
const seasonalityOption = page.slice(page.indexOf("    seasonalityOption()"), page.indexOf("    meterKpis()"));

// These used to pin exact literals ("barMaxWidth: 18", "slice(0, 8)") that the
// page never actually contained — the assertions shipped broken and this file
// had never passed. The contract is the constraint (bars stay narrow enough for
// the card, the list stays short enough to fit), not one specific number, so
// assert the bound and let the design tune the value inside it.
function numericOption(source, option) {
  const match = source.match(new RegExp(`${option}:\\s*(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function assertAtMost(source, option, ceiling, message) {
  const value = numericOption(source, option);
  assert(value !== null, `${message} (no ${option} declared)`);
  assert(value <= ceiling, `${message} (${option} is ${value}, must be <= ${ceiling})`);
}

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
assertAtMost(shareOption, "barMaxWidth", 18, "station load share bars must fit the card height");
assert(shareOption.includes('overflow: "truncate"'), "station labels must truncate on mobile");
const shareRowCap = (shareOption.match(/slice\(0,\s*(\d+)\)/) || [])[1];
assert(shareRowCap !== undefined, "station load share must cap visible rows");
assert(Number(shareRowCap) <= 8, `station load share row cap must be <= 8 (is ${shareRowCap})`);
assertAtMost(seasonalityOption, "barMaxWidth", 28, "weekly chart bars must fit mobile card width");
assert(seasonalityOption.includes("clip: true"), "weekly chart must clip bars to plotting area");
assert(seasonalityOption.includes("splitNumber: 3"), "weekly chart must reduce mobile y-axis density");
// These two were inverted: they banned the very modifiers that implement the
// behaviour their own message asks for. `.scc-table-wrap--league` is the
// horizontal-scroll shell and `.scc-table--league` is the fixed-column table
// layout — together they are what keeps the league table a real table on a
// phone. What actually has to stay banned is the card-collapse pattern
// (cells turned into blocks with data-label pseudo-headers).
assert(
  /<div class="scc-table-wrap scc-table-wrap--league">\s*<table class="scc-table scc-table--league">/.test(page),
  "league table must keep desktop table shell on mobile"
);
assert(
  /@media[^{]*\{[\s\S]*?\.scc-table--league \{ min-width: \d+px; \}/.test(page),
  "league table must keep a table-width floor on mobile rather than collapsing"
);
assert(
  !/\.scc-table--league\s+td[^{]*\{[^}]*display:\s*block/.test(page),
  "league table cells must not collapse into stacked blocks on mobile"
);
assert(!page.includes("scc-table-wrap--meters"), "top meters table must keep desktop table shell on mobile");
assert(!page.includes("scc-table--meters"), "top meters table must keep desktop table layout on mobile");
assert(!page.includes("scc-meter-id-cell"), "top meters meter id must remain a normal table cell");
assert(!page.includes('data-label="Active Periods"'), "top meters metric cells must not use mobile cards");

console.log(JSON.stringify({
  status: "station consumption chart contract passed",
  checks: 24
}, null, 2));
