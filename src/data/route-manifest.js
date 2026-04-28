export const routeManifest = [
  { group: "Dashboard", title: "Dashboard", hash: "#/dashboard", apis: ["/api/dashboard/readPanelGroup", "/api/dashboard/readLineChart"], columns: [], actions: [], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Token Generate", title: "Credit Token", hash: "#/token-generate/credit-token", apis: ["/api/item/readItemList", "/api/user/read", "/api/station/read", "/api/account/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Meter Type", "Communication Way", "Tariff Id", "Protocol Version", "Remark", "Create Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Recharge", "Cancel", "Confirm"], note: "Quota(kwh): No Limit", roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Clear Tamper Token", hash: "#/token-generate/clear-tamper-token", apis: ["/api/station/read", "/api/account/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Meter Type", "Communication Way", "Tariff Id", "Remark", "Create Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Clear Credit Token", hash: "#/token-generate/clear-credit-token", apis: ["/api/station/read", "/api/account/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Meter Type", "Communication Way", "Tariff Id", "Remark", "Create Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Generate", title: "Set Maximum Power Limit Token", hash: "#/token-generate/set-maximum-power-limit-token", apis: ["/api/station/read", "/api/account/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Meter Type", "Communication Way", "Tariff Id", "Remark", "Create Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Generate Token", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Credit Token Record", hash: "#/token-record/credit-token-record", apis: ["/api/station/read", "/api/item/readItemList", "/api/token/creditTokenRecord/read"], columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Meter Type", "Tariff Id", "VAT Charge", "Total Unit", "Total Paid", "Token(Recharge)", "Vend", "Time", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Print", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Clear Tamper Token Record", hash: "#/token-record/clear-tamper-token-record", apis: ["/api/station/read", "/api/token/clearTamperTokenRecord/read"], columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Token", "Create Time", "Update Time", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Clear Credit Token Record", hash: "#/token-record/clear-credit-token-record", apis: ["/api/station/read", "/api/token/clearCreditTokenRecord/read"], columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Token", "Create Time", "Update Time", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Print", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Token Record", title: "Set Maximum Power Limit Token Record", hash: "#/token-record/set-maximum-power-limit-token-record", apis: ["/api/station/read", "/api/token/setMaximumPowerLimitTokenRecord/read"], columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Maximum Power(W)", "Token", "Create Time", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Remote Operation", title: "Meter Reading", hash: "#/remote-operation/remote-meter-reading", apis: ["/api/station/read", "/api/account/read"], columns: ["Status", "Customer Name", "Meter Id", "Meter Type", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation", title: "Meter Control", hash: "#/remote-operation/remote-meter-control", apis: ["/api/station/read", "/api/account/read"], columns: ["Status", "Customer Name", "Meter Id", "Meter Type", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation", title: "Meter Token", hash: "#/remote-operation/remote-meter-token", apis: ["/api/station/read", "/api/account/read"], columns: ["Status", "Customer Name", "Meter Id", "Meter Type", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add Batch Task", "Add Task", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Reading Task", hash: "#/remote-operation-record/remote-meter-reading-task", apis: ["/api/station/read", "/api/remoteMeterTask/getReadingTask"], columns: ["Customer Id", "Customer Name", "Meter Id", "Data Item", "Station Id", "Data Value", "Status", "Create Time", "Update Time"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Control Task", hash: "#/remote-operation-record/remote-meter-control-task", apis: ["/api/remoteMeterTask/getControlTask", "/api/station/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Data Item", "Station Id", "Status", "Create Time", "Update Time"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Operation Task", title: "Meter Token Task", hash: "#/remote-operation-record/remote-meter-token-task", apis: ["/api/station/read", "/api/remoteMeterTask/getTokenTask"], columns: ["Customer Id", "Customer Name", "Meter Id", "Data Item", "Token", "Station Id", "Status", "Remark", "Create Time", "Update Time"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Data Report", title: "Long Nonpurchase Situation", hash: "#/prepay-report/long-nonpurchase-situation", apis: ["/api/station/read", "/api/customer/read", "/api/tariff/read", "/api/meter/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Tariff Id", "Last Purchase Unit", "Last Purchase Paid", "Last Purchase Date", "Nonpurchase Days", "Customer Address"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Low Purchase Situation", hash: "#/prepay-report/low-purchase-situation", apis: ["/api/customer/read", "/api/meter/read", "/api/tariff/read", "/api/station/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Tariff Id", "Total Unit", "Total Paid", "Customer Address"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Consumption Statistics", hash: "#/prepay-report/consumption-statistics", apis: ["/api/station/read", "/api/customer/read", "/api/meter/read", "/api/tariff/read"], columns: ["Collection Date", "Consumption"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Data Report", title: "Interval Data", hash: "#/prepay-report/daily-data-meter", apis: ["/api/station/read", "/api/DailyDataMeter/read"], columns: ["Meter Id", "Gateway Id", "Collection Date", "Customer Id", "Customer Name", "Station Id", "Total Energy", "Last Hour Usage", "Credit Balance", "Maximum Demand", "Power", "Relay Status", "Battery Status", "Magnetic Status", "Terminal Cover", "Upper Open", "Current Reverse", "Current Unbalance", "Update Time", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm", "Close"], roles: ["super-admin", "operations-manager", "account"] },
  { group: "Management", title: "Gateway", hash: "#/management/gateway", apis: ["/api/DailyDataMeter/read", "/api/station/read", "/api/gateway/read"], columns: ["Status", "Success Rate", "Id", "Name", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Customer", hash: "#/management/customer", apis: ["/api/DailyDataMeter/readMore", "/api/gateway/read", "/api/customer/read", "/api/station/read"], columns: ["Id", "Name", "Phone", "Address", "CertifiName", "CertifiNo", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Tariff", hash: "#/management/tariff", apis: ["/api/item/readItemList", "/api/tariff/read"], columns: ["Id", "Name", "Price", "Remark", "Create Time", "Update Time", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Management", title: "Account", hash: "#/management/account", apis: ["/api/tariff/read", "/api/station/read", "/api/account/read", "/api/customer/read"], columns: ["Customer Id", "Meter Id", "Tariff Id", "Communication Way", "CT Ratio", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin", "account"] },
  { group: "Administration", title: "User", hash: "#/admin/user", apis: ["/api/user/read"], columns: ["Status", "User Id", "Name", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Role", hash: "#/admin/role", apis: ["/api/role/read"], columns: ["Id", "Name", "Remark", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Log", hash: "#/admin/log", apis: ["/api/log/read"], columns: ["Id", "User Id", "Status", "Remark", "Create Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Station", hash: "#/admin/station", apis: ["/api/station/read"], columns: ["Id", "Name", "Remark", "Create Time", "Update Time", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Item", hash: "#/admin/item", apis: ["/api/item/read"], columns: ["Id", "Name", "Remark", "Create Time", "Update Time", "Actions"], actions: ["Sort", "Search", "Reset", "Add", "Export", "Delete", "Edit", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Meter", hash: "#/admin/meter", apis: ["/api/meter/read"], columns: ["Customer Id", "Customer Name", "Meter Id", "Meter Type", "Communication Way", "Tariff Id", "Remark", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Administration", title: "Debt", hash: "#/admin/debt", apis: ["/api/debt/read"], columns: ["Customer Id", "Meter Id", "Total Paid", "Total Unit", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Protocol", title: "DLMS", hash: "#/protocol/dlms", apis: ["/api/dlms/Read"], columns: ["Id", "Customer Id", "Meter Id", "Protocol Version", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Protocol", title: "DLT645", hash: "#/protocol/dlt645", apis: ["/api/dlt645/read"], columns: ["Id", "Customer Id", "Meter Id", "Protocol Version", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] },
  { group: "Remote Support", title: "GPRS Tasks", hash: "#/remote-support/gprs-tasks", apis: ["/API/GPRSMeterTask/GPRSGetReadingTask"], columns: ["Id", "Gateway Id", "Status", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "GPRS Online Status", hash: "#/remote-support/gprs-online-status", apis: ["/API/GPRSOnlineStatus/Read"], columns: ["Status", "Success Rate", "Id", "Name", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Load Profile", hash: "#/remote-support/load-profile", apis: ["/API/LoadProfile/ElectricEnergyCurve"], columns: ["Customer Id", "Meter Id", "Total Energy", "Power", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Event Notification", hash: "#/remote-support/event-notification", apis: ["/API/EventNotification/Read"], columns: ["Id", "Customer Id", "Meter Id", "Status", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "Firmware Update", hash: "#/remote-support/firmware-update", apis: ["/API/UpdateFirmwareTask/GetUpdateFirmwareTask"], columns: ["Id", "Gateway Id", "Status", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin", "operations-manager"] },
  { group: "Remote Support", title: "File Upload", hash: "#/remote-support/file-upload", apis: ["/API/File/Upload"], columns: ["Id", "Name", "Status", "Remark", "Create Time", "Update Time", "Station Id", "Actions"], actions: ["Sort", "Search", "Reset", "Import", "Export", "Close", "Cancel", "Confirm"], roles: ["super-admin"] }
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
  "#/management/gateway",
  "#/management/customer",
  "#/management/tariff",
  "#/management/account"
]);

export function routeAllowed(route, roleId = "super-admin") {
  return !route.roles || route.roles.includes(roleId);
}

export function visibleRoutes(roleId = "super-admin") {
  return routeManifest.filter((route) => routeAllowed(route, roleId));
}

export function referenceVisibleRoutes() {
  return routeManifest.filter((route) => referenceVisibleHashes.has(route.hash));
}

export function findReferenceVisibleRoute(hash) {
  return referenceVisibleRoutes().find((route) => route.hash === hash) || referenceVisibleRoutes()[0] || routeManifest[0];
}

export function findRoute(hash, roleId = "super-admin") {
  return visibleRoutes(roleId).find((route) => route.hash === hash) || visibleRoutes(roleId)[0] || routeManifest[0];
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
