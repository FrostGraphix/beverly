import assert from "node:assert";
import { mapActionResponse, mapWriteLog } from "../src/services/mappers/action-mapper.mjs";
import { mapDashboardDataset, mapDashboardPanels } from "../src/services/mappers/dashboard-mapper.mjs";
import { mapTableCollection } from "../src/services/mappers/table-mapper.mjs";

const panels = mapDashboardPanels([
  {
    code: 0,
    result: {
      totalAccountCount: 2420,
      totalPurchaseTimes: 7305,
      totalPurchaseUnit: 100369,
      totalPurchaseMoney: 35253085
    }
  }
]);

assert.strictEqual(panels.totalAccountCount, 2420);
assert.strictEqual(panels.totalPurchaseMoney, 35253085);

const dashboard = mapDashboardDataset({
  panelGroup: { result: panels },
  topChart: { result: { xData: [], yData: [] } },
  payments: {
    payments: [
      { timestamp: "2026-01-01T00:00:00.000Z", amount: 100 },
      { timestamp: "2026-01-01T01:00:00.000Z", amount: 50 }
    ]
  },
  hourly: {
    readings: [
      { collectionDate: "2026-01-01T00:00:00.000Z", totalEnergy: 1, consumption: 1 }
    ]
  },
  activeType: 3
});

assert.strictEqual(dashboard.top.labels[0], "2026-01-01");
assert.strictEqual(dashboard.top.values[0], 150);
assert.strictEqual(dashboard.consumption.values[0], 1);

const route = { hash: "#/management/account" };
const table = mapTableCollection({
  data: {
    rows: [{ id: "123", name: "Customer" }],
    total: 1
  }
}, route);

assert.strictEqual(table.rows[0].customerId, "123");
assert.strictEqual(table.total, 1);

const action = mapActionResponse({
  code: 0,
  result: {
    token: "1234"
  }
}, "Generate Token");
const log = mapWriteLog("/api/token/creditToken/generate", [{ amount: 100 }]);

assert.strictEqual(action.resultText, "Token: 1234");
assert.strictEqual(log.endpoint, "/api/token/creditToken/generate");

console.log(JSON.stringify({
  dashboardLabels: dashboard.top.labels.length,
  tableRows: table.rows.length,
  status: "shared mappers passed"
}, null, 2));
