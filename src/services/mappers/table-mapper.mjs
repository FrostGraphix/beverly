import { buildConsumptionStatisticsPayload } from "../live-report-adapters.mjs";
import { normalizeCollection } from "../response-normalizers.mjs";
import { formatToken, normalizeAccountStatus, normalizeRemoteStatus } from "../remote-task-flow.mjs";

export function normalizeTableResponse(rawResponse, route) {
  const response = route.hash.includes("consumption-statistics")
    ? buildConsumptionStatisticsPayload(normalizeCollection(rawResponse).rows)
    : rawResponse;
  return normalizeCollection(response);
}

export function mapTableCollection(rawResponse, route) {
  const collection = normalizeTableResponse(rawResponse, route);
  const rows = collection.rows.map((row) => mapRowShape(row, route));
  return {
    envelope: collection.envelope,
    rows,
    total: collection.total
  };
}

function mapRowShape(row, route) {
  const record = row && typeof row === "object" ? { ...row } : row;
  if (!record || typeof record !== "object") return row;

  if (route.hash.includes("management/account")) {
    if (record.customerId == null && record.id != null) record.customerId = record.id;
    if (record.customerName == null && record.name != null) record.customerName = record.name;
  }

  if (route.hash.includes("remote-operation/remote-meter-")) {
    record.status = normalizeAccountStatus(record.status);
    if (record.meterType === 0) record.meterType = "Electricity";
    if (record.meterType === 1) record.meterType = "Water";
    if (record.meterType === 2) record.meterType = "Gas";
    if (record.communicationWay === 0) record.communicationWay = "GPRS";
    if (record.communicationWay === 1) record.communicationWay = "LoraWan";
  }

  if (route.hash.includes("remote-operation-record/remote-meter-")) {
    record.dataItem = record.dataItem || record.name || "";
    record.dataValue = record.dataValue || (!route.hash.includes("remote-meter-token-task") ? record.data : "");
    record.token = route.hash.includes("remote-meter-token-task") ? formatToken(record.token || record.data) : record.token;
    record.status = normalizeRemoteStatus(record.status);
  }

  return record;
}
