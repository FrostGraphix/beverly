export const remoteTaskOptions = {
  reading: [
    { value: "Credit balance", label: "Credit balance", flag: "E421", dataDefault: "", dataPrefix: "Credit balance,,", aliases: ["credit balance"] },
    { value: "Total Consumption", label: "Total Consumption", flag: "901F", dataDefault: "", dataPrefix: "Total Consumption(kWh)", aliases: ["total consumption", "total consumption(kwh)", "read_total_energy"] },
    { value: "Power", label: "Power", flag: "B630", dataDefault: "", dataPrefix: "Power", aliases: ["power"] },
    { value: "Relay Status", label: "Relay Status", flag: "EFF5", dataDefault: "", dataPrefix: "Relay Status", aliases: ["relay status"] }
  ],
  control: [
    { value: "Switch On", label: "Switch On", action: "on", dataPrefix: "", aliases: ["switch on"] },
    { value: "Switch Off", label: "Switch Off", action: "off", dataPrefix: "", aliases: ["switch off"] }
  ],
  token: [
    { value: "Send Token", label: "Send Token", flag: "A120", dataDefault: "", dataPrefix: "", aliases: ["send token"] }
  ]
};

/**
 * Grouped data-item structure for batch reading tasks.
 * Matches reference system's "Basic Parameters" / "Status Value" layout.
 */
export const readingDataItemGroups = [
  {
    group: "Basic Parameters",
    items: [
      { value: "Total Consumption", label: "Total Consumption", flag: "901F", dataDefault: "", dataPrefix: "Total Consumption(kWh)" },
      { value: "Credit balance", label: "Credit balance", flag: "E421", dataDefault: "", dataPrefix: "Credit balance,," },
      { value: "Relay Status", label: "Relay Status", flag: "EFF5", dataDefault: "", dataPrefix: "Relay Status" }
    ]
  },
  {
    group: "Status Value",
    items: [
      { value: "Power", label: "Power", flag: "B630", dataDefault: "", dataPrefix: "Power" }
    ]
  }
];

function normalizeRemoteItemKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function isRemoteOperationRoute(route = {}) {
  const hash = String(route.hash || "");
  return hash.includes("remote-operation/remote-meter-");
}

export function isRemoteMeterReadingRoute(route = {}) {
  return String(route.hash || "").includes("remote-operation/remote-meter-reading");
}

export function isGprsSupportTaskRoute(route = {}) {
  return String(route.hash || "").includes("remote-support/gprs-tasks");
}

export function isRemoteTaskAction(route = {}, action = "") {
  return (isRemoteOperationRoute(route) || isGprsSupportTaskRoute(route)) && ["Add Task", "Add Batch Task"].includes(action);
}

export function remoteTaskKind(route = {}) {
  const hash = String(route.hash || "");
  if (hash.includes("remote-support/gprs-tasks")) return "reading";
  if (hash.includes("remote-meter-token")) return "token";
  if (hash.includes("remote-meter-control")) return "control";
  return "reading";
}

export function remoteTaskEndpoint(route = {}) {
  if (isGprsSupportTaskRoute(route)) return "/API/GPRSMeterTask/GPRSCreateReadingTask";
  const kind = remoteTaskKind(route);
  if (kind === "token") return "/API/RemoteMeterTask/CreateTokenTask";
  if (kind === "control") return "/API/RemoteMeterTask/CreateControlTask";
  return "/API/RemoteMeterTask/CreateReadingTask";
}

export function remoteTaskNeedsAuthorization(route = {}) {
  return false;
}

export function remoteTaskTitle(route = {}, action = "") {
  const kind = remoteTaskKind(route);
  const prefix = action === "Add Batch Task" ? "Add Batch Task" : "Add Task";
  if (isGprsSupportTaskRoute(route)) return `${prefix} (GPRS Reading)`;
  if (kind === "token") return `${prefix} (Meter Token)`;
  if (kind === "control") return `${prefix} (Meter Control)`;
  return `${prefix} (Meter Reading)`;
}

export function defaultRemoteDataItem(route = {}) {
  return remoteTaskOptions[remoteTaskKind(route)][0]?.value || "";
}

export function findRemoteTaskOption(route = {}, dataItem = "") {
  const normalized = normalizeRemoteItemKey(dataItem);
  const options = remoteTaskOptions[remoteTaskKind(route)] || [];
  if (!normalized) return options[0] || null;
  return options.find((option) => {
    const keys = [
      option.value,
      option.label,
      option.dataPrefix,
      ...(Array.isArray(option.aliases) ? option.aliases : [])
    ];
    return keys.some((key) => normalizeRemoteItemKey(key) === normalized);
  }) || null;
}

export function normalizeRemoteDataItem(route = {}, dataItem = "") {
  const option = findRemoteTaskOption(route, dataItem);
  return option?.value || "";
}

