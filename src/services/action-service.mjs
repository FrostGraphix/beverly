import { liveWritesAllowed, postApi, uploadApi } from "./api.js";
import { mapActionResponse, mapWriteLog } from "./mappers/action-mapper.mjs";
import { buildWritePayload, isWriteEndpoint, validateWriteForm } from "./write-helpers.mjs";
import { validateUploadFile } from "./upload-policy.mjs";

export function actionEndpoint(route, action, uploadMode = false) {
  if (uploadMode) return "/API/File/Upload";
  if (action === "Recharge") return "/api/token/creditToken/generate";
  if (action === "Generate Token" && route.hash.includes("clear-credit")) return "/api/token/clearCreditToken/generate";
  if (action === "Generate Token" && route.hash.includes("clear-tamper")) return "/api/token/clearTamperToken/generate";
  if (action === "Generate Token" && route.hash.includes("set-maximum-power-limit")) return "/api/token/setMaximumPowerLimitToken/generate";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-reading")) return "/API/RemoteMeterTask/CreateReadingTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-control")) return "/API/RemoteMeterTask/CreateControlTask";
  if ((action === "Add Task" || action === "Add Batch Task") && route.hash.includes("remote-meter-token")) return "/API/RemoteMeterTask/CreateTokenTask";

  const moduleName = route.hash.includes("gateway")
    ? "gateway"
    : route.hash.includes("customer")
      ? "customer"
      : route.hash.includes("tariff")
        ? "tariff"
        : route.hash.includes("account")
          ? "account"
          : "";
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

function formDataPayload(route, action, form, selectedFile) {
  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("routeHash", route.hash);
  formData.append("action", action);
  formData.append("confirmationText", form.confirmationText);
  formData.append("authorizationProvided", String(Boolean(form.authorizationPassword)));
  return formData;
}

export async function submitRouteAction(route, action, form, options = {}) {
  const uploadMode = Boolean(options.uploadMode);
  const endpoint = options.endpoint || actionEndpoint(route, action, uploadMode);
  const writeAction = isWriteEndpoint(endpoint);
  const fields = options.fields || [];
  const importRows = options.importRows || [];
  const selectedFile = options.selectedFile || null;
  const meta = auditMeta(route, action, form);

  if (writeAction) {
    const validationError = validateWriteForm(action, form, fields);
    if (validationError) throw new Error(validationError);
  }
  if (uploadMode) {
    const uploadError = validateUploadFile(selectedFile);
    if (uploadError) throw new Error(uploadError);
  }
  if (action === "Import" && !uploadMode && !importRows.length) {
    throw new Error("Import file is required");
  }
  if (writeAction && !liveWritesAllowed()) {
    throw new Error("Writes are blocked until VITE_ALLOW_LIVE_WRITES=true");
  }

  const payload = action === "Import"
    ? buildWritePayload(endpoint, { ...form, ...meta, rows: importRows, items: importRows })
    : writeAction
      ? buildWritePayload(endpoint, { ...form, ...meta })
      : form;
  const requestLog = mapWriteLog(endpoint, payload, uploadMode ? { ...meta, fileName: form.fileName, fileSize: selectedFile?.size || 0 } : null);
  const response = uploadMode
    ? await uploadApi(endpoint, formDataPayload(route, action, form, selectedFile))
    : endpoint
      ? await postApi(endpoint, payload)
      : { data: {} };
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
