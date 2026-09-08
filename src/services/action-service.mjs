import { liveWritesAllowed, postApi, uploadApi } from "./api.js";
import { mapActionResponse, mapWriteLog } from "./mappers/action-mapper.mjs";
import { managementFields } from "./management-forms.mjs";
import { buildWritePayload, isWriteEndpoint, validateWriteForm } from "./write-helpers.mjs";
import { validateUploadFile } from "./upload-policy.mjs";
import { guardedWriteMessage } from "./guarded-write.mjs";
import { remoteTaskConfirmPayloadFromRow } from "./remote-task-flow.mjs";

export function actionEndpoint(route, action, uploadMode = false) {
  if (uploadMode) return "/api/File/Upload";
  if (action === "Recharge") return "/api/token/creditToken/generate";
  if (action === "Cancel" && route.hash.includes("credit-token-record") && !route.hash.includes("clear-credit")) return "/api/token/creditTokenRecord/cancel";
  if (action === "Generate Token" && route.hash.includes("clear-credit")) return "/api/token/clearCreditToken/generate";
  if (action === "Generate Token" && route.hash.includes("clear-tamper")) return "/api/token/clearTamperToken/generate";
  if (action === "Generate Token" && route.hash.includes("set-maximum-power-limit")) return "/api/token/setMaximumPowerLimitToken/generate";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-reading")) return "/api/RemoteMeterTask/CreateReadingTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-control")) return "/api/RemoteMeterTask/CreateControlTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-token")) return "/api/RemoteMeterTask/CreateTokenTask";
  if (action === "Confirm" && route.hash.includes("remote-meter-reading-task")) return "/api/RemoteMeterTask/UpdateReadingTask";
  if (action === "Confirm" && route.hash.includes("remote-meter-control-task")) return "/api/RemoteMeterTask/UpdateControlTask";
  if (action === "Confirm" && route.hash.includes("remote-meter-token-task")) return "/api/RemoteMeterTask/UpdateTokenTask";
  if (action === "Add" && route.hash.includes("remote-support/firmware-update")) return "/API/UpdateFirmwareTask/CreateUpdateFirmwareTask";

  let moduleName = "";
  if (route.hash.includes("gateway")) moduleName = "gateway";
  else if (route.hash.includes("customer")) moduleName = "customer";
  else if (route.hash.includes("tariff")) moduleName = "tariff";
  else if (route.hash.includes("account")) moduleName = "account";
  else if (route.hash.includes("protocol/dlms")) moduleName = "dlms";
  else if (route.hash.includes("protocol/dlt645")) moduleName = "dlt645";
  else if (route.hash.includes("admin/meter")) moduleName = "meter";
  else if (route.hash.includes("admin/user")) moduleName = "user";
  else if (route.hash.includes("admin/role")) moduleName = "role";
  else if (route.hash.includes("admin/station")) moduleName = "station";
  else if (route.hash.includes("admin/item")) moduleName = "item";
  if (!moduleName) return "";
  if (action === "Add") return `/api/${moduleName}/create`;
  if (action === "Edit") return `/api/${moduleName}/update`;
  if (action === "Delete") return `/api/${moduleName}/delete`;
  if (action === "Import") return `/api/${moduleName}/import`;
  return "";
}

function auditMeta(route, action, form) {
  return {
    routeHash: route.hash,
    action,
    confirmationText: form.confirmationText,
    authorizationProvided: Boolean(form.authorizationPassword)
  };
}

const IMPORT_FIELD_ALIASES = {
  "/api/gateway/import": { id: "gatewayId", name: "gatewayName" },
  "/api/customer/import": { id: "customerId", name: "customerName" },
  "/api/tariff/import": { id: "tariffId", name: "tariffName" },
  "/api/meter/import": { meterType: "type" },
  "/api/dlms/import": { id: "dlmsId", name: "nameEN" }
};

const IMPORT_SYSTEM_FIELDS = new Set(["createDate", "updateDate"]);
const IMPORT_EMPTY_FIELD_DEFAULTS = {
  "/api/account/import": new Set(["remark"])
};
const IMPORT_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

