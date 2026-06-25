import {
  envelopeSources,
  firstDefinedValue,
  normalizeCollection,
  normalizeEnvelope,
  toFiniteNumber
} from "../response-normalizers.mjs";
import {
  axisLabels,
  buildAlarmLegendFromReadings,
  buildConsumptionRowsFromReadings,
  buildHourlySuccessSeries,
  buildPurchaseRowsFromPayments,
  normalizeDashboardLegend,
  normalizeDashboardSeries
} from "../live-report-adapters.mjs";

export const dashboardChartTitles = {
  0: "Account Count",
  1: "Purchase Times",
  2: "Purchase Unit",
  3: "Purchase Money",
  4: "Daily Consumption",
  5: "Monthly Consumption",
  6: "Communication Success Rate",
  7: "Abnormal Alarm"
};

const referenceLabels = [
  "2026-03-29",
  "2026-03-31",
  "2026-04-01",
  "2026-04-02",
  "2026-04-03",
  "2026-04-04",
  "2026-04-05",
  "2026-04-06",
  "2026-04-07",
  "2026-04-08",
  "2026-04-09",
  "2026-04-10",
  "2026-04-11",
  "2026-04-12",
  "2026-04-13",
  "2026-04-14",
  "2026-04-15",
  "2026-04-16",
  "2026-04-17",
  "2026-04-18",
  "2026-04-19",
  "2026-04-20",
  "2026-04-21",
  "2026-04-22",
  "2026-04-23",
  "2026-04-24",
  "2026-04-25",
  "2026-04-26",
  "2026-04-27"
];

const referencePurchaseMoney = [
  225000, 185000, 185000, 280000, 195000, 168000, 240000, 255000, 322000, 645000,
  200000, 240000, 255000, 278000, 283000, 304000, 365000, 355000, 448000, 212000,
  200000, 370000, 270000, 360000, 265000, 315000, 280000, 258000, 225000
];

const referenceDailyConsumption = [
  0, 4200, 2900, 1200, 0, 2050, 1650, 1450, 950, 0,
  1580, 0, 3080, 0, 2050, 0, 5450, 80, 850, 0,
  1980, 3480, 1380, 0, 0, 1200, 6150, 580, 1980
];

const referenceSuccess = [
  ["10:00", 48],
  ["12:00", 50],
  ["14:00", 62],
  ["16:00", 70],
  ["18:00", 72],
  ["20:00", 71],
  ["22:00", 75],
  ["01:00", 80],
  ["03:00", 75],
  ["05:00", 70],
  ["07:00", 66],
  ["09:00", 61],
  ["11:00", 57],
  ["13:00", 59],
  ["15:00", 66],
  ["17:00", 68],
  ["19:00", 72],
  ["21:00", 75],
  ["23:00", 70],
  ["02:00", 69],
  ["04:00", 76],
  ["06:00", 70],
  ["08:00", 36]
];

const referenceAlarms = [
  { label: "No Data Report", color: "#35c2c1", value: 10 },
  { label: "Current Unbalance", color: "#b399dd", value: 14 },
  { label: "Current Reverse", color: "#10b981", value: 18 },
  { label: "Cover Open", color: "#ffb26a", value: 20 },
  { label: "Terminal Cover Open", color: "#db7a85", value: 26 },
  { label: "Magnetic Interference", color: "#92a0bd", value: 12 },
  { label: "Battery Low", color: "#f3d600", value: 9 },
  { label: "Relay Open", color: "#9ab94f", value: 58 }
];

function referenceTopSeries(type) {
  if (type === 0) return referencePurchaseMoney.map((value) => Math.max(1, Math.round(value / 250)));
  if (type === 1) return referencePurchaseMoney.map((value) => Math.max(1, Math.round(value / 10000)));
  if (type === 2) return referencePurchaseMoney.map((value) => Math.max(1, Math.round(value / 6)));
  return referencePurchaseMoney;
}

export function referenceDashboardDataset(activeType = 3) {
  return {
    panel: {
      totalAccountCount: 2420,
      totalPurchaseTimes: 7305,
      totalPurchaseUnit: 100369,
      totalPurchaseMoney: 35253085
    },
    top: {
      title: dashboardChartTitles[activeType] || dashboardChartTitles[3],
      labels: referenceLabels,
      values: referenceTopSeries(activeType),
      axis: axisLabels(Math.max(1, ...referenceTopSeries(activeType)))
    },
    consumption: {
      title: "Daily Consumption",
      labels: referenceLabels,
      values: referenceDailyConsumption,
      axis: axisLabels(Math.max(1, ...referenceDailyConsumption))
    },
    success: {
      labels: referenceSuccess.map((row) => row[0]),
      values: referenceSuccess.map((row) => row[1])
    },
    alarms: referenceAlarms
  };
}

export function mapDashboardPanels(payloads = []) {
  const sources = payloads.flatMap((payload) => envelopeSources(payload));
  return {
    totalAccountCount: toFiniteNumber(firstDefinedValue(sources, ["totalAccountCount", "accountCount", "accounts", "totalAccounts"], 0), 0),
    totalPurchaseTimes: toFiniteNumber(firstDefinedValue(sources, ["totalPurchaseTimes", "purchaseTimes", "paymentsCount", "transactionCount"], 0), 0),
    totalPurchaseUnit: toFiniteNumber(firstDefinedValue(sources, ["totalPurchaseUnit", "purchaseUnit", "unitsSold", "energySoldKwh", "totalEnergy"], 0), 0),
    totalPurchaseMoney: toFiniteNumber(firstDefinedValue(sources, ["totalPurchaseMoney", "purchaseMoney", "revenue", "amountCollected", "collectedRevenue"], 0), 0)
  };
}

