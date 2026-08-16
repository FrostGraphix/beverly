// @ts-check
/**
 * Patterns that identify a FRONTEND guard response (live-writes disabled at
 * the proxy level).  A plain 403 from the upstream API must NOT match here —
 * that is a real backend permission error and should surface as-is.
 */
const guardedWritePattern = /writes are blocked|live write/i;

/**
 * Patterns that identify a BACKEND permission error.
 * These are real errors from the API, not frontend guards.
 */
const backendPermissionPattern = /route permission required|session lacks permission|forbidden/i;

/**
 * @typedef {Object} WriteErrorBody
 * @property {{ source?: string }} [_proxy]
 * @property {string} [reason]
 * @property {string} [msg]
 * @property {string} [message]
 * @property {string} [error]
 *
 * @typedef {Object} WriteErrorLike
 * @property {string} [message]
 * @property {string} [reason]
 * @property {number} [status]
 * @property {{ source?: string }} [_proxy]
 * @property {{ status?: number, data?: WriteErrorBody }} [response]
 */

/** @param {WriteErrorLike | string} [error] */
export function isGuardedWriteError(error = {}) {
  if (typeof error === "string") return guardedWritePattern.test(error);
  const source = error?.response?.data?._proxy?.source || error?._proxy?.source || "";
  if (source === "guard") return true;

  const message = String(error?.message || error?.reason || error || "");
  if (guardedWritePattern.test(message)) return true;

  // A raw 403 is only treated as a "live writes" guard when live writes are
  // explicitly disabled — otherwise it is a real backend permission error.
  const status = Number(error?.response?.status || error?.status || 0);
  if (status === 403 && !liveWritesOn()) return true;

  return false;
}

/**
 * Returns the best user-facing message for a failed write.
 *
 * Precedence:
 *  1. If it is a frontend guard error → standard "Live writes are off" copy.
 *  2. If it is a backend permission error (403 / "route permission required")
 *     and live writes ARE on → surface the actual reason so operators can act.
 *  3. Fall through to the generic error message helpers.
 */
export function guardedWriteMessage(action = "Action") {
  return `${action} not submitted. Live writes are off.`;
}

/**
 * @param {WriteErrorLike} [error]
 * @param {string} [fallback]
 */
export function userFacingError(error = {}, fallback = "Action failed") {
  if (isGuardedWriteError(error)) return guardedWriteMessage();

  // Real backend permission error — show it clearly.
  const message = String(error?.message || "");
  const status = Number(error?.response?.status || error?.status || 0);
  if (status === 403 || backendPermissionPattern.test(message)) {
    const detail = error?.response?.data?.reason
      || error?.response?.data?.msg
      || error?.response?.data?.message
      || message
      || "Permission denied by server.";
    return `Permission denied: ${detail}`;
  }

  return error?.response?.data?.msg
    || error?.response?.data?.reason
    || error?.response?.data?.error
    || error?.message
    || fallback;
}

/** Thin shim so isGuardedWriteError can check live-write state without importing api.js (avoids circular dep). */
function liveWritesOn() {
  if (typeof window === "undefined") return false;
  const override = window.localStorage?.getItem("beverly.allow_live_writes");
  if (override === "true") return true;
  if (override === "false") return false;
  const host = window.location?.hostname || "";
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}
