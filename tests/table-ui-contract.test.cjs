const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file, expected) {
  assert(
    file.includes(expected),
    `Expected ${expected} in file content`
  );
}

const globalCss = `${readProjectFile("src/styles/reference.css")}\n${readProjectFile("src/styles/primitives.css")}\n${fs.readdirSync(path.join(root, "src/styles"))
  .filter((file) => file.startsWith("legacy-") && file.endsWith(".css"))
  .map((file) => readProjectFile(`src/styles/${file}`))
  .join("\n")}`;
const tablePage = readProjectFile("src/components/TablePage.vue");
const loginPage = readProjectFile("src/components/LoginPage.vue");
const dailyDataMeterPage = readProjectFile("src/components/DailyDataMeterPage.vue");
const pickerModal = readProjectFile("src/components/PickerModal.vue");
const consumptionStatisticsPage = readProjectFile("src/components/ConsumptionStatisticsPage.vue");
const customerDrawer = readProjectFile("src/components/consumption/CustomerDrawer.vue");
const suspectLedger = readProjectFile("src/components/consumption/SuspectLedger.vue");

assertIncludes(globalCss, "TABLE COMMAND CENTER");
assertIncludes(globalCss, "border-collapse: separate");
assertIncludes(globalCss, "font-variant-numeric: tabular-nums");
assertIncludes(globalCss, "[data-theme=\"executive\"] .filter-toolbar");
assertIncludes(globalCss, "th.action-column,");
assertIncludes(globalCss, "min-width: 240px");
assertIncludes(globalCss, "width: 240px");
assertIncludes(globalCss, "[data-theme] .link-btn");

assertIncludes(tablePage, "table-command-strip");
assertIncludes(tablePage, "displayedTotal()");
assertIncludes(tablePage, "Number(this.total) > this.filteredTotal");
assertIncludes(tablePage, "Total {{ displayedTotal }}");
assertIncludes(tablePage, ":aria-label=\"`${action} row ${rowIndex + 1}`\"");
assertIncludes(tablePage, "min-width: var(--table-action-column-width, 240px)");
assertIncludes(tablePage, ":data-column-key=\"getColKey(column)\"");
assertIncludes(tablePage, "data-testid=\"table-apply-controls\"");
assertIncludes(tablePage, "data-testid=\"table-select-all\"");
assertIncludes(tablePage, ":data-testid=\"`table-toolbar-action-${actionTestId(action)}`\"");
assertIncludes(tablePage, ":data-testid=\"`table-row-action-${actionTestId(action)}-${rowIndex + 1}`\"");
assertIncludes(tablePage, ".table-scroll th:not(.action-column)");
assertIncludes(tablePage, ".table-scroll th.action-column");

assertIncludes(loginPage, "data-testid=\"login-user-id\"");
assertIncludes(loginPage, "data-testid=\"login-password\"");
assertIncludes(loginPage, "data-testid=\"login-submit\"");

assertIncludes(dailyDataMeterPage, "Meter interval ledger");
assertIncludes(dailyDataMeterPage, "aria-label=\"Search interval meter data\"");

assertIncludes(pickerModal, "box-shadow: var(--shadow-xl)");
assertIncludes(pickerModal, "selected-row td");

assertIncludes(consumptionStatisticsPage, "consumption-sort-panel");
assertIncludes(consumptionStatisticsPage, "Pick a Customer Id first");
assertIncludes(consumptionStatisticsPage, "exportReportPdfText");
assertIncludes(consumptionStatisticsPage, "syncThemePalette");
assertIncludes(consumptionStatisticsPage, "observeThemeChanges");
assertIncludes(consumptionStatisticsPage, "var(--text-strong)");
assertIncludes(consumptionStatisticsPage, "var(--primary-light)");

const consumptionStyle = consumptionStatisticsPage.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] || "";
assert(
  !/#[0-9a-fA-F]{3,8}|rgba\(/.test(consumptionStyle),
  "Consumption statistics scoped CSS should use theme tokens instead of raw colors"
);

assertIncludes(customerDrawer, ".recharge-table { width: 100%; border-collapse: separate");
assertIncludes(suspectLedger, ".ledger-table { width: 100%; border-collapse: separate");
assertIncludes(suspectLedger, "ledger-action-col");

console.log("table-ui-contract ok");
