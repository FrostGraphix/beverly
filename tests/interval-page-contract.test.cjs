const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "components", "DailyDataMeterPage.vue"), "utf8");

assert(!page.includes("Sort by..."), "Interval Data should not render the Sort by dropdown.");
assert(!page.includes('aria-label="Sort by"'), "Interval Data should remove the Sort by control.");
assert(page.includes('aria-label="Sort direction"'), "Interval Data should keep the direction dropdown.");
assert(page.indexOf('/api/DailyDataMeter/readMore') < page.indexOf('/api/DailyDataMeter/readHourly'), "Hourly modal should prefer readMore for real create time.");
assert(page.includes("item.createDate || item.createTime"), "Hourly modal date filter should keep rows that only expose create time.");
assert(page.includes(".map(normalizeDailyMeterRow)"), "Hourly modal rows should be normalized before rendering create time.");
assert(page.includes("tableHealthText"), "Main table should use table-specific status normalization.");
assert(page.includes("healthText(row.relayOpen ?? row.relayStatus)"), "Hourly modal should use hourly/reference status normalization.");
assert(page.includes("normalizeHourlyStatus"), "Hourly modal should use the explicit hourly status normalizer.");
assert(!page.includes("normalizeIntervalStatus"), "DailyDataMeterPage should avoid the ambiguous interval status normalizer.");
assert(page.includes("healthText(value) {\n      return normalizeHourlyStatus(value);"), "Hourly text must not use inverted table status.");
assert(page.includes("healthClass(value) {\n      return normalizeHourlyStatus(value) === \"Normal\""), "Hourly class must not use inverted table status.");

console.log("interval-page-contract ok");
