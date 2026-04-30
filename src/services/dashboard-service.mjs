import { getApi, postApi } from "./api.js";
import { mapDashboardDataset } from "./mappers/dashboard-mapper.mjs";

export const defaultDashboardOptions = {
  siteId: "KYAKALE",
  from: "2026-03-29T00:00:00.000Z",
  to: "2026-04-27T23:59:59.999Z",
  pageNumber: 1,
  pageSize: 500,
  activeType: 3,
  consumptionType: 4
};

function dashboardOptions(options = {}) {
  return {
    ...defaultDashboardOptions,
    ...options
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

export async function fetchDashboardData(options = {}) {
  const requestOptions = dashboardOptions(options);
  const api = options.api || { getApi, postApi };
  const scope = rangeParams(requestOptions);
  const [panelGroup, topChart, consumptionChart, successChart, alarmChart, hourly, gprs, events, payments] = await Promise.all([
    safeRequest(() => api.postApi("/api/dashboard/readPanelGroup")),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: requestOptions.activeType,
      days: 30
    })),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: requestOptions.consumptionType,
      days: 30
    })),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: 6,
      days: 48
    })),
    safeRequest(() => api.postApi("/api/dashboard/readLineChart", {
      ...scope,
      type: 7,
      days: 1
    })),
    safeRequest(() => api.getApi("/api/dashboard/hourly", {
      ...scope,
      pageNumber: requestOptions.pageNumber,
      pageSize: requestOptions.pageSize
    })),
    safeRequest(() => api.getApi("/api/dashboard/gprs", {
      ...scope,
      pageNumber: requestOptions.pageNumber,
      pageSize: 48
    })),
    safeRequest(() => api.getApi("/api/dashboard/events", {
      ...scope,
      pageNumber: requestOptions.pageNumber,
      pageSize: 20
    })),
    safeRequest(() => api.getApi("/api/token/creditTokenRecord/readMore", {
      from: requestOptions.from,
      to: requestOptions.to,
      siteId: requestOptions.siteId
    }))
  ]);

  const dataset = mapDashboardDataset({
    panelGroup,
    topChart,
    consumptionChart,
    successChart,
    alarmChart,
    hourly,
    gprs,
    events,
    payments,
    activeType: requestOptions.activeType,
    consumptionType: requestOptions.consumptionType
  });

  return {
    ...dataset,
    meta: {
      siteId: requestOptions.siteId,
      from: requestOptions.from,
      to: requestOptions.to,
      source: dataset.envelope?._proxy?.source || "mapped"
    }
  };
}
