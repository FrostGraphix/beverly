import { postApi } from "./api.js";

export async function logExportJob(route, rows, format) {
  return postApi("/api/local/exportJob/create", {
    routeHash: route.hash,
    routeTitle: route.title,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    format,
    status: "completed"
  });
}

export async function logPrintJob(route, receiptModel, mode, receiptType) {
  return postApi("/api/local/printJob/create", {
    routeHash: route.hash,
    routeTitle: route.title,
    receiptType,
    mode,
    fieldCount: Array.isArray(receiptModel.fields) ? receiptModel.fields.length : 0,
    status: "completed"
  });
}
