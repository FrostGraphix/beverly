const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/styles/legacy-dashboard.css"), "utf8");
const modalCss = fs.readFileSync(path.join(root, "src/styles/legacy-modals.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "src/components/DashboardPage.vue"), "utf8");
const chartService = fs.readFileSync(path.join(root, "src/services/dashboard-chart-options.mjs"), "utf8");

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] || "";
}

const cardRule = ruleFor(".dashboard-stat-card");
const gridRule = ruleFor(".dashboard-card-grid");
const iconRule = ruleFor(".dashboard-stat-icon");
const valueRule = ruleFor(".dashboard-stat-value");

assert(cardRule.includes("min-height: 98px"), "Dashboard cards should stay compact.");
assert(cardRule.includes("padding: 14px 14px"), "Dashboard card padding should remain balanced.");
assert(gridRule.includes("gap: 18px"), "Dashboard card spacing should remain consistent.");
assert(iconRule.includes("width: 44px"), "Dashboard stat icons should stay compact.");
assert(valueRule.includes("font-size: clamp(20px, 1.88vw, 28px)"), "Dashboard values should retain desktop hierarchy.");
assert(css.includes("font-size: 16px"), "Mobile dashboard values should fit without truncation.");
assert(css.includes("height: 300px; min-height: 280px"), "Mobile charts should remain compact.");
assert(!modalCss.includes(".dashboard-stat-value"), "Modal CSS must not override dashboard values.");
assert(!modalCss.includes(".dashboard-card-grid"), "Modal CSS must not override dashboard layout.");
assert(!dashboard.includes("referenceConsumption"), "Dashboard must not display stale consumption samples.");
assert(dashboard.includes("setInterval(() => this.loadDataset(this.activeType, false), 300000)"), "Dashboard should refresh every five minutes.");
assert(dashboard.includes('document.addEventListener("visibilitychange"'), "Dashboard should refresh when reopened.");
assert(dashboard.includes("syncThemePalette"), "Dashboard should sync chart colors from the active theme.");
assert(dashboard.includes("observeThemeChanges"), "Dashboard should react to theme changes.");
assert(!dashboard.includes("color: \"#f4516c\""), "Dashboard cards should not hardcode the old red card color.");
assert(chartService.includes("chartTheme"), "Dashboard chart options should accept themed colors.");
assert(chartService.includes("tooltipText"), "Dashboard chart tooltip text should be theme controlled.");
assert(chartService.includes("alarmColors"), "Abnormal alarm should accept per-alarm indicator colors.");
assert(chartService.includes("borderWidth: 0"), "Abnormal alarm segments should not have a white outline.");
assert(chartService.includes("textBorderWidth: 0"), "Abnormal alarm labels should not render white text outlines.");

console.log("dashboard-ui-contract ok");
