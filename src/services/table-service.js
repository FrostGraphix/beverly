import { getApi, postApi } from "./api";
import { buildConsumptionStatisticsPayload } from "./live-report-adapters.mjs";
import { mapExportRows } from "./record-mappers.mjs";
import { normalizeCollection } from "./response-normalizers.mjs";
import { buildReceiptModel } from "./receipt-tools.mjs";
import { columnKey, createFormSeed, pageNumbers, pageSizeOptions, paginateRows, rowActionButtons, searchRows, sortRows, totalPages } from "./table-helpers.mjs";

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
  if (route.hash.includes("management/gateway")) return "/api/gateway/read";
  if (route.hash.includes("management/customer")) return "/api/customer/read";
  if (route.hash.includes("management/tariff")) return "/api/tariff/read";
  if (route.hash.includes("management/account")) return "/api/account/read";
  if (route.hash.includes("remote-operation")) return "/api/account/read";
  if (route.hash.includes("token-generate")) return "/api/account/read";
  return route.apis[route.apis.length - 1];
}

function tableRequest(route) {
  const path = tableDataPath(route);
  if (path === "/api/token/creditTokenRecord/readMore") {
    return {
      path,
      method: "GET",
      params: {
        FROM: "2026-01-01T00:00:00.000Z",
        TO: "2026-01-17T00:00:00.000Z",
        SITE_ID: "KYAKALE"
      }
    };
  }
  if (path === "/api/DailyDataMeter/readHourly") {
    return {
      path,
      method: "GET",
      params: {
        offset: 0,
        pageLimit: 100,
        FROM: "2026-01-10T00:00:00.000Z",
        TO: "2026-01-17T00:00:00.000Z",
        SITE_ID: "KYAKALE"
      }
    };
  }
  if (path.includes("/API/PrepayReport/LongNonpurchaseSituation")) {
    return { path, method: "POST", payload: { lang: "en", pageNumber: 1, pageSize: 20 } };
  }
  if (path.includes("/API/PrepayReport/LowPurchaseSituation")) {
    return { path, method: "POST", payload: { lang: "en", stationId: "KYAKALE", dateRange: ["2026-01-01T00:00:00.000Z", "2026-01-17T00:00:00.000Z"], pageNumber: 1, pageSize: 20 } };
  }
  if (path.includes("/API/RemoteMeterTask/")) {
    return { path, method: "POST", payload: { lang: "en", stationId: "KYAKALE", pageNumber: 1, pageSize: 20 } };
  }
  return { path, method: "POST", payload: { pageNumber: 1, pageSize: 20 } };
}

export async function fetchTableData(route) {
  const request = tableRequest(route);
  const dataPath = request.path;
  const backgroundPaths = route.apis.filter((path) => path.toLowerCase() !== dataPath.toLowerCase());
  await Promise.all(backgroundPaths.map((path) => postApi(path, { pageNumber: 1, pageSize: 20 }).catch(() => null)));
  const rawResponse = request.method === "GET" ? await getApi(dataPath, request.params) : await postApi(dataPath, request.payload);
  const response = route.hash.includes("consumption-statistics")
    ? buildConsumptionStatisticsPayload(rawResponse.readings || rawResponse.data?.readings || rawResponse.result?.readings || [])
    : rawResponse;
  const collection = normalizeCollection(response);
  return { rows: collection.rows, total: collection.total };
}

export function exportRowsForRoute(route, rows) {
  return mapExportRows(route, rows, columnKey);
}

export function printModelForRoute(route, row, receiptType = "") {
  return buildReceiptModel(route, row, columnKey, receiptType);
}

export { columnKey, createFormSeed, pageNumbers, pageSizeOptions, paginateRows, rowActionButtons, searchRows, sortRows, totalPages };