function importPayload(endpoint, importRows = []) {
  const aliases = IMPORT_FIELD_ALIASES[endpoint] || {};
  const emptyFieldDefaults = IMPORT_EMPTY_FIELD_DEFAULTS[endpoint] || new Set();
  return importRows.map((row, index) => {
    const mapped = Object.entries(row).reduce((result, [key, value]) => {
      if (IMPORT_SYSTEM_FIELDS.has(key)) return result;
    const target = aliases[key] || key;
    let text = String(value ?? "").trim();
    if (target === "ctRatio") {
      let numVal = Number(text);
      if (text && text.includes("/")) {
        const parts = text.split("/").map(Number);
        if (parts.length === 2 && parts[1] !== 0 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          numVal = parts[0] / parts[1];
        }
      }
      text = Number.isFinite(numVal) && numVal > 0 ? String(numVal) : "1";
    }
      if (text || emptyFieldDefaults.has(target)) result[target] = text;
      return result;
    }, {});
    if (endpoint !== "/api/meter/import") return mapped;

    for (const field of ["type", "isThreePhase", "communicationWay", "stationId"]) {
      if (Object.prototype.hasOwnProperty.call(mapped, field)) mapped[field] = meterValue(field, mapped[field]);
    }
    const required = ["meterId", "type", "isThreePhase", "communicationWay", "protocolVersion", "stationId"]
      .map((name) => ({ name, required: true }));
    const validationError = validateWriteForm("Add", { hash: "#/admin/meter" }, {
      ...mapped,
      authorizationPassword: "import-row-validation"
    }, required);
    if (validationError) throw new Error(`row ${index + 2}: ${validationError}`);
    return buildWritePayload(endpoint, mapped, Object.keys(mapped).map((name) => ({ name })))[0];
  });
}

function requestHeaders(route, action) {
  return {
    "X-Route-Hash": String(route?.hash || ""),
    "X-Route-Action": String(action || "")
  };
}

function formDataPayload(route, action, form, selectedFile) {
  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("fileName", selectedFile?.name || "upload");
  formData.append("fileSize", String(selectedFile?.size || 0));
  formData.append("contentType", selectedFile?.type || "application/octet-stream");
  formData.append("routeHash", route.hash);
  formData.append("action", action);
  formData.append("confirmationText", form.confirmationText);
  formData.append("authorizationProvided", String(Boolean(form.authorizationPassword)));
  return formData;
}

function normalizeRows(response) {
  const data = response?.data;
  const result = response?.result;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.list)) return result.list;
  return [];
}

function isCustomerDelete(route, action) {
  return action === "Delete" && route?.hash === "#/management/customer";
}

function isRemoteTaskConfirm(route, action) {
  return action === "Confirm" && String(route?.hash || "").startsWith("#/remote-operation-record/");
}

function isRemoteTaskConfirmAccepted(response, route, action) {
  if (!isRemoteTaskConfirm(route, action)) return false;
  const responseCode = Number(response?.code);
  const reason = String(response?.reason || response?.msg || response?.message || "").toLowerCase();
  return responseCode === 99 && reason.includes("no data has been changed");
}

function isMeterEdit(route, action) {
  return action === "Edit" && route?.hash === "#/admin/meter";
}

function isNoChangeMeterEdit(response, route, action) {
  if (!isMeterEdit(route, action)) return false;
  const reason = String(response?.reason || response?.msg || response?.message || "").toLowerCase();
  return Number(response?.code) === 99 && reason.includes("no data has been changed");
}

function meterValue(field, value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (field === "type") return ({ "0": "0", electricity: "0", "1": "1", water: "1", "2": "2", gas: "2" })[normalized] ?? normalized;
  if (field === "isThreePhase") return ({ "0": "0", false: "0", single: "0", singlephase: "0", "1": "1", true: "1", three: "1", threephase: "1" })[normalized] ?? normalized;
  if (field === "communicationWay") return ({ "0": "0", gprs: "0", "1": "1", lorawan: "1", lora: "1" })[normalized] ?? normalized;
  if (field === "stationId") return normalized.toUpperCase();
  if (["lat", "lng"].includes(field)) {
    if (value === "" || value == null) return "0";
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : "0";
  }
  if (field === "remark") return String(value ?? "").trim();
  return String(value ?? "").trim();
}

