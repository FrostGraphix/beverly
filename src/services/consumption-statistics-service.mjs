import { postApi } from "./api.js";

const defaultRangeDays = 30;
export const CONSUMPTION_STATISTICS_ENDPOINT = "/api/DailyDataMeter/read";
export const MONTHLY_CONSUMPTION_STATISTICS_ENDPOINT = "/api/DailyDataMeter/readMonthly";
const maxConsumptionRows = 50000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function weekStartDate(dateText) {
  const text = String(dateText || "").slice(0, 10);
  if (text.length < 10) return "";
  const d = new Date(text + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  const dow = d.getUTCDay();
  const shift = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + shift);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function groupKeyYearly(dateText) {
  return String(dateText || "").slice(0, 4);
}

export function buildConsumptionPeriodRange(periodKey) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const ago = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  switch (periodKey) {
    case "daily":    return { from: ago(29),  to: todayStr, granularity: "daily" };
    case "weekly":   return { from: ago(83),  to: todayStr, granularity: "weekly" };
    case "monthly": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: todayStr, granularity: "monthly" };
    }
    case "annually": {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 4);
      d.setMonth(0);
      d.setDate(1);
      return { from: `${d.getFullYear()}-01-01`, to: todayStr, granularity: "yearly" };
    }
    case "all":
    default:
      return { from: "2020-01-01", to: todayStr, granularity: "monthly" };
  }
}

export function defaultConsumptionStatisticsFilters(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (defaultRangeDays - 1));
  return {
    customerId: "",
    meterId: "",
    stationId: "",
    dateFrom: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    dateTo: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    granularity: "daily"
  };
}

export function buildConsumptionStatisticsPayload(filters = {}, paging = {}) {
  const pageSize = Number(paging.pageSize || paging.pageLimit || 5000);
  const pageNumber = Math.max(1, Number(paging.pageNumber || 1));
  
  let fromDateStr = filters.dateFrom;
  if (fromDateStr) {
    const fd = new Date(fromDateStr);
    if (!Number.isNaN(fd.getTime())) {
      fd.setDate(fd.getDate() - 1);
      fromDateStr = `${fd.getFullYear()}-${pad(fd.getMonth() + 1)}-${pad(fd.getDate())}`;
    }
  }

  const payload = {
    lang: "en",
    pageNumber,
    pageSize,
    FROM: fromDateStr ? `${fromDateStr}T00:00:00.000Z` : undefined,
    TO: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined
  };

  if (filters.stationId) payload.stationId = String(filters.stationId).trim();
  if (filters.meterId) payload.meterId = String(filters.meterId).trim();
  if (filters.customerId) payload.customerId = String(filters.customerId).trim();

  return payload;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function envelopeCode(response = {}) {
  return response?.code ?? response?.statusCode ?? response?.body?.code ?? response?.data?.code;
}

function envelopeReason(response = {}) {
  return response?.reason || response?.msg || response?.message || response?.body?.reason || response?.body?.msg || "";
}

function isFailureEnvelope(response = {}) {
  const code = envelopeCode(response);
  return code !== undefined && ![0, 200, "0", "200"].includes(code);
}

export function normalizeConsumptionStatisticRow(row = {}, index = 0) {
  const collectionDate = String(
    row.currentDate
    || row.collectionDate
    || row.statDate
    || row.dataDate
    || row.month
    || row.currentMonth
    || row.dataMonth
    || row.timestamp
    || ""
  );
  const hasCumulativeTotal = row.total1 != null || row.totalEnergy != null;
  const rawConsumption = row.total1 ?? row.totalEnergy ?? row.usage1 ?? row.consumption ?? row.energyConsumptionKwh ?? 0;
  const numericConsumption = Math.max(0, toNumber(rawConsumption, 0));
  return {
    id: row.id || `${collectionDate}-${row.meterId || row.customerId || index}`,
    collectionDate,
    totalEnergy: numericConsumption, // Use totalEnergy for derivation
    consumption: hasCumulativeTotal ? 0 : numericConsumption,
    hasCumulativeTotal,
    customerId: row.customerId || row.customerAccountId || "",
    customerName: row.customerName || "",
    meterId: row.meterId || "",
    stationId: row.stationId || "",
    source: row
  };
}

export function deriveConsumptionFromTotal(rows = []) {
  const byMeter = new Map();
  for (const row of rows) {
    const key = String(row.meterId || row.customerId || "unknown");
    if (!byMeter.has(key)) byMeter.set(key, []);
    byMeter.get(key).push(row);
  }

  for (const meterRows of byMeter.values()) {
    if (!meterRows.some((row) => row.hasCumulativeTotal)) continue;
    meterRows.sort((a, b) => String(a.collectionDate).localeCompare(String(b.collectionDate)));
    for (let i = 0; i < meterRows.length; i++) {
      const current = meterRows[i].totalEnergy;
      // If we don't have a previous day, we assume 0 consumption for this meter on this first day
      const previous = i === 0 ? current : meterRows[i - 1].totalEnergy;
      meterRows[i].consumption = Math.max(0, current - previous);
    }
  }
  return rows;
}

export function normalizeConsumptionStatisticsResponse(response = {}) {
  const result = response?.result || response?.data?.result || response?.data || {};
  const rows = Array.isArray(response.readings)
    ? response.readings
    : Array.isArray(result.readings)
      ? result.readings
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.rows)
          ? result.rows
          : [];
  return {
    rows: rows.map(normalizeConsumptionStatisticRow),
    total: Number(response.total || result.total || rows.length || 0)
  };
}

