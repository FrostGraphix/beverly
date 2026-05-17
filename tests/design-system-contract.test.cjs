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
  "src/components/base/BaseModalShell.vue"
]) {
  exists(file);
}

const architecture = read("ARCHITECTURE.md");
const appVue = read("src/App.vue");
const actionModal = read("src/components/ActionModal.vue");
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
const pickerModal = read("src/components/PickerModal.vue");
const tablePage = read("src/components/TablePage.vue");
const taskOutputModal = read("src/components/TaskOutputModal.vue");
const successModal = read("src/components/SuccessModal.vue");
const profilePage = read("src/components/ProfilePage.vue");
const settingsPage = read("src/components/SettingsPage.vue");
const dailyDataMeterPage = read("src/components/DailyDataMeterPage.vue");
const consumptionStatisticsPage = read("src/components/ConsumptionStatisticsPage.vue");
const dashboardPage = read("src/components/DashboardPage.vue");
const siteConsumptionPage = read("src/components/SiteConsumptionPage.vue");
const customerDrawer = read("src/components/consumption/CustomerDrawer.vue");
const stationSummaryGrid = read("src/components/consumption/StationSummaryGrid.vue");
const suspectLedger = read("src/components/consumption/SuspectLedger.vue");
const temporalLineChart = read("src/components/consumption/TemporalLineChart.vue");
const toastNotification = read("src/components/ToastNotification.vue");
const siteSidebar = read("src/components/consumption/SiteSidebar.vue");

assert(referenceCss.trimStart().startsWith('@import "./tokens.css";'), "tokens.css must load first.");
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

for (const theme of ["light", "dark", "executive", "ocean", "contrast"]) {
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
assert(siteConsumptionPage.includes("BaseButton"), "SiteConsumptionPage controls should consume BaseButton.");
assert(siteConsumptionPage.includes("BaseInput"), "SiteConsumptionPage date fields should consume BaseInput.");
assert(siteConsumptionPage.includes("BaseIconButton"), "SiteConsumptionPage icon controls should consume BaseIconButton.");
assert(loginPage.includes("BaseButton"), "LoginPage actions should consume BaseButton.");
assert(loginPage.includes("BaseInput"), "LoginPage fields should consume BaseInput.");
assert(loginPage.includes("BaseIconButton"), "LoginPage icon controls should consume BaseIconButton.");
assert(loginPage.includes("BaseCheckbox"), "LoginPage checkbox should consume BaseCheckbox.");
assert(customerDrawer.includes("BaseButton"), "CustomerDrawer actions should consume BaseButton.");
assert(customerDrawer.includes("BaseIconButton"), "CustomerDrawer close should consume BaseIconButton.");
assert(stationSummaryGrid.includes("BaseButton"), "StationSummaryGrid actions should consume BaseButton.");
assert(suspectLedger.includes("BaseButton"), "SuspectLedger actions should consume BaseButton.");
assert(suspectLedger.includes("BaseInput"), "SuspectLedger search should consume BaseInput.");
assert(suspectLedger.includes("BaseSelect"), "SuspectLedger filters should consume BaseSelect.");
assert(suspectLedger.includes("BaseIconButton"), "SuspectLedger drill button should consume BaseIconButton.");
assert(temporalLineChart.includes("BaseButton"), "TemporalLineChart toggles should consume BaseButton.");
assert(toastNotification.includes("BaseIconButton"), "ToastNotification close should consume BaseIconButton.");
assert(siteSidebar.includes("BaseButton"), "SiteSidebar station pills should consume BaseButton.");
assert(combinedCss.includes(".theme-command-menu"), "Expected legacy component CSS through import hub.");
assert(combinedCss.includes(".batch-task-preview"), "Batch remote-task preview should have shared modal styling.");
assert(architecture.includes("## Design System"), "Architecture should document design-system ownership.");

console.log("design-system-contract ok");
