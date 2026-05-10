const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/styles/reference.css"), "utf8");
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

assert(cardRule.includes("min-height: 74px"), "Dashboard cards should stay compact.");
assert(cardRule.includes("padding: 14px 20px"), "Dashboard card padding should match the previous compact size.");
assert(gridRule.includes("gap: 18px"), "Dashboard card spacing should match the previous layout.");
assert(iconRule.includes("width: 42px"), "Dashboard stat icons should stay compact.");
assert(valueRule.includes("font-size: 26px"), "Dashboard values should keep the previous stronger size.");
assert(dashboard.includes("syncThemePalette"), "Dashboard should sync chart colors from the active theme.");
assert(dashboard.includes("observeThemeChanges"), "Dashboard should react to theme changes.");
assert(!dashboard.includes("color: \"#f4516c\""), "Dashboard cards should not hardcode the old red card color.");
assert(chartService.includes("chartTheme"), "Dashboard chart options should accept themed colors.");
assert(chartService.includes("tooltipText"), "Dashboard chart tooltip text should be theme controlled.");
assert(chartService.includes("alarmColors"), "Abnormal alarm should accept per-alarm indicator colors.");
assert(chartService.includes("borderWidth: 0"), "Abnormal alarm segments should not have a white outline.");
assert(chartService.includes("textBorderWidth: 0"), "Abnormal alarm labels should not render white text outlines.");

console.log("dashboard-ui-contract ok");