function assertLiveConsumptionResponse(response = {}) {
  if (isFailureEnvelope(response)) {
    throw new Error(envelopeReason(response) || "Consumption statistics endpoint failed");
  }
  const proxySource = response?._proxy?.source || "";
  if (proxySource && proxySource !== "live") {
    throw new Error("Live AMR consumption data is unavailable. Static sample data is disabled for Consumption Statistics.");
  }
}

async function getConsumptionPage(endpoint, filters, paging, api) {
  const params = buildConsumptionStatisticsPayload(filters, paging);
  let response;
  try {
    response = await api.postApi(endpoint, params);
  } catch (error) {
    const reason = error?.response?.data?.reason || error?.response?.data?.msg || error?.message;
    throw new Error(reason || "Consumption statistics endpoint failed");
  }
  assertLiveConsumptionResponse(response);
  return normalizeConsumptionStatisticsResponse(response);
}

async function fetchEndpointRows(endpoint, filters, paging, api) {
  const pageSize = Math.max(1, Number(paging.pageSize || paging.pageLimit || 5000));
  const first = await getConsumptionPage(endpoint, filters, { ...paging, pageNumber: 1, pageSize }, api);
  const rows = first.rows.slice();
  const total = Math.min(first.total || rows.length, maxConsumptionRows);

  if (rows.length < total) {
    const requests = [];
    const pageCount = Math.ceil(total / pageSize);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      requests.push(getConsumptionPage(endpoint, filters, { ...paging, pageNumber, pageSize }, api));
    }
    const pages = await Promise.all(requests);
    for (const page of pages) rows.push(...page.rows);
  }
  return { rows: rows.slice(0, total), total };
}

export async function fetchConsumptionStatistics(filters = {}, paging = {}, api = { postApi }) {
  const wantsMonthly = filters.granularity === "monthly";
  const endpoint = wantsMonthly ? MONTHLY_CONSUMPTION_STATISTICS_ENDPOINT : CONSUMPTION_STATISTICS_ENDPOINT;
  let result = await fetchEndpointRows(endpoint, filters, paging, api);
  let warning = wantsMonthly
    ? "Monthly Consumption is loaded from monthly AMR data. If no monthly rows exist, daily AMR data is grouped by month."
    : "Daily Consumption is loaded from live DailyDataMeter rows.";

  if (wantsMonthly && result.rows.length === 0) {
    result = await fetchEndpointRows(CONSUMPTION_STATISTICS_ENDPOINT, filters, paging, api);
    warning = "Monthly AMR rows were empty, so monthly consumption is grouped from live daily AMR data.";
  }

  // Derive daily/monthly consumption from cumulative energy
  deriveConsumptionFromTotal(result.rows);

  // Filter out the extra day we fetched for baseline
  const dateFromPrefix = filters.dateFrom ? String(filters.dateFrom).slice(0, wantsMonthly ? 7 : 10) : "";
  const filteredRows = dateFromPrefix 
    ? result.rows.filter(r => String(r.collectionDate).slice(0, wantsMonthly ? 7 : 10) >= dateFromPrefix)
    : result.rows;

  return {
    rows: filteredRows,
    total: result.total,
    source: "live-derived",
    endpoint: wantsMonthly && warning.includes("grouped") ? CONSUMPTION_STATISTICS_ENDPOINT : endpoint,
    warning
  };
}

