const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  assert(fs.existsSync(path.join(root, relativePath)), `Missing ${relativePath}`);
}

for (const file of [
  "src/styles/tokens.css",
  "src/styles/themes.css",
  "src/styles/primitives.css",
  "src/styles/layouts.css",
  "src/components/base/BaseButton.vue",
  "src/components/base/BaseCheckbox.vue",
  "src/components/base/BaseIconButton.vue",
  "src/components/base/BaseInput.vue",
  "src/components/base/BaseSelect.vue",
  "src/components/base/BaseToggle.vue",
  "src/components/base/BaseBadge.vue",
  "src/components/base/BaseConfirmDialog.vue",
  "src/components/base/BaseModalShell.vue"
]) {
  exists(file);
}

const architecture = read("ARCHITECTURE.md");
const appVue = read("src/App.vue");
const routeManifest = read("src/data/route-manifest.js");
const actionModal = [
  "src/components/ActionModal.vue",
  "src/components/ActionModalGeneric.vue",
  "src/components/ActionModalPrint.vue",
  "src/components/ActionModalRemoteTask.vue",
  "src/components/ActionModalSopFlow.vue",
  "src/components/ActionModalTokenFlow.vue"
].map(read).join("\n");
const loginPage = read("src/components/LoginPage.vue");
const referenceCss = read("src/styles/reference.css");
const legacyCss = fs.readdirSync(path.join(root, "src/styles"))
  .filter((file) => file.startsWith("legacy-") && file.endsWith(".css"))
  .map((file) => read(`src/styles/${file}`))
  .join("\n");
const combinedCss = `${referenceCss}\n${legacyCss}`;
const tokensCss = read("src/styles/tokens.css");
const themesCss = read("src/styles/themes.css");
const primitivesCss = read("src/styles/primitives.css");
const layoutsCss = read("src/styles/layouts.css");
const crmSidebarCss = read("src/styles/crm-wallet-sidebar.css");
const pickerModal = read("src/components/PickerModal.vue");
const tablePage = read("src/components/TablePage.vue");
const taskOutputModal = read("src/components/TaskOutputModal.vue");
const successModal = read("src/components/SuccessModal.vue");
const profilePage = read("src/components/ProfilePage.vue");
const settingsPage = read("src/components/SettingsPage.vue");
const dailyDataMeterPage = read("src/components/DailyDataMeterPage.vue");
const consumptionStatisticsPage = read("src/components/ConsumptionStatisticsPage.vue");
const dashboardPage = read("src/components/DashboardPage.vue");
const customerDrawer = read("src/components/consumption/CustomerDrawer.vue");
const stationSummaryGrid = read("src/components/consumption/StationSummaryGrid.vue");
const suspectLedger = read("src/components/consumption/SuspectLedger.vue");
const temporalLineChart = read("src/components/consumption/TemporalLineChart.vue");
const toastNotification = read("src/components/ToastNotification.vue");
const siteSidebar = read("src/components/consumption/SiteSidebar.vue");
const confirmDialog = read("src/components/base/BaseConfirmDialog.vue");
const exportToolbar = read("src/components/base/ExportToolbar.vue");
const exportRangeMenu = read("src/components/base/ExportRangeMenu.vue");
const reportsPage = read("src/components/ReportsPage.vue");
const adminDashboard = read("apps/admin/src/views/Dashboard.vue");
const adminReports = read("apps/admin/src/views/Reports.vue");
const adminRefunds = read("apps/admin/src/views/Refunds.vue");
const adminSupport = read("apps/admin/src/views/Support.vue");
const sharedTokensCss = read("packages/tokens/tokens.css");
const walletCss = read("packages/tokens/wallet.css");

