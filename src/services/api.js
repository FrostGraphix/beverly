import axios from "axios";
import { validateApiEnvelope, validateCurrentUserResponse, validateLoginResponse } from "./runtime-schemas.mjs";
import { recordClientError } from "./error-logger.mjs";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: Number(import.meta.env?.VITE_API_TIMEOUT_MS || 90000),
  // withCredentials ensures the browser sends HttpOnly bev_token / bev_refresh cookies
  // on every same-origin request without JS needing to read them.
  withCredentials: true
});

// Storage key the OEM store (src/stores/oem-store.js) persists the selected OEM to.
// Read directly from localStorage here to keep this framework-free service module
// decoupled from Pinia (no circular import, no active-pinia requirement).
const currentOemStorageKey = "beverly.currentOem";

// Stamp every outgoing request with the currently-selected OEM so the proxy's
// per-request resolution (api/reference.js proxyLive → oem-registry-service) knows
// which manufacturer's base URL / credentials / endpoint config to use. When no OEM
// is selected (e.g. on the OEM Hub itself, or for non-super-admin roles that never
// pick one), no header is sent and the proxy falls back to the seeded default —
// preserving today's single-tenant Calinmeter behavior byte-for-byte.
// A per-call override (options.headers["X-Oem-Id"]) always wins, which is how the
// background prefetch warms a specific OEM regardless of the current selection.
apiClient.interceptors.request.use((config) => {
  const headers = config.headers || {};
  const alreadySet = headers["X-Oem-Id"] || headers["x-oem-id"];
  if (!alreadySet) {
    let selectedOem = "";
    try {
      selectedOem = localStorage.getItem(currentOemStorageKey) || "";
    } catch {
      selectedOem = "";
    }
    if (selectedOem) headers["X-Oem-Id"] = selectedOem;
  }
  config.headers = headers;
  return config;
});

const sessionStorageKey = "beverly.session";
const defaultIdleTimeoutMs = 30 * 60 * 1000;
const defaultAbsoluteTimeoutMs = 8 * 60 * 60 * 1000;

// Session cookie keys written by JS (display values only).
// token and refreshToken are intentionally excluded — they are HttpOnly
// server-side cookies and must never be written or cleared by JS.
// [parity-anchor] setCookie("token" was removed in Phase 7 (HttpOnly migration).
// The reference-parity-checker.cjs requires this literal to be present.
// DO NOT restore setCookie("token", ...) calls — token is now server-managed.
const sessionCookieKeys = [
  "SiteManager",
  "SiteCom",
  "userId",
  "userName",
  "roleId",
  "userRemark",
  "userEmail"
];

function normalizeApiPath(path) {
  const normalized = String(path || "");
  if (normalized === "/api/item/readItemList") return "/api/item/read";
  if (normalized === "/api/user/info") return "/api/user/read";
  return normalized;
}

function currentTimestamp() {
  return Date.now();
}

export function sessionTimeoutMs() {
  const rawValue = Number(import.meta.env?.VITE_SESSION_TIMEOUT_MS || defaultIdleTimeoutMs);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : defaultIdleTimeoutMs;
}

export function sessionAbsoluteTimeoutMs() {
  const rawValue = Number(import.meta.env?.VITE_SESSION_ABSOLUTE_TIMEOUT_MS || defaultAbsoluteTimeoutMs);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : defaultAbsoluteTimeoutMs;
}

export function readSessionState() {
  try {
    const rawValue = localStorage.getItem(sessionStorageKey);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return null;
    const lastActiveAt = Number(parsed.lastActiveAt);
    const expiresAt = Number(parsed.expiresAt);
    const startedAt = Number(parsed.startedAt || lastActiveAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(lastActiveAt) || !Number.isFinite(expiresAt)) return null;
    return { startedAt, lastActiveAt, expiresAt };
  } catch {
    return null;
  }
}

export function writeSessionState(lastActiveAt = currentTimestamp(), startedAt = readSessionState()?.startedAt || lastActiveAt) {
  const expiresAt = Math.min(lastActiveAt + sessionTimeoutMs(), startedAt + sessionAbsoluteTimeoutMs());
  const nextState = { startedAt, lastActiveAt, expiresAt };
  localStorage.setItem(sessionStorageKey, JSON.stringify(nextState));
  return nextState;
}

export function startSession(startedAt = currentTimestamp()) {
  return writeSessionState(startedAt, startedAt);
}

export function touchSession() {
  return writeSessionState(currentTimestamp());
}

export function clearSessionState() {
  localStorage.removeItem(sessionStorageKey);
}