export function normalizeRemoteDataItems(route = {}, dataItems = []) {
  const values = Array.isArray(dataItems) ? dataItems : [dataItems];
  return [...new Set(values.map((value) => normalizeRemoteDataItem(route, value)).filter(Boolean))];
}

function cleanToken(value) {
  return String(value || "").replace(/\s+/g, "");
}

export function formatToken(value) {
  const token = cleanToken(value);
  return token ? token.replace(/(.{4})(?=.)/g, "$1 ") : "";
}

export function normalizeRemoteStatus(value) {
  if (value === true) return "Online";
  if (value === false) return "Offline";
  if (value === 0 || value === "0") return "StandBy";
  if (value === 1 || value === "1") return "Success";
  if (value === 2 || value === "2") return "Failure";
  if (value === 3 || value === "3") return "Processing";
  return value || "";
}

export function normalizeAccountStatus(value) {
  if (value === true || value === 1 || value === "1" || String(value).toLowerCase() === "online") return "Online";
  return "Offline";
}

export function remoteTaskValidationError(route = {}, form = {}, options = {}) {
  const isBatch = options.action === "Add Batch Task";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const selectedMeterIds = Array.isArray(form.selectedMeterIds) ? form.selectedMeterIds.filter(Boolean) : [];
  const selectedDataItems = normalizeRemoteDataItems(route, form.selectedDataItems);
  const kind = remoteTaskKind(route);
  if (isBatch) {
    if (Array.isArray(form.selectedMeterIds)) {
      if (!selectedMeterIds.length) return "meterIds are required";
    } else if (!rows.some((row) => row?.meterId)) return "rows are required";
  } else {
    if (!String(form.meterId || "").trim()) return "meterId is required";
    if (!String(form.stationId || "").trim()) return "stationId is required";
  }
  if (isBatch && kind === "reading") {
    if (!selectedDataItems.length) return "dataItems are required";
  } else {
    if (!String(form.dataItem || "").trim()) return "dataItem is required";
    if (!normalizeRemoteDataItem(route, form.dataItem)) return "Select a valid data item";
  }
  if (kind === "token" && !cleanToken(form.token || form.data)) return "token is required";

  return "";
}

export function remoteTaskPayloadForRow(route = {}, row = {}, form = {}) {
  const option = findRemoteTaskOption(route, form.dataItem);
  if (!option) {
    throw new Error("Select a valid data item");
  }
  const kind = remoteTaskKind(route);
  const token = cleanToken(form.token || form.data);
  const protocolVersion = String(row.protocolVersion || form.protocolVersion || "2.2");
  const controlPayload = controlTaskFields(protocolVersion, option.action);
  return {
    customerId: row.customerId || form.customerId || row.meterId || form.meterId || "",
    customerName: row.customerName || form.customerName || "",
    meterId: row.meterId || form.meterId || "",
    version: protocolVersion,
    flag: kind === "control" ? controlPayload.flag : option.flag,
    name: option.label,
    dataItem: option.label,
    dataDefault: kind === "control" ? controlPayload.dataDefault : option.dataDefault,
    dataPrefix: option.dataPrefix,
    data: kind === "token" ? token : kind === "control" ? controlPayload.dataDefault : (form.data || ""),
    stationId: row.stationId || form.stationId || "",
    remark: form.remark || ""
  };
}

function controlTaskFields(protocolVersion = "2.2", action = "on") {
  const normalizedVersion = String(protocolVersion || "").trim();
  const modernProtocol = /^(1|2|3)\./.test(normalizedVersion);
  if (action === "off") {
    return modernProtocol
      ? { flag: "C03C", dataDefault: "335500000001" }
      : { flag: "C03C", dataDefault: "3500000000" };
  }
  return modernProtocol
    ? { flag: "C03D", dataDefault: "996600000001" }
    : { flag: "C03D", dataDefault: "9600000000" };
}

export function buildRemoteTaskPayload(route = {}, action = "", form = {}, rows = []) {
  const kind = remoteTaskKind(route);
  const allRows = rows.filter((row) => row && row.meterId);
  const selectedMeterIds = Array.isArray(form.selectedMeterIds) ? form.selectedMeterIds.filter(Boolean) : [];
  const sourceRows = action === "Add Batch Task"
    ? (selectedMeterIds.length
      ? allRows.filter((row) => selectedMeterIds.includes(String(row.meterId || "")))
      : allRows)
    : [form];

  if (action === "Add Batch Task" && kind === "reading") {
    const selectedDataItems = normalizeRemoteDataItems(route, form.selectedDataItems);
    return sourceRows.flatMap((row) =>
      selectedDataItems.map((dataItem) => remoteTaskPayloadForRow(route, row, { ...form, dataItem }))
    );
  }

  return sourceRows.map((row) => remoteTaskPayloadForRow(route, row, form));
}
