export const pageSizeOptions = [10, 20, 50, 100];

export function columnKey(label) {
  const map = {
    "Address": "address",
    "Battery Status": "batteryStatus",
    "CertifiName": "certifiName",
    "CertifiNo": "certifiNo",
    "Collection Date": "collectionDate",
    "Communication Way": "communicationWay",
    "Create Time": "createTime",
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
    "Time": "time",
    "Token": "token",
    "Token(Recharge)": "token",
    "Total Energy": "totalEnergy",
    "Total Paid": "totalPaid",
    "Total Unit": "totalUnit",
    "Update Time": "updateTime",
    "Upper Open": "upperOpen",
    "VAT Charge": "vatCharge",
    "Vend": "vend"
  };
  return map[label] || label.charAt(0).toLowerCase() + label.slice(1).replace(/\s+/g, "");
}

export function searchRows(route, rows, searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) return rows.slice();
  const searchableColumns = route.columns.filter((column) => column !== "Actions");
  return rows.filter((row) => searchableColumns.some((column) => String(row[columnKey(column)] || "").toLowerCase().includes(query)));
}

export function sortRows(route, rows, direction) {
  if (!direction) return rows.slice();
  const firstColumn = route.columns.find((column) => !["Actions", "Status"].includes(column)) || route.columns[0];
  const key = columnKey(firstColumn);
  const factor = direction === "desc" ? -1 : 1;
  return rows.slice().sort((left, right) => {
    const leftValue = String(left[key] || "");
    const rightValue = String(right[key] || "");
    return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * factor;
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
  if (route.actions.includes("Print")) buttons.push("Print");
  if (route.actions.includes("Edit")) buttons.push("Edit");
  if (route.actions.includes("Delete")) buttons.push("Delete");
  if (route.actions.includes("Add Task")) buttons.push("Add Task");
  if (!buttons.length && route.actions.includes("Close")) buttons.push("Close");
  return buttons;
}

export function createFormSeed(route, action, row = {}) {
  const seed = {};
  for (const column of route.columns.filter((item) => item !== "Actions")) {
    const key = columnKey(column);
    seed[key] = row[key] || "";
  }
  if (action === "Recharge") {
    seed.amount = seed.amount || "500";
    seed.totalUnit = seed.totalUnit || "1.4";
  }
  if (action === "Add Task" || action === "Add Batch Task") {
    seed.dataItem = seed.dataItem || route.title;
  }
  return seed;
}