function groupKey(row, granularity) {
  const text = String(row.collectionDate || "");
  if (granularity === "monthly") return text.slice(0, 7);
  return text.slice(0, 10);
}

export function aggregateConsumptionRows(rows = [], granularity = "daily") {
  const grouped = new Map();
  if (!Array.isArray(rows)) return [];

  for (const row of rows) {
    let key;
    if (granularity === "weekly") {
      key = weekStartDate(row.collectionDate);
    } else if (granularity === "yearly") {
      key = groupKeyYearly(row.collectionDate);
    } else {
      key = groupKey(row, granularity);
    }
    if (!key) continue;
    grouped.set(key, (grouped.get(key) || 0) + toNumber(row.consumption, 0));
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([collectionDate, consumption], idx) => ({
      id: `${granularity}-${collectionDate}-${idx}`,
      collectionDate,
      consumption: Number(consumption.toFixed(3))
    }));
}

function inclusiveDayCount(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function inclusiveMonthCount(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) + (end.getUTCMonth() - start.getUTCMonth()) + 1;
}

function inclusiveWeekCount(dateFrom, dateTo) {
  const days = inclusiveDayCount(dateFrom, dateTo);
  return days ? Math.ceil(days / 7) : 0;
}

function inclusiveYearCount(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return end.getUTCFullYear() - start.getUTCFullYear() + 1;
}

export function decorateConsumptionRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const previousValue = toNumber(previous?.consumption, 0);
    const consumption = toNumber(row.consumption, 0);
    const change = index === 0 ? null : Number((consumption - previousValue).toFixed(3));
    return {
      ...row,
      change,
      status: consumption === 0 ? "Zero" : "Recorded"
    };
  });
}

export function summarizeConsumptionRows(rows = [], filters = {}) {
  if (!Array.isArray(rows)) rows = [];
  const total = rows.reduce((sum, row) => sum + toNumber(row.consumption, 0), 0);
  const reportingDays = rows.length;
  let expectedDays;
  switch (filters.granularity) {
    case "monthly": expectedDays = inclusiveMonthCount(filters.dateFrom, filters.dateTo); break;
    case "weekly":  expectedDays = inclusiveWeekCount(filters.dateFrom, filters.dateTo); break;
    case "yearly":  expectedDays = inclusiveYearCount(filters.dateFrom, filters.dateTo); break;
    default:        expectedDays = inclusiveDayCount(filters.dateFrom, filters.dateTo);
  }
  const zeroDays = rows.filter((row) => toNumber(row.consumption, 0) === 0).length;
  const peak = rows.reduce((best, row) => (toNumber(row.consumption, 0) > toNumber(best?.consumption, -1) ? row : best), null);

  return {
    total: Number(total.toFixed(3)),
    average: reportingDays ? Number((total / reportingDays).toFixed(3)) : 0,
    peakDate: peak?.collectionDate || "",
    peakValue: peak ? Number(toNumber(peak.consumption, 0).toFixed(3)) : 0,
    reportingDays,
    expectedDays,
    missingDays: Math.max(0, expectedDays - reportingDays),
    zeroDays
  };
}

export function buildConsumptionInsights(rows = [], filters = {}) {
  const summary = summarizeConsumptionRows(rows, filters);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstValue = toNumber(first?.consumption, 0);
  const lastValue = toNumber(last?.consumption, 0);
  const trendValue = firstValue > 0 ? Number((((lastValue - firstValue) / firstValue) * 100).toFixed(1)) : 0;
  const trend = !rows.length ? "No data" : trendValue > 0 ? "Increasing" : trendValue < 0 ? "Decreasing" : "Flat";

  return [
    { label: "Peak period", value: summary.peakDate || "No data", detail: `${summary.peakValue} kWh` },
    { label: "Average load", value: `${summary.average} kWh`, detail: `${summary.reportingDays} reporting periods` },
    { label: "Coverage", value: `${summary.reportingDays}/${summary.expectedDays || summary.reportingDays}`, detail: `${summary.missingDays} missing periods` },
    { label: "Trend", value: trend, detail: `${trendValue}% from first to last period` }
  ];
}

