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

  if (route.hash.includes("management/gateway")) {
    if (record.id == null && record.gatewayId != null) record.id = record.gatewayId;
    if (record.name == null && record.gatewayName != null) record.name = record.gatewayName;
    if (record.status === true) record.status = "Online";
    if (record.status === false) record.status = "Offline";
  }

  if (route.hash.includes("management/customer")) {
    if (record.id == null && record.customerId != null) record.id = record.customerId;
    if (record.name == null && record.customerName != null) record.name = record.customerName;
  }

  if (route.hash.includes("management/tariff")) {
    if (record.id == null && record.tariffId != null) record.id = record.tariffId;
    if (record.name == null && record.tariffName != null) record.name = record.tariffName;
  }

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

  if (route.hash.includes("prepay-report/low-purchase-situation")) {
    if (record.totalUnit == null && record.purchaseTotalUnit != null) record.totalUnit = record.purchaseTotalUnit;
    if (record.totalPaid == null && record.purchaseTotalPaid != null) record.totalPaid = record.purchaseTotalPaid;
  }

  if (route.hash.includes("admin/user")) {
    if (record.name == null) record.name = record.nickName || record.fullName || record.userId || "";
    if (record.status === true || record.status === 1) record.status = "Active";
    if (record.status === false || record.status === 0) record.status = "Inactive";
  }

  if (route.hash.includes("admin/role")) {
    if (record.id == null && record.roleId != null) record.id = record.roleId;
    if (record.name == null && record.content != null) record.name = record.content;
  }

  if (route.hash.includes("admin/log")) {
    if (record.id == null && record.logId != null) record.id = record.logId;
    if (record.userId == null && record.createId != null) record.userId = record.createId;
    if (record.status == null) record.status = record.action || "";
  }

  if (route.hash.includes("admin/station")) {
    if (record.id == null && record.stationId != null) record.id = record.stationId;
  }

  if (route.hash.includes("admin/item")) {
    if (record.id == null && record.itemType != null) record.id = record.itemType;
    if (record.name == null && record.itemName != null) record.name = record.itemName;
  }

  if (route.hash.includes("admin/meter")) {
    if (record.meterType == null && record.type != null) record.meterType = record.type;
    if (record.meterType === 0 || record.meterType === "0") record.meterType = "Electricity";
    if (record.meterType === 1 || record.meterType === "1") record.meterType = "Water";
    if (record.meterType === 2 || record.meterType === "2") record.meterType = "Gas";
    if (record.communicationWay === 0) record.communicationWay = "GPRS";
    if (record.communicationWay === 1) record.communicationWay = "LoraWan";
    if (record.status === true) record.status = "Online";
    if (record.status === false) record.status = "Offline";
  }

  if (route.hash.includes("admin/debt")) {
    if (record.id == null && record.debtId != null) record.id = record.debtId;
  }

  if (route.hash.includes("protocol/dlms")) {
    if (record.id == null && record.dlmsId != null) record.id = record.dlmsId;
    if (record.name == null && record.nameEN != null) record.name = record.nameEN;
  }

  if (route.hash.includes("protocol/dlt645")) {
    if (record.id == null && record.dlt645Id != null) record.id = record.dlt645Id;
    if (record.name == null && record.nameEN != null) record.name = record.nameEN;
  }

  return record;
}