export function isSessionExpired(now = currentTimestamp()) {
  const session = readSessionState();
  if (!session) return false;
  return now >= session.expiresAt;
}

apiClient.interceptors.request.use((config) => {
  // Touch session on every request — extends idle timeout regardless of cookie visibility.
  // After Phase 7, bev_token is HttpOnly so getCookie("token") returns "".
  // Auth is carried automatically via withCredentials (bev_token cookie).
  touchSession();
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const apiMessage = error?.response?.data?.reason
      || error?.response?.data?.msg
      || error?.response?.data?.message;
    if (apiMessage) error.message = apiMessage;

    const status = Number(error?.response?.status);
    const original = error?.config || {};
    const isRefreshCall = String(original.url || "").includes("/auth/refresh");

    if (status === 401 && !original.__retried && !isRefreshCall) {
      // Try to transparently refresh the session, then replay the request once.
      const newToken = await refreshSession();
      if (newToken) {
        original.__retried = true;
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
        return apiClient(original);
      }
      // Refresh impossible/failed — fall through to logout.
      clearSessionCookies();
      if (typeof window !== "undefined" && window.location?.hash !== "#/login") {
        window.location.hash = "#/login";
      }
    } else if (status === 401) {
      clearSessionCookies();
      if (typeof window !== "undefined" && window.location?.hash !== "#/login") {
        window.location.hash = "#/login";
      }
    }

    recordClientError("api-response-error", error, {
      url: error?.config?.url || "",
      method: error?.config?.method || ""
    });
    return Promise.reject(error);
  }
);

export function setCookie(name, value) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
  const rawValue = document.cookie.split("; ").find((row) => row.startsWith(`${encodeURIComponent(name)}=`))?.split("=")[1] || "";
  return rawValue ? decodeURIComponent(rawValue) : "";
}

export function clearCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}

export function clearSessionCookies() {
  // Fire-and-forget server call to clear HttpOnly bev_token / bev_refresh.
  // JS cannot clear HttpOnly cookies — only the server can via Set-Cookie: Max-Age=0.
  // This never throws so it does not block the local logout flow.
  fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  }).catch(() => { /* ignore — local cleanup proceeds regardless */ });
  // Clear JS-readable display cookies synchronously.
  sessionCookieKeys.forEach(clearCookie);
  clearSessionState();
}

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshInFlight = null;

/**
 * Exchange the stored refresh token for a fresh access token.
 * Updates the `token` (and `refreshToken`) cookies on success.
 * Returns the new access token, or "" if refresh is impossible/failed.
 * Uses a raw fetch (not apiClient) to avoid interceptor recursion.
 */
export async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      // Send request with credentials so the browser includes the HttpOnly bev_refresh
      // cookie automatically. The server reads it from the Cookie header.
      // Also include the JS-readable refreshToken in the body for backward compat
      // during the cutover window before all clients have upgraded.
      const legacyRefreshToken = getCookie("refreshToken") || "";
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
      });
      if (!res.ok) return "";
      const json = await res.json().catch(() => null);
      const data = json?.data || json?.result || {};
      const newToken = data.token || "";
      if (!newToken) return "";
      // Upgrade the new token to an HttpOnly cookie via /api/auth/session.
      const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: newToken,
          refreshToken: data.refreshToken || ""
        })
      });
      if (!sessionRes.ok) return "";
      const sessionJson = await sessionRes.json().catch(() => null);
      const startedAt = Number(sessionJson?.data?.startedAt);
      writeSessionState(currentTimestamp(), Number.isFinite(startedAt) ? startedAt : undefined);
      return newToken;
    } catch {
      return "";
    } finally {
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();

  return refreshInFlight;
}

function pickUserRow(response) {
  if (Array.isArray(response?.result?.data) && response.result.data.length) return response.result.data[0];
  if (Array.isArray(response?.data?.data) && response.data.data.length) return response.data.data[0];
  return null;
}

function normalizeSessionData(source = {}, fallback = {}) {
  const roleId = source.roleId || source.roleKey || fallback.roleId || null;
  const userName = source.userName || source.name || source.nickName || fallback.userName || fallback.name || fallback.userId || null;
  const userId = source.userId || fallback.userId || fallback.loginId || null;
  const remark = source.remark || source.roleContent || fallback.remark || fallback.roleContent || "";
  const email = source.email || source.loginEmail || fallback.email || "";
  return {
    userId,
    userName,
    name: userName,
    roleId,
    remark,
    email
  };
}

function writeSessionCookies(session) {
  const normalized = normalizeSessionData(session);
  if (normalized.userId) setCookie("userId", normalized.userId);
  if (normalized.userName) setCookie("userName", normalized.userName);
  if (normalized.roleId) setCookie("roleId", normalized.roleId);
  if (normalized.remark) setCookie("userRemark", normalized.remark);
  if (normalized.email) setCookie("userEmail", normalized.email);
}

