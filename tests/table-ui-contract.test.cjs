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
const apiService = readProjectFile("src/services/api.js");
const loginPage = readProjectFile("src/components/LoginPage.vue");
const dailyDataMeterPage = readProjectFile("src/components/DailyDataMeterPage.vue");
const pickerModal = readProjectFile("src/components/PickerModal.vue");
const consumptionStatisticsPage = readProjectFile("src/components/ConsumptionStatisticsPage.vue");
const customerDrawer = readProjectFile("src/components/consumption/CustomerDrawer.vue");
const suspectLedger = readProjectFile("src/components/consumption/SuspectLedger.vue");
const tokenFlow = readProjectFile("src/components/ActionModalTokenFlow.vue");
const adminDashboard = readProjectFile("apps/admin/src/views/Dashboard.vue");
const walletTableSkeleton = readProjectFile("packages/tokens/WalletTableSkeleton.vue");
const portalTables = [
  "apps/customer/src/views/Wallet.vue",
  "apps/customer/src/views/Transactions.vue",
  "apps/customer/src/views/FundingHistory.vue",
  "apps/customer/src/views/Consumption.vue",
  "apps/customer/src/views/Receipts.vue",
  "apps/vendor/src/views/Wallet.vue",
  "apps/vendor/src/views/Transactions.vue",
  "apps/vendor/src/views/FundingHistory.vue",
  "apps/vendor/src/views/MeterOrders.vue",
  "apps/vendor/src/views/Statement.vue",
  "apps/vendor/src/views/Disputes.vue",
  "apps/vendor/src/views/Receipts.vue",
  "apps/vendor/src/views/Consumption.vue",
].map(readProjectFile);

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
assertIncludes(tablePage, "this.total = 0;");
assertIncludes(tablePage, "routeUsesServerPagination(this.route)");
assertIncludes(tablePage, "requestOptions.pageNumber = this.currentPage;");
assertIncludes(tablePage, "requestOptions.pageSize = this.pageSize;");
assertIncludes(tablePage, "searchTerm: this.serverPaginated ? this.searchTerm : undefined");
assertIncludes(tablePage, "this.applyControls({ reloadServer: false });");
assertIncludes(tablePage, "if (this.serverPaginated) {");
assertIncludes(tablePage, ":aria-label=\"`${action} row ${rowIndex + 1}`\"");
assertIncludes(apiService, "error?.response?.data?.reason");
assertIncludes(apiService, "if (apiMessage) error.message = apiMessage;");
assertIncludes(tablePage, "min-width: var(--table-action-column-width, 240px)");
assertIncludes(tablePage, ":data-column-key=\"getColKey(column)\"");
assertIncludes(tablePage, "data-testid=\"table-apply-controls\"");
assertIncludes(tablePage, "data-testid=\"table-select-all\"");
assertIncludes(tablePage, ":data-testid=\"`table-toolbar-action-${actionTestId(action)}`\"");
assertIncludes(tablePage, ":data-testid=\"`table-row-action-${actionTestId(action)}-${rowIndex + 1}`\"");
assertIncludes(tablePage, ".table-scroll th:not(.action-column)");
assertIncludes(tablePage, ".table-scroll th.action-column");
assertIncludes(tablePage, "grid-template-columns: repeat(3, minmax(0, 1fr))");
assertIncludes(tablePage, ".ddm-actions-group :deep(.export-range-menu)");
assertIncludes(tablePage, "class=\"ddm-toolbar-group ddm-reset-group\"");
assertIncludes(tablePage, "grid-template-columns: minmax(0, 1fr) 52px minmax(92px, auto)");
assertIncludes(tablePage, ".ddm-search-group .search-input {");
assertIncludes(tablePage, ".ddm-reset-group {");
assertIncludes(tablePage, "management-stat-grid");
assertIncludes(tablePage, "Total Customers");
assertIncludes(tablePage, "Active Meters");
assertIncludes(tablePage, "Inactive Meters");
assertIncludes(tablePage, "loadManagementStats()");
assertIncludes(tokenFlow, "amount: this.action === \"Recharge\" ? \"\"");
assertIncludes(tokenFlow, "totalUnit: this.action === \"Recharge\" ? \"\"");
assertIncludes(tokenFlow, "{ id: \"meter\", number: 1, label: \"Meter\" }");
assertIncludes(tokenFlow, "{ id: \"final\", number: 4, label: \"Receipt\" }");
assertIncludes(tokenFlow, "class=\"token-meter-stage\"");
assertIncludes(tokenFlow, "class=\"token-quick-amounts\"");
assertIncludes(tokenFlow, "{{ tokenCopied ? 'Copied' : 'Copy Token' }}");
assertIncludes(tokenFlow, "resetRecharge()");
assertIncludes(tokenFlow, "Token generated. Receipt ready:");
assertIncludes(tokenFlow, "vatBreakdown.vatRateBasisPoints / 100");
assertIncludes(tokenFlow, "Total payable");
assertIncludes(tokenFlow, "formattedEnergyAmount");

assertIncludes(adminDashboard, "dashboard-section-skeleton-row");
assertIncludes(adminDashboard, "dashboard-vending-skeleton-row");
assertIncludes(adminDashboard, "recent-table-skeleton");
assertIncludes(adminDashboard, "recent-card-skeleton");
assertIncludes(adminDashboard, "dashboard-pagination-skeleton");
assert(!adminDashboard.includes('class="bw-card bw-skeleton" style="min-height:260px"'));
assertIncludes(walletTableSkeleton, "wallet-table-skeleton-row");
assertIncludes(walletTableSkeleton, "wallet-card-skeleton");
portalTables.forEach((table) => assertIncludes(table, "WalletTableSkeleton"));

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
assertIncludes(consumptionStatisticsPage, "Customer Id");
assertIncludes(consumptionStatisticsPage, "Meter Id");
assertIncludes(consumptionStatisticsPage, "Date Range");
assertIncludes(consumptionStatisticsPage, "Collection Date");
assertIncludes(consumptionStatisticsPage, "Consumption");
assertIncludes(consumptionStatisticsPage, "csp-reference-shell");

const consumptionStyle = consumptionStatisticsPage.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] || "";
assert(
  !/#[0-9a-fA-F]{3,8}|rgba\(/.test(consumptionStyle),
  "Consumption statistics scoped CSS should use theme tokens instead of raw colors"
);

assertIncludes(customerDrawer, ".recharge-table { width: 100%; border-collapse: separate");
assertIncludes(suspectLedger, ".ledger-table { width: 100%; border-collapse: separate");
assertIncludes(suspectLedger, "ledger-action-col");

console.log("table-ui-contract ok");
