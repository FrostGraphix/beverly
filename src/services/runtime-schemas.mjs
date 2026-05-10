function fail(schemaName, message) {
  const error = new Error(`${schemaName}: ${message}`);
  error.name = "SchemaValidationError";
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value, fallback = "") {
  if (value === null || typeof value === "undefined") return fallback;
  return String(value);
}

function optionalNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function validateApiEnvelope(value, schemaName = "ApiEnvelope") {
  if (!isObject(value)) throw fail(schemaName, "response must be an object");
  return {
    ...value,
    code: optionalNumber(value.code, value.status ?? 0),
    msg: optionalString(value.msg || value.message || value.reason),
    reason: optionalString(value.reason || value.msg || value.message),
    data: value.data ?? null,
    result: value.result ?? null
  };
}

export function validateLoginResponse(value) {
  const envelope = validateApiEnvelope(value, "LoginResponse");
  if (!isObject(envelope.data)) throw fail("LoginResponse", "data must be an object");
  if (!optionalString(envelope.data.token)) throw fail("LoginResponse", "token is required");
  return {
    ...envelope,
    data: {
      token: optionalString(envelope.data.token),
      userId: optionalString(envelope.data.userId),
      userName: optionalString(envelope.data.userName || envelope.data.name),
      roleId: optionalString(envelope.data.roleId),
      remark: optionalString(envelope.data.remark)
    }
  };
}

export function validateCurrentUserResponse(value) {
  const envelope = validateApiEnvelope(value, "CurrentUserResponse");
  const data = isObject(envelope.data) ? envelope.data : {};
  return {
    ...envelope,
    data: {
      ...data,
      userId: optionalString(data.userId),
      userName: optionalString(data.userName || data.name),
      name: optionalString(data.name || data.userName),
      roleId: optionalString(data.roleId),
      remark: optionalString(data.remark)
    }
  };
}

export function validateProfileState(value) {
  const source = isObject(value) ? value : {};
  return {
    name: optionalString(source.name),
    email: optionalString(source.email),
    phone: optionalString(source.phone)
  };
}

export function validatePreferenceState(value) {
  const source = isObject(value) ? value : {};
  return {
    theme: optionalString(source.theme, "system"),
    compact: Boolean(source.compact),
    emailAlerts: source.emailAlerts !== false,
    tokenAlerts: source.tokenAlerts !== false,
    systemAlerts: Boolean(source.systemAlerts)
  };
}

export function assertPasswordChangePayload(payload) {
  if (!isObject(payload)) throw fail("PasswordChangePayload", "payload must be an object");
  if (!optionalString(payload.currentPassword)) throw fail("PasswordChangePayload", "current password is required");
  if (optionalString(payload.newPassword).length < 8) throw fail("PasswordChangePayload", "new password must be at least 8 characters");
  return {
    currentPassword: optionalString(payload.currentPassword),
    newPassword: optionalString(payload.newPassword)
  };
}
