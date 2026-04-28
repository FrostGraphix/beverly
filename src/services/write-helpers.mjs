const crudPattern = /\/(create|update|delete|import)\b/i;
const writePattern = /\/(create|update|delete|import|generate|cancel|reset|modify|addread|upload)\b/i;

export function isWriteEndpoint(endpoint = "") {
  return writePattern.test(endpoint);
}

export function usesArrayPayload(endpoint = "") {
  return crudPattern.test(endpoint);
}

export function needsAuthorizationPassword(action = "") {
  return ["Add", "Edit", "Delete", "Import", "Recharge", "Generate Token", "Add Task", "Add Batch Task"].includes(action);
}

export function confirmationMessage(action = "", routeTitle = "") {
  if (action === "Delete") return `Confirm delete for ${routeTitle}`;
  if (action === "Recharge") return `Confirm recharge for ${routeTitle}`;
  if (action === "Generate Token") return `Confirm token generation for ${routeTitle}`;
  if (action === "Add Task" || action === "Add Batch Task") return `Confirm task creation for ${routeTitle}`;
  if (action === "Add") return `Confirm create for ${routeTitle}`;
  if (action === "Edit") return `Confirm update for ${routeTitle}`;
  if (action === "Import" && routeTitle === "File Upload") return `Confirm upload for ${routeTitle}`;
  if (action === "Import") return `Confirm import for ${routeTitle}`;
  return `Confirm ${action.toLowerCase()} for ${routeTitle}`;
}

export function validateWriteForm(action, form, fields) {
  const values = form || {};
  const requiredFieldNames = (fields || [])
    .map((field) => field.name)
    .filter((name) => !["remark", "fileName"].includes(name));

  for (const name of requiredFieldNames) {
    if (!String(values[name] || "").trim()) {
      return `${name} is required`;
    }
  }

  if (needsAuthorizationPassword(action) && !String(values.authorizationPassword || "").trim()) {
    return "authorizationPassword is required";
  }

  return "";
}

export function stripWriteMeta(form = {}) {
  const payload = { ...form };
  delete payload.authorizationPassword;
  return payload;
}

export function buildWritePayload(endpoint, form = {}) {
  const payload = stripWriteMeta(form);
  return usesArrayPayload(endpoint) ? [payload] : payload;
}