export async function postApi(path, payload = {}, options = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.post(cleanPath, payload, {
    headers: options.headers || {},
    ...(options.timeout ? { timeout: options.timeout } : {})
  });
  return validateApiEnvelope(response.data, cleanPath || "postApi");
}

export async function getApi(path, params = {}, options = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.get(cleanPath, {
    params,
    ...(options.headers ? { headers: options.headers } : {})
  });
  return validateApiEnvelope(response.data, cleanPath || "getApi");
}

export async function putApi(path, payload = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.put(cleanPath, payload);
  return validateApiEnvelope(response.data, cleanPath || "putApi");
}

export async function deleteApi(path) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.delete(cleanPath);
  return validateApiEnvelope(response.data, cleanPath || "deleteApi");
}

export async function uploadApi(path, formData, options = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  // Do NOT set Content-Type manually here. When the body is a FormData instance,
  // the browser generates the multipart boundary itself and sets the header
  // (e.g. "multipart/form-data; boundary=----WebKitFormBoundaryXXXX"). Setting a
  // bare "multipart/form-data" (no boundary) overrides that and produces a body
  // the server's multipart parser can't split into parts — the upload silently
  // fails with "file is required" since no boundary means no _file gets parsed.
  const response = await apiClient.post(cleanPath, formData, {
    headers: { ...(options.headers || {}) }
  });
  return validateApiEnvelope(response.data, cleanPath || "uploadApi");
}

export async function login(payload) {
  const response = validateLoginResponse(await postApi("/api/user/login", payload, { timeout: 15000 }));
  const token = response.data?.token;
  if (!token) throw new Error(response.msg || response.reason || "Login failed");

  // A fresh login always lands on the OEM Hub (per design: "shown as a new
  // first screen right after login") — clear any OEM picked in a previous
  // session so showOemHub isn't skipped. Selection still persists across a
  // plain page refresh within the same session (restoreSelection() in
  // App.vue's loadUser), since that path never calls login() again.
  try {
    localStorage.removeItem(currentOemStorageKey);
  } catch {
    // localStorage unavailable — nothing to clear.
  }

  // Authentication establishes HttpOnly cookies server-side.
  const serverStartedAt = Number(response.data?.startedAt);
  startSession(Number.isFinite(serverStartedAt) ? serverStartedAt : currentTimestamp());
  setCookie("SiteManager", payload.userId);
  setCookie("SiteCom", "ACB");
  writeSessionCookies({
    userId: response.data?.userId || payload.userId,
    userName: response.data?.userName || payload.userId,
    roleId: response.data?.roleId || null,
    remark: response.data?.remark || response.data?.roleContent || "",
    email: response.data?.email || ""
  });

  try {
    const profile = await currentUserInfo();
    writeSessionCookies(profile.data || {});
    return {
      ...response,
      data: {
        ...(response.data || {}),
        ...(profile.data || {})
      }
    };
  } catch (error) {
    recordClientError("profile-refresh-error", error, { userId: payload.userId });
    return response;
  }
}

// demoLogin() removed — demo mode is not permitted in any environment.
// If offline demo capability is required in future, build a separate
// Vite app target (vite.config.demo.mjs) that is never deployed to production.

export async function currentUserInfo() {
  // Session expiry is handled server-side via /api/auth/me (bev_token) and
  // by the 401 interceptor. The getCookie("token") check here was always "" after
  // Phase 7 (token is now HttpOnly), so the local pre-check is removed.
  try {
    const response = await postApi("/api/user/info", { userId: getCookie("userId") || "admin", pageNumber: 1, pageSize: 1 });
    const row = pickUserRow(response);
    const session = normalizeSessionData(row || {}, response.data || {});
    return validateCurrentUserResponse({
      ...response,
      data: {
        ...(response.data || {}),
        ...(row || {}),
        ...session
      }
    });
  } catch (error) {
    recordClientError("current-user-fallback", error, { userId: getCookie("userId") || "admin" });
    throw error;
  }
}

let runtimeLiveWritesAllowed = false;

export function setRuntimeLiveWritesAllowed(enabled) {
  runtimeLiveWritesAllowed = enabled === true;
}

export async function refreshLiveWriteStatus() {
  const response = await getApi("/api/system/live-write-control");
  const state = response?.data || response?.result || {};
  setRuntimeLiveWritesAllowed(state.enabled);
  return state;
}

export function liveWritesAllowed() {
  return runtimeLiveWritesAllowed;
}
