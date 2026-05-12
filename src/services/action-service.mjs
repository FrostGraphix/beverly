import { liveWritesAllowed, postApi, uploadApi } from "./api.js";
import { mapActionResponse, mapWriteLog } from "./mappers/action-mapper.mjs";
import { managementFields } from "./management-forms.mjs";
import { buildWritePayload, isWriteEndpoint, validateWriteForm } from "./write-helpers.mjs";
import { validateUploadFile } from "./upload-policy.mjs";

export function actionEndpoint(route, action, uploadMode = false) {
  if (uploadMode) return "/api/File/Upload";
  if (action === "Recharge") return "/api/token/creditToken/generate";
  if (action === "Cancel" && route.hash.includes("credit-token-record") && !route.hash.includes("clear-credit")) return "/api/token/creditTokenRecord/cancel";
  if (action === "Cancel" && route.hash.includes("clear-tamper-token-record")) return "/api/token/clearTamperTokenRecord/cancel";
  if (action === "Cancel" && route.hash.includes("set-maximum-power-limit-token-record")) return "/api/token/setMaximumPowerLimitTokenRecord/cancel";
  if (action === "Generate Token" && route.hash.includes("clear-credit")) return "/api/token/clearCreditToken/generate";
  if (action === "Generate Token" && route.hash.includes("clear-tamper")) return "/api/token/clearTamperToken/generate";
  if (action === "Generate Token" && route.hash.includes("set-maximum-power-limit")) return "/api/token/setMaximumPowerLimitToken/generate";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-reading")) return "/api/RemoteMeterTask/CreateReadingTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-control")) return "/api/RemoteMeterTask/CreateControlTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-token")) return "/api/RemoteMeterTask/CreateTokenTask";
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
    throw new Error("Writes are blocked until VITE_ALLOW_LIVE_WRITES=true");
  }

  if (isCustomerDelete(route, action)) {
    await deleteCustomerDependencies(form, api);
  }

  const payload = action === "Import"
    ? buildWritePayload(endpoint, { ...form, ...meta, rows: importRows, items: importRows }, fields)
    : writeAction
      ? buildWritePayload(endpoint, { ...form, ...meta }, fields)
      : form;
  const requestLog = mapWriteLog(endpoint, payload, uploadMode ? { ...meta, fileName: form.fileName, fileSize: selectedFile?.size || 0 } : null);
  const response = uploadMode
    ? await api.uploadApi(endpoint, formDataPayload(route, action, form, selectedFile), { headers: requestHeaders(route, action) })
    : endpoint
      ? await api.postApi(endpoint, payload, { headers: requestHeaders(route, action) })
      : { data: {} };
  const responseCode = Number(response?.code);
  if (Number.isFinite(responseCode) && responseCode !== 0 && responseCode !== 200) {
    throw new Error(response?.reason || response?.msg || `Request failed with code ${responseCode}`);
  }
  if (isCustomerDelete(route, action)) {
    await verifyCustomerDeleted(form, api);
  }
  const mapped = mapActionResponse(response, action);

  return {
    endpoint,
    payload,
    requestLog,
    responseLog: response,
    mapped,
    resultText: mapped.resultText
  };
}
