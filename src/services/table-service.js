import { reactive } from "vue";
import { getApi, postApi } from "./api.js";
import { mapTableCollection, normalizeTableResponse } from "./mappers/table-mapper.mjs";
import { normalizeCollection } from "./response-normalizers.mjs";
import { mapExportRows } from "./record-mappers.mjs";
import { buildReceiptModel } from "./receipt-tools.mjs";
import { fetchStationOptions } from "./station-registry.mjs";
import { columnKey, createFormSeed, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, resolveRowValue, routeSortDirection, routeSortPolicy, rowActionButtons, searchRows, sortRows, totalPages } from "./table-helpers.mjs";
import { isCreditTokenRoute, meterPhaseFromRow } from "./token-flow.mjs";
import { isWriteEndpoint } from "./write-helpers.mjs";

const tableFetchPageSize = 500;
const liveReadPageSize = 20;
const maxTableRows = 20000;
export const tableSiteOptions = reactive([
  { value: "", label: "All sites" }
]);

let stationLoadingPromise = null;

export async function loadDynamicStationOptions(api = defaultTableApi, forceRefresh = false) {
  if (stationLoadingPromise && !forceRefresh) return stationLoadingPromise;
  stationLoadingPromise = (async () => {
    try {
      const rows = api === defaultTableApi
        ? await fetchStationOptions({ force: forceRefresh })
        : normalizeCollection(await api.postApi("/api/station/read", { pageNumber: 1, pageSize: 500 })).rows;
      if (rows.length > 0) {
        const fetched = rows.map((s) => {
          const id = String(s.stationId || s.id || s.station_id || s.name || "").trim();
          const rawName = String(s.label || s.name || s.stationName || s.station_name || s.communityLabel || id).trim();
          let label = rawName;
          if (rawName && rawName === rawName.toUpperCase() && rawName.length > 1 && !/^\d+$/.test(rawName)) {
            label = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
          }
          return {
            value: id,
            label: label || id,
            oemId: String(s.oemId || "").trim(),
            status: String(s.status || "active").trim().toLowerCase(),
          };
        }).filter((opt) => opt.value && opt.value.toLowerCase() !== "admin");

        tableSiteOptions.splice(0, tableSiteOptions.length, { value: "", label: "All sites" }, ...fetched);
      }
    } catch (error) {
      if (tableSiteOptions.length === 1) throw error;
    }
    return tableSiteOptions;
  })();
  return stationLoadingPromise;
}

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

function searchFilter(options) {
  const searchTerm = String(options.searchTerm || "").trim();
  return searchTerm ? { searchTerm } : {};
}

function normalizeLiveReadOrderBy(orderBy, keyMap = {}) {
  const rawOrderBy = String(orderBy || "").trim();
  if (!rawOrderBy) return "";
  const [rawKey, rawDirection = "asc"] = rawOrderBy.split(/\s+/);
  const mappedKey = keyMap[String(rawKey || "").toLowerCase()];
  if (!mappedKey) return "";
  const direction = String(rawDirection || "").toLowerCase() === "desc" ? "desc" : "asc";
  return `${mappedKey} ${direction}`;
}

const customerOrderByKeys = {
  id: "customerId",
  customerid: "customerId",
  name: "customerName",
  customername: "customerName"
};

const accountOrderByKeys = {
  id: "customerId",
  customerid: "customerId",
  name: "customerName",
  customername: "customerName",
  meterid: "meterId",
  tariffid: "tariffId",
  communicationway: "communicationWay",
  ctratio: "ctRatio",
  stationid: "stationId",
  createdate: "createDate",
  updatedate: "updateDate"
};

const gatewayOrderByKeys = {
  id: "gatewayId",
  gatewayid: "gatewayId",
  name: "gatewayName",
  gatewayname: "gatewayName",
  status: "status",
  stationid: "stationId",
  createdate: "createDate",
  updatedate: "updateDate"
};

const tariffOrderByKeys = {
  id: "tariffId",
  tariffid: "tariffId",
  name: "tariffName",
  tariffname: "tariffName",
  price: "price",
  createdate: "createDate",
  updatedate: "updateDate"
};

