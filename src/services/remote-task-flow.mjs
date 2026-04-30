export const remoteTaskOptions = {
  reading: [
    { value: "Credit balance", label: "Credit balance", flag: "Credit balance", dataDefault: "", dataPrefix: "Credit balance,," },
    { value: "Total Consumption", label: "Total Consumption", flag: "Total Consumption", dataDefault: "", dataPrefix: "Total Consumption(kWh)" },
    { value: "Power", label: "Power", flag: "Power", dataDefault: "", dataPrefix: "Power" },
    { value: "Relay Status", label: "Relay Status", flag: "Relay Status", dataDefault: "", dataPrefix: "Relay Status" }
  ],
  control: [
    { value: "Switch On", label: "Switch On", flag: "Switch On", dataDefault: "1", dataPrefix: "" },
    { value: "Switch Off", label: "Switch Off", flag: "Switch Off", dataDefault: "0", dataPrefix: "" }
  ],
  token: [
    { value: "Send Token", label: "Send Token", flag: "Send Token", dataDefault: "", dataPrefix: "" }
  ]
};

export function isRemoteOperationRoute(route = {}) {
  const hash = String(route.hash || "");
  return hash.includes("remote-operation/remote-meter-");
}

export function isRemoteTaskAction(route = {}, action = "") {
  return isRemoteOperationRoute(route) && ["Add Task", "Add Batch Task"].includes(action);
}

export function remoteTaskKind(route = {}) {
  const hash = String(route.hash || "");
  if (hash.includes("remote-meter-token")) return "token";
  if (hash.includes("remote-meter-control")) return "control";
  return "reading";
}

export function remoteTaskEndpoint(route = {}) {
  const kind = remoteTaskKind(route);
  if (kind === "token") return "/API/RemoteMeterTask/CreateTokenTask";
  if (kind === "control") return "/API/RemoteMeterTask/CreateControlTask";
  return "/API/RemoteMeterTask/CreateReadingTask";
}

export function remoteTaskTitle(route = {}, action = "") {
  const kind = remoteTaskKind(route);
  const prefix = action === "Add Batch Task" ? "Add Batch Task" : "Add Task";
  if (kind === "token") return `${prefix} (Meter Token)`;
  if (kind === "control") return `${prefix} (Meter Control)`;
  return `${prefix} (Meter Reading)`;
}

export function defaultRemoteDataItem(route = {}) {
  return remoteTaskOptions[remoteTaskKind(route)][0].value;
}

export function findRemoteTaskOption(route = {}, dataItem = "") {
  const options = remoteTaskOptions[remoteTaskKind(route)];
  return options.find((option) => option.value === dataItem) || options[0];
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
  return value || "";
}

export function normalizeAccountStatus(value) {
  if (value === true || value === 1 || value === "1" || String(value).toLowerCase() === "online") return "Online";
  return "Offline";
}

export function remoteTaskValidationError(route = {}, form = {}) {
  if (!String(form.meterId || "").trim()) return "meterId is required";
  if (!String(form.stationId || "").trim()) return "stationId is required";
  if (!String(form.dataItem || "").trim()) return "dataItem is required";
  if (remoteTaskKind(route) === "token" && !cleanToken(form.token || form.data)) return "token is required";
  if (!String(form.authorizationPassword || "").trim()) return "authorizationPassword is required";
  return "";
}

export function remoteTaskPayloadForRow(route = {}, row = {}, form = {}) {
  const option = findRemoteTaskOption(route, form.dataItem);
  const token = cleanToken(form.token || form.data);
  return {
    customerId: row.customerId || form.customerId || "",
    customerName: row.customerName || form.customerName || "",
    meterId: row.meterId || form.meterId || "",
    version: row.protocolVersion || form.protocolVersion || "2.2",
    flag: option.flag,
    name: option.label,
    dataItem: option.label,
    dataDefault: option.dataDefault,
    dataPrefix: option.dataPrefix,
    data: remoteTaskKind(route) === "token" ? token : form.data || "",
    stationId: row.stationId || form.stationId || "",
    remark: form.remark || ""
  };
}

export function buildRemoteTaskPayload(route = {}, action = "", form = {}, rows = []) {
  const sourceRows = action === "Add Batch Task" ? rows.filter((row) => row && row.meterId) : [form];
  return sourceRows.map((row) => remoteTaskPayloadForRow(route, row, form));
}
