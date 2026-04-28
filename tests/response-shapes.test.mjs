import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeActionResult, normalizeChartPayload, normalizeCollection, normalizeDashboardMetrics } from "../src/services/response-normalizers.mjs";
import { mapExportRows } from "../src/services/record-mappers.mjs";
import { buildReceiptModel } from "../src/services/receipt-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reference-route-manifest.json"), "utf8"));

function readSample(filename) {
  return JSON.parse(fs.readFileSync(path.join(root, "contracts", "samples", filename), "utf8")).body;
}

function columnKey(label) {
  const map = {
    "Customer Id": "customerId",
    "Meter Id": "meterId",
    "Tariff Id": "tariffId",
    "Communication Way": "communicationWay",
    "CT Ratio": "ctRatio",
    "Remark": "remark",
    "Create Time": "createTime",
    "Update Time": "updateTime",
    "Station Id": "stationId",
    "Customer Name": "customerName",
    "Data Item": "dataItem",
    "Data Value": "dataValue",
    "Status": "status",
    "Gateway Id": "gatewayId",
    "Collection Date": "collectionDate",
    "Total Energy": "totalEnergy",
    "Last Hour Usage": "lastHourUsage",
    "Credit Balance": "creditBalance",
    "Maximum Demand": "maximumDemand",
    "Power": "power",
    "Relay Status": "relayStatus",
    "Battery Status": "batteryStatus",
    "Magnetic Status": "magneticStatus",
    "Terminal Cover": "terminalCover",
    "Upper Open": "upperOpen",
    "Current Reverse": "currentReverse",
    "Current Unbalance": "currentUnbalance"
  };
  return map[label] || label;
}

const accountRoute = manifest.find((route) => route.hash === "#/management/account");
const remoteTaskRoute = manifest.find((route) => route.hash === "#/remote-operation-record/remote-meter-reading-task");
const intervalRoute = manifest.find((route) => route.hash === "#/prepay-report/daily-data-meter");
const accountSample = normalizeCollection(readSample("account-read.code-msg-data.json"));
const remoteSample = normalizeCollection(readSample("remote-meter-reading-task.code-reason-result.json"));
const intervalSample = normalizeCollection(readSample("daily-data-meter.raw-array.json"));
const liveCreditSample = normalizeCollection(readSample("api__token__creditTokenRecord__readMore.json"));
const liveHourlySample = normalizeCollection(readSample("api__DailyDataMeter__readHourly.json"));
const actionSample = normalizeActionResult(readSample("credit-token-generate.code-reason-result.json"));
const dashboardSample = normalizeDashboardMetrics({
  code: 0,
  reason: "success",
  result: {
    totalAccountCount: 2420,
    totalPurchaseTimes: 7305,
    totalPurchaseUnit: 100369,
    totalPurchaseMoney: 35253085
  }
});
const chartSample = normalizeChartPayload({
  code: 200,
  msg: "success",
  data: {
    title: "Purchase Money",
    xData: ["04-24", "04-25"],
    yData: [320000, 260000]
  }
});

assert.strictEqual(accountSample.rows.length, 2);
assert.strictEqual(accountSample.total, 2420);
assert.strictEqual(remoteSample.rows.length, 1);
assert.strictEqual(remoteSample.total, 1);
assert.strictEqual(intervalSample.rows.length, 2);
assert.strictEqual(intervalSample.total, 2);
assert(liveCreditSample.rows.length > 0);
assert(liveHourlySample.rows.length > 0);
assert(liveHourlySample.total >= liveHourlySample.rows.length);
assert.strictEqual(actionSample.token, "0021 2636 8628 4408 6688");
assert.strictEqual(dashboardSample.totalAccountCount, 2420);
assert.strictEqual(chartSample.title, "Purchase Money");

const exportRows = mapExportRows(accountRoute, accountSample.rows, columnKey);
const printModel = buildReceiptModel(remoteTaskRoute, remoteSample.rows[0], columnKey);
assert.strictEqual(exportRows.length, 2);
assert.strictEqual(exportRows[0]["Customer Id"], "470005342689");
assert(printModel.fields.some((field) => field.label === "Meter Id" && field.value === "470005342689"));

for (const route of manifest.filter((item) => item.hash !== "#/dashboard")) {
  const sample = route.hash.includes("remote-operation-record")
    ? remoteSample
    : route.hash.includes("daily-data-meter")
      ? intervalSample
      : accountSample;
  assert(Array.isArray(sample.rows), `Missing rows for ${route.hash}`);
}

console.log(JSON.stringify({
  accountRows: accountSample.rows.length,
  liveCreditRows: liveCreditSample.rows.length,
  liveHourlyRows: liveHourlySample.rows.length,
  remoteRows: remoteSample.rows.length,
  intervalRows: intervalSample.rows.length,
  exportRows: exportRows.length,
  printFields: printModel.fields.length,
  status: "response shapes passed"
}, null, 2));