assert(referenceCss.trimStart().startsWith('@import "./tokens.css";'), "tokens.css must load first.");
assert(tokensCss.trimStart().startsWith('@import "../../packages/tokens/tokens.css";'), "CRM tokens must inherit shared Beverly primitives.");
assert(tokensCss.includes('@import "../../packages/tokens/theme.css";'), "CRM tokens must inherit shared Beverly themes.");
for (const alias of [
  "--bev-font-sans: var(--font-sans)",
  "--bev-space-4: var(--s-4)",
  "--bev-radius-md: var(--r-md)",
  "--bev-shadow-md: var(--shadow-2)"
]) {
  assert(tokensCss.includes(alias), `Expected shared token alias ${alias}`);
}
for (const status of ["active", "approved", "pending", "reversed", "frozen", "failed", "offline", "suspended"]) {
  assert(sharedTokensCss.includes(`--status-${status}:`), `Expected shared status token ${status}`);
  assert(sharedTokensCss.includes(`--status-${status}-soft:`), `Expected shared soft status token ${status}`);
}
assert(walletCss.includes(".bw-badge.reversed"), "Wallet badges must expose named status utilities.");
assert(walletCss.includes("var(--semantic-negative-soft)"), "Wallet feedback must consume semantic status colors.");
assert(referenceCss.includes('@import "./themes.css";'), "themes.css must be imported.");
assert(referenceCss.includes('@import "./primitives.css";'), "primitives.css must be imported.");
assert(referenceCss.includes('@import "./layouts.css";'), "layouts.css must be imported.");
assert(referenceCss.includes('@import "./legacy-components.css";'), "legacy-components.css must be imported.");

for (const token of [
  "--bev-color-green-600",
  "--color-brand",
  "--button-height-md",
  "--field-height",
  "--bev-touch-target-min",
  "--table-action-column-width",
  "--shell-sidebar-width"
]) {
  assert(tokensCss.includes(token), `Expected token ${token}`);
}

for (const theme of ["light", "executive", "contrast"]) {
  assert(themesCss.includes(`[data-theme="${theme}"]`), `Expected theme ${theme}`);
}

for (const primitive of [
  ".base-button",
  ".base-button--primary",
  ".base-checkbox",
  ".base-icon-button",
  ".base-toggle",
  ".bev-field",
  ".base-badge",
  ".base-modal-shell"
]) {
  assert(primitivesCss.includes(primitive), `Expected primitive ${primitive}`);
}

assert(layoutsCss.includes(".bev-page-surface"), "Expected page layout contract.");
assert(layoutsCss.includes(".bev-command-strip"), "Expected command strip contract.");
assert(pickerModal.includes("BaseButton"), "PickerModal should consume BaseButton.");
assert(pickerModal.includes("BaseInput"), "PickerModal should consume BaseInput.");
assert(pickerModal.includes("BaseSelect"), "PickerModal should consume BaseSelect.");
assert(taskOutputModal.includes("BaseButton"), "TaskOutputModal should consume BaseButton.");
assert(taskOutputModal.includes("BaseIconButton"), "TaskOutputModal should consume BaseIconButton.");
assert(successModal.includes("BaseButton"), "SuccessModal should consume BaseButton.");
assert(appVue.includes("BaseIconButton"), "App shell should consume BaseIconButton.");
assert(appVue.includes('role="separator"'), "Desktop sidebar needs an accessible resize handle.");
assert(appVue.includes('aria-label="Filter navigation links"'), "Sidebar search must filter navigation links.");
assert(appVue.includes("sidebarGroups()"), "Sidebar navigation must expose filtered groups.");
assert.match(
  appVue,
  /this\.expandedGroups\s*=\s*Object\.fromEntries\(\s*routeGroups\(this\.currentRoleId\)/s,
  "Permitted sidebar groups must be expanded after authentication."
);
assert(crmSidebarCss.includes("cursor: col-resize"), "Sidebar resize handle must advertise dragging.");
assert(!appVue.includes('class="theme-swatch"'), "Theme choices must show names only.");
assert(appVue.includes('class="user-theme-submenu"'), "Theme choices must remain a compact submenu.");
const routeHashes = [...routeManifest.matchAll(/hash:\s*"([^"]+)"/g)].map((match) => match[1]);
const shellChrome = read("src/data/shell-chrome.mjs");
const routeIconBlock = shellChrome.match(/const routeIconOverrides = \{([\s\S]*?)\n\};/)?.[1] || "";
const routeIcons = new Map([...routeIconBlock.matchAll(/"(#[^"]+)":\s*(?:"([^"]+)"|routeIconPaths\.([a-z]+))/g)]
  .map((match) => [match[1], match[2] || `routeIconPaths.${match[3]}`]));
