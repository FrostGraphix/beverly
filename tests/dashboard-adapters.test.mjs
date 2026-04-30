import assert from "node:assert";
import {
  buildAlarmLegendFromReadings,
  buildPurchaseRowsFromPayments,
  normalizeDashboardCards,
  normalizeDashboardLegend,
  normalizeDashboardSeries
} from "../src/services/live-report-adapters.mjs";

const rows = buildPurchaseRowsFromPayments([
  { timestamp: "2026-01-01T10:00:00.000Z", amount: 100 },
  { timestamp: "2026-01-01T11:00:00.000Z", amount: 50 },
  { timestamp: "2026-01-02T10:00:00.000Z", purchaseMoney: 25 }
]);

assert.deepStrictEqual(rows, [
  { collectionDate: "2026-01-01", amount: 150 },
  { collectionDate: "2026-01-02", amount: 25 }
]);

const cards = normalizeDashboardCards([
  {
    data: {
      summary: {
        totalAccounts: 42,
        totalPurchaseTimes: 11,
        totalPurchaseUnit: 500,
        totalPurchaseMoney: 7000
      }
    }
  }
]);

assert.deepStrictEqual(cards, {
  totalAccountCount: 42,
  totalPurchaseTimes: 11,
  totalPurchaseUnit: 500,
  totalPurchaseMoney: 7000
});

const series = normalizeDashboardSeries({
  data: {
    records: [
      { date: "2026-04-24", revenue: 1200 },
      { date: "2026-04-25", revenue: 900 }
    ]
  }
}, {
  fallbackTitle: "Revenue",
  labelKeys: ["date"],
  valueKeys: ["revenue"]
});

assert.deepStrictEqual(series, {
  title: "Revenue",
  labels: ["2026-04-24", "2026-04-25"],
  values: [1200, 900]
});

const legend = normalizeDashboardLegend({
  data: {
    list: [
      { name: "Critical", count: 3, color: "#ef4444" },
      { name: "Warning", count: 8, color: "#f59e0b" }
    ]
  }
});

assert.deepStrictEqual(legend, [
  { label: "Critical", value: 3, color: "#ef4444" },
  { label: "Warning", value: 8, color: "#f59e0b" }
]);

const derivedAlarmLegend = buildAlarmLegendFromReadings([
  {
    energyConsumptionKwh: 0,
    batteryStatus: "Low",
    relayStatus: "Open",
    terminalCover: "Open",
    currentReverse: "Yes",
    currentUnbalance: "Yes",
    magneticStatus: "Abnormal"
  },
  {
    energyConsumptionKwh: 1.4,
    batteryStatus: "Normal",
    relayStatus: "Closed",
    terminalCover: "Closed",
    currentReverse: "No",
    currentUnbalance: "No",
    magneticStatus: "Normal"
  }
]);

assert.deepStrictEqual(derivedAlarmLegend, [
  { label: "No Data Report", color: "#35c2c1", value: 1 },
  { label: "Active Readings", color: "#5caee8", value: 1 },
  { label: "Battery Low", color: "#ffb26a", value: 1 },
  { label: "Relay Open", color: "#f97316", value: 1 },
  { label: "Terminal Cover Open", color: "#0ea5e9", value: 1 },
  { label: "Current Reverse", color: "#8b5cf6", value: 1 },
  { label: "Current Unbalance", color: "#db2777", value: 1 },
  { label: "Magnetic Interference", color: "#ef4444", value: 1 }
]);

console.log(JSON.stringify({
  rows: rows.length,
  cards: cards.totalAccountCount,
  series: series.values.length,
  legend: legend.length + derivedAlarmLegend.length,
  status: "dashboard adapters passed"
}, null, 2));