const meterOrderByKeys = {
  id: "meterId",
  meterid: "meterId",
  metertype: "meterType",
  communicationway: "communicationWay",
  protocolversion: "protocolVersion",
  status: "status",
  stationid: "stationId",
  createdate: "createDate",
  updatedate: "updateDate"
};

const logOrderByKeys = {
  id: "id",
  userid: "userId",
  action: "action",
  status: "status",
  remark: "remark",
  createdate: "createDate",
  stationid: "stationId"
};

export function routeSupportsSiteFilter(route) {
  return Array.isArray(route?.columns)
    && route.columns.some((column) => columnKey(column) === "stationId");
}

function routeUsesServerPagination(route) {
  // Manifest override wins when present (lets a new OEM's route opt into server
  // pagination declaratively). Falls back to the legacy hash whitelist so every
  // existing Calinmeter route behaves byte-identically.
  if (typeof route?.serverPagination === "boolean") return route.serverPagination;
  const hash = String(route?.hash || "");
  return hash.includes("management/customer")
    || hash.includes("token-record/credit-token-record")
    || hash.includes("management/account")
    || hash.includes("management/gateway")
    || hash.includes("management/tariff")
    || hash.includes("admin/log")
    || hash.includes("admin/meter")
    || hash.includes("admin/station")
    || hash.includes("token-generate")
    || hash.includes("prepay-report/abnormal-alarm")
    || hash.includes("prepay-report/low-purchase-situation")
    || hash.startsWith("#/remote-operation/");
}

function isAccountRoute(route) {
  return String(route?.hash || "").includes("management/account");
}

// The upstream account read matches `searchTerm` against identifiers only —
// searching "HARUNA" upstream returns nothing even though that customer has a
// binding. Identifier-shaped terms stay server-side (one fast call); anything
// else needs the full set pulled so names can be matched client-side.
function needsClientSideAccountSearch(route, options = {}) {
  if (!isAccountRoute(route)) return false;
  const term = String(options.searchTerm || "").trim();
  if (!term) return false;
  return !/^[0-9]+$/.test(term);
}

function isLongNonpurchaseRoute(route) {
  return String(route?.hash || "").includes("prepay-report/long-nonpurchase-situation");
}

function parseOrderBy(orderBy, route) {
  const raw = String(orderBy || "").trim();
  if (!raw) return { direction: routeSortDirection(route), field: routeSortPolicy(route).key };
  const parts = raw.split(/\s+/);
  const field = parts[0] || routeSortPolicy(route).key;
  const direction = String(parts[1] || "").toLowerCase() === "desc" ? "desc" : "asc";
  return { direction, field };
}

function requiresMeterPhaseServerFilter(route, options = {}) {
  return isCreditTokenRoute(route) && ["single-phase", "three-phase"].includes(String(options.meterPhaseFilter || ""));
}

function meterReadRoute() {
  return {
    hash: "#/admin/meter",
    title: "Meter",
    apis: ["/api/meter/read"],
    columns: ["meterId"]
  };
}

