import axios from "axios";
import { validateApiEnvelope, validateCurrentUserResponse, validateLoginResponse } from "./runtime-schemas.mjs";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 30000
});

function normalizeApiPath(path) {
  const normalized = String(path || "");
  if (normalized === "/api/item/readItemList") return "/api/item/read";
  if (normalized === "/api/user/info") return "/api/user/read";
  return normalized;
}

apiClient.interceptors.request.use((config) => {
  const token = getCookie("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function setCookie(name, value) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
  return document.cookie.split("; ").find((row) => row.startsWith(`${encodeURIComponent(name)}=`))?.split("=")[1] || "";
}

export async function postApi(path, payload = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.post(cleanPath, payload);
  return validateApiEnvelope(response.data, cleanPath || "postApi");
}

export async function getApi(path, params = {}) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.get(cleanPath, { params });
  return validateApiEnvelope(response.data, cleanPath || "getApi");
}

export async function uploadApi(path, formData) {
  const cleanPath = normalizeApiPath(path).replace(/^\/api/, "");
  const response = await apiClient.post(cleanPath, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return validateApiEnvelope(response.data, cleanPath || "uploadApi");
}

export async function login(payload) {
  const response = validateLoginResponse(await postApi("/api/user/login", payload));
  const token = response.data?.token;
  if (!token) throw new Error(response.msg || response.reason || "Login failed");
  setCookie("token", token);
  setCookie("SiteManager", payload.userId);
  setCookie("SiteCom", "ACB");
  setCookie("userId", response.data?.userId || payload.userId);
  setCookie("userName", response.data?.userName || payload.userId);
  setCookie("roleId", response.data?.roleId || "super-admin");
  setCookie("userRemark", response.data?.remark || "");
  return response;
}

export async function currentUserInfo() {
  try {
    const response = await postApi("/api/user/info", { userId: getCookie("userId") || "admin", pageNumber: 1, pageSize: 1 });
    const row = Array.isArray(response?.result?.data) ? response.result.data[0] : Array.isArray(response?.data?.data) ? response.data.data[0] : null;
    return validateCurrentUserResponse({
      ...response,
      data: {
        ...(response.data || {}),
        ...(row || {}),
        roleId: getCookie("roleId") || "super-admin",
        remark: getCookie("userRemark") || ""
      }
    });
  } catch {
    return validateCurrentUserResponse({
      code: 0,
      reason: "fallback",
      data: {
        userId: getCookie("userId") || "admin",
        userName: getCookie("userName") || "ACB(admin)",
        name: getCookie("userName") || "ACB(admin)",
        roleId: getCookie("roleId") || "super-admin",
        remark: getCookie("userRemark") || ""
      }
    });
  }
}

export function liveWritesAllowed() {
  return (import.meta.env?.VITE_ALLOW_LIVE_WRITES || "false") === "true";
}
