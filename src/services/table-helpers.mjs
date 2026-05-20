export const pageSizeOptions = [10, 20, 50, 100];

export function isBatchCheckableRoute(route = {}) {
  return String(route.hash || "").includes("remote-operation/remote-meter-reading");
}

export function columnKey(label) {
  const map = {
    "Address": "address",
    "Battery Status": "batteryStatus",
    "CertifiName": "certifiName",
    "CertifiNo": "certifiNo",
    "Collection Date": "collectionDate",
    "Communication Way": "communicationWay",
    "Create Time": "createDate",
    "Credit Balance": "creditBalance",
    "CT Ratio": "ctRatio",
    "Current Reverse": "currentReverse",
    "Current Unbalance": "currentUnbalance",
    "Customer Address": "customerAddress",
    "Customer Id": "customerId",
    "Customer Name": "customerName",
    "Data Item": "dataItem",
    "Data Value": "dataValue",
    "Gateway Id": "gatewayId",
    "Id": "id",
    "Last Hour Usage": "lastHourUsage",
    "Last Purchase Date": "lastPurchaseDate",
    "Last Purchase Paid": "lastPurchasePaid",
    "Last Purchase Unit": "lastPurchaseUnit",
    "Magnetic Status": "magneticStatus",
    "Maximum Demand": "maximumDemand",
    "Maximum Power(W)": "maximumPower",
    "Meter Id": "meterId",
    "Meter Type": "meterType",
    "Name": "name",
    "Nonpurchase Days": "nonpurchaseDays",
    "Phone": "phone",
    "Power": "power",
    "Price": "price",
    "Protocol Version": "protocolVersion",
    "Receipt Id": "receiptId",
    "Relay Status": "relayStatus",
    "Remark": "remark",
    "Station Id": "stationId",
    "Status": "status",
    "Success Rate": "successRate",
    "Tariff Id": "tariffId",
    "Terminal Cover": "terminalCover",
    "Time": "createDate",
    "Token": "token",
    "Token(Recharge)": "token",
    "Total Energy": "totalEnergy",
    "Total Paid": "totalPaid",
    "Total Unit": "totalUnit",
    "Update Time": "updateDate",
    "Upper Open": "upperOpen",
    "User Id": "userId",
    "VAT Charge": "tax",
    "Vend": "vend",
    "Version": "version",
    "Class Id": "classId",
    "OBIS": "obis",
    "Type": "type"
  };
  return map[label] || label.charAt(0).toLowerCase() + label.slice(1).replace(/\s+/g, "");
}

function directRowValue(row, candidate) {
  if (!row || typeof row !== "object" || !candidate) return undefined;
  if (candidate in row) return row[candidate];
  const actualKey = Object.keys(row).find((key) => key.toLowerCase() === String(candidate).toLowerCase());
  return actualKey ? row[actualKey] : undefined;
}

function aliasedKeys(route = {}, key = "") {
  const hash = String(route.hash || "");
  const aliases = {
    id: ["gatewayId", "customerId", "tariffId", "roleId", "logId", "stationId", "itemType", "dlmsId", "dlt645Id", "debtId", "userId"],
    name: ["customerName", "gatewayName", "tariffName", "itemName", "nickName", "fullName", "nameEN"],
    customerId: ["id"],
    customerName: ["name", "fullName", "nickName"],
    meterId: ["serialNumber"],
    createDate: ["createTime", "timestamp", "time"],
    updateDate: ["updateTime"],
    totalUnit: ["purchaseTotalUnit", "transactionKwh", "usage1"],
    totalPaid: ["purchaseTotalPaid", "amount"],
    receiptId: ["transactionId", "id"],
    dataItem: ["name", "title"],
    dataValue: ["data", "value"],
    remark: ["content", "message", "description"],
    status: ["state", "result", "onlineStatus"],
    successRate: ["rate"],
    stationId: ["station", "siteId"],
    totalEnergy: ["total1"],
    lastHourUsage: ["usage1"],
    creditBalance: ["remain1"],
    relayStatus: ["relayOpen"],
    batteryStatus: ["batteryLow"],
    magneticStatus: ["magneticInterference"],
    terminalCover: ["terminalCoverOpen"],
    upperOpen: ["coverOpen"]
  };

  if (hash.includes("token-record/credit-token-record")) {
    aliases.tariffId = ["transactionType", "tariffId"];
    aliases.token = ["generatedToken", "tokenValue"];
    aliases.stationId = ["station", "siteId", "serialNumber"];
  }

  if (hash.includes("admin/log")) {
    aliases.userId = ["createId"];
    aliases.status = ["title"];
    aliases.remark = ["ipAddress", "contentAfter", "contentBefore"];
  }

  return [key, ...(aliases[key] || [])];
}

