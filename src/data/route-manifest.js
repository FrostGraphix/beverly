export const routeManifest = [
  { group: "Dashboard", title: "Dashboard", hash: "#/dashboard", apis: ["/api/dashboard/readPanelGroup", "/api/dashboard/readLineChart"], columns: [], actions: [], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Token Generate", title: "Credit Token", hash: "#/token-generate/credit-token", apis: ["/api/item/readItemList", "/api/user/read", "/api/station/read", "/api/account/read"], columns: ["customerId", "customerName", "meterId", "meterType", "communicationWay", "tariffId", "protocolVersion", "remark", "createDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Recharge", "Cancel", "Confirm"], note: "Quota(kwh): No Limit", roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Clear Tamper Token", hash: "#/token-generate/clear-tamper-token", apis: ["/api/station/read", "/api/account/read"], columns: ["customerId", "customerName", "meterId", "meterType", "communicationWay", "tariffId", "remark", "createDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Clear Credit Token", hash: "#/token-generate/clear-credit-token", apis: ["/api/station/read", "/api/account/read"], columns: ["customerId", "customerName", "meterId", "meterType", "communicationWay", "tariffId", "remark", "createDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Set Maximum Power Limit Token", hash: "#/token-generate/set-maximum-power-limit-token", apis: ["/api/station/read", "/api/account/read"], columns: ["customerId", "customerName", "meterId", "meterType", "communicationWay", "tariffId", "remark", "createDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Credit Token Record", hash: "#/token-record/credit-token-record", apis: ["/api/station/read", "/api/item/readItemList", "/api/token/creditTokenRecord/read"], columns: ["receiptId", "customerId", "customerName", "meterId", "meterType", "tariffId", "tax", "totalUnit", "totalPaid", "token", "vend", "createDate", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Print", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Clear Tamper Token Record", hash: "#/token-record/clear-tamper-token-record", apis: ["/api/station/read", "/api/token/clearTamperTokenRecord/read"], columns: ["receiptId", "customerId", "customerName", "meterId", "token", "createDate", "updateDate", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Print", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Clear Credit Token Record", hash: "#/token-record/clear-credit-token-record", apis: ["/api/station/read", "/api/token/clearCreditTokenRecord/read"], columns: ["receiptId", "customerId", "customerName", "meterId", "token", "createDate", "updateDate", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Print", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Set Maximum Power Limit Token Record", hash: "#/token-record/set-maximum-power-limit-token-record", apis: ["/api/station/read", "/api/token/setMaximumPowerLimitTokenRecord/read"], columns: ["receiptId", "customerId", "customerName", "meterId", "maximumPower", "token", "createDate", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Remote Operation", title: "Meter Reading", hash: "#/remote-operation/remote-meter-reading", apis: ["/api/station/read", "/api/account/read"], columns: ["status", "customerName", "meterId", "meterType", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation", title: "Meter Control", hash: "#/remote-operation/remote-meter-control", apis: ["/api/station/read", "/api/account/read"], columns: ["status", "customerName", "meterId", "meterType", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation", title: "Meter Token", hash: "#/remote-operation/remote-meter-token", apis: ["/api/station/read", "/api/account/read"], columns: ["status", "customerName", "meterId", "meterType", "remark", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Reading Task", hash: "#/remote-operation-record/remote-meter-reading-task", apis: ["/api/station/read", "/api/RemoteMeterTask/GetReadingTask"], columns: ["customerId", "customerName", "meterId", "dataItem", "stationId", "dataValue", "status", "createDate", "updateDate"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Control Task", hash: "#/remote-operation-record/remote-meter-control-task", apis: ["/api/RemoteMeterTask/GetControlTask", "/api/station/read"], columns: ["customerId", "customerName", "meterId", "dataItem", "stationId", "status", "createDate", "updateDate"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Token Task", hash: "#/remote-operation-record/remote-meter-token-task", apis: ["/api/station/read", "/api/RemoteMeterTask/GetTokenTask"], columns: ["customerId", "customerName", "meterId", "dataItem", "token", "stationId", "status", "remark", "createDate", "updateDate"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Data Report", title: "Long Nonpurchase Situation", hash: "#/prepay-report/long-nonpurchase-situation", apis: ["/api/station/read", "/api/customer/read", "/api/tariff/read", "/api/meter/read"], columns: ["customerId", "customerName", "meterId", "tariffId", "lastPurchaseUnit", "lastPurchasePaid", "lastPurchaseDate", "nonpurchaseDays", "stationId", "customerAddress"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Low Purchase Situation", hash: "#/prepay-report/low-purchase-situation", apis: ["/api/customer/read", "/api/meter/read", "/api/tariff/read", "/api/station/read"], columns: ["customerId", "customerName", "meterId", "tariffId", "purchaseTotalUnit", "purchaseTotalPaid", "stationId", "customerAddress"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Consumption Statistics", hash: "#/prepay-report/consumption-statistics", apis: ["/api/station/read", "/api/customer/read", "/api/meter/read", "/api/DailyDataMeter/read", "/api/DailyDataMeter/readMonthly"], columns: ["collectionDate", "consumption", "change", "status"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], isCustomPage: true, customComponent: "ConsumptionStatisticsPage", roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Interval Data", hash: "#/prepay-report/daily-data-meter", apis: ["/api/station/read", "/api/DailyDataMeter/read"], columns: ["customerId", "customerName", "meterId", "gatewayId", "currentDate", "usage1", "total1", "remain1", "power", "status", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm", "Close"], isCustomPage: true, customComponent: "DailyDataMeterPage", roles: ["super-admin", "operations-manager", "account"] },
  { group: "Management", title: "Gateway", hash: "#/management/gateway", apis: ["/api/DailyDataMeter/read", "/api/station/read", "/api/gateway/read"], columns: ["status", "successRate", "id", "name", "remark", "createDate", "updateDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Customer", hash: "#/management/customer", apis: ["/api/customer/read", "/api/station/read"], columns: ["id", "name", "phone", "address", "certifiName", "certifiNo", "remark", "createDate", "updateDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Tariff", hash: "#/management/tariff", apis: ["/api/item/readItemList", "/api/tariff/read"], columns: ["id", "name", "price", "remark", "createDate", "updateDate", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Account", hash: "#/management/account", apis: ["/api/tariff/read", "/api/station/read", "/api/account/read", "/api/customer/read"], columns: ["customerId", "meterId", "tariffId", "communicationWay", "ctRatio", "remark", "createDate", "updateDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Administration", title: "User", hash: "#/admin/user", apis: ["/api/user/read"], columns: ["status", "userId", "name", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Role", hash: "#/admin/role", apis: ["/api/role/read"], columns: ["id", "name", "remark", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Log", hash: "#/admin/log", apis: ["/api/log/read"], columns: ["id", "userId", "action", "status", "remark", "createDate", "stationId"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Station", hash: "#/admin/station", apis: ["/api/station/read"], columns: ["id", "name", "remark", "createDate", "updateDate", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Item", hash: "#/admin/item", apis: ["/api/item/read"], columns: ["id", "name", "remark", "createDate", "updateDate", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Meter", hash: "#/admin/meter", apis: ["/api/meter/read"], columns: ["meterId", "meterType", "communicationWay", "protocolVersion", "status", "stationId", "remark", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Debt", hash: "#/admin/debt", apis: ["/api/debt/read"], columns: ["customerId", "meterId", "totalPaid", "totalUnit", "remark", "createDate", "updateDate", "stationId", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Reports", hash: "#/admin/reports", apis: [], columns: [], actions: ["Export"], isCustomPage: true, customComponent: "ReportsPage", roles: ["super-admin", "operations-manager", "finance-checker"] },
  // Wallet — opens the standalone wallet admin app in a new tab.
  // Staff: localhost:5175 (dev) / admin.beverly.acoblighting.com (prod)
  // Vendor portal: localhost:5174 (dev) — vendors log in there directly.
  { group: "Wallet", title: "Wallet", hash: "#/wallet", apis: [], columns: [], actions: [], external: true, externalUrl: "https://admin.beverly.acoblighting.com", devExternalUrl: "http://localhost:5175", roles: ["super-admin"] },
  { group: "Protocol", title: "DLMS", hash: "#/protocol/dlms", apis: ["/api/dlms/read"], columns: ["id", "version", "type", "classId", "obis", "name", "remark", "createDate", "updateDate", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Protocol", title: "DLT645", hash: "#/protocol/dlt645", apis: ["/api/dlt645/read"], columns: ["id", "version", "type", "name", "remark", "createDate", "updateDate", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Remote Support", title: "GPRS Tasks", hash: "#/remote-support/gprs-tasks", apis: ["/api/GPRSMeterTask/GPRSGetReadingTask"], columns: ["id", "gatewayId", "status", "remark", "createDate", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Add Task", "Export"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "GPRS Online Status", hash: "#/remote-support/gprs-online-status", apis: ["/api/GPRSOnlineStatus/Read"], columns: ["status", "successRate", "id", "name", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Export"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Load Profile", hash: "#/remote-support/load-profile", apis: ["/api/LoadProfile/ElectricEnergyCurve"], columns: ["customerId", "meterId", "totalEnergy", "power", "createDate", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Export"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Event Notification", hash: "#/remote-support/event-notification", apis: ["/API/EventNotification/Read"], columns: ["eventCode", "eventContent", "meterId", "currentDate", "remark", "createDate", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Export"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Firmware Update", hash: "#/remote-support/firmware-update", apis: ["/api/UpdateFirmwareTask/GetUpdateFirmwareTask"], columns: ["id", "gatewayId", "status", "remark", "createDate", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Add", "Export"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "File Upload", hash: "#/remote-support/file-upload", apis: ["/api/File/Upload"], columns: ["id", "name", "status", "remark", "createDate", "updateDate", "stationId"], actions: ["Sort", "Search", "Reset", "Import", "Export"], roles: ["super-admin"] },
  {
    group: "System",
    title: "Station Onboarding Studio",
    hash: "#/system/station-onboarding-studio",
    apis: ["/api/station/read", "/api/gateway/read", "/api/meter/read", "/api/customer/read", "/api/account/read", "/api/tariff/read"],
    columns: [],
    actions: [],
    isCustomPage: true,
    customComponent: "OnboardingStudioPage",
    roles: ["super-admin"]
  },
  { group: "System", title: "Automation Command", hash: "#/system/automation-command", apis: ["/api/system/automation-report", "/api/system/automation-control"], columns: [], actions: ["Refresh", "Save", "Test Alert"], isCustomPage: true, customComponent: "AutomationCommandPage", roles: ["super-admin", "operations-manager"] },
  {
    group: "Data Report",
    title: "Site Consumption",
    hash: "#/prepay-report/site-consumption",
    apis: ["/api/token/creditTokenRecord/read", "/api/DailyDataMeter/read", "/api/account/read", "/api/tariff/read"],
    columns: [],
    actions: ["Export"],
    isCustomPage: true,
    roles: ["super-admin", "operations-manager", "account"]
  },
  {
    group: "System",
    title: "Live Probing & Sync",
    hash: "#/system/live-probing",
    apis: ["/api/local/consumption/live-probe", "/api/local/consumption/trigger-sync"],
    columns: [],
    actions: [],
    isCustomPage: true,
    customComponent: "LiveProbingPage",
    roles: ["super-admin", "operations-manager"]
  }
];

const referenceVisibleHashes = new Set([
  "#/dashboard",
  "#/token-generate/credit-token",
  "#/token-generate/clear-tamper-token",
  "#/token-generate/clear-credit-token",
  "#/token-generate/set-maximum-power-limit-token",
  "#/token-record/credit-token-record",
  "#/token-record/clear-tamper-token-record",
  "#/token-record/clear-credit-token-record",
  "#/token-record/set-maximum-power-limit-token-record",
  "#/remote-operation/remote-meter-reading",
  "#/remote-operation/remote-meter-control",
  "#/remote-operation/remote-meter-token",
  "#/remote-operation-record/remote-meter-reading-task",
  "#/remote-operation-record/remote-meter-control-task",
  "#/remote-operation-record/remote-meter-token-task",
  "#/prepay-report/long-nonpurchase-situation",
  "#/prepay-report/low-purchase-situation",
  "#/prepay-report/consumption-statistics",
  "#/prepay-report/daily-data-meter",
  "#/prepay-report/site-consumption",
  "#/management/gateway",
  "#/management/customer",
  "#/management/tariff",
  "#/management/account",
  "#/admin/user",
  "#/admin/role",
  "#/admin/log",
  "#/admin/station",
  "#/admin/item",
  "#/admin/meter",
  "#/admin/debt",
  "#/protocol/dlms",
  "#/protocol/dlt645",
  "#/remote-support/gprs-tasks",
  "#/remote-support/gprs-online-status",
  "#/remote-support/load-profile",
  "#/remote-support/event-notification",
  "#/remote-support/firmware-update",
  "#/remote-support/file-upload",
  "#/system/station-onboarding-studio",
  "#/system/automation-command",
  "#/system/live-probing",
]);


export function normalizeRoleId(roleId = "super-admin") {
  const value = String(roleId || "super-admin").trim().toLowerCase();
  if (["admin", "administrator", "superadmin", "super_admin", "super-admin", "0", "1"].includes(value)) return "super-admin";
  if (["operator", "operations", "operations-manager", "operation-manager"].includes(value)) return "operations-manager";
  if (["account", "accountant", "finance", "account-officer", "account_officer"].includes(value)) return "account";
  if (["finance-checker", "finance_checker", "checker"].includes(value)) return "finance-checker";
  if (["vendor", "vendor-user", "vendor_user"].includes(value)) return "vendor_user";
  if (["vendor-manager", "vendor_manager"].includes(value)) return "vendor_manager";
  return value;
}

const permissionAliases = {
  "#/token-generate/credit-token": ["Token.CreditToken", "CreditToken"],
  "#/token-record/credit-token-record": ["TokenRecord.CreditTokenRecord", "CreditTokenRecord"],
  "#/remote-operation/remote-meter-reading": ["RemoteMeterTask.CreateReadingTask", "GetReadingTask", "RemoteMeterTask.GetReadingTask"],
  "#/remote-operation/remote-meter-control": ["RemoteMeterTask.CreateControlTask", "GetControlTask", "RemoteMeterTask.GetControlTask"],
  "#/remote-operation/remote-meter-token": ["RemoteMeterTask.CreateTokenTask", "GetTokenTask", "RemoteMeterTask.GetTokenTask"],
  "#/remote-operation-record/remote-meter-reading-task": ["RemoteMeterTaskRecord.GetReadingTask", "RemoteMeterTask.GetReadingTask"],
  "#/remote-operation-record/remote-meter-control-task": ["RemoteMeterTaskRecord.GetControlTask", "RemoteMeterTask.GetControlTask", "RemoteMeterTaskRecord.UpdateControlTask"],
  "#/remote-operation-record/remote-meter-token-task": ["RemoteMeterTaskRecord.GetTokenTask", "RemoteMeterTaskRecord.UpdateTokenTask", "RemoteMeterTask.GetTokenTask"],
  "#/prepay-report/daily-data-meter": ["DailyDataMeter"],
  "#/prepay-report/consumption-statistics": ["ConsumptionStatistics"],
  "#/prepay-report/long-nonpurchase-situation": ["LongNonpurchase"],
  "#/prepay-report/low-purchase-situation": ["LowPurchase"]
};

function matchesPermission(permissionString, candidate) {
  return permissionString.toLowerCase().includes(String(candidate || "").toLowerCase());
}

export function permissionAliasesForRoute(route = {}) {
  return [
    ...(permissionAliases[route.hash] || []),
    String(route.group || "").replace(/\s+/g, ""),
    String(route.hash || "").split("/").pop() || ""
  ].filter(Boolean);
}

export function permissionsGrantRoute(permissionString = "", route = {}) {
  const permissionsStr = String(permissionString || "");
  if (!permissionsStr) return false;
  if (matchesPermission(permissionsStr, "super-admin") || matchesPermission(permissionsStr, "ALL")) return true;

  const titleKey = String(route.title || "").replace(/\s+/g, "");
  if (matchesPermission(permissionsStr, titleKey)) return true;
  if (permissionAliasesForRoute(route).some((alias) => matchesPermission(permissionsStr, alias))) return true;
  if (route.title === "Set Maximum Power Limit Token" && matchesPermission(permissionsStr, "SetMaximumPowerLimitToken")) return true;
  return false;
}

export function roleAllowsRoute(route, roleId = "super-admin", permissionString = "") {
  const normRole = normalizeRoleId(roleId);
  if (normRole === "super-admin") return true;
  if (permissionsGrantRoute(permissionString, route)) return true;
  return !route.roles || route.roles.includes(normRole);
}

export function routeAllowed(route, roleId = "super-admin") {
  return roleAllowsRoute(route, roleId, getRouteCookie("userRemark"));
}

function getRouteCookie(name) {
  if (typeof document === "undefined") return "";
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export function visibleRoutes(roleId = "super-admin") {
  return routeManifest.filter((route) => routeAllowed(route, roleId));
}

export function referenceVisibleRoutes() {
  return routeManifest.filter((route) => referenceVisibleHashes.has(route.hash));
}

export function normalizeHash(hash = "") {
  const value = String(hash || "");
  const withoutQuery = value.split("?")[0];
  return withoutQuery || "#/dashboard";
}

export function findReferenceVisibleRoute(hash) {
  const normalizedHash = normalizeHash(hash);
  return referenceVisibleRoutes().find((route) => route.hash === normalizedHash) || referenceVisibleRoutes()[0] || routeManifest[0];
}

export function findRoute(hash, roleId = "super-admin") {
  const normalizedHash = normalizeHash(hash);
  return visibleRoutes(roleId).find((route) => route.hash === normalizedHash) || visibleRoutes(roleId)[0] || routeManifest[0];
}

export function routeGroups(roleId = "super-admin") {
  return visibleRoutes(roleId).reduce((groups, route) => {
    let group = groups.find((item) => item.name === route.group);
    if (!group) groups.push(group = { name: route.group, routes: [] });
    group.routes.push(route);
    return groups;
  }, []);
}

export function referenceVisibleRouteGroups() {
  return referenceVisibleRoutes().reduce((groups, route) => {
    let group = groups.find((item) => item.name === route.group);
    if (!group) groups.push(group = { name: route.group, routes: [] });
    group.routes.push(route);
    return groups;
  }, []);
}