function meterIdSet(rows = []) {
  return new Set(
    rows
      .map((row) => String(row?.meterId || row?.id || "").trim())
      .filter(Boolean)
  );
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
  if (route.hash.includes("abnormal-alarm")) return "/api/local/abnormal-alarms";
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
        ...stationFilter(requestOptions),
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
  if (lowerPath.includes("/api/customer/read")) {
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || liveReadPageSize), liveReadPageSize),
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/gateway/read")) {
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || liveReadPageSize), liveReadPageSize),
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/tariff/read")) {
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || liveReadPageSize), liveReadPageSize),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/local/abnormal-alarms")) {
    const hash = String(route.hash || "");
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const alarm = params.get("alarm") || "";
    const pageSize = Math.min(Number(requestOptions.pageSize || liveReadPageSize), liveReadPageSize);
    const pageNumber = Math.max(1, Number(requestOptions.pageNumber || 1));
    const { direction, field } = parseOrderBy(requestOptions.orderBy, route);
    return {
      path,
      method: "GET",
      params: {
        alarm,
        station_id: requestOptions.siteId || "",
        from: requestOptions.from,
        to: requestOptions.to,
        searchTerm: requestOptions.searchTerm || "",
        sortBy: field,
        sortDirection: direction,
        offset: (pageNumber - 1) * pageSize,
        pageLimit: pageSize,
        limit: pageSize
      },
      pagination: "offset"
    };
  }
  if (lowerPath.includes("/api/meter/read")) {
    const meterPhase = String(requestOptions.meterPhaseFilter || "");
    const maximumPageSize = requestOptions.bulkRead ? tableFetchPageSize : liveReadPageSize;
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || maximumPageSize), maximumPageSize),
        ...(meterPhase === "three-phase" ? { isThreePhase: 1 } : {}),
        ...(meterPhase === "single-phase" ? { isThreePhase: 0 } : {}),
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/log/read")) {
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || liveReadPageSize), liveReadPageSize),
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/account/read")) {
    const maximumPageSize = requestOptions.bulkRead ? tableFetchPageSize : liveReadPageSize;
    return {
      path,
      method: "POST",
      payload: {
        pageNumber: requestOptions.pageNumber,
        pageSize: Math.min(Number(requestOptions.pageSize || maximumPageSize), maximumPageSize),
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions)
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/api/prepayreport/longnonpurchasesituation")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/api/prepayreport/lowpurchasesituation")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), ...searchFilter(requestOptions), dateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/remotemetertask/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/gprstmetertask/") || lowerPath.includes("/gprsmetertask/") || lowerPath.includes("/gprsonlinestatus/") || lowerPath.includes("/updatefirmwaretask/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  if (lowerPath.includes("/loadprofile/")) {
    return {
      path,
      method: "POST",
      payload: {
        lang: "en",
        ...stationFilter(requestOptions),
        ...searchFilter(requestOptions),
        currentDateRange: [requestOptions.from, requestOptions.to],
        pageNumber: requestOptions.pageNumber,
        pageSize: requestOptions.pageSize
      },
      pagination: "pageNumber"
    };
  }
  if (lowerPath.includes("/eventnotification/")) {
    return { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), currentDateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  }
  const defaultRequest = { path, method: "POST", payload: { ...stationFilter(requestOptions), pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" };
  const finalRequest = lowerPath.includes("/eventnotification/")
    ? { path, method: "POST", payload: { lang: "en", ...stationFilter(requestOptions), currentDateRange: [requestOptions.from, requestOptions.to], pageNumber: requestOptions.pageNumber, pageSize: requestOptions.pageSize }, pagination: "pageNumber" }
    : defaultRequest;
  return finalRequest;
}

export function tableRequest(route, options = {}) {
  const requestOptions = tableOptions(options);
  const req = buildTableRequest(route, requestOptions);
  if (requestOptions.orderBy && req.payload && typeof req.payload === 'object') {
    const lowerPath = req.path.toLowerCase();
    // Only forward orderBy to upstream paths proven to accept it. Every other
    // read is re-sorted client-side by sortRows() after fetch regardless (see
    // applyControls() in TablePage.vue), so orderBy serves no purpose there —
    // and for /api/station/read specifically, sending it makes the live
    // upstream reject the whole request (code 99, "Value does not fall
    // within the expected range."), which used to be silently masked by the
    // now-removed sample fallback and surfaced as "Live API unavailable"
    // once that masking was correctly removed.
    const orderBy = lowerPath === "/api/customer/read"
      ? normalizeLiveReadOrderBy(requestOptions.orderBy, customerOrderByKeys)
      : lowerPath === "/api/account/read"
        ? normalizeLiveReadOrderBy(requestOptions.orderBy, accountOrderByKeys)
        : lowerPath === "/api/gateway/read"
          ? normalizeLiveReadOrderBy(requestOptions.orderBy, gatewayOrderByKeys)
          : lowerPath === "/api/tariff/read"
            ? normalizeLiveReadOrderBy(requestOptions.orderBy, tariffOrderByKeys)
            : lowerPath === "/api/meter/read"
              ? normalizeLiveReadOrderBy(requestOptions.orderBy, meterOrderByKeys)
              : lowerPath === "/api/log/read"
                ? normalizeLiveReadOrderBy(requestOptions.orderBy, logOrderByKeys)
                : undefined;
    if (orderBy) req.payload.orderBy = orderBy;
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

const defaultTableApi = { getApi, postApi };

function tableRowKey(row, route = {}) {
  if (!row || typeof row !== "object") return JSON.stringify(row);
  const hash = String(route.hash || "");
  if (hash.includes("remote-operation-record/remote-meter-")) {
    const stableTaskId = row.taskId || row.id || row.taskNo || row.taskCode;
    if (stableTaskId) return String(stableTaskId);
    return [
      row.customerId,
      row.meterId,
      row.dataItem || row.name,
      row.createDate || row.createTime,
      row.updateDate || row.updateTime,
      row.status,
      row.dataValue || row.data || row.token
    ].map((value) => String(value || "").trim()).join(":");
  }
  if (hash.includes("management/customer")) {
    return String(row.customerId || row.id || row.phone || row.name || JSON.stringify(row));
  }
  const stableId = row.receiptId
    || row.customerId && row.meterId && `${row.customerId}:${row.meterId}`
    || row.meterId
    || row.id
    || row.gatewayId
    || row.customerName;
  return stableId ? String(stableId) : JSON.stringify(row);
}

function pushUniqueRows(targetRows, nextRows, seenKeys, route = {}) {
  let added = 0;
  for (const row of nextRows) {
    const key = tableRowKey(row, route);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    targetRows.push(row);
    added += 1;
  }
  return added;
}

async function sendTableRequest(request, api = defaultTableApi) {
  return request.method === "GET" ? api.getApi(request.path, request.params) : api.postApi(request.path, request.payload);
}

async function fetchAllTableRows(request, route, api = defaultTableApi, rowLimit = maxTableRows) {
  const firstResponse = await sendTableRequest(request, api);
  const firstCollection = responseRows(firstResponse, route);
  const rows = [];
  const seenKeys = new Set();
  pushUniqueRows(rows, firstCollection.rows, seenKeys, route);
  let total = firstCollection.total;
  const requestedSize = pageSizeForRequest(request);

  // Detect C# backend pagination bug: we requested a large page (e.g. 500)
  // but the API clamped the response to exactly 20 items and falsely claims total=20.
  // If we continue using pageSize=500, we skip items (offset=500).
  const isCappedAt20 = requestedSize > 20 && firstCollection.rows.length === 20;

  if (isCappedAt20) {
    // Switch to page size 20 and fetch sequentially to avoid skipping offsets
    const clampedSize = 20;
    let pageIndex = 1; // We already have page 1 (index 0)

    if (total > clampedSize) {
      const pageCount = Math.ceil(total / clampedSize);
      for (let start = 1; start < pageCount; start += 10) {
        const pageIndexes = Array.from({ length: Math.min(10, pageCount - start) }, (_, index) => start + index);
        const responses = await Promise.all(pageIndexes.map((index) => sendTableRequest(withPage({
          ...request,
          payload: { ...request.payload, pageSize: clampedSize },
          params: { ...request.params, pageLimit: clampedSize }
        }, index), api)));
        for (const response of responses) pushUniqueRows(rows, responseRows(response, route).rows, seenKeys, route);
      }
      return { rows: rows.slice(0, Math.min(total, rowLimit)), total };
    }
    
    while (rows.length < rowLimit) {
      // Create a modified request that explicitly asks for pageSize 20
      const nextReq = withPage({
        ...request,
        payload: { ...request.payload, pageSize: clampedSize },
        params: { ...request.params, pageLimit: clampedSize }
      }, pageIndex);
      
      const nextRes = await sendTableRequest(nextReq, api);
      const nextCol = responseRows(nextRes, route);
      
      if (!nextCol.rows.length) break;
      
      const added = pushUniqueRows(rows, nextCol.rows, seenKeys, route);
      if (!added) break;
      total = Math.max(total || 0, nextCol.total || 0, rows.length);
      
      if (nextCol.rows.length < clampedSize) break;
      pageIndex++;
    }
    
    const cappedTotal = Math.max(total || 0, rows.length);
    return { rows: rows.slice(0, Math.min(cappedTotal, rowLimit)), total: cappedTotal };
  }

  // Normal logic for well-behaved endpoints
  if (!request.pagination || rows.length >= total || rows.length >= rowLimit) {
    return { rows, total };
  }

  const pageCount = Math.min(Math.ceil(total / requestedSize), Math.ceil(rowLimit / requestedSize));
  if (request.path.toLowerCase() === "/api/account/read") {
    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      const pageResponse = await sendTableRequest(withPage(request, pageIndex), api);
      const added = pushUniqueRows(rows, responseRows(pageResponse, route).rows, seenKeys, route);
      if (!added || rows.length >= rowLimit) break;
    }
    const finalRows = rows.slice(0, Math.min(total || rows.length, rowLimit));
    return { rows: finalRows, total: Math.min(total || finalRows.length, finalRows.length) };
  }

  if (!Number.isFinite(rowLimit)) {
    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      const pageResponse = await sendTableRequest(withPage(request, pageIndex), api);
      const added = pushUniqueRows(rows, responseRows(pageResponse, route).rows, seenKeys, route);
      if (!added) break;
    }
    return { rows, total: rows.length };
  }

  const pageRequests = [];
  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
    pageRequests.push(sendTableRequest(withPage(request, pageIndex), api));
  }

  const pageResponses = await Promise.all(pageRequests);
  for (const pageResponse of pageResponses) {
    pushUniqueRows(rows, responseRows(pageResponse, route).rows, seenKeys, route);
    if (rows.length >= rowLimit) break;
  }

  const finalRows = rows.slice(0, Math.min(total || rows.length, rowLimit));
  return { rows: finalRows, total: Math.min(total || finalRows.length, finalRows.length) };
}

