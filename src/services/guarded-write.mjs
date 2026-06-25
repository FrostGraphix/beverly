const guardedWritePattern = /status code 403|code 403|forbidden|writes are blocked|live write|route permission required|session lacks permission/i;

export function isGuardedWriteError(error = {}) {
  const status = Number(error?.response?.status || error?.status || 0);
  const message = String(error?.message || error?.reason || error || "");
  const source = error?.response?.data?._proxy?.source || error?._proxy?.source || "";
  return status === 403 || source === "guard" || guardedWritePattern.test(message);
}

export function guardedWriteMessage(action = "Action") {
  return `${action} not submitted. Live writes are off.`;
}

export function userFacingError(error = {}, fallback = "Action failed") {
  if (isGuardedWriteError(error)) return guardedWriteMessage();
  return error?.response?.data?.msg
    || error?.response?.data?.reason
    || error?.response?.data?.error
    || error?.message
    || fallback;
}
