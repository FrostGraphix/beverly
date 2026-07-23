import { getApi, postApi } from "./api.js";
import { mapDashboardDataset } from "./mappers/dashboard-mapper.mjs";

export const defaultDashboardOptions = {
  siteId: "KYAKALE",
  pageNumber: 1,
  pageSize: 500,
  activeType: 3,
  consumptionType: 4
};

export function dashboardDateWindow(now = new Date()) {
  const end = new Date(now);
  const safeEnd = Number.isFinite(end.getTime()) ? end : new Date();
  const start = new Date(safeEnd);
  start.setUTCDate(start.getUTCDate() - 29);
  start.setUTCHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: safeEnd.toISOString() };
}

function dashboardOptions(options = {}) {
  const { now, ...provided } = options;
  return {
    ...defaultDashboardOptions,
    ...dashboardDateWindow(now),
    ...provided
  };
}

function rangeParams(options) {
  return {
    from: options.from,
    to: options.to,
    siteId: options.siteId
  };
}

function pagePayload(options, pageSize = options.pageSize) {
  return {
    pageNumber: options.pageNumber,
    pageSize,
    ...rangeParams(options)
  };
}

async function safeRequest(run) {
  try {
    return await run();
  } catch (error) {
    return null;
  }
}

function proxySource(response) {
  return String(response?._proxy?.source || "").toLowerCase();
}

export function isSyntheticDashboardResponse(response) {
  const source = proxySource(response);
  return source === "sample" || source.startsWith("sample-");
}

export function filterDashboardSeriesToWindow(series, from, to) {
  const startTime = Date.parse(from);
  const endTime = Date.parse(to);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return series;

  const points = (series?.labels || []).map((label, index) => ({
    label,
    value: series.values?.[index],
    time: Date.parse(label)
  }));
  if (!points.some((point) => Number.isFinite(point.time))) return series;

  const currentPoints = points.filter((point) => (
    Number.isFinite(point.time) && point.time >= startTime && point.time <= endTime
  ));
  return {
    ...series,
    labels: currentPoints.map((point) => point.label),
    values: currentPoints.map((point) => point.value)
  };
}

// Per-request cap so one slow upstream call can't hold the dashboard skeleton
// for the client's full 90s axios timeout. Each request either returns real data
// or aborts to null within this window; the mapper fills reference fallbacks for
// nulls, so `loading` clears promptly even when the backend is degraded.
export const DASHBOARD_REQUEST_TIMEOUT_MS = 15000;

export async function fetchDashboardData(options = {}) {
  const requestOptions = dashboardOptions(options);
  const api = options.api || { getApi, postApi };
  const scope = rangeParams(requestOptions);
  const timeoutOption = { timeout: DASHBOARD_REQUEST_TIMEOUT_MS };
  const [panelGroup, topChart, consumptionChart, successChart, alarmChart] = await Promise.all([
    safeRequest(() => api.postApi("/api/dashboard/readPanelGroup", {}, timeoutOption)),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: requestOptions.activeType,
      days: 30
    }, timeoutOption)),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: requestOptions.consumptionType,
      days: 30
    }, timeoutOption)),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: 6,
      days: 48
    }, timeoutOption)),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: 7,
      days: 1
    }, timeoutOption))
  ]);

  const liveConsumptionChart = isSyntheticDashboardResponse(consumptionChart) ? null : consumptionChart;
  const needsFallbackData = !topChart || !liveConsumptionChart || !successChart;
  const [hourly, gprs, payments] = needsFallbackData
    ? await Promise.all([
        safeRequest(() => api.getApi("/api/dashboard/hourly", {
          ...scope,
          pageNumber: requestOptions.pageNumber,
          pageSize: 120
        }, timeoutOption)),
        safeRequest(() => api.getApi("/api/dashboard/gprs", {
          ...scope,
          pageNumber: requestOptions.pageNumber,
          pageSize: 48
        }, timeoutOption)),
        safeRequest(() => api.getApi("/api/token/creditTokenRecord/readMore", {
          from: requestOptions.from,
          to: requestOptions.to,
          siteId: requestOptions.siteId
        }, timeoutOption))
      ])
    : [null, null, null];
  const liveHourly = isSyntheticDashboardResponse(hourly) ? null : hourly;
  const dataset = mapDashboardDataset({
    panelGroup,
    topChart,
    consumptionChart: liveConsumptionChart,
    successChart,
    alarmChart,
    hourly: liveHourly,
    gprs,
    payments,
    activeType: requestOptions.activeType,
    consumptionType: requestOptions.consumptionType
  });
  const currentConsumption = requestOptions.consumptionType === 4
    ? filterDashboardSeriesToWindow(dataset.consumption, requestOptions.from, requestOptions.to)
    : dataset.consumption;

  return {
    ...dataset,
    consumption: currentConsumption,
    meta: {
      siteId: requestOptions.siteId,
      from: requestOptions.from,
      to: requestOptions.to,
      source: dataset.envelope?._proxy?.source || "mapped",
      consumptionSource: proxySource(consumptionChart) || "unavailable",
      hourlySource: proxySource(hourly) || "unavailable"
    }
  };
}
