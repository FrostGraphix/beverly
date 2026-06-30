import assert from "node:assert";
import {
  buildAlarmLegendFromReadings,
  buildPurchaseRowsFromPayments,
  normalizeDashboardCards,
  normalizeDashboardLegend,
  normalizeDashboardSeries
} from "../src/services/live-report-adapters.mjs";
import { mapDashboardDataset } from "../src/services/mappers/dashboard-mapper.mjs";

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

const referenceLegend = normalizeDashboardLegend({
  result: {
    xData: ["No Data Report", "Battery Low"],
    yData: [
      { name: "No Data Report", value: 10 },
      { name: "Battery Low", value: 9 }
    ]
  }
});

assert.deepStrictEqual(referenceLegend, [
  { label: "No Data Report", value: 10, color: "#2ec7c9" },
  { label: "Battery Low", value: 9, color: "#b6a2de" }
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
  { label: "No Data Report", color: "#2ec7c9", value: 1 },
  { label: "Active Readings", color: "#b6a2de", value: 1 },
  { label: "Battery Low", color: "#e5cf0d", value: 1 },
  { label: "Relay Open", color: "#97b552", value: 1 },
  { label: "Terminal Cover Open", color: "#d87a80", value: 1 },
  { label: "Current Reverse", color: "#5ab1ef", value: 1 },
  { label: "Current Unbalance", color: "#b6a2de", value: 1 },
  { label: "Magnetic Interference", color: "#8d98b3", value: 1 }
]);

const dashboardAlarmFallback = mapDashboardDataset({
  alarmChart: {
    result: {
      xData: ["No Data Report", "Battery Low"],
      yData: [0, 0]
    }
  }
});

assert.deepStrictEqual(dashboardAlarmFallback.alarms, [
  { label: "No Data Report", color: "#2ec7c9", value: 10 },
  { label: "Current Unbalance", color: "#b6a2de", value: 14 },
  { label: "Current Reverse", color: "#5ab1ef", value: 18 },
  { label: "Cover Open", color: "#ffb26a", value: 20 },
  { label: "Terminal Cover Open", color: "#d87a80", value: 26 },
  { label: "Magnetic Interference", color: "#8d98b3", value: 12 },
  { label: "Battery Low", color: "#e5cf0d", value: 9 },
  { label: "Relay Open", color: "#97b552", value: 58 }
]);

const dashboardAlarmLive = mapDashboardDataset({
  alarmChart: {
    result: {
      xData: ["Battery Low", "Relay Open", "Current Reverse", "No Data Report"],
      yData: [2, 4, 1, 3]
    }
  }
});

assert.deepStrictEqual(dashboardAlarmLive.alarms, [
  { label: "No Data Report", color: "#2ec7c9", value: 3 },
  { label: "Current Unbalance", color: "#b6a2de", value: 0 },
  { label: "Current Reverse", color: "#5ab1ef", value: 1 },
  { label: "Cover Open", color: "#ffb26a", value: 0 },
  { label: "Terminal Cover Open", color: "#d87a80", value: 0 },
  { label: "Magnetic Interference", color: "#8d98b3", value: 0 },
  { label: "Battery Low", color: "#e5cf0d", value: 2 },
  { label: "Relay Open", color: "#97b552", value: 4 }
]);

console.log(JSON.stringify({
  rows: rows.length,
  cards: cards.totalAccountCount,
  series: series.values.length,
  legend: legend.length + derivedAlarmLegend.length + dashboardAlarmLive.alarms.length,
  status: "dashboard adapters passed"
}, null, 2));
