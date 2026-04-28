export type OperationKind =
  | "read"
  | "crud-create"
  | "crud-update"
  | "crud-delete"
  | "import"
  | "export"
  | "token-generate"
  | "token-cancel"
  | "task-create"
  | "task-update"
  | "task-read"
  | "drilldown"
  | "file-upload"
  | "generic";

export interface EndpointPolicy {
  pathname: string;
  operation: OperationKind;
  liveWrite: boolean;
}

const explicitPolicies = new Map<string, OperationKind>([
  ["/api/dashboard/readPanelGroup", "read"],
  ["/api/dashboard/readLineChart", "read"],
  ["/api/account/read", "read"],
  ["/api/account/create", "crud-create"],
  ["/api/account/update", "crud-update"],
  ["/api/account/delete", "crud-delete"],
  ["/api/account/import", "import"],
  ["/api/customer/read", "read"],
  ["/api/customer/create", "crud-create"],
  ["/api/customer/update", "crud-update"],
  ["/api/customer/delete", "crud-delete"],
  ["/api/customer/import", "import"],
  ["/api/user/read", "read"],
  ["/api/user/create", "crud-create"],
  ["/api/user/update", "crud-update"],
  ["/api/user/delete", "crud-delete"],
  ["/api/user/import", "import"],
  ["/api/user/reset", "crud-update"],
  ["/api/user/info", "read"],
  ["/api/user/login", "read"],
  ["/api/user/logout", "read"],
  ["/api/role/read", "read"],
  ["/api/role/ReadDataRole", "read"],
  ["/api/role/create", "crud-create"],
  ["/api/role/update", "crud-update"],
  ["/api/role/delete", "crud-delete"],
  ["/api/station/read", "read"],
  ["/api/tariff/read", "read"],
  ["/api/gateway/read", "read"],
  ["/api/meter/read", "read"],
  ["/api/debt/read", "read"],
  ["/api/item/read", "read"],
  ["/api/item/readItemList", "read"],
  ["/api/token/creditToken/generate", "token-generate"],
  ["/api/token/creditTokenRecord/read", "read"],
  ["/api/token/creditTokenRecord/readMore", "read"],
  ["/api/token/creditTokenRecord/cancel", "token-cancel"],
  ["/api/token/clearTamperToken/generate", "token-generate"],
  ["/api/token/clearTamperTokenRecord/read", "read"],
  ["/api/token/clearCreditToken/generate", "token-generate"],
  ["/api/token/clearCreditTokenRecord/read", "read"],
  ["/api/token/setMaximumPowerLimitToken/generate", "token-generate"],
  ["/api/token/setMaximumPowerLimitTokenRecord/read", "read"],
  ["/api/token/meterTestToken/read", "read"],
  ["/api/token/meterKey/update", "crud-update"],
  ["/api/DailyData/read", "read"],
  ["/api/DailyData/readMore", "read"],
  ["/api/DailyData/readMonthly", "drilldown"],
  ["/api/DailyDataMeter/read", "read"],
  ["/api/DailyDataMeter/readMore", "read"],
  ["/api/DailyDataMeter/readHourly", "drilldown"],
  ["/api/DailyDataMeter/readMonthly", "drilldown"],
  ["/API/PrepayReport/LongNonpurchaseSituation", "read"],
  ["/API/PrepayReport/LowPurchaseSituation", "read"],
  ["/API/PrepayReport/ConsumptionStatistics", "read"],
  ["/API/RemoteMeterTask/CreateReadingTask", "task-create"],
  ["/API/RemoteMeterTask/CreateSettingTask", "task-create"],
  ["/API/RemoteMeterTask/CreateControlTask", "task-create"],
  ["/API/RemoteMeterTask/CreateTokenTask", "task-create"],
  ["/API/RemoteMeterTask/CreateTransparentForwardingTask", "task-create"],
  ["/API/RemoteMeterTask/GetReadingTask", "task-read"],
  ["/API/RemoteMeterTask/GetSettingTask", "task-read"],
  ["/API/RemoteMeterTask/GetControlTask", "task-read"],
  ["/API/RemoteMeterTask/GetTokenTask", "task-read"],
  ["/API/RemoteMeterTask/GetTransparentForwardingTask", "task-read"],
  ["/API/RemoteMeterTask/UpdateReadingTask", "task-update"],
  ["/API/RemoteMeterTask/UpdateSettingTask", "task-update"],
  ["/API/RemoteMeterTask/UpdateControlTask", "task-update"],
  ["/API/RemoteMeterTask/UpdateTokenTask", "task-update"],
  ["/API/File/Upload", "file-upload"],
  ["/API/File/UploadBin", "file-upload"],
  ["/API/File/ConcentratorUploadBin", "file-upload"],
  ["/api/Log/read", "read"]
]);

export function inferOperation(pathname: string): OperationKind {
  const lower = pathname.toLowerCase();
  if (lower.includes("readhourly") || lower.includes("readmonthly")) return "drilldown";
  if (lower.includes("task") && lower.includes("get")) return "task-read";
  if (lower.includes("task") && lower.includes("create")) return "task-create";
  if (lower.includes("task") && lower.includes("update")) return "task-update";
  if (lower.includes("/generate")) return "token-generate";
  if (lower.includes("/cancel")) return "token-cancel";
  if (lower.endsWith("/read") || lower.endsWith("/readmore") || lower.endsWith("/view") || lower.endsWith("/info")) return "read";
  if (lower.includes("/create")) return "crud-create";
  if (lower.includes("/update") || lower.includes("/reset") || lower.includes("/modify")) return "crud-update";
  if (lower.includes("/delete")) return "crud-delete";
  if (lower.includes("/import")) return "import";
  if (lower.includes("/upload")) return "file-upload";
  if (lower.includes("/export")) return "export";
  return "generic";
}

export function resolveEndpointPolicy(pathname: string): EndpointPolicy {
  const operation = explicitPolicies.get(pathname) ?? inferOperation(pathname);
  return {
    pathname,
    operation,
    liveWrite: !["read", "drilldown", "task-read", "generic"].includes(operation)
  };
}

export const knownEndpointPaths = Array.from(explicitPolicies.keys());