export function resolveRowValue(route, row, column) {
  const key = columnKey(column);
  for (const candidate of aliasedKeys(route, key)) {
    const value = directRowValue(row, candidate);
    if (value !== undefined && value !== null && value !== "") return value;
  }

  if (key.toLowerCase().includes("id")) {
    for (const candidate of ["id", "customerId", "meterId", "gatewayId", "tariffId", "userId", "roleId", "stationId"]) {
      const value = directRowValue(row, candidate);
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }

  if (key.toLowerCase().includes("name")) {
    for (const candidate of ["name", "customerName", "gatewayName", "tariffName", "itemName", "nameEN", "fullName", "nickName"]) {
      const value = directRowValue(row, candidate);
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }

  return "";
}

export function searchRows(route, rows, searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) return rows.slice();
  const searchableColumns = route.columns.filter((column) => column !== "Actions");
  return rows.filter((row) => searchableColumns.some((column) => String(resolveRowValue(route, row, column) || "").toLowerCase().includes(query)));
}

const fixedSortPolicies = [
  [/token-generate\/credit-token/, "customerId", "asc"],
  [/token-generate\/clear-tamper-token/, "customerId", "asc"],
  [/token-generate\/clear-credit-token/, "customerId", "asc"],
  [/token-generate\/set-maximum-power-limit-token/, "customerId", "asc"],
  [/remote-operation\/remote-meter-(reading|control|token)/, "customerName", "asc"],
  [/management\/customer/, "customerId", "asc"],
  [/management\/tariff/, "id", "asc"],
  [/management\/account/, "customerId", "asc"],
  [/admin\/user/, "userId", "asc"],
  [/admin\/role/, "id", "asc"],
  [/admin\/station/, "id", "asc"],
  [/admin\/item/, "id", "asc"],
  [/admin\/meter/, "meterId", "asc"],
  [/protocol\/dlms/, "id", "asc"],
  [/protocol\/dlt645/, "id", "asc"],
  [/token-record\/(credit-token-record|clear-tamper-token-record|clear-credit-token-record|set-maximum-power-limit-token-record)/, "createDate", "desc"],
  [/remote-operation-record\/remote-meter-(reading|control|token)-task/, "createDate", "desc"],
  [/admin\/log/, "createDate", "desc"],
  [/admin\/debt/, "createDate", "desc"],
  [/remote-support\/gprs-tasks/, "createDate", "desc"],
  [/remote-support\/load-profile/, "createDate", "desc"],
  [/remote-support\/event-notification/, "createDate", "desc"],
  [/remote-support\/firmware-update/, "createDate", "desc"],
  [/prepay-report\/long-nonpurchase-situation/, "nonpurchaseDays", "desc"],
  [/prepay-report\/low-purchase-situation/, "totalUnit", "asc"],
  [/prepay-report\/consumption-statistics/, "collectionDate", "desc"],
  [/prepay-report\/daily-data-meter/, "collectionDate", "desc"],
  [/management\/gateway/, "successRate", "desc"],
  [/remote-support\/gprs-online-status/, "successRate", "desc"],
  [/remote-support\/file-upload/, "createDate", "desc"]
];

export function routeSortPolicy(route = {}) {
  const hash = String(route.hash || "");
  const match = fixedSortPolicies.find(([pattern]) => pattern.test(hash));
  if (match) return { key: match[1], direction: match[2], fixed: true };
  const firstColumn = route.columns?.find((column) => !["Actions", "Status", "status"].includes(column)) || route.columns?.[0] || "";
  return { key: columnKey(firstColumn), direction: "asc", fixed: false };
}

export function routeSortDirection(route = {}) {
  return routeSortPolicy(route).direction;
}

function comparableValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const numeric = Number(text.replace(/,/g, "").replace("%", ""));
  if (Number.isFinite(numeric) && /^-?\d+(?:[,.]\d+)?%?$/.test(text)) return numeric;
  const timestamp = Date.parse(text);
  if (Number.isFinite(timestamp) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return timestamp;
  return text.toLowerCase();
}

export function sortRows(route, rows, sortDirection = "", sortField = "") {
  const policy = routeSortPolicy(route);
  const dir = sortDirection || policy.direction;
  if (!dir) return rows.slice();
  const key = sortField || policy.key;
  const factor = dir === "desc" ? -1 : 1;
  return rows.slice().sort((left, right) => {
    const leftValue = comparableValue(resolveRowValue(route, left, key));
    const rightValue = comparableValue(resolveRowValue(route, right, key));
    if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * factor;
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * factor;
  });
}

export function paginateRows(rows, currentPage, pageSize) {
  const start = (currentPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function totalPages(totalRows, pageSize) {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

export function pageNumbers(currentPage, pageCount) {
  const pages = [];
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(pageCount, start + 2);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

export function rowActionButtons(route) {
  const buttons = [];
  if (route.actions.includes("Recharge")) buttons.push("Recharge");
  if (route.actions.includes("Generate Token")) buttons.push("Generate Token");
  if (route.actions.includes("Cancel") && String(route.hash || "").includes("credit-token-record") && !String(route.hash || "").includes("clear-credit")) buttons.push("Cancel");
  if (route.actions.includes("Cancel") && String(route.hash || "").includes("clear-tamper-token-record")) buttons.push("Cancel");
  if (route.actions.includes("Cancel") && String(route.hash || "").includes("set-maximum-power-limit-token-record")) buttons.push("Cancel");
  if (route.actions.includes("Print")) buttons.push("Print");
  if (route.actions.includes("Edit")) buttons.push("Edit");
  if (route.actions.includes("Delete")) buttons.push("Delete");
  if (route.actions.includes("Add Task") && Array.isArray(route.columns) && route.columns.includes("Actions")) buttons.push("Add Task");
  if (!buttons.length && route.actions.includes("Close")) buttons.push("Close");
  return buttons;
}

export function createFormSeed(route, action, row = {}) {
  const seed = {};
  for (const column of route.columns.filter((item) => item !== "Actions")) {
    const key = columnKey(column);
    let value = resolveRowValue(route, row, key);
    if (key === "stationId" && typeof value === "string") {
      value = value.toUpperCase();
    }
    seed[key] = value ?? "";
  }
  if (action === "Recharge") {
    seed.amount = seed.amount || "500";
    seed.totalUnit = seed.totalUnit || "1.4";
  }
  if (action === "Cancel" && String(route.hash || "").includes("credit-token-record")) {
    seed.receiptId = row.receiptId || seed.receiptId || "";
    seed.customerId = row.customerId || seed.customerId || "";
    seed.customerName = row.customerName || seed.customerName || "";
    seed.meterId = row.meterId || seed.meterId || "";
    seed.totalPaid = row.totalPaid || seed.totalPaid || "";
    seed.totalUnit = row.totalUnit || seed.totalUnit || "";
    seed.token = row.token || seed.token || "";
    seed.stationId = row.stationId || seed.stationId || "";
  }
  if (action === "Add Task" || action === "Add Batch Task") {
    if (String(route.hash || "").includes("remote-operation/remote-meter-") || String(route.hash || "").includes("remote-support/gprs-tasks")) {
      seed.customerId = row.customerId || seed.customerId || row.meterId || seed.meterId || "";
      seed.customerName = row.customerName || seed.customerName || "";
      seed.meterId = row.meterId || seed.meterId || "";
      seed.protocolVersion = row.protocolVersion || seed.protocolVersion || "2.2";
      seed.stationId = row.stationId || seed.stationId || "";
    } else {
      seed.dataItem = seed.dataItem || route.title;
    }
  }
  return seed;
}
