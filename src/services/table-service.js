import { getApi, postApi } from "./api.js";
import { mapTableCollection, normalizeTableResponse } from "./mappers/table-mapper.mjs";
import { mapExportRows } from "./record-mappers.mjs";
import { buildReceiptModel } from "./receipt-tools.mjs";
import { columnKey, createFormSeed, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, resolveRowValue, routeSortDirection, routeSortPolicy, rowActionButtons, searchRows, sortRows, totalPages } from "./table-helpers.mjs";
import { isWriteEndpoint } from "./write-helpers.mjs";

const tableFetchPageSize = 500;
const maxTableRows = 20000;
export const tableSiteOptions = [
  { value: "", label: "All sites" },
  { value: "KYAKALE", label: "Kyakale" },
  { value: "MUSHA", label: "Musha" },
  { value: "UMAISHA", label: "Umaisha" },
  { value: "TUNGA", label: "Tunga" },
  { value: "OGUFA", label: "Ogufa" }
];
export const defaultTableOptions = {
  siteId: "",
  get from() { return new Date(new Date().getFullYear(), 0, 1).toISOString(); },
  get to()   { return new Date().toISOString(); },
  pageNumber: 1,
  pageSize: tableFetchPageSize,
  orderBy: ""
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
    ...(options.siteId ? { SITE_ID: options.siteId } : {})
  };
}

function stationFilter(options) {
  return options.siteId ? { stationId: options.siteId } : {};
}

export function routeSupportsSiteFilter(route) {
  return route.hash.startsWith("#/remote-operation-record/")
    || route.hash.startsWith("#/prepay-report/")
    || route.hash.startsWith("#/remote-support/");
}

export function tableDataPath(route) {
  if (route.hash.includes("clear-credit-token-record")) return "/api/token/clearCreditTokenRecord/read";
  if (route.hash.includes("clear-tamper-token-record")) return "/api/token/clearTamperTokenRecord/read";
  if (route.hash.includes("set-maximum-power-limit-token-record")) return "/api/token/setMaximumPowerLimitTokenRecord/read";
  if (route.hash.includes("credit-token-record")) return "/api/token/creditTokenRecord/readMore";
  if (route.hash.includes("remote-meter-reading-task")) return "/API/RemoteMeterTask/GetReadingTask";
  if (route.hash.includes("remote-meter-control-task")) return "/API/RemoteMeterTask/GetControlTask";
  if (route.hash.includes("remote-meter-token-task")) return "/API/RemoteMeterTask/GetTokenTask";
  if (route.hash.includes("long-nonpurchase-situation")) return "/api/PrepayReport/LongNonpurchaseSituation";
  if (route.hash.includes("low-purchase-situation")) return "/api/PrepayReport/LowPurchaseSituation";
  if (route.hash.includes("consumption-statistics")) return "/api/DailyDataMeter/read";
  if (route.hash.includes("daily-data-meter")) return "/api/DailyDataMeter/read";
  if (route.hash.includes("remote-support/file-upload")) return "/api/local/importJobs/read";
  if (route.hash.includes("management/gateway")) return "/api/gateway/read";
  if (route.hash.includes("management/customer")) return "/api/customer/read";
  if (route.hash.includes("management/tariff")) return "/api/tariff/read";
  if (route.hash.includes("management/account")) return "/api/account/read";
  if (route.hash.includes("remote-operation")) return "/api/account/read";
  if (route.hash.includes("token-generate")) return "/api/account/read";
  return route.apis[route.apis.length - 1];
}

function buildTableRequest(route, requestOptions) {
  const path = tableDataPath(route);
  const lowerPath = path.toLowerCase();
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
  if (lowerPath.includes("/api/dailydatameter/readhourly")) {
    return {
      path,
      method: "GET",
      params: {
        ...rangeParams(requestOptions),
        offset: (requestOptions.pageNumber - 1) * requestOptions.pageSize,
        pageLimit: requestOptions.pageSize
      },
      pagination: "offset"
    };
  }
  if (lowerPath.includes("/api/dailydatameter/read")) {
    return {
      path,
      method: "POST",
      payload: {
        lang: "en",
        pageNumber: requestOptions.pageNumber,
        pageSize: requestOptions.pageSize,
        ...rangeParams(requestOptions),
        ...stationFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/prepayreport/longnonpurchasesituation")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/api/prepayreport/lowpurchasesituation")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), dateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/remotemetertask/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/gprstmetertask/") || lowerPath.includes("/gprsmetertask/") || lowerPath.includes("/gprsonlinestatus/") || lowerPath.includes("/updatefirmwaretask/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/loadprofile/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), dateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/eventnotification/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), currentDateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  const defaultRequest = { path, method: "POST", payload: { pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  const finalRequest = lowerPath.includes("/eventnotification/")
    ? { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), currentDateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" }
    : defaultRequest;
  return finalRequest;
}

export function tableRequest(route, options = {}) {
  const requestOptions = tableOptions(options);
  const req = buildTableRequest(route, requestOptions);
  if (requestOptions.orderBy && req.payload && typeof req.payload === 'object') {
    req.payload.orderBy = requestOptions.orderBy;
  }
  return req;
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
  let total = firstCollection.total;
  const requestedSize = pageSizeForRequest(request);

  // Detect C# backend pagination bug: we requested a large page (e.g. 500)
  // but the API clamped the response to exactly 20 items and falsely claims total=20.
  // If we continue using pageSize=500, we skip items (offset=500).
  const isCappedAt20 = requestedSize > 20 && rows.length === 20;

  if (isCappedAt20) {
    // Switch to page size 20 and fetch sequentially to avoid skipping offsets
    const clampedSize = 20;
    let pageIndex = 1; // We already have page 1 (index 0)
    
    while (rows.length < maxTableRows) {
      // Create a modified request that explicitly asks for pageSize 20
      const nextReq = withPage({
        ...request,
        payload: { ...request.payload, pageSize: clampedSize },
        params: { ...request.params, pageLimit: clampedSize }
      }, pageIndex);
      
      const nextRes = await sendTableRequest(nextReq);
      const nextCol = responseRows(nextRes, route);
      
      if (!nextCol.rows.length) break;
      
      rows.push(...nextCol.rows);
      total = nextCol.total || total; // The API usually returns the real total on page 2+
      
      if (nextCol.rows.length < clampedSize) break;
      pageIndex++;
    }
    
    return { rows: rows.slice(0, Math.min(total || rows.length, maxTableRows)), total };
  }

  // Normal logic for well-behaved endpoints
  if (!request.pagination || rows.length >= total || rows.length >= maxTableRows) {
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

export function printModelForRoute(route, row) {
  return buildReceiptModel(route, row, columnKey);
}


export { columnKey, createFormSeed, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, resolveRowValue, routeSortDirection, routeSortPolicy, rowActionButtons, searchRows, sortRows, totalPages };
