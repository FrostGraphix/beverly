import axios from "axios";
import { validateApiEnvelope, validateCurrentUserResponse, validateLoginResponse } from "./runtime-schemas.mjs";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 30000
});

const sessionStorageKey = "beverly.session";
const defaultIdleTimeoutMs = 30 * 60 * 1000;

const sessionCookieKeys = [
  "token",
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

export function readSessionState() {
  try {
    const rawValue = localStorage.getItem(sessionStorageKey);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return null;
    const lastActiveAt = Number(parsed.lastActiveAt);
    const expiresAt = Number(parsed.expiresAt);
    if (!Number.isFinite(lastActiveAt) || !Number.isFinite(expiresAt)) return null;
    return { lastActiveAt, expiresAt };
  } catch {
    return null;
  }
}

export function writeSessionState(lastActiveAt = currentTimestamp()) {
  const expiresAt = lastActiveAt + sessionTimeoutMs();
  const nextState = { lastActiveAt, expiresAt };
  localStorage.setItem(sessionStorageKey, JSON.stringify(nextState));
  return nextState;
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
  const token = getCookie("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token) touchSession();
  return config;
});

export function setCookie(name, value) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
  return document.cookie.split("; ").find((row) => row.startsWith(`${encodeURIComponent(name)}=`))?.split("=")[1] || "";
}

export function clearCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}

export function clearSessionCookies() {
  sessionCookieKeys.forEach(clearCookie);
  clearSessionState();
}

function pickUserRow(response) {
  if (Array.isArray(response?.result?.data) && response.result.data.length) return response.result.data[0];
  if (Array.isArray(response?.data?.data) && response.data.data.length) return response.data.data[0];
  return null;
}

function normalizeSessionData(source = {}, fallback = {}) {
  const roleId = source.roleId || source.roleKey || fallback.roleId || "super-admin";
  const userName = source.userName || source.name || source.nickName || fallback.userName || fallback.name || fallback.userId || "ACB(admin)";
  const userId = source.userId || fallback.userId || fallback.loginId || "admin";
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
  setCookie("userId", normalized.userId);
  setCookie("userName", normalized.userName);
  setCookie("roleId", normalized.roleId);
  setCookie("userRemark", normalized.remark);
  if (normalized.email) setCookie("userEmail", normalized.email);
}

export async function postApi(path, payload = {}, options = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.post(cleanPath, payload, {
    headers: options.headers || {}
  });
  return validateApiEnvelope(response.data, cleanPath || "postApi");
}

export async function getApi(path, params = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.get(cleanPath, { params });
  return validateApiEnvelope(response.data, cleanPath || "getApi");
}

export async function uploadApi(path, formData, options = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.post(cleanPath, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...(options.headers || {})
    }
  });
  return validateApiEnvelope(response.data, cleanPath || "uploadApi");
}

export async function login(payload) {
  const response = validateLoginResponse(await postApi("/api/user/login", payload));
  const token = response.data?.token;
  if (!token) throw new Error(response.msg || response.reason || "Login failed");
  setCookie("token", token);
  writeSessionState();
  setCookie("SiteManager", payload.userId);
  setCookie("SiteCom", "ACB");
  writeSessionCookies({
    userId: response.data?.userId || payload.userId,
    userName: response.data?.userName || payload.userId,
    roleId: response.data?.roleId || "super-admin",
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
  } catch {
    return response;
  }
}

export async function currentUserInfo() {
  if (getCookie("token") && isSessionExpired()) {
    clearSessionCookies();
    throw new Error("Session expired");
  }
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
  } catch {
    const session = normalizeSessionData({
      userId: getCookie("userId") || "admin",
      userName: getCookie("userName") || "ACB(admin)",
      roleId: getCookie("roleId") || "super-admin",
      remark: getCookie("userRemark") || "",
      email: getCookie("userEmail") || ""
    });
    return validateCurrentUserResponse({
      code: 0,
      reason: "fallback",
      data: {
        ...session
      }
    });
  }
}

export function liveWritesAllowed() {
  return (import.meta.env?.VITE_ALLOW_LIVE_WRITES || "false") === "true";
}
