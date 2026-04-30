import { getApi, postApi } from "./api.js";
import { mapTableCollection, normalizeTableResponse } from "./mappers/table-mapper.mjs";
import { mapExportRows } from "./record-mappers.mjs";
import { buildReceiptModel } from "./receipt-tools.mjs";
import { columnKey, createFormSeed, pageNumbers, pageSizeOptions, paginateRows, rowActionButtons, searchRows, sortRows, totalPages } from "./table-helpers.mjs";
import { isWriteEndpoint } from "./write-helpers.mjs";

const tableFetchPageSize = 500;
const maxTableRows = 20000;
export const defaultTableOptions = {
  siteId: "KYAKALE",
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-17T00:00:00.000Z",
  pageNumber: 1,
  pageSize: tableFetchPageSize
};

function tableOptions(options = {}) {
  return {
    ...defaultTableOptions,
    ...options
  };
}

function rangeParams(options) {
  return {
    FROM: options.from,
    TO: options.to,
    SITE_ID: options.siteId
  };
}

export function tableDataPath(route) {
  if (route.hash.includes("clear-credit-token-record")) return "/api/token/clearCreditTokenRecord/read";
  if (route.hash.includes("clear-tamper-token-record")) return "/api/token/clearTamperTokenRecord/read";
  if (route.hash.includes("set-maximum-power-limit-token-record")) return "/api/token/setMaximumPowerLimitTokenRecord/read";
  if (route.hash.includes("credit-token-record")) return "/api/token/creditTokenRecord/readMore";
  if (route.hash.includes("remote-meter-reading-task")) return "/API/RemoteMeterTask/GetReadingTask";
  if (route.hash.includes("remote-meter-control-task")) return "/API/RemoteMeterTask/GetControlTask";
  if (route.hash.includes("remote-meter-token-task")) return "/API/RemoteMeterTask/GetTokenTask";
  if (route.hash.includes("long-nonpurchase-situation")) return "/API/PrepayReport/LongNonpurchaseSituation";
  if (route.hash.includes("low-purchase-situation")) return "/API/PrepayReport/LowPurchaseSituation";
  if (route.hash.includes("consumption-statistics")) return "/api/DailyDataMeter/readHourly";
  if (route.hash.includes("daily-data-meter")) return "/api/DailyDataMeter/readHourly";
  if (route.hash.includes("remote-support/file-upload")) return "/api/local/importJobs/read";
  if (route.hash.includes("management/gateway")) return "/api/gateway/read";
  if (route.hash.includes("management/customer")) return "/api/customer/read";
  if (route.hash.includes("management/tariff")) return "/api/tariff/read";
  if (route.hash.includes("management/account")) return "/api/account/read";
  if (route.hash.includes("remote-operation")) return "/api/account/read";
  if (route.hash.includes("token-generate")) return "/api/account/read";
  return route.apis[route.apis.length - 1];
}

export function tableRequest(route, options = {}) {
  const requestOptions = tableOptions(options);
  const path = tableDataPath(route);
  if (path === "/api/token/creditTokenRecord/readMore") {
    return {
      path: "/api/token/creditTokenRecord/read",
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: requestOptions.pageSize,
        ...rangeParams(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (path === "/api/DailyDataMeter/readHourly") {
    return {
      path,
      method: "GET",
      params: {
        offset: 0,
        pageLimit: requestOptions.pageSize,
        ...rangeParams(requestOptions)
      },
      pagination: "offset"
    };
  }
  if (path === "/api/local/importJobs/read") {
    return {
      path,
      method: "POST",
      payload: {
        routeHash: route.hash,
        pageSize: requestOptions.pageSize,
        offset: (requestOptions.pageNumber - 1) * requestOptions.pageSize
      },
      pagination: "offset"
    };
  }
  if (path.includes("/API/PrepayReport/LongNonpurchaseSituation")) {
    return { path, method: "POST", payload: { lang: "en", stationId: requestOptions.siteId, pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (path.includes("/API/PrepayReport/LowPurchaseSituation")) {
    return { path, method: "POST", payload: { lang: "en", stationId: requestOptions.siteId, dateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (path.includes("/API/RemoteMeterTask/")) {
    return { path, method: "POST", payload: { lang: "en", stationId: requestOptions.siteId, pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (path.includes("/API/GPRSMeterTask/") || path.includes("/API/GPRSOnlineStatus/") || path.includes("/API/UpdateFirmwareTask/")) {
    return { path, method: "POST", payload: { lang: "en", stationId: requestOptions.siteId, pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (path.includes("/API/LoadProfile/") || path.includes("/API/EventNotification/")) {
    return { path, method: "POST", payload: { lang: "en", stationId: requestOptions.siteId, dateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  return { path, method: "POST", payload: { pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
}

function responseRows(rawResponse, route) {
  return normalizeTableResponse(rawResponse, route);
}

function pageSizeForRequest(request) {
  if (request.pagination === "offset") return Number(request.params?.pageLimit || tableFetchPageSize);
  return Number(request.payload?.pageSize || tableFetchPageSize);
}

function withPage(request, pageIndex) {
  if (request.pagination === "offset") {
    const limit = pageSizeForRequest(request);
    return {
      ...request,
      params: {
        ...request.params,
        offset: pageIndex * limit,
        pageLimit: limit
      }
    };
  }

  return {
    ...request,
    payload: {
      ...request.payload,
      pageNumber: pageIndex + 1,
      pageSize: pageSizeForRequest(request)
    }
  };
}

async function sendTableRequest(request) {
  return request.method === "GET" ? getApi(request.path, request.params) : postApi(request.path, request.payload);
}

async function fetchAllTableRows(request, route) {
  const firstResponse = await sendTableRequest(request);
  const firstCollection = responseRows(firstResponse, route);
  const rows = firstCollection.rows.slice();
  const total = firstCollection.total;
  const requestedSize = pageSizeForRequest(request);

  if (!request.pagination || rows.length >= total || rows.length < requestedSize || rows.length >= maxTableRows) {
    return { rows, total };
  }

  const pageCount = Math.min(Math.ceil(total / requestedSize), Math.ceil(maxTableRows / requestedSize));
  const pageRequests = [];
  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
    pageRequests.push(sendTableRequest(withPage(request, pageIndex)));
  }

  const pageResponses = await Promise.all(pageRequests);
  for (const pageResponse of pageResponses) {
    rows.push(...responseRows(pageResponse, route).rows);
    if (rows.length >= maxTableRows) break;
  }

  return { rows: rows.slice(0, Math.min(total || rows.length, maxTableRows)), total };
}

export async function fetchTableData(route, options = {}) {
  const request = tableRequest(route, options);
  const dataPath = request.path;
  const backgroundPaths = route.apis.filter((path) => path.toLowerCase() !== dataPath.toLowerCase() && !isWriteEndpoint(path));
  await Promise.all(backgroundPaths.map((path) => postApi(path, { pageNumber: 1, pageSize: 20 }).catch(() => null)));
  const collection = await fetchAllTableRows(request, route);
  const mapped = mapTableCollection({ data: { rows: collection.rows, total: collection.total } }, route);
  return {
    ...mapped,
    meta: {
      path: request.path,
      method: request.method,
      source: mapped.envelope?._proxy?.source || "mapped"
    }
  };
}

export function exportRowsForRoute(route, rows) {
  return mapExportRows(route, rows, columnKey);
}

export function printModelForRoute(route, row, receiptType = "") {
  return buildReceiptModel(route, row, columnKey, receiptType);
}

export { columnKey, createFormSeed, pageNumbers, pageSizeOptions, paginateRows, rowActionButtons, searchRows, sortRows, totalPages };
