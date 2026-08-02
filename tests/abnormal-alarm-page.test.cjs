const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/components/AbnormalAlarmPage.vue"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.vue"), "utf8");
const manifest = fs.readFileSync(path.join(root, "src/data/route-manifest.js"), "utf8");
const api = fs.readFileSync(path.join(root, "api/reference.js"), "utf8");

for (const contract of ["Total alarms", "Bypass candidates", "Alarm ledger", "Interval evidence", "Field inspection confirms bypass."]) {
  assert.ok(page.includes(contract), `missing page contract: ${contract}`);
}
assert.ok(page.includes('class="alarm-table"'), "alarm table missing");
assert.ok(page.includes('class="alarm-card-list"'), "alarm cards missing");
assert.ok(page.includes("alarm-view-switch"), "view switch missing");
assert.ok(page.includes('aria-label="List view"'), "list view icon missing");
assert.ok(page.includes('aria-label="Table view"'), "table view icon missing");
assert.ok(!page.includes("setViewMode('cards')"), "cards view must not remain selectable");
assert.ok(page.includes("ExportRangeMenu"), "consistent export missing");
assert.ok(app.includes("<AbnormalAlarmPage"), "page route missing");
assert.ok(manifest.includes('customComponent: "AbnormalAlarmPage"'), "custom manifest missing");
assert.ok(api.includes("summarizeAbnormalAlarms(filtered)"), "server summary missing");
assert.ok(api.includes("truncated: sourceTotal >"), "source coverage missing");
assert.ok(api.includes("stationScope = stationId ? [stationId] : await fetchLiveStationIds(request)"), "all-station aggregation missing");

console.log("abnormal alarm page tests passed");
