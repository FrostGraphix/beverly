const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "components", "DailyDataMeterPage.vue"), "utf8");

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

console.log("interval-page-contract ok");
