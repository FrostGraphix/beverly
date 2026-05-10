import { postApi } from "./api.js";

export async function logExportJob(route, rows, format, artifact = {}) {
  return postApi("/api/local/exportJob/create", {
    routeHash: route.hash,
    routeTitle: route.title,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    format,
    status: "completed",
    fileName: artifact.fileName,
    content: artifact.content,
    contentType: artifact.contentType
  });
}

export async function logPrintJob(route, receiptModel, mode, receiptType, artifact = {}) {
  return postApi("/api/local/printJob/create", {
    routeHash: route.hash,
    routeTitle: route.title,
    receiptType,
    mode,
    format: artifact.format || "html",
    fileName: artifact.fileName,
    content: artifact.content,
    contentType: artifact.contentType,
    fieldCount: Array.isArray(receiptModel.fields) ? receiptModel.fields.length : 0,
    status: "completed"
  });
}