export function mapDashboardSeries(payload, options = {}) {
  const fallbackTitle = options.fallbackTitle || dashboardChartTitles[options.type] || "Series";
  return normalizeDashboardSeries(payload, {
    fallbackTitle,
    labelKeys: options.labelKeys || ["date", "collectionDate", "label", "name", "hour", "timestamp"],
    valueKeys: options.valueKeys || ["amount", "purchaseMoney", "revenue", "consumption", "usage", "value", "total", "count", "percentage", "successRate"]
  });
}

export function mapDashboardDataset({
  dashboard = null,
  panelGroup = null,
  topChart = null,
  consumptionChart = null,
  successChart = null,
  alarmChart = null,
  hourly = null,
  gprs = null,
  events = null,
  payments = null,
  activeType = 3,
  consumptionType = 4,
  preferReference = false
} = {}) {
  if (preferReference) {
    const reference = referenceDashboardDataset(activeType);
    return {
      envelope: normalizeEnvelope(dashboard),
      ...reference
    };
  }

  const hourlyRows = normalizeCollection(hourly).rows;
  const paymentRows = normalizeCollection(payments).rows;
  const panel = mapDashboardPanels([panelGroup, dashboard]);
  const normalizedTopChart = mapDashboardSeries(topChart, {
    type: activeType,
    fallbackTitle: dashboardChartTitles[activeType] || "Purchase Money"
  });
  const purchaseRows = buildPurchaseRowsFromPayments(paymentRows);
  const topSeries = normalizedTopChart.values.length
    ? normalizedTopChart
    : purchaseRows.length
      ? {
          title: dashboardChartTitles[activeType] || normalizedTopChart.title,
          labels: purchaseRows.map((row) => row.collectionDate),
          values: purchaseRows.map((row) => row.amount)
        }
      : {
          title: dashboardChartTitles[activeType] || normalizedTopChart.title,
          labels: referenceLabels,
          values: referenceTopSeries(activeType)
        };

  const derivedConsumptionRows = buildConsumptionRowsFromReadings(hourlyRows);
  const normalizedConsumptionChart = mapDashboardSeries(
    consumptionType === 5 ? consumptionChart : { data: { rows: derivedConsumptionRows } },
    {
      type: consumptionType,
      fallbackTitle: dashboardChartTitles[consumptionType] || "Daily Consumption",
      labelKeys: ["collectionDate", "date", "label", "name"],
      valueKeys: ["consumption", "usage", "value", "amount", "total"]
    }
  );

  const normalizedSuccessChart = mapDashboardSeries(successChart, {
    type: 6,
    fallbackTitle: "Communication Success Rate",
    labelKeys: ["hour", "label", "name", "status", "collectionDate"],
    valueKeys: ["successRate", "value", "count", "percentage", "onlineRate"]
  });
  const fallbackGprsChart = mapDashboardSeries(gprs, {
    type: 6,
    fallbackTitle: "Hourly Success Rate",
    labelKeys: ["hour", "label", "name", "status", "collectionDate"],
    valueKeys: ["successRate", "value", "count", "percentage", "onlineRate"]
  });
  const fallbackHourly = buildHourlySuccessSeries(hourlyRows);
  const successSource = normalizedSuccessChart.values.length
    ? normalizedSuccessChart
    : fallbackGprsChart;
  const successRows = successSource.values.length
    ? successSource.labels.map((label, index) => ({
        label,
        value: Number(successSource.values[index] || 0)
      }))
    : fallbackHourly;

  const fallbackAlarmLegend = buildAlarmLegendFromReadings(hourlyRows);
  const primaryAlarmRows = normalizeDashboardLegend(alarmChart, []);
  const eventAlarmRows = normalizeDashboardLegend(events, []);
  const alarmRows = primaryAlarmRows.length
    ? primaryAlarmRows
    : eventAlarmRows.length
      ? eventAlarmRows
      : fallbackAlarmLegend;

  const envelope = normalizeEnvelope(dashboard);

  return {
    envelope,
    panel,
    top: {
      title: topSeries.title || dashboardChartTitles[activeType],
      labels: topSeries.labels,
      values: topSeries.values,
      axis: axisLabels(Math.max(1, ...topSeries.values))
    },
    consumption: {
      title: consumptionType === 4 ? "Daily Consumption" : "Monthly Consumption",
      labels: normalizedConsumptionChart.labels.length ? normalizedConsumptionChart.labels : referenceLabels,
      values: normalizedConsumptionChart.values.length ? normalizedConsumptionChart.values : referenceDailyConsumption,
      axis: axisLabels(Math.max(1, ...(normalizedConsumptionChart.values.length ? normalizedConsumptionChart.values : referenceDailyConsumption)))
    },
    success: {
      labels: successRows.length ? successRows.map((row) => row.label) : referenceSuccess.map((row) => row[0]),
      values: successRows.length ? successRows.map((row) => Number(row.value || 0)) : referenceSuccess.map((row) => row[1])
    },
    alarms: alarmRows.length ? alarmRows : referenceAlarms
  };
}
