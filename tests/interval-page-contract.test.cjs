const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "components", "DailyDataMeterPage.vue"), "utf8").replace(/\r\n/g, "\n");
const exportMenu = fs.readFileSync(path.join(root, "src", "components", "base", "ExportRangeMenu.vue"), "utf8").replace(/\r\n/g, "\n");

assert(!page.includes("Sort by..."), "Interval Data should not render the Sort by dropdown.");
assert(!page.includes('aria-label="Sort by"'), "Interval Data should remove the Sort by control.");
assert(page.includes('aria-label="Sort direction options"'), "Interval Data should keep the direction control.");
assert(page.indexOf('/api/DailyDataMeter/readMore') < page.indexOf('/api/DailyDataMeter/readHourly'), "Hourly modal should prefer readMore for real create time.");
assert(page.includes("item.createDate || item.createTime"), "Hourly modal date filter should keep rows that only expose create time.");
assert(page.includes(".map(normalizeDailyMeterRow)"), "Hourly modal rows should be normalized before rendering create time.");
assert(page.includes("tableHealthText"), "Main table should use table-specific status normalization.");
assert(page.includes("healthText(row.relayOpen ?? row.relayStatus)"), "Hourly modal status cells should use explicit normalization.");
assert(page.includes("normalizeIntervalTableStatus"), "Hourly modal should align with interval table polarity.");
assert(!page.includes("normalizeIntervalStatus"), "DailyDataMeterPage should avoid the ambiguous interval status normalizer.");
assert(page.includes("healthText(value) {\n      // Hourly modal uses same polarity users expect in Interval table.\n      return normalizeIntervalTableStatus(value);"), "Hourly text should map status with interval table polarity.");
assert(page.includes("healthClass(value) {\n      return normalizeIntervalTableStatus(value) === \"Normal\""), "Hourly class should map status with interval table polarity.");
assert(page.includes('/api/DailyDataMeter/export.xlsx?'), "Interval export should use the streaming endpoint.");
assert(page.includes('document.createElement("a")'), "Interval export should use a native browser download.");
assert(page.includes('exportRange: "all"'), "Interval export should default to complete history.");
assert(exportMenu.includes('{ value: "1d"') && exportMenu.includes('{ value: "1y"'), "Interval export should offer requested date ranges.");
assert(page.includes('search: this.searchTerm.trim()'), "Interval export should send the active search filter.");
assert(page.includes('format="XLSX"'), "Interval export should identify its workbook format.");
assert(!page.includes('Preparing XLSX'), "Interval export must not buffer XLSX data in the browser.");
assert(page.includes('.ddm-toolbar { position: relative; z-index: 100; overflow: visible;'), "Interval export options must render above sticky table columns.");

console.log("interval-page-contract ok");