export async function fetchTableData(route, options = {}, api = defaultTableApi) {
  const requestOptions = tableOptions(options);
  const rowLimit = requestOptions.exportAll ? Number.POSITIVE_INFINITY : maxTableRows;
  const { direction: requestedDirection, field: requestedField } = parseOrderBy(requestOptions.orderBy, route);
  if (requiresMeterPhaseServerFilter(route, requestOptions)) {
    const selectedPhase = String(requestOptions.meterPhaseFilter);
    const meterRoute = meterReadRoute();
    const meterRequest = tableRequest(meterRoute, {
      pageNumber: 1,
      pageSize: tableFetchPageSize,
      bulkRead: true,
      siteId: requestOptions.siteId,
      meterPhaseFilter: selectedPhase
    });
    const meterCollection = await fetchAllTableRows(meterRequest, meterRoute, api, rowLimit);
    const threePhaseMeterIds = meterIdSet(meterCollection.rows);
    if (!threePhaseMeterIds.size) {
      return {
        envelope: {},
        rows: [],
        total: 0,
        serverPaginated: true,
        meta: {
          path: "/api/account/read",
          method: "POST",
          source: "meter-phase-filter"
        }
      };
    }

    const accountRequest = tableRequest(route, {
      ...requestOptions,
      pageNumber: 1,
      pageSize: tableFetchPageSize,
      bulkRead: true
    });
    const accountCollection = await fetchAllTableRows(accountRequest, route, api, rowLimit);
    const phaseRows = accountCollection.rows
      .filter((row) => threePhaseMeterIds.has(String(row?.meterId || "").trim()))
      .map((row) => ({
        ...row,
        isThreePhase: selectedPhase === "three-phase",
        meterPhase: selectedPhase,
      }));
    const mappedAll = mapTableCollection({ data: { rows: phaseRows, total: phaseRows.length } }, route);
    const searchedRows = searchRows(route, mappedAll.rows, requestOptions.searchTerm || "");
    const sortedRows = sortRows(route, searchedRows, requestedDirection, requestedField);
    if (requestOptions.exportAll) {
      return {
        ...mappedAll,
        rows: sortedRows,
        total: sortedRows.length,
        serverPaginated: true,
        meta: { path: "/api/account/read", method: "POST", source: "meter-phase-filter" }
      };
    }
    const pageSize = Math.min(Number(requestOptions.pageSize || 10), liveReadPageSize);
    const pageNumber = Math.max(1, Number(requestOptions.pageNumber || 1));
    return {
      ...mappedAll,
      rows: sortedRows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
      total: sortedRows.length,
      serverPaginated: true,
      meta: {
        path: "/api/account/read",
        method: "POST",
        source: "meter-phase-filter"
      }
    };
  }
  const request = tableRequest(route, options);
  const dataPath = request.path;
  if (isLongNonpurchaseRoute(route) && !String(requestOptions.siteId || "").trim()) {
    const fullCollection = await fetchAllTableRows(request, route, api, rowLimit);
    const mappedAll = mapTableCollection({ data: { rows: fullCollection.rows, total: fullCollection.total } }, route);
    const searchedRows = searchRows(route, mappedAll.rows, requestOptions.searchTerm || "");
    const sortedRows = sortRows(route, searchedRows, requestedDirection, requestedField);
    if (requestOptions.exportAll) {
      return {
        ...mappedAll,
        rows: sortedRows,
        total: sortedRows.length,
        serverPaginated: true,
        meta: { path: request.path, method: request.method, source: "verified-live-total" }
      };
    }
    const pageSize = Math.min(Number(requestOptions.pageSize || 10), 20);
    const pageNumber = Math.max(1, Number(requestOptions.pageNumber || 1));
    return {
      ...mappedAll,
      rows: sortedRows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
      total: sortedRows.length,
      serverPaginated: true,
      meta: {
        path: request.path,
        method: request.method,
        source: "verified-live-total"
      }
    };
  }
  if (needsClientSideAccountSearch(route, requestOptions)) {
    const bulkRequest = tableRequest(route, {
      ...requestOptions,
      searchTerm: "",
      pageNumber: 1,
      pageSize: tableFetchPageSize,
      bulkRead: true
    });
    const fullCollection = await fetchAllTableRows(bulkRequest, route, api, rowLimit);
    const mappedAll = mapTableCollection({ data: { rows: fullCollection.rows, total: fullCollection.total } }, route);
    const searchedRows = searchRows(route, mappedAll.rows, requestOptions.searchTerm || "");
    const sortedRows = sortRows(route, searchedRows, requestedDirection, requestedField);
    const pageSize = Math.max(1, Number(requestOptions.pageSize || 10));
    const pageNumber = Math.max(1, Number(requestOptions.pageNumber || 1));
    return {
      ...mappedAll,
      rows: requestOptions.exportAll ? sortedRows : sortedRows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
      total: sortedRows.length,
      serverPaginated: true,
      meta: { path: request.path, method: request.method, source: "client-name-search" }
    };
  }
  if (routeUsesServerPagination(route)) {
    const collection = requestOptions.exportAll
      ? await fetchAllTableRows(request, route, api, rowLimit)
      : responseRows(await sendTableRequest(request, api), route);
    const mapped = mapTableCollection({ data: { rows: collection.rows, total: collection.total } }, route);
    return {
      ...mapped,
      serverPaginated: true,
      meta: {
        path: request.path,
        method: request.method,
        source: mapped.envelope?._proxy?.source || "mapped"
      }
    };
  }
  const backgroundPaths = route.apis.filter((path) => path.toLowerCase() !== dataPath.toLowerCase() && !isWriteEndpoint(path));
  await Promise.all(backgroundPaths.map((path) => api.postApi(path, { pageNumber: 1, pageSize: 20 }).catch(() => null)));
  const collection = await fetchAllTableRows(request, route, api, rowLimit);
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

function rowDateValue(row) {
  const keys = ["currentDate", "createDate", "collectionDate", "statusUpdateDate", "lastPurchaseDate", "updateDate"];
  for (const key of keys) {
    const value = row?.[key];
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

export async function fetchTableExportData(route, options = {}, api = defaultTableApi) {
  const requestOptions = tableOptions({ ...options, pageNumber: 1, pageSize: tableFetchPageSize, exportAll: true });
  const table = await fetchTableData(route, requestOptions, api);
  const from = Date.parse(requestOptions.from);
  const to = Date.parse(requestOptions.to);
  const rangedRows = table.rows.filter((row) => {
    const timestamp = rowDateValue(row);
    return timestamp === null || ((!Number.isFinite(from) || timestamp >= from) && (!Number.isFinite(to) || timestamp <= to));
  });
  const searchedRows = searchRows(route, rangedRows, requestOptions.searchTerm || "");
  const { direction, field } = parseOrderBy(requestOptions.orderBy, route);
  const rows = sortRows(route, searchedRows, direction, field);
  return { ...table, rows, total: rows.length };
}

export function exportRowsForRoute(route, rows) {
  return mapExportRows(route, rows, columnKey);
}

export function printModelForRoute(route, row) {
  return buildReceiptModel(route, row, columnKey);
}


export { columnKey, createFormSeed, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, resolveRowValue, routeSortDirection, routeSortPolicy, routeUsesServerPagination, rowActionButtons, searchRows, sortRows, totalPages };