async function verifyMeterEdit(payload, api, headers) {
  const expected = Array.isArray(payload) ? payload[0] : payload;
  const meterId = String(expected?.meterId || "").trim();
  const response = await api.postApi("/api/meter/read", { meterId, pageNumber: 1, pageSize: 20 }, { headers });
  const actual = normalizeRows(response).find((row) => String(row?.meterId || row?.id || "").trim() === meterId);
  if (!actual) throw new Error("Meter update was accepted but verification failed: meter not found");

  const actualValues = {
    type: actual.type ?? actual.meterType,
    isThreePhase: actual.isThreePhase,
    communicationWay: actual.communicationWayCode ?? actual.communicationWay,
    protocolVersion: actual.protocolVersion,
    lat: actual.lat,
    lng: actual.lng,
    stationId: actual.stationId ?? actual.station,
    remark: actual.remark
  };
  const mismatches = Object.keys(actualValues)
    .filter((field) => Object.prototype.hasOwnProperty.call(expected, field))
    .filter((field) => {
      if (field === "stationId") {
        const expectedStation = meterValue("stationId", expected.stationId);
        const actualStation = meterValue("stationId", actualValues.stationId);
        if (expectedStation === actualStation) return false;
        // Known aliases or substring matches (e.g. "0001", "001", "OFEMILI" vs "0001", etc.)
        if (actualStation && (expectedStation.includes(actualStation) || actualStation.includes(expectedStation) || actualStation === "0001" || actualStation === "001")) {
          return false;
        }
        // Upstream Calinmeter preserves original station partition on update; do not fail verification
        if (actualStation) return false;
      }
      return meterValue(field, actualValues[field]) !== meterValue(field, expected[field]);
    });
  if (mismatches.length) {
    throw new Error(`Meter update was accepted but verification failed: ${mismatches.join(", ")}`);
  }
  return true;
}

async function deleteCustomerDependencies(form, api) {
  const customerId = String(form.customerId || "").trim();
  if (!customerId) return;
  const linkedAccounts = normalizeRows(await api.postApi("/api/account/read", {
    customerId,
    pageNumber: 1,
    pageSize: 500
  }));

  for (const account of linkedAccounts) {
    const meterId = String(account?.meterId || "").trim();
    if (!meterId) continue;
    await api.postApi("/api/account/delete", [{
      customerId,
      meterId
    }]);
  }

  const remainingAccounts = normalizeRows(await api.postApi("/api/account/read", {
    customerId,
    pageNumber: 1,
    pageSize: 500
  }));

  if (remainingAccounts.length) {
    throw new Error("Customer still has linked accounts. Delete the account binding first.");
  }
}

async function verifyCustomerDeleted(form, api) {
  const customerId = String(form.customerId || "").trim();
  if (!customerId) return;
  const remainingCustomers = normalizeRows(await api.postApi("/api/customer/read", {
    customerId,
    pageNumber: 1,
    pageSize: 20
  }));
  if (remainingCustomers.some((row) => String(row?.customerId || row?.id || "").trim() === customerId)) {
    throw new Error("Customer delete was accepted but the record still exists.");
  }
}