assert.deepStrictEqual(routeHashes.filter((hash) => !routeIcons.has(hash)), [], "Every sidebar route needs an explicit icon.");
assert.strictEqual(new Set(routeIcons.values()).size, routeIcons.size, "Every sidebar route icon must be unique.");
assert(tablePage.includes("BaseButton"), "TablePage toolbar should consume BaseButton.");
assert(tablePage.includes("BaseInput"), "TablePage search should consume BaseInput.");
assert(tablePage.includes("BaseSelect"), "TablePage filters should consume BaseSelect.");
assert(actionModal.includes("BaseButton"), "ActionModal actions should consume BaseButton.");
assert(actionModal.includes("BaseIconButton"), "ActionModal icon controls should consume BaseIconButton.");
assert(actionModal.includes("BaseInput"), "ActionModal fields should consume BaseInput.");
assert(actionModal.includes("BaseSelect"), "ActionModal selects should consume BaseSelect.");
assert(actionModal.includes("BaseCheckbox"), "ActionModal checkboxes should consume BaseCheckbox.");
assert(actionModal.includes("batch-task-preview"), "ActionModal batch flow should preview selected meters.");
assert(actionModal.includes("remoteBatchStep"), "ActionModal batch flow should support a review step.");
assert(actionModal.includes("selectedMeterIds"), "ActionModal batch flow should track selected meters.");
assert(actionModal.includes("selectedDataItems"), "ActionModal batch flow should track selected data items.");
assert(actionModal.includes("multiple size=\"8\""), "ActionModal batch flow should support multi-select meters.");
assert(read("src/components/base/BaseButton.vue").includes("nativeType"), "BaseButton should support submit buttons.");
assert(profilePage.includes("BaseButton"), "ProfilePage actions should consume BaseButton.");
assert(profilePage.includes("BaseIconButton"), "ProfilePage icon controls should consume BaseIconButton.");
assert(profilePage.includes("BaseInput"), "ProfilePage fields should consume BaseInput.");
assert(settingsPage.includes("BaseToggle"), "SettingsPage switches should consume BaseToggle.");
assert(dailyDataMeterPage.includes("BaseButton"), "DailyDataMeterPage controls should consume BaseButton.");
assert(dailyDataMeterPage.includes("BaseInput"), "DailyDataMeterPage fields should consume BaseInput.");
assert(dailyDataMeterPage.includes("BaseSelect"), "DailyDataMeterPage filters should consume BaseSelect.");
assert(consumptionStatisticsPage.includes("BaseButton"), "ConsumptionStatisticsPage controls should consume BaseButton.");
assert(consumptionStatisticsPage.includes("BaseInput"), "ConsumptionStatisticsPage fields should consume BaseInput.");
assert(consumptionStatisticsPage.includes("BaseSelect"), "ConsumptionStatisticsPage filters should consume BaseSelect.");
assert(consumptionStatisticsPage.includes("BaseIconButton"), "ConsumptionStatisticsPage icon controls should consume BaseIconButton.");
assert(consumptionStatisticsPage.includes("BaseCheckbox"), "ConsumptionStatisticsPage selections should consume BaseCheckbox.");
assert(dashboardPage.includes("BaseButton"), "DashboardPage controls should consume BaseButton.");
assert(loginPage.includes("BaseButton"), "LoginPage actions should consume BaseButton.");
assert(loginPage.includes("BaseInput"), "LoginPage fields should consume BaseInput.");
assert(loginPage.includes("BaseIconButton"), "LoginPage icon controls should consume BaseIconButton.");
assert(loginPage.includes("BaseCheckbox"), "LoginPage checkbox should consume BaseCheckbox.");
assert(loginPage.includes("Beverly is unreachable. Check your connection, then retry."), "Login transport errors need actionable recovery copy.");
assert(loginPage.includes('aria-label="Dismiss error"'), "Login errors need a dismiss control.");
assert(customerDrawer.includes("BaseButton"), "CustomerDrawer actions should consume BaseButton.");
assert(customerDrawer.includes("BaseIconButton"), "CustomerDrawer close should consume BaseIconButton.");
assert(stationSummaryGrid.includes("BaseButton"), "StationSummaryGrid actions should consume BaseButton.");
assert(suspectLedger.includes("BaseButton"), "SuspectLedger actions should consume BaseButton.");
assert(suspectLedger.includes("BaseInput"), "SuspectLedger search should consume BaseInput.");
assert(suspectLedger.includes("BaseSelect"), "SuspectLedger filters should consume BaseSelect.");
assert(suspectLedger.includes("BaseIconButton"), "SuspectLedger drill button should consume BaseIconButton.");
assert(temporalLineChart.includes("BaseButton"), "TemporalLineChart toggles should consume BaseButton.");
assert(toastNotification.includes("BaseIconButton"), "ToastNotification close should consume BaseIconButton.");
assert(toastNotification.includes("this.toasts.length >= 3"), "Toast stacks must remain bounded.");
assert(toastNotification.includes("prefers-reduced-motion"), "Toast motion must respect user preferences.");
assert(siteSidebar.includes("BaseButton"), "SiteSidebar station pills should consume BaseButton.");
assert(confirmDialog.includes('role="alertdialog"'), "Destructive confirmation must use alertdialog semantics.");
assert(exportToolbar.includes("export-menu--up"), "Export menus must flip above cramped viewports.");
assert(exportToolbar.includes("export-toolbar--open"), "Open export menus need their own overlay layer.");
assert(exportToolbar.includes("@media (max-width: 640px)"), "Export format controls need mobile layout rules.");
assert(exportRangeMenu.includes("export-range-menu--open"), "Open export panels need their own overlay layer.");
assert(exportRangeMenu.includes("max-height: calc(100dvh - 24px)"), "Export range panels must remain viewport-bound.");
assert(exportRangeMenu.includes("grid-template-columns: repeat(3"), "Export periods must reflow on mobile.");
assert(primitivesCss.includes(".base-table-shell__toolbar") && primitivesCss.includes("z-index: 20"), "Table toolbars must layer above table content.");
assert(tablePage.includes('class="skeleton-row"'), "Table loading must preserve table geometry.");
assert(tablePage.includes('No records yet'), "Table emptiness must provide one clear message.");
assert(reportsPage.includes('Use 30 days'), "Report emptiness must provide one recovery action.");
assert(adminDashboard.includes('kpi-skeleton'), "Admin dashboard loading must use skeletons.");
assert(adminReports.includes('rp-chart-skeleton'), "Admin report loading must use skeletons.");
assert(!adminReports.includes('class="bw-loading"'), "Admin reports must not use loading spinners.");
assert(adminRefunds.includes("ConfirmDialog"), "Refund decisions must use shared confirmations.");
assert(adminSupport.includes('@click="loadTickets"'), "Support emptiness must provide recovery.");
assert(combinedCss.includes(".theme-command-menu"), "Expected legacy component CSS through import hub.");
assert(combinedCss.includes(".batch-task-preview"), "Batch remote-task preview should have shared modal styling.");
assert(architecture.includes("## Design System"), "Architecture should document design-system ownership.");

console.log("design-system-contract ok");
