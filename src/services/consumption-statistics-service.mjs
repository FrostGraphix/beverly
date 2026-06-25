import { postApi } from "./api.js";

const defaultRangeDays = 30;
export const CONSUMPTION_STATISTICS_ENDPOINT = "/api/DailyDataMeter/read";
export const MONTHLY_CONSUMPTION_STATISTICS_ENDPOINT = "/api/DailyDataMeter/readMonthly";
const maxConsumptionRows = 50000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDayParts(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatMonthParts(year, month) {
  return `${year}-${pad(month)}`;
}

function normalizeDateObject(value, granularity = "daily") {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  if (granularity === "monthly") {
    return formatMonthParts(value.getFullYear(), value.getMonth() + 1);
  }
  return formatDayParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function monthEndDate(monthText) {
  const [year, month] = String(monthText).split("-").map(Number);
  if (!year || !month) return "";
  const end = new Date(Date.UTC(year, month, 0));
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

export function normalizeConsumptionDateKey(value, granularity = "daily") {
  if (!value && value !== 0) return "";
  if (value instanceof Date) return normalizeDateObject(value, granularity);

  const text = String(value).trim();
  if (!text) return "";

  if (granularity === "monthly") {
    const isoMonth = text.match(/^(\d{4})-(\d{1,2})(?:$|[T\s/:-])/);
    if (isoMonth) return formatMonthParts(isoMonth[1], isoMonth[2]);

    const slashMonth = text.match(/^(\d{4})\/(\d{1,2})(?:$|[T\s/:-])/);
    if (slashMonth) return formatMonthParts(slashMonth[1], slashMonth[2]);

    const dayFirstMonth = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dayFirstMonth) return formatMonthParts(dayFirstMonth[3], dayFirstMonth[2]);
  } else {
    const isoDay = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoDay) return formatDayParts(isoDay[1], isoDay[2], isoDay[3]);

    const slashDay = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (slashDay) return formatDayParts(slashDay[1], slashDay[2], slashDay[3]);

    const compactDay = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactDay) return formatDayParts(compactDay[1], compactDay[2], compactDay[3]);

    const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dayFirst) return formatDayParts(dayFirst[3], dayFirst[2], dayFirst[1]);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return normalizeDateObject(parsed, granularity);
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
  const granularity = paging.granularity || (filters.granularity === "monthly" ? "monthly" : "daily");
  const includeBaseline = paging.includeBaseline ?? granularity !== "monthly";

  let fromDateStr = normalizeConsumptionDateKey(filters.dateFrom, granularity);
  if (fromDateStr && includeBaseline) {
    const fd = new Date(`${fromDateStr}T00:00:00`);
    if (!Number.isNaN(fd.getTime())) {
      fd.setDate(fd.getDate() - 1);
      fromDateStr = `${fd.getFullYear()}-${pad(fd.getMonth() + 1)}-${pad(fd.getDate())}`;
    }
  }

  const toDateStr = normalizeConsumptionDateKey(filters.dateTo, granularity);
  const fromTimestamp = granularity === "monthly" ? `${fromDateStr}-01` : fromDateStr;
  const toTimestamp = granularity === "monthly" ? monthEndDate(toDateStr) : toDateStr;

  const payload = {
    lang: "en",
    pageNumber,
    pageSize,
    FROM: fromTimestamp ? `${fromTimestamp}T00:00:00.000Z` : undefined,
    TO: toTimestamp ? `${toTimestamp}T23:59:59.999Z` : undefined
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
  const rawCollectionDate = String(
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
  const collectionDate = normalizeConsumptionDateKey(
    rawCollectionDate,
    /^\d{4}-\d{1,2}$/.test(rawCollectionDate) ? "monthly" : "daily"
  ) || rawCollectionDate;
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

function assertConsumptionResponse(response = {}) {
  if (isFailureEnvelope(response)) {
    throw new Error(envelopeReason(response) || "Consumption statistics endpoint failed");
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
  assertConsumptionResponse(response);
  return normalizeConsumptionStatisticsResponse(response);
}

async function fetchEndpointRows(endpoint, filters, paging, api) {
  const pageSize = Math.max(1, Number(paging.pageSize || paging.pageLimit || 5000));
  const includeBaseline = endpoint === CONSUMPTION_STATISTICS_ENDPOINT;
  const granularity = endpoint === MONTHLY_CONSUMPTION_STATISTICS_ENDPOINT ? "monthly" : "daily";
  const endpointPaging = { ...paging, granularity, includeBaseline, pageSize };
  const first = await getConsumptionPage(endpoint, filters, { ...endpointPaging, pageNumber: 1 }, api);
  const rows = first.rows.slice();
  const total = Math.min(first.total || rows.length, maxConsumptionRows);

  if (rows.length < total) {
    const requests = [];
    const pageCount = Math.ceil(total / pageSize);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      requests.push(getConsumptionPage(endpoint, filters, { ...endpointPaging, pageNumber }, api));
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
  const dateFromPrefix = normalizeConsumptionDateKey(filters.dateFrom, wantsMonthly ? "monthly" : "daily");
  const filteredRows = dateFromPrefix 
    ? result.rows.filter((r) => {
      const rowKey = normalizeConsumptionDateKey(r.collectionDate, wantsMonthly ? "monthly" : "daily");
      return rowKey >= dateFromPrefix;
    })
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
  return normalizeConsumptionDateKey(row.collectionDate, granularity);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addMonths(monthText, months) {
  const date = new Date(`${monthText}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function rangeIsValid(from, to, granularity) {
  if (!from || !to) return false;
  const suffix = granularity === "monthly" ? "-01" : "";
  const start = new Date(`${from}${suffix}T00:00:00.000Z`);
  const end = new Date(`${to}${suffix}T00:00:00.000Z`);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end;
}

export function fillConsumptionDateRange(rows = [], filters = {}) {
  const granularity = filters.granularity === "monthly" ? "monthly" : "daily";
  const from = normalizeConsumptionDateKey(filters.dateFrom, granularity);
  const to = normalizeConsumptionDateKey(filters.dateTo, granularity);
  if (!rangeIsValid(from, to, granularity)) return rows;

  const byDate = new Map(
    rows.map((row) => [normalizeConsumptionDateKey(row.collectionDate, granularity) || row.collectionDate, row])
  );
  const filled = [];
  for (let cursor = from; cursor <= to; cursor = granularity === "monthly" ? addMonths(cursor, 1) : addDays(cursor, 1)) {
    filled.push(byDate.get(cursor) || {
      id: `${granularity}-${cursor}-empty`,
      collectionDate: cursor,
      consumption: 0
    });
  }
  return filled;
}

export function aggregateConsumptionRows(rows = [], granularity = "daily", filters = {}) {
  const grouped = new Map();

  for (const row of rows) {
    const key = groupKey(row, granularity);
    if (!key) continue;
    const current = grouped.get(key) || 0;
    grouped.set(key, current + toNumber(row.consumption, 0));
  }

  const aggregated = Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([collectionDate, consumption], index) => ({
      id: `${granularity}-${collectionDate}-${index}`,
      collectionDate,
      consumption: Number(consumption.toFixed(3))
    }));
  return fillConsumptionDateRange(aggregated, { ...filters, granularity });
}

function inclusiveDayCount(dateFrom, dateTo) {
  const from = normalizeConsumptionDateKey(dateFrom, "daily");
  const to = normalizeConsumptionDateKey(dateTo, "daily");
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function inclusiveMonthCount(dateFrom, dateTo) {
  const from = normalizeConsumptionDateKey(dateFrom, "monthly");
  const to = normalizeConsumptionDateKey(dateTo, "monthly");
  if (!from || !to) return 0;
  const start = new Date(`${from}-01T00:00:00.000Z`);
  const end = new Date(`${to}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) + (end.getUTCMonth() - start.getUTCMonth()) + 1;
}

export function decorateConsumptionRows(rows = []) {
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
  const total = rows.reduce((sum, row) => sum + toNumber(row.consumption, 0), 0);
  const reportingDays = rows.length;
  const expectedDays = filters.granularity === "monthly"
    ? inclusiveMonthCount(filters.dateFrom, filters.dateTo)
    : inclusiveDayCount(filters.dateFrom, filters.dateTo);
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
      boundaryGap: true,
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
      type: "bar",
      barMaxWidth: 46,
      itemStyle: {
        color: primary,
        borderRadius: [4, 4, 0, 0]
      },
      data: rows.map((row) => row.consumption)
    }]
  };
}