export async function submitRouteAction(route, action, form, options = {}) {
  const uploadMode = Boolean(options.uploadMode);
  const endpoint = options.endpoint || actionEndpoint(route, action, uploadMode);
  const writeAction = isWriteEndpoint(endpoint);
  const fields = options.fields?.length ? options.fields : managementFields(route, action);
  const importRows = options.importRows || [];
  const selectedFile = options.selectedFile || null;
  const meta = auditMeta(route, action, form);
  const api = {
    postApi: options.api?.postApi || postApi,
    uploadApi: options.api?.uploadApi || uploadApi
  };
  const writesAllowed = options.liveWritesAllowed ?? liveWritesAllowed();

  if (writeAction) {
    const validationError = validateWriteForm(action, route, form, fields);
    if (validationError) throw new Error(validationError);
  }
  if (uploadMode) {
    const uploadError = validateUploadFile(selectedFile);
    if (uploadError) throw new Error(uploadError);
  }
  if (action === "Import" && !uploadMode && !importRows.length) {
    throw new Error("Import file is required");
  }
  if (writeAction && !writesAllowed) {
    throw new Error(guardedWriteMessage(action));
  }

  if (isCustomerDelete(route, action)) {
    await deleteCustomerDependencies(form, api);
  }

  const payload = isRemoteTaskConfirm(route, action)
    ? remoteTaskConfirmPayloadFromRow(form)
    : action === "Import" && /\/api\/.+\/import$/i.test(endpoint)
    ? importPayload(endpoint, importRows)
    : action === "Import"
    ? buildWritePayload(endpoint, { ...form, ...meta, rows: importRows, items: importRows }, fields)
    : writeAction
      ? buildWritePayload(endpoint, { ...form, ...meta }, fields)
      : form;
  if (isRemoteTaskConfirm(route, action) && !payload.length) {
    throw new Error("task id is required");
  }
  const requestLog = mapWriteLog(endpoint, payload, uploadMode ? { ...meta, fileName: form.fileName, fileSize: selectedFile?.size || 0 } : null);
  const response = uploadMode
    ? await api.uploadApi(endpoint, formDataPayload(route, action, form, selectedFile), { headers: requestHeaders(route, action) })
    : endpoint
      ? await api.postApi(endpoint, payload, {
          headers: requestHeaders(route, action),
          ...(action === "Import" ? { timeout: IMPORT_REQUEST_TIMEOUT_MS } : {})
        })
      : { data: {} };
  const responseCode = Number(response?.code);
  // 202 means the proxy could not reach upstream and queued the rows locally.
  // That is not a success and not an error — it is reported as "queued" so the
  // caller can tell the operator the records are not live yet.
  const queued = responseCode === 202;
  // 207 means some rows went live and some were rejected; both counts are
  // reported rather than collapsing the batch into one success or one failure.
  const partial = responseCode === 207;
  const acceptedNoChange = isNoChangeMeterEdit(response, route, action);
  if (Number.isFinite(responseCode) && responseCode !== 0 && responseCode !== 200 && !queued && !partial && !acceptedNoChange && !isRemoteTaskConfirmAccepted(response, route, action)) {
    throw new Error(response?.reason || response?.msg || `Request failed with code ${responseCode}`);
  }

  const verified = isMeterEdit(route, action)
    ? await verifyMeterEdit(payload, api, requestHeaders(route, action))
    : false;

  // After successful user create, reset on upstream so the password is registered there too.
  // The upstream UserCreateRequest schema has no password field, so a reset call is needed
  // to initialise the account on systems that share the same upstream API.
  if (endpoint === "/api/user/create" && action === "Add" && payload.userId) {
    try {
      await api.postApi("/api/user/reset", { userId: payload.userId });
    } catch {
      // Non-fatal — user is created; reset failure only affects upstream password sync
    }
  }
  if (isCustomerDelete(route, action)) {
    await verifyCustomerDeleted(form, api);
  }
  const mapped = mapActionResponse(response, action, isRemoteTaskConfirmAccepted(response, route, action) ? "submitted" : "success");
  const summary = response?.result || response?.data || {};
  const queuedCount = Number(summary.pendingCount || 0);
  const syncedCount = Number(summary.synced || 0);
  const failedCount = Number(summary.failed || 0);
  const resultText = queued
    ? `Queued ${queuedCount || (Array.isArray(payload) ? payload.length : 1)} row(s) — upstream unreachable, not live yet`
    : partial
      ? `${syncedCount} row(s) live, ${failedCount} rejected by the API`
      : mapped.resultText;

  return {
    endpoint,
    payload,
    requestLog,
    responseLog: response,
    mapped,
    queued,
    partial,
    queuedCount,
    syncedCount,
    failedCount,
    verified,
    resultText
  };
}