export function buildConsumptionChartOption(rows = [], granularity = "daily", theme = {}) {
  const title = granularity === "monthly" ? "Monthly Consumption" : "Daily Consumption";
  const primary = theme.primary || "#059669";
  const primaryLight = theme.primaryLight || "rgba(5, 150, 105, 0.12)";
  const textStrong = theme.textStrong || "#0f172a";
  const textMuted = theme.textMuted || "#64748b";
  const grid = theme.grid || theme.border || "#d1fae5";
  return {
    title: {
      text: title,
      left: "center",
      textStyle: {
        color: textStrong,
        fontSize: 20,
        fontWeight: 700
      }
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} kWh`
    },
    grid: {
      left: 56,
      right: 16,
      top: 56,
      bottom: 44
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: rows.map((row) => row.collectionDate),
      axisLine: {
        lineStyle: {
          color: primary
        }
      },
      axisLabel: {
        color: textMuted
      }
    },
    yAxis: {
      type: "value",
      name: "kWh",
      min: 0,
      axisLine: {
        lineStyle: {
          color: primary
        }
      },
      axisLabel: {
        color: textMuted
      },
      splitLine: {
        lineStyle: {
          color: grid
        }
      }
    },
    series: [{
      name: title,
      type: "line",
      smooth: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: {
        color: primary,
        width: 3
      },
      itemStyle: {
        color: primary
      },
      areaStyle: {
        color: primaryLight
      },
      markPoint: {
        data: [
          { type: "max", name: "Peak" },
          { type: "min", name: "Low" }
        ]
      },
      data: rows.map((row) => row.consumption)
    }]
  };
}

export function buildBarChartOption(rows = [], granularity = "daily", theme = {}, title = "") {
  const primary = theme.primary || "#059669";
  const textMuted = theme.textMuted || "#64748b";
  const grid = theme.grid || theme.border || "#d1fae5";

  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => `${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} kWh`
    },
    grid: { left: 60, right: 16, top: 36, bottom: 48 },
    xAxis: {
      type: "category",
      data: rows.map((r) => r.collectionDate),
      axisLabel: { color: textMuted, rotate: rows.length > 24 ? 30 : 0, fontSize: 11 },
      axisLine: { lineStyle: { color: primary } }
    },
    yAxis: {
      type: "value",
      name: "kWh",
      min: 0,
      axisLabel: { color: textMuted },
      nameTextStyle: { color: textMuted, fontSize: 11 },
      splitLine: { lineStyle: { color: grid } }
    },
    series: [{
      name: title || "kWh",
      type: "bar",
      barMaxWidth: 48,
      itemStyle: { color: primary, borderRadius: [4, 4, 0, 0] },
      data: rows.map((r) => r.consumption)
    }]
  };
}

export function buildStationBarChartOption(stationRows = [], theme = {}) {
  const textMuted = theme.textMuted || "#64748b";
  const grid = theme.grid || "#d1fae5";
  const sorted = [...stationRows].sort((a, b) => b.total - a.total);

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (v) => `${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`
    },
    grid: { left: 80, right: 24, top: 16, bottom: 24 },
    xAxis: {
      type: "value",
      name: "kWh",
      axisLabel: { color: textMuted, fontSize: 11 },
      splitLine: { lineStyle: { color: grid } }
    },
    yAxis: {
      type: "category",
      data: sorted.map((s) => s.label),
      axisLabel: { color: textMuted, fontSize: 12, fontWeight: 700 }
    },
    series: [{
      type: "bar",
      barMaxWidth: 40,
      data: sorted.map((s) => ({
        value: s.total,
        itemStyle: { color: s.color, borderRadius: [0, 4, 4, 0] }
      }))
    }]
  };
}
