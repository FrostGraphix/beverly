const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { loadEnvFile } = require("../tools/env-loader.cjs");
const {
  ensureDatabase,
  cacheApiResponse,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  listImportJobs,
  listAccountBindings,
  readCachedApiResponse,
  recordPrintJob,
  recordWriteConfirmation,
  saveAccountBinding,
  deleteAccountBinding,
  saveArtifact,
  tableCounts
} = require("../backend/src/services/storage-adapter");
const { resetForTests } = require("../backend/src/services/local-database");
const {
  authEnabled: supabaseAuthEnabled,
  signInWithPassword,
  authUserFromAccessToken,
  storageReport,
  createAuthUser,
  updateAuthUser,
  deleteAuthUser,
  getAuthUserByUserId
} = require("../backend/src/services/supabase-service");
const {
  readSnapshot,
  snapshotSchedule,
  writeSnapshot
} = require("../backend/src/services/snapshot-service");
const {
  dailyMeterStationStats,
  dailyMeterTableReport,
  readDailyMeterSummary,
  readDailyMeterRows,
  writeDailyMeterRows,
  ingestWebhookReadings
} = require("../backend/src/services/consumption-store");
const { automationReport } = require("../backend/src/services/automation-catalog");
const {
  automationControlReport,
  handleAutomationIncident,
  readAutomationControl,
  saveAutomationControl
} = require("../backend/src/services/automation-control");
const { previousDayRange, refreshTargets } = require("../backend/src/services/refresh-targets");
const {
  governancePlan,
  rolePermissionAudit,
  runGovernance,
  runRetentionCleanup
} = require("../backend/src/services/data-governance");
const walletLedger = require("../backend/src/services/wallet-ledger-service");
const walletFunding = require("../backend/src/services/wallet-funding-service");
const walletPurchase = require("../backend/src/services/wallet-purchase-service");
const vendorOnboarding = require("../backend/src/services/vendor-onboarding-service");
const walletApproval = require("../backend/src/services/wallet-approval-service");
const walletReconciliation = require("../backend/src/services/wallet-reconciliation-service");
const walletDisputes = require("../backend/src/services/wallet-disputes-service");
const walletRefunds = require("../backend/src/services/wallet-refunds-service");
const walletSettlement = require("../backend/src/services/wallet-settlement-service");
const walletVendingMonitor = require("../backend/src/services/wallet-vending-monitor-service");
const walletFeatureFlags = require("../backend/src/services/wallet-feature-flags-service");
const walletPrivacy = require("../backend/src/services/wallet-privacy-service");
const smsNotifications = require("../backend/src/services/sms-notification-service");

// No live upstream URL has a code default.
const liveBaseUrlDefault = "";
const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "reference-contract.json");
const samplesDir = path.join(root, "contracts", "samples");
const jsonContentType = "application/json";
const writePattern = /\/(?:create|update|delete|import|generate|cancel|reset|modify|addread|upload|send)\w*\b/i;
const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
];
const rateLimitBuckets = new Map();

loadEnvFile();

let contractAliasMap = null;
let accessControlModulePromise = null;

function getEnv() {
  const readMode = process.env.LIVE_READ_MODE || (process.env.LIVE_API_PROXY_ENABLED === "true" ? "live" : "local");
  const liveBaseUrl = process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || liveBaseUrlDefault;
  const configuredLiveWrites = process.env.ALLOW_LIVE_WRITES;
  const allowLiveWrites = configuredLiveWrites === "false"
    ? false
    : configuredLiveWrites === "true"
      || process.env.APPROVED_LIVE_WRITES === "true"
      || process.env.NODE_ENV !== "production";
  return {
    readMode,
    liveBaseUrl,
    liveProxyEnabled: readMode !== "local" && process.env.LIVE_API_PROXY_ENABLED === "true" && Boolean(liveBaseUrl),
    liveBearerToken: process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "",
    allowLiveWrites,
    corsOrigins: splitCsv(process.env.CORS_ORIGINS || defaultCorsOrigins.join(",")),
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300),
    demoAuthEnabled: process.env.DEMO_AUTH_ENABLED === "true",
    demoAuthUser: process.env.DEMO_AUTH_USER || "admin",
    demoAuthPassword: process.env.DEMO_AUTH_PASSWORD || ""
  };
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setResponseHeader(response, name, value) {
  if (typeof response.setHeader === "function") {
    response.setHeader(name, value);
  }
}

function applyCorsHeaders(request, response) {
  const env = getEnv();
  const origin = request.headers.origin || "";
  const allowAny = env.corsOrigins.includes("*");
  const allowedOrigin = allowAny ? "*" : env.corsOrigins.includes(origin) ? origin : "";
  if (allowedOrigin) setResponseHeader(response, "Access-Control-Allow-Origin", allowedOrigin);
  setResponseHeader(response, "Vary", "Origin");
  setResponseHeader(response, "Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  setResponseHeader(response, "Access-Control-Allow-Headers", "Content-Type,Authorization,X-Authorization-Password,X-Route-Hash,X-Route-Action");
  setResponseHeader(response, "Access-Control-Max-Age", "86400");
}

function clientAddress(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.socket?.remoteAddress || "unknown";
}

function rateLimitResult(request) {
  const env = getEnv();
  if (!env.rateLimitEnabled || String(request.method || "GET").toUpperCase() === "OPTIONS") return null;
  const windowMs = Number.isFinite(env.rateLimitWindowMs) && env.rateLimitWindowMs > 0 ? env.rateLimitWindowMs : 60000;
  const maxRequests = Number.isFinite(env.rateLimitMaxRequests) && env.rateLimitMaxRequests > 0 ? env.rateLimitMaxRequests : 300;
  const now = Date.now();
  const key = `${clientAddress(request)}:${Math.floor(now / windowMs)}`;
  const current = rateLimitBuckets.get(key) || 0;
  rateLimitBuckets.set(key, current + 1);
  for (const bucketKey of rateLimitBuckets.keys()) {
    if (!bucketKey.endsWith(`:${Math.floor(now / windowMs)}`)) rateLimitBuckets.delete(bucketKey);
  }
  if (current + 1 <= maxRequests) return null;
  return {
    status: 429,
    body: {
      code: 429,
      msg: "Too many requests",
      reason: "Too many requests",
      data: null,
      result: null,
      _proxy: {
        source: "rate-limit",
        pathname: normalizeRequestPath(request.url)
      }
    }
  };
}

function getContractAliasMap() {
  if (contractAliasMap) return contractAliasMap;
  contractAliasMap = new Map();
  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    for (const endpoint of contract.endpoints || []) {
      const aliases = Array.from(new Set([
        endpoint.path,
        ...(endpoint.aliases || []),
        ...(endpoint.casingVariants || [])
      ]));
      for (const alias of aliases) {
        contractAliasMap.set(alias.toLowerCase(), aliases);
      }
    }
  } catch {
    contractAliasMap = new Map();
  }
  return contractAliasMap;
}

async function getAccessControlModule() {
  if (!accessControlModulePromise) {
    accessControlModulePromise = import(pathToFileURL(path.join(root, "src", "data", "route-manifest.js")).href);
  }
  return accessControlModulePromise;
}

function authHeaderToken(request) {
  const value = String(request.headers.authorization || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function routeHeaderHash(request) {
  return String(request.headers["x-route-hash"] || "").trim();
}

function routeHashForWritePath(pathname) {
  const lowerPath = String(pathname || "").toLowerCase();
  if (lowerPath.endsWith("/remotemetertask/createreadingtask")) return "#/remote-operation/remote-meter-reading";
  if (lowerPath.endsWith("/remotemetertask/createcontroltask")) return "#/remote-operation/remote-meter-control";
  if (lowerPath.endsWith("/remotemetertask/createtokentask")) return "#/remote-operation/remote-meter-token";
  if (lowerPath.endsWith("/gprstask/gprscreatereadingtask") || lowerPath.endsWith("/gprsmetertask/gprscreatereadingtask")) return "#/remote-support/gprs-tasks";
  if (lowerPath.endsWith("/updatefirmwaretask/createupdatefirmwaretask")) return "#/remote-support/firmware-update";
  return "";
}

function stationFromPayload(payload) {
  const value = payload?.stationId ?? payload?.SITE_ID ?? payload?.siteId ?? "";
  return String(value || "").trim();
}

function protectedPath(pathname) {
  if (!supabaseAuthEnabled()) return false;
  const lowerPath = String(pathname || "").toLowerCase();
  if (!lowerPath.startsWith("/api/")) return false;
  if (lowerPath === "/api/user/login") return false;
  if (lowerPath === "/api/auth/mfa/factors") return false;
  if (lowerPath === "/api/system/health") return false;
  if (lowerPath === "/api/notifications/sms/status") return false;
  if (lowerPath === "/api/webhooks/meter-readings") return false;
  if (lowerPath.startsWith("/api/cron/")) return false;
  return true;
}

function authFailure(status, pathname, reason) {
  return {
    status,
    body: {
      code: status,
      msg: reason,
      reason,
      data: null,
      result: null,
      _proxy: {
        source: "authz",
        pathname
      }
    }
  };
}

function actorCanAccessStation(actor, payload) {
  const actorStation = String(actor?.stationId || "").trim();
  const requestedStation = stationFromPayload(payload);
  if (!actorStation || !requestedStation) return true;
  return String(actorStation).toUpperCase() === String(requestedStation).toUpperCase();
}

function roleAllowsWalletPath(roleId, pathname) {
  const role = String(roleId || "").trim();
  const lowerPath = String(pathname || "").toLowerCase();
  const staffRoles = new Set(["super-admin", "operations-manager", "account", "account-officer", "finance-checker"]);
  const vendorRoles = new Set(["vendor_user", "vendor_manager"]);
  if (lowerPath.startsWith("/api/vendor/")) return vendorRoles.has(role) || staffRoles.has(role);
  if (lowerPath.startsWith("/api/wallet/funding/approve")) return role === "finance-checker" || role === "super-admin";
  if (lowerPath.startsWith("/api/wallet/funding/reject")) return role === "finance-checker" || role === "super-admin";
  if (lowerPath.startsWith("/api/wallet/freeze")) return role === "super-admin";
  if (lowerPath.startsWith("/api/wallet/unfreeze")) return role === "super-admin";
  if (lowerPath.startsWith("/api/wallet/")) return vendorRoles.has(role) || staffRoles.has(role);
  return false;
}

async function matchingRouteForRequest(pathname, request) {
  const access = await getAccessControlModule();
  const requestedHash = routeHeaderHash(request);
  if (requestedHash) {
    return access.routeManifest.find((route) => route.hash === requestedHash) || null;
  }
  const writeRouteHash = routeHashForWritePath(pathname);
  if (writeRouteHash) {
    return access.routeManifest.find((route) => route.hash === writeRouteHash) || null;
  }
  const loweredPath = String(pathname || "").toLowerCase();
  return access.routeManifest.find((route) =>
    Array.isArray(route.apis) && route.apis.some((apiPath) => String(apiPath || "").toLowerCase() === loweredPath)
  ) || null;
}

async function authorizeRequest(request, pathname, requestData) {
  if (!protectedPath(pathname)) return null;
  const token = authHeaderToken(request);
  const trustedLiveActor = trustedLiveReadActor(pathname, request);
  if (!token && !trustedLiveActor) return authFailure(401, pathname, "Authentication required");

  const actor = token ? await authUserFromAccessToken(token) : trustedLiveActor;
  if (!actor && !trustedLiveActor) return authFailure(401, pathname, "Invalid session");
  const resolvedActor = actor || trustedLiveActor;

  request.__auth = resolvedActor;

  const access = await getAccessControlModule();
  const normalizedRole = access.normalizeRoleId(resolvedActor.roleId);
  const lowerPath = String(pathname || "").toLowerCase();
  const payload = Array.isArray(requestData?.parsedBody) ? requestData.parsedBody[0] || {} : requestData?.parsedBody || {};

  if (!actorCanAccessStation(resolvedActor, payload) && normalizedRole !== "super-admin") {
    return authFailure(403, pathname, "Station scope violation");
  }

  if (lowerPath === "/api/user/profile" || lowerPath === "/api/user/changepassword") return null;
  if ((lowerPath === "/api/user/read" || lowerPath === "/api/user/info") && String(payload.userId || "").trim()) {
    const targetUserId = String(payload.userId || "").trim().toLowerCase();
    if (normalizedRole === "super-admin" || targetUserId === String(resolvedActor.userId || "").trim().toLowerCase()) return null;
  }

  if (lowerPath.startsWith("/api/user/")) {
    return normalizedRole === "super-admin" ? null : authFailure(403, pathname, "Super admin required");
  }

  const route = await matchingRouteForRequest(pathname, request);
  if (route && access.roleAllowsRoute(route, resolvedActor.roleId, resolvedActor.remark)) return null;

  if (lowerPath.startsWith("/api/local/")) {
    return normalizedRole === "super-admin" ? null : authFailure(403, pathname, "Super admin required");
  }

  if (lowerPath.startsWith("/api/system/")) {
    if (lowerPath === "/api/system/automation-report" || lowerPath === "/api/system/automation-control" || lowerPath === "/api/system/automation-hooks/test") {
      return (normalizedRole === "super-admin" || normalizedRole === "operations-manager") ? null : authFailure(403, pathname, "Insufficient permissions");
    }
    return normalizedRole === "super-admin" ? null : authFailure(403, pathname, "Super admin required");
  }

  if (lowerPath.startsWith("/api/notifications/")) {
    return (normalizedRole === "super-admin" || normalizedRole === "operations-manager")
      ? null
      : authFailure(403, pathname, "Insufficient permissions");
  }

  if ((lowerPath.startsWith("/api/wallet/") || lowerPath.startsWith("/api/vendor/"))
    && roleAllowsWalletPath(normalizedRole, lowerPath)) {
    return null;
  }

  if (isWriteRequest(pathname, request.method)) {
    return authFailure(403, pathname, "Route permission required");
  }

  return null;
}

function readRequest(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      const contentType = String(request.headers["content-type"] || "");
      const rawText = rawBody.toString("utf8");
      let parsedBody = {};
      if (!rawBody.length) {
        parsedBody = {};
      } else if (contentType.includes(jsonContentType)) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch {
          parsedBody = { raw: rawText };
        }
      } else if (contentType.includes("multipart/form-data")) {
        parsedBody = parseMultipartFields(rawBody, rawText, contentType);
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        parsedBody = parseUrlEncodedFields(rawText);
      } else {
        parsedBody = { raw: rawText };
      }
      resolve({
        contentType,
        rawBody,
        rawText,
        parsedBody
      });
    });
    request.on("error", reject);
  });
}

function parseUrlEncodedFields(rawText) {
  const fields = {};
  const params = new URLSearchParams(String(rawText || ""));
  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      fields[key] = Array.isArray(fields[key]) ? [...fields[key], value] : [fields[key], value];
    } else {
      fields[key] = value;
    }
  }
  return fields;
}

function parseMultipartFields(rawBody, rawText, contentType) {
  const boundary = String(contentType || "").match(/boundary=([^;]+)/i)?.[1];
  if (!boundary) return { raw: rawText };
  const fields = {};
  for (const part of rawText.split(`--${boundary}`)) {
    const name = part.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const filename = part.match(/filename="([^"]*)"/)?.[1];
    const value = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/\r?\n--$/, "").trim();
    if (filename) {
      fields.fileName = fields.fileName || filename;
      fields.uploadFileName = filename;
    } else {
      fields[name] = value;
    }
  }
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let offset = rawBody.indexOf(boundaryBuffer);
  while (offset !== -1) {
    const next = rawBody.indexOf(boundaryBuffer, offset + boundaryBuffer.length);
    if (next === -1) break;
    const part = rawBody.subarray(offset + boundaryBuffer.length, next);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString("utf8");
      const filename = headerText.match(/filename="([^"]*)"/)?.[1];
      if (filename) {
        const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
        let fileBuffer = part.subarray(headerEnd + 4);
        if (fileBuffer.subarray(0, 2).toString() === "\r\n") fileBuffer = fileBuffer.subarray(2);
        if (fileBuffer.subarray(-2).toString() === "\r\n") fileBuffer = fileBuffer.subarray(0, -2);
        fields._file = { name: filename, contentType: type, buffer: fileBuffer };
        break;
      }
    }
    offset = next;
  }
  return fields;
}

function normalizeRequestPath(urlValue) {
  const overridePath = requestPathOverride(urlValue);
  if (overridePath) return overridePath;
  const pathname = String(urlValue || "/")
    .replace(/^\/api\/reference(?:\.js)?/i, "/api")
    .split("?")[0];
  if (/^\/auth\/mfa\//i.test(pathname)) return `/api${pathname}`;
  if (/^\/api\/API\//.test(pathname)) return pathname.replace(/^\/api\/API\//, "/API/");
  if (/^\/api\/api\//.test(pathname)) return pathname.replace(/^\/api\/api\//, "/api/");
  return pathname;
}

function requestPathOverride(urlValue) {
  try {
    const parsed = new URL(String(urlValue || "/"), "http://localhost");
    const override = parsed.searchParams.get("__pathname");
    if (!override) return "";
    return override.startsWith("/") ? override : `/${override}`;
  } catch {
    return "";
  }
}

function querySuffix(urlValue) {
  const text = String(urlValue || "");
  return text.includes("?") ? text.slice(text.indexOf("?")) : "";
}

function swapApiPrefix(endpointPath) {
  if (endpointPath.startsWith("/API/")) return endpointPath.replace(/^\/API\//, "/api/");
  if (endpointPath.startsWith("/api/")) return endpointPath.replace(/^\/api\//, "/API/");
  return endpointPath;
}

function candidatePaths(pathname) {
  const aliases = getContractAliasMap().get(pathname.toLowerCase()) || [];
  return Array.from(new Set([
    pathname,
    ...aliases,
    swapApiPrefix(pathname)
  ]));
}

function isWriteRequest(pathname, method) {
  if (String(method || "GET").toUpperCase() === "GET") return false;
  return writePattern.test(pathname);
}

function isPreviewRequest(requestData) {
  const payload = Array.isArray(requestData?.parsedBody) ? requestData.parsedBody[0] : requestData?.parsedBody;
  return payload?.isPreview === true;
}

function isGuardedWriteRequest(pathname, method, requestData) {
  return isWriteRequest(pathname, method) && !isPreviewRequest(requestData);
}

function isCacheableRequest(pathname, method) {
  if (pathname.startsWith("/api/local/")) return false;
  return !isWriteRequest(pathname, method);
}

function requiresLiveRead(pathname) {
  const normalizedPath = String(pathname || "");
  return /\/api\/DailyDataMeter\/read$/i.test(normalizedPath)
    || /\/api\/customer\/read$/i.test(normalizedPath)
    || /\/api\/account\/read$/i.test(normalizedPath)
    || /\/api\/RemoteMeterTask\/Get(?:Reading|Control|Token)Task$/i.test(normalizedPath);
}

function trustedLiveReadActor(pathname, request) {
  const env = getEnv();
  const method = String(request?.method || "GET").toUpperCase();
  if (!env.liveProxyEnabled || !env.liveBearerToken) return null;
  if (method !== "GET" && method !== "POST") return null;
  if (isWriteRequest(pathname, method) || !requiresLiveRead(pathname)) return null;
  return {
    userId: "live-read-proxy",
    userName: "Live Read Proxy",
    roleId: "super-admin",
    remark: "super-admin",
    stationId: ""
  };
}

function canUseSampleFallback(_pathname) {
  return false;
}

function apiCacheEnabled() {
  return process.env.API_CACHE_ENABLED === "true" || process.env.SESSION_STORE_MODE === "supabase";
}

function buildCacheKey(request, requestData) {
  return JSON.stringify({
    query: querySuffix(request.url),
    body: requestData.parsedBody || {}
  });
}

function cronAuthorized(request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return String(request.headers.authorization || "") === `Bearer ${secret}`;
}

function refreshScopeFromPath(pathname) {
  if (pathname.endsWith("/refresh-hourly")) return "hourly";
  if (pathname.endsWith("/refresh-daily")) return "daily";
  if (pathname.endsWith("/refresh-backfill")) return "backfill";
  if (pathname.endsWith("/refresh-all")) return "all";
  return "hot";
}

function syntheticRefreshRequest(target) {
  const rawBody = Buffer.from(JSON.stringify(target.payload || {}));
  return {
    method: "POST",
    url: target.path,
    headers: {
      accept: jsonContentType,
      "content-type": jsonContentType
    },
    socket: {
      remoteAddress: "cron"
    }
  };
}

function syntheticRefreshRequestData(target) {
  const rawBody = Buffer.from(JSON.stringify(target.payload || {}));
  return {
    contentType: jsonContentType,
    rawBody,
    rawText: rawBody.toString("utf8"),
    parsedBody: target.payload || {}
  };
}

function logWriteEvent(kind, details) {
  console.info(`[write-${kind}]`, JSON.stringify(details));
}

function buildLiveHeaders(request, requestData, token) {
  const headers = {
    Accept: request.headers.accept || jsonContentType,
    Authorization: token
  };
  if (requestData.contentType) headers["Content-Type"] = requestData.contentType;
  return headers;
}

function sanitizeReadPayload(payload, keyMap = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const sanitized = { ...payload };
  const pageSize = Number(sanitized.pageSize || 20);
  sanitized.pageSize = Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 20) : 20;

  const rawOrderBy = String(sanitized.orderBy || "").trim();
  if (rawOrderBy) {
    const [rawKey, rawDirection = "asc"] = rawOrderBy.split(/\s+/);
    const mappedKey = keyMap[String(rawKey || "").toLowerCase()];
    const direction = String(rawDirection || "").toLowerCase() === "desc" ? "desc" : "asc";
    if (mappedKey) sanitized.orderBy = `${mappedKey} ${direction}`;
    else delete sanitized.orderBy;
  }

  return sanitized;
}

function sanitizeLiveRequestData(pathname, requestData) {
  const normalizedPath = String(pathname || "");
  const customerKeyMap = {
    id: "customerId",
    customerid: "customerId",
    name: "customerName",
    customername: "customerName"
  };
  const accountKeyMap = {
    id: "customerId",
    customerid: "customerId",
    meterid: "meterId",
    tariffid: "tariffId",
    communicationway: "communicationWay",
    ctratio: "ctRatio",
    stationid: "stationId",
    createdate: "createDate",
    updatedate: "updateDate"
  };
  const payload = /\/api\/customer\/read$/i.test(normalizedPath)
    ? sanitizeReadPayload(requestData?.parsedBody, customerKeyMap)
    : /\/api\/account\/read$/i.test(normalizedPath)
      ? sanitizeReadPayload(requestData?.parsedBody, accountKeyMap)
      : requestData?.parsedBody;
  if (payload === requestData?.parsedBody) return requestData;
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    ...requestData,
    rawBody,
    rawText: rawBody.toString("utf8"),
    parsedBody: payload,
    contentType: requestData?.contentType || jsonContentType
  };
}

async function parseLiveResponse(response) {
  const contentType = String(response.headers.get("content-type") || "");
  const rawText = await response.text();
  if (contentType.includes(jsonContentType)) {
    try {
      return JSON.parse(rawText);
    } catch {
      return { raw: rawText };
    }
  }
  return { raw: rawText };
}

function normalizeLivePayload(payload, status, pathname) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const normalized = { ...payload };
    if (!("msg" in normalized) && "reason" in normalized) normalized.msg = normalized.reason;
    if (!("reason" in normalized) && "msg" in normalized) normalized.reason = normalized.msg;
    if (!("data" in normalized) && "result" in normalized) normalized.data = normalized.result;
    if (!("result" in normalized) && "data" in normalized) normalized.result = normalized.data;
    normalized._proxy = {
      source: "live",
      pathname
    };
    return normalized;
  }

  return {
    code: status,
    msg: status < 400 ? "success" : "proxy error",
    reason: status < 400 ? "success" : "proxy error",
    data: payload,
    result: payload,
    raw: payload,
    _proxy: {
      source: "live",
      pathname
    }
  };
}

function hasBusinessFailure(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const code = Number(payload.code);
  const emptyPayload = payload.result === null || payload.data === null;
  return Number.isFinite(code) && code !== 0 && code !== 200 && emptyPayload;
}

function isAccountCreatePath(pathname) {
  return String(pathname || "").toLowerCase() === "/api/account/create";
}

function isAccountReadPath(pathname) {
  return String(pathname || "").toLowerCase() === "/api/account/read";
}

function isAccountDeletePath(pathname) {
  return String(pathname || "").toLowerCase() === "/api/account/delete";
}

function accountBindingPayloadRows(requestData) {
  const payload = requestData?.parsedBody;
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return rows
    .map((row) => ({
      customerId: String(row?.customerId || "").trim(),
      meterId: String(row?.meterId || "").trim(),
      tariffId: String(row?.tariffId || "").trim(),
      ctRatio: String(row?.ctRatio || "").trim(),
      stationId: String(row?.stationId || "").trim(),
      remark: String(row?.remark || "").trim()
    }))
    .filter((row) => row.customerId && row.meterId);
}

async function persistLocalAccountBindings(requestData, source = "local-fallback") {
  const rows = accountBindingPayloadRows(requestData);
  for (const row of rows) {
    await saveAccountBinding({
      ...row,
      source,
      status: "active",
      details: row
    });
  }
  return rows;
}

async function removeLocalAccountBindings(requestData) {
  const rows = accountBindingPayloadRows(requestData);
  let removed = 0;
  for (const row of rows) {
    removed += await deleteAccountBinding(row);
  }
  return removed;
}

function accountReadFilters(requestData) {
  const payload = Array.isArray(requestData?.parsedBody) ? requestData.parsedBody[0] || {} : requestData?.parsedBody || {};
  return {
    customerId: String(payload.customerId || "").trim(),
    meterId: String(payload.meterId || "").trim(),
    stationId: String(payload.stationId || payload.SITE_ID || "").trim()
  };
}

function accountBindingKey(row = {}) {
  return `${String(row.customerId || "").trim()}::${String(row.meterId || "").trim()}`;
}

async function mergeLocalAccountBindings(pathname, requestData, result) {
  if (!isAccountReadPath(pathname)) return result;
  const localRows = await listAccountBindings(accountReadFilters(requestData));
  if (!localRows.length) return result;
  const body = result?.body;
  if (!body || typeof body !== "object") {
    return {
      status: 200,
      body: {
        code: 0,
        msg: "success",
        reason: "success",
        data: {
          total: localRows.length,
          data: localRows
        },
        result: {
          total: localRows.length,
          data: localRows
        },
        _proxy: {
          source: "local-fallback",
          pathname
        }
      }
    };
  }
  const liveRows = collectionRowsFromPayload(body);
  const merged = new Map();
  for (const row of liveRows) merged.set(accountBindingKey(row), row);
  for (const row of localRows) merged.set(accountBindingKey(row), { ...merged.get(accountBindingKey(row)), ...row });
  const mergedRows = Array.from(merged.values());
  const mergedBody = JSON.parse(JSON.stringify(body));
  setCollectionRows(mergedBody, mergedRows, mergedRows.length);
  mergedBody._proxy = {
    ...(body._proxy || {}),
    source: body._proxy?.source === "local-fallback" ? "local-fallback" : `${body._proxy?.source || "live"}+local`,
    pathname
  };
  return {
    status: result.status,
    body: mergedBody
  };
}

function localAccountCreateResponse(pathname, rows, lastFailure) {
  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "Account binding stored locally while upstream is unavailable",
      data: {
        stored: true,
        rows,
        mode: "local-fallback"
      },
      result: {
        stored: true,
        rows,
        mode: "local-fallback"
      },
      _proxy: {
        source: "local-fallback",
        pathname,
        upstreamStatus: lastFailure?.status || 0
      }
    }
  };
}

function logProxyFailure(details) {
  console.error("[live-proxy]", JSON.stringify(details));
}

function sampleName(endpointPath) {
  return endpointPath.replace(/^\/+/, "").replace(/[/?&=:]+/g, "__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function normalizeSamplePayload(payload, pathname) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const normalized = { ...payload };
  if (!("msg" in normalized) && "reason" in normalized) normalized.msg = normalized.reason;
  if (!("reason" in normalized) && "msg" in normalized) normalized.reason = normalized.msg;
  if (!("data" in normalized) && "result" in normalized) normalized.data = normalized.result;
  if (!("result" in normalized) && "data" in normalized) normalized.result = normalized.data;
  normalized._proxy = {
    source: "sample",
    pathname
  };
  return normalized;
}

function collectionRowsFromPayload(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function setCollectionRows(payload, rows, total) {
  if (payload?.result?.data && Array.isArray(payload.result.data)) {
    payload.result = { ...payload.result, total, data: rows };
  }
  if (payload?.data?.data && Array.isArray(payload.data.data)) {
    payload.data = { ...payload.data, total, data: rows };
  }
  if (Array.isArray(payload?.result)) payload.result = rows;
  if (Array.isArray(payload?.data)) payload.data = rows;
  return payload;
}

function declaredCollectionTotal(payload, fallbackTotal) {
  const candidates = [
    payload?.result?.total,
    payload?.data?.total,
    payload?.total,
    payload?.result?.count,
    payload?.data?.count,
    payload?.count
  ];
  for (const value of candidates) {
    const total = Number(value);
    if (Number.isFinite(total) && total >= fallbackTotal) return total;
  }
  return fallbackTotal;
}

function syntheticRowValue(value, rowNumber) {
  if (value === null || typeof value === "undefined" || value === "") return value;
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const nextValue = BigInt(text) + BigInt(rowNumber);
    return nextValue.toString().padStart(text.length, "0");
  }
  return `${text} ${rowNumber}`;
}

function synthesizeSampleRow(row, pathname, rowIndex) {
  const clone = { ...row };
  const rowNumber = rowIndex + 1;
  if (clone.id != null) clone.id = syntheticRowValue(clone.id, rowNumber);
  return clone;
}

function expandSampleRows(pathname, rows, total) {
  if (!rows.length || total <= rows.length) return rows;
  const boundedTotal = Math.min(total, 5000);
  return Array.from({ length: boundedTotal }, (_, index) => synthesizeSampleRow(rows[index % rows.length], pathname, index));
}

function filterSampleRows(pathname, rows, requestData, declaredTotal = rows.length) {
  const payload = Array.isArray(requestData?.parsedBody) ? requestData.parsedBody[0] || {} : requestData?.parsedBody || {};
  let filtered = expandSampleRows(pathname, rows, declaredTotal);

  const stationId = payload.stationId || payload.SITE_ID || "";
  if (stationId) {
    filtered = filtered.filter((row) => String(row.stationId || row.station || "").toUpperCase() === String(stationId).toUpperCase());
  }

  if (pathname === "/api/item/read") {
    const query = String(payload.itemType || payload.type || payload.keyword || "").trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((row) =>
        String(row.itemType || "").toLowerCase().includes(query)
        || String(row.itemName || "").toLowerCase().includes(query)
        || String(row.en || "").toLowerCase().includes(query)
      );
    }
  }

  const pageNumber = Math.max(1, Number(payload.pageNumber || 1));
  const pageSize = Math.max(1, Number(payload.pageSize || filtered.length || 20));
  const start = (pageNumber - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length
  };
}

function sampleReadResponse(pathname, requestData) {
  if (requiresLiveRead(pathname)) return null;
  for (const candidate of candidatePaths(pathname)) {
    const filePath = path.join(samplesDir, `${sampleName(candidate)}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const sampleFile = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const normalized = normalizeSamplePayload(sampleFile.body, pathname);
      if (!normalized) continue;
      const rows = collectionRowsFromPayload(normalized);
      if (rows.length) {
        const page = filterSampleRows(pathname, rows, requestData, declaredCollectionTotal(normalized, rows.length));
        setCollectionRows(normalized, page.rows, page.total);
      }
      return {
        status: Number(sampleFile.status || 200),
        body: normalized
      };
    } catch {
      continue;
    }
  }
  return null;
}

function syntheticSampleResponse(sourcePathname, requestData, facadePathname) {
  const sample = sampleReadResponse(sourcePathname, requestData);
  if (!sample) return null;
  return {
    ...sample,
    body: {
      ...sample.body,
      _proxy: {
        ...(sample.body?._proxy || {}),
        source: sample.body?._proxy?.source || "sample",
        pathname: facadePathname
      }
    }
  };
}

async function cacheResponseIfNeeded(request, pathname, requestData, result) {
  if (!apiCacheEnabled() || !isCacheableRequest(pathname, request.method) || result.status >= 400) return;
  await cacheApiResponse({
    method: request.method || "GET",
    path: pathname,
    requestKey: buildCacheKey(request, requestData),
    status: result.status,
    source: result.body?._proxy?.source || "unknown",
    body: result.body
  });
}

async function cachedReadResponse(request, pathname, requestData) {
  if (!apiCacheEnabled() || !isCacheableRequest(pathname, request.method)) return null;
  const cached = await readCachedApiResponse({
    method: request.method || "GET",
    path: pathname,
    requestKey: buildCacheKey(request, requestData)
  });
  if (!cached) return null;
  return {
    status: cached.status,
    body: {
      ...(cached.body || {}),
      _proxy: {
        ...(cached.body?._proxy || {}),
        source: "cache",
        pathname
      }
    }
  };
}

async function recordWriteArtifacts(pathname, requestData, status) {
  const payload = Array.isArray(requestData.parsedBody) ? requestData.parsedBody[0] || {} : requestData.parsedBody || {};
  await recordWriteConfirmation({
    endpoint: pathname,
    action: payload.action || pathname.split("/").pop() || "write",
    confirmationText: payload.confirmationText || "",
    authorizationProvided: Boolean(payload.authorizationProvided || payload.authorizationPassword),
    status: status < 400 ? "completed" : "blocked",
    details: payload
  });
  if (/\/import\b/i.test(pathname)) {
    await recordImportJob({
      routeHash: payload.routeHash || "",
      fileName: payload.fileName || "unknown",
      rowCount: Array.isArray(payload.rows) ? payload.rows.length : Array.isArray(payload.items) ? payload.items.length : 0,
      status: status < 400 ? "completed" : "blocked",
      details: payload
    });
  }
  if (/\/upload\b/i.test(pathname)) {
    const file = payload._file || null;
    const uploadArtifact = await saveArtifact({
      bucket: "uploads",
      routeHash: payload.routeHash || "#/remote-support/file-upload",
      filename: file?.name || payload.fileName || "upload.bin",
      content: file?.buffer || requestData.rawBody,
      contentType: file?.contentType || payload.contentType || requestData.contentType || "application/octet-stream"
    });
    const details = { ...payload };
    delete details._file;
    await recordImportJob({
      routeHash: payload.routeHash || "#/remote-support/file-upload",
      fileName: file?.name || payload.fileName || "upload",
      rowCount: 1,
      status: status < 400 ? "completed" : "blocked",
      storageBucket: uploadArtifact?.bucket,
      storagePath: uploadArtifact?.path,
      details: { ...details, kind: "upload", storage: uploadArtifact }
    });
  }
}

function localJobResponse(body) {
  return {
    status: 200,
    body: {
      code: 200,
      msg: "success",
      reason: "success",
      data: body,
      result: body,
      _proxy: {
        source: "local-db",
        pathname: "/api/local"
      }
    }
  };
}

function isTokenGeneratePath(pathname) {
  return /^\/api\/token\/(?:creditToken|clearCreditToken|clearTamperToken|setMaximumPowerLimitToken)\/generate$/i.test(String(pathname || ""));
}

function localPreviewToken(pathname, payload = {}) {
  const seed = [
    pathname,
    payload.customerId,
    payload.meterId,
    payload.amount,
    payload.totalUnit,
    payload.maximumPower
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const numeric = `${hash}${Date.now()}`.replace(/\D/g, "").padEnd(20, "0").slice(0, 20);
  return numeric.match(/.{1,4}/g).join(" ");
}

function localTokenPreviewResponse(pathname, payload = {}) {
  const now = new Date().toISOString();
  const body = {
    receiptId: `PREVIEW-${Date.now()}`,
    customerId: payload.customerId || "",
    meterId: payload.meterId || "",
    tariffId: payload.tariffId || "",
    totalPaid: payload.amount || payload.totalPaid || "",
    totalUnit: payload.totalUnit || "",
    maximumPower: payload.maximumPower || "",
    token: localPreviewToken(pathname, payload),
    status: true,
    vend: "Preview",
    createTime: now,
    createDate: now,
    reason: "preview"
  };

  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: body,
      result: body,
      _proxy: {
        source: "local-token-preview",
        pathname
      }
    }
  };
}

function configuredConsumptionBackfillFrom() {
  return process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01";
}

function readConsumptionBackfillProgress() {
  const progressPath = path.join(root, "tmp", "consumption-backfill-progress.json");
  try {
    return JSON.parse(fs.readFileSync(progressPath, "utf8"));
  } catch {
    return { stations: {} };
  }
}

function readConsumptionLiveUniqueAudit() {
  const auditPath = path.join(root, "tmp", "consumption-live-unique-audit.json");
  try {
    const payload = JSON.parse(fs.readFileSync(auditPath, "utf8"));
    const stations = Array.isArray(payload?.stations) ? payload.stations : [];
    return {
      generatedAt: payload?.generatedAt || null,
      stations: new Map(stations.map((station) => [String(station.station || "").toUpperCase(), station])),
    };
  } catch {
    return {
      generatedAt: null,
      stations: new Map(),
    };
  }
}

function dayDiff(from, to) {
  if (!from || !to) return null;
  const fromTime = new Date(`${from}T00:00:00.000Z`).getTime();
  const toTime = new Date(`${to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.max(0, Math.round((toTime - fromTime) / 86400000));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function classifyFreshness(latestReadingDate) {
  if (!latestReadingDate) return { status: "missing", staleDays: null };
  const staleDays = dayDiff(latestReadingDate, todayKey());
  if (staleDays == null) return { status: "unknown", staleDays: null };
  if (staleDays <= 1) return { status: "fresh", staleDays };
  if (staleDays <= 3) return { status: "aging", staleDays };
  return { status: "stale", staleDays };
}

function classifyCoverage(earliestReadingDate, configuredFrom) {
  if (!earliestReadingDate) {
    return { status: "missing", gapDays: null };
  }
  const gapDays = dayDiff(configuredFrom, earliestReadingDate);
  if (gapDays == null) return { status: "unknown", gapDays: null };
  return {
    status: gapDays === 0 ? "full" : "partial",
    gapDays,
  };
}

function expectedMidnightSyncDate(now = new Date()) {
  return previousDayRange(now).to;
}

function classifyMidnightSync(latestReadingDate, expectedDate) {
  if (!latestReadingDate) return { status: "missing", expectedDate, lagDays: null };
  const lagDays = dayDiff(latestReadingDate, expectedDate);
  if (lagDays == null) return { status: "unknown", expectedDate, lagDays: null };
  return {
    status: lagDays <= 0 ? "synced" : "missed",
    expectedDate,
    lagDays: Math.max(0, lagDays),
  };
}

function classifyBackfillDrift(deltaStoreVsLive, deltaStoreVsProgress) {
  const liveDrift = deltaStoreVsLive != null && Number(deltaStoreVsLive) !== 0;
  const progressDrift = deltaStoreVsProgress != null && Number(deltaStoreVsProgress) !== 0;
  return {
    status: liveDrift || progressDrift ? "drift" : "clear",
    liveDelta: deltaStoreVsLive,
    progressDelta: deltaStoreVsProgress,
  };
}

async function fetchLiveDailyMeterTotal(stationId) {
  const env = getEnv();
  if (!env.liveProxyEnabled || !env.liveBaseUrl) return null;
  
  const axios = require("axios");
  const http = require("http");
  const https = require("https");
  
  if (!global.liveAxios) {
    global.liveAxios = axios.create({
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
      validateStatus: () => true
    });
  }

  const payload = {
    lang: "en",
    stationId,
    FROM: configuredConsumptionBackfillFrom(),
    TO: todayKey(),
    pageNumber: 1,
    pageSize: 1,
    compact: true,
  };

  const requestData = {
    parsedBody: payload,
    rawBody: Buffer.from(JSON.stringify(payload)),
    contentType: jsonContentType,
  };
  const token = env.liveBearerToken ? `Bearer ${env.liveBearerToken}` : "";
  const liveUrl = `${env.liveBaseUrl}/api/DailyDataMeter/read`;

  const request = { method: "POST", headers: { accept: jsonContentType } };
  
  const response = await global.liveAxios({
    method: "POST",
    url: liveUrl,
    headers: buildLiveHeaders(request, requestData, token),
    data: requestData.rawBody,
    responseType: "text"
  });

  let payloadBody;
  const contentTypeHeader = String(response.headers["content-type"] || "");
  if (contentTypeHeader.includes("application/json")) {
    try { payloadBody = JSON.parse(response.data); } catch { payloadBody = { raw: response.data }; }
  } else {
    payloadBody = { raw: response.data };
  }

  if (response.status < 200 || response.status >= 300 || hasBusinessFailure(payloadBody)) {
    throw new Error(`Live total read failed for ${stationId}`);
  }
  return Number(payloadBody?.result?.total ?? payloadBody?.data?.total ?? 0);
}

async function buildConsumptionAudit() {
  const progress = readConsumptionBackfillProgress();
  const uniqueAudit = readConsumptionLiveUniqueAudit();
  const configuredFrom = configuredConsumptionBackfillFrom();
  const generatedAt = new Date().toISOString();
  const midnightExpectedDate = expectedMidnightSyncDate();
  const stats = await dailyMeterStationStats();
  if (!stats.tableReady) {
    return {
      enabled: stats.enabled,
      tableReady: false,
      configuredFrom,
      generatedAt,
      stations: [],
      overall: {
        completenessStatus: "unknown",
        freshnessStatus: "unknown",
        coverageStatus: "unknown",
        midnightSyncStatus: "unknown",
        backfillDriftStatus: "unknown",
      },
      alerts: [{
        severity: "critical",
        type: "sync-failure",
        station: null,
        title: "Consumption store unavailable",
        message: stats.error || "Consumption store is not ready",
      }],
      syncLogs: [],
      warnings: [stats.error || "Consumption store is not ready"],
    };
  }

  const stations = [];
  for (const stationStat of stats.stations) {
    const stationId = stationStat.station;
    const progressStation = progress?.stations?.[stationId] || {};
    const uniqueStation = uniqueAudit.stations.get(stationId) || null;
    let liveTotalRows = null;
    let liveError = null;
    let liveMetric = "unavailable";
    if (uniqueStation?.uniqueTotal != null) {
      liveTotalRows = Number(uniqueStation.uniqueTotal);
      liveMetric = "unique";
    } else {
      try {
        liveTotalRows = await fetchLiveDailyMeterTotal(stationId);
        liveMetric = "raw";
      } catch (error) {
        liveError = error instanceof Error ? error.message : String(error);
      }
    }

    const latestReadingDate = stationStat.latestReadingDate || uniqueStation?.latestReadingDate || null;
    const earliestReadingDate = stationStat.earliestReadingDate || uniqueStation?.earliestReadingDate || null;
    const freshness = classifyFreshness(latestReadingDate);
    const effectiveCoverageStart = earliestReadingDate || configuredFrom;
    const coverage = classifyCoverage(earliestReadingDate, effectiveCoverageStart);
    const storeRows = Number(stationStat.rows || 0);
    const logicalRawRows = Number(stationStat.logicalRawRows || storeRows);
    const progressTotalRows = Number(progressStation.totalRows || 0) || null;
    const progressStoredRows = Number(progressStation.storedRows || 0) || null;
    const auditRows = liveMetric === "raw" ? logicalRawRows : storeRows;
    const deltaStoreVsLive = liveTotalRows == null ? null : auditRows - liveTotalRows;
    const deltaStoreVsProgress = progressTotalRows == null ? null : storeRows - progressTotalRows;
    const midnightSync = classifyMidnightSync(latestReadingDate, midnightExpectedDate);
    const backfillDrift = classifyBackfillDrift(deltaStoreVsLive, deltaStoreVsProgress);
    const warnings = [];

    let completenessStatus = "unknown";
    if (liveTotalRows != null) {
      if (liveMetric === "unique") {
        completenessStatus = deltaStoreVsLive === 0 ? "complete" : "incomplete";
        if (deltaStoreVsLive !== 0) {
          warnings.push(`${stationId}: store differs from live unique rows by ${deltaStoreVsLive}.`);
        }
      } else {
        completenessStatus = deltaStoreVsLive === 0 ? "complete" : "unverified";
        if (deltaStoreVsLive !== 0) {
          warnings.push(`${stationId}: raw live total differs from store by ${deltaStoreVsLive}.`);
        }
      }
    } else if (progressTotalRows != null) {
      completenessStatus = deltaStoreVsProgress === 0 ? "complete" : "needs-review";
      if (deltaStoreVsProgress !== 0) {
        warnings.push(`${stationId}: store differs from progress by ${deltaStoreVsProgress}.`);
      }
    }

    if (progressStation.complete && progressStoredRows != null && progressStoredRows !== storeRows) {
      warnings.push(`${stationId}: progress marked complete, but stored rows drift by ${storeRows - progressStoredRows}.`);
    }
    if (coverage.status === "partial" && coverage.gapDays > 0) {
      warnings.push(`${stationId}: earliest reading starts ${coverage.gapDays} days after ${configuredFrom}.`);
    }
    if (freshness.status === "aging" || freshness.status === "stale") {
      warnings.push(`${stationId}: latest reading is ${freshness.staleDays} days behind today.`);
    }
    if (midnightSync.status === "missed" || midnightSync.status === "missing") {
      warnings.push(`${stationId}: midnight sync missing ${midnightExpectedDate}.`);
    }
    if (backfillDrift.status === "drift") {
      warnings.push(`${stationId}: backfill drift requires reconciliation.`);
    }
    if (liveError) warnings.push(`${stationId}: live total audit unavailable.`);

    stations.push({
      station: stationId,
      rows: storeRows,
      rawDuplicateRows: Number(stationStat.rawDuplicateRows || 0),
      logicalRawRows,
      liveTotalRows,
      liveMetric,
      auditedAt: uniqueStation?.auditedAt || uniqueAudit.generatedAt || null,
      progressTotalRows,
      progressStoredRows,
      earliestReadingDate,
      latestReadingDate,
      effectiveCoverageStart,
      completenessStatus,
      deltaStoreVsLive,
      deltaStoreVsProgress,
      freshness,
      coverage,
      midnightSync,
      backfillDrift,
      warnings,
    });
  }

  const overallWarnings = stations.flatMap((station) => station.warnings);
  const alerts = stations.flatMap((station) => {
    const items = [];
    if (station.backfillDrift?.status === "drift") {
      items.push({
        severity: "critical",
        type: "backfill-drift",
        station: station.station,
        title: "Backfill drift detected",
        message: `${station.station} store and audit totals do not match.`,
      });
    }
    if (station.midnightSync?.status === "missed" || station.midnightSync?.status === "missing") {
      items.push({
        severity: "warning",
        type: "midnight-sync",
        station: station.station,
        title: "Midnight sync missed",
        message: `${station.station} has no reading for ${station.midnightSync.expectedDate}.`,
      });
    }
    if (station.liveTotalRows == null) {
      items.push({
        severity: "warning",
        type: "sync-failure",
        station: station.station,
        title: "Live audit unavailable",
        message: `${station.station} live total check could not complete.`,
      });
    }
    return items;
  });
  const syncLogs = stations.map((station) => ({
    station: station.station,
    generatedAt,
    latestReadingDate: station.latestReadingDate,
    expectedMidnightDate: station.midnightSync?.expectedDate || midnightExpectedDate,
    midnightStatus: station.midnightSync?.status || "unknown",
    backfillStatus: station.backfillDrift?.status || "unknown",
    deltaStoreVsLive: station.deltaStoreVsLive,
    deltaStoreVsProgress: station.deltaStoreVsProgress,
    liveMetric: station.liveMetric,
  }));
  const overall = {
    completenessStatus: stations.every((station) => station.completenessStatus === "complete")
      ? "complete"
      : stations.some((station) => station.completenessStatus === "incomplete" || station.completenessStatus === "needs-review")
        ? "incomplete"
        : stations.some((station) => station.completenessStatus === "estimated-match" || station.completenessStatus === "unverified")
          ? "unverified"
        : "unknown",
    freshnessStatus: stations.every((station) => station.freshness.status === "fresh")
      ? "fresh"
      : stations.some((station) => station.freshness.status === "stale" || station.freshness.status === "aging")
        ? "stale"
        : "unknown",
    coverageStatus: stations.every((station) => station.coverage.status === "full")
      ? "full"
      : stations.some((station) => station.coverage.status === "partial")
        ? "partial"
        : "unknown",
    midnightSyncStatus: stations.every((station) => station.midnightSync.status === "synced")
      ? "synced"
      : stations.some((station) => station.midnightSync.status === "missed" || station.midnightSync.status === "missing")
        ? "attention"
        : "unknown",
    backfillDriftStatus: stations.every((station) => station.backfillDrift.status === "clear")
      ? "clear"
      : stations.some((station) => station.backfillDrift.status === "drift")
        ? "drift"
        : "unknown",
    totalRows: stats.totalRows,
    earliestReadingDate: stations.map((station) => station.earliestReadingDate).filter(Boolean).sort()[0] || null,
    latestReadingDate: stations.map((station) => station.latestReadingDate).filter(Boolean).sort().slice(-1)[0] || null,
  };

  return {
    enabled: true,
    tableReady: true,
    configuredFrom,
    generatedAt,
    expectedMidnightDate: midnightExpectedDate,
    liveAuditMode: uniqueAudit.stations.size ? "mixed-audit" : "raw-live-total",
    verificationStatus: stations.every((station) => station.liveMetric === "unique")
      ? "verified"
      : stations.some((station) => station.liveMetric === "unique")
        ? "partial"
        : "raw-only",
    overall,
    stations,
    alerts,
    syncLogs,
    warnings: overallWarnings,
  };
}

async function loginResponse(payload) {
  if (supabaseAuthEnabled()) {
    const supabaseResult = await signInWithPassword(payload);
    if (supabaseResult?.status === 200) return supabaseResult;
    if (!getEnv().demoAuthEnabled) return supabaseResult;
  }

  const userId = String(payload.userId || payload.username || "").trim() || "admin";
  const password = String(payload.password || "");
  const normalizedUserId = userId === "admin@acoblighting.com" ? "admin" : userId;
  const env = getEnv();
  const allowed = env.demoAuthEnabled && env.demoAuthPassword && normalizedUserId === env.demoAuthUser && password === env.demoAuthPassword;
  if (!allowed) {
    return {
      status: 401,
      body: {
        code: 401,
        msg: "Invalid credentials",
        reason: "Invalid credentials",
        data: null,
        result: null,
        _proxy: {
          source: "local-auth",
          pathname: "/api/user/login"
        }
      }
    };
  }

  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: {
        token: "local-dev-token",
        userId: normalizedUserId,
        userName: "ACB(admin)",
        roleId: "super-admin"
      },
      result: {
        token: "local-dev-token",
        userId: normalizedUserId,
        userName: "ACB(admin)",
        roleId: "super-admin"
      },
      _proxy: {
        source: "local-auth",
        pathname: "/api/user/login"
      }
    }
  };
}

async function dispatchLocalDatabaseAction(request, pathname, requestData) {
  if ((request.method || "GET").toUpperCase() === "GET" && pathname.startsWith("/api/cron/refresh")) {
    if (!cronAuthorized(request)) {
      return {
        status: 401,
        body: {
          code: 401,
          msg: "Unauthorized",
          reason: "Unauthorized",
          data: null,
          result: null,
          _proxy: { source: "cron-auth", pathname }
        }
      };
    }
    return localJobResponse(await runRefreshJob(refreshScopeFromPath(pathname)));
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/cron/governance-daily") {
    if (!cronAuthorized(request)) {
      return {
        status: 401,
        body: {
          code: 401,
          msg: "Unauthorized",
          reason: "Unauthorized",
          data: null,
          result: null,
          _proxy: { source: "cron-auth", pathname }
        }
      };
    }
    return localJobResponse(await runGovernance());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/health") {
    return localJobResponse({
      ok: true,
      service: "reference-api",
      readMode: getEnv().readMode,
      liveProxyEnabled: getEnv().liveProxyEnabled,
      allowLiveWrites: getEnv().allowLiveWrites,
      databasePath: process.env.LOCAL_DB_PATH || "backend/data/reference-crm.sqlite"
    });
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/live-report") {
    const matrixPath = path.join(root, "contracts", "live-route-matrix.json");
    let routeSummary = { routes: 0, liveReady: 0, liveDerived: 0, blocked: 0, guarded: 0, mixed: 0 };
    try {
      const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
      routeSummary = {
        routes: matrix.routes.length,
        liveReady: matrix.routes.filter((route) => route.source === "live-ready").length,
        liveDerived: matrix.routes.filter((route) => route.source === "live-derived").length,
        blocked: matrix.routes.filter((route) => route.source === "blocked").length,
        guarded: matrix.routes.filter((route) => route.source === "guarded-write").length,
        mixed: matrix.routes.filter((route) => route.source === "mixed").length
      };
    } catch {
      routeSummary = { ...routeSummary, mixed: -1 };
    }
    return localJobResponse({
      ok: true,
      service: "reference-api",
      readMode: getEnv().readMode,
      liveProxyEnabled: getEnv().liveProxyEnabled,
      allowLiveWrites: getEnv().allowLiveWrites,
      routeSummary,
      storage: await tableCounts(),
      snapshots: snapshotSchedule()
    });
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/automation-report") {
    return localJobResponse(automationReport());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/automation-control") {
    return localJobResponse(automationControlReport());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/snapshot-schedule") {
    return localJobResponse({
      enabled: process.env.SNAPSHOT_STORE_ENABLED === "true" || process.env.SESSION_STORE_MODE === "supabase",
      schedule: snapshotSchedule()
    });
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/storage-report") {
    return localJobResponse(await storageReport());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/governance-plan") {
    return localJobResponse(governancePlan());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/consumption-store") {
    return localJobResponse(await dailyMeterTableReport());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/system/consumption-audit") {
    return localJobResponse(await buildConsumptionAudit());
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/dashboard/hourly") {
    return syntheticSampleResponse("/api/DailyDataMeter/readHourly", requestData, pathname);
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/dashboard/gprs") {
    return syntheticSampleResponse("/API/GPRSOnlineStatus/Read", requestData, pathname)
      || localJobResponse({ total: 0, data: [] });
  }
  if ((request.method || "GET").toUpperCase() === "GET" && pathname === "/api/dashboard/events") {
    return syntheticSampleResponse("/API/EventNotification/Read", requestData, pathname)
      || localJobResponse({ total: 0, data: [] });
  }
  if (pathname === "/api/webhooks/meter-readings" && (request.method || "GET").toUpperCase() === "POST") {
    const configuredSecret = process.env.WEBHOOK_SECRET;
    const providedSecret = request.headers["x-webhook-secret"] || request.headers["authorization"];
    if (configuredSecret && providedSecret !== configuredSecret && providedSecret !== `Bearer ${configuredSecret}`) {
      return { status: 401, body: { code: 401, msg: "Unauthorized webhook access" } };
    }
    return await ingestWebhookReadings(requestData.parsedBody);
  }
  if (pathname === "/api/local/consumption/summary") {
    return readDailyMeterSummary({ requestPayload: requestData.parsedBody });
  }
  if (pathname === "/api/local/consumption/live-probe") {
    const { runLiveProbe } = require("../backend/src/services/live-probe-engine");
    try {
      const data = await runLiveProbe();
      return {
        status: 200,
        body: {
          code: 0,
          msg: "success",
          data
        }
      };
    } catch (err) {
      return {
        status: 500,
        body: {
          code: 500,
          msg: err.message
        }
      };
    }
  }
  if (pathname === "/api/local/consumption/trigger-sync") {
    const { runSync } = require("../backend/src/services/live-probe-engine");
    try {
      const data = await runSync(requestData.parsedBody?.stationId);
      return {
        status: 200,
        body: {
          code: 0,
          msg: "success",
          data
        }
      };
    } catch (err) {
      return {
        status: 500,
        body: {
          code: 500,
          msg: err.message
        }
      };
    }
  }


  // ── Admin v1 REST endpoints ─────────────────────────────────────────────────
  const methodUpper = (request.method || "GET").toUpperCase();

  function adminQueryParams(url) {
    try { return new URL(String(url || "/"), "http://localhost").searchParams; } catch { return new URLSearchParams(); }
  }
  function adminPathId(prefix) {
    const after = pathname.slice(prefix.length).replace(/^\//, "");
    return after || null;
  }

  // ── GET endpoints ───────────────────────────────────────────────────────────
  // ── Vendor v1 REST GET endpoints ───────────────────────────────────────────
  const DEMO_VENDOR_ORG = "demo-vendor-org-01";

  function vendorOrgId(req) {
    return req.__auth?.organizationId || DEMO_VENDOR_ORG;
  }

  function getOrProvisionVendorWallet(orgId) {
    let w = walletLedger.walletForOrganization(orgId);
    if (!w) {
      try {
        walletLedger.createVendorOrganization({ organizationId: orgId, name: "Demo Vendor" });
        walletLedger.provisionWalletForOrganization({ organizationId: orgId, currency: "NGN", actorId: "system" });
        w = walletLedger.walletForOrganization(orgId);
      } catch {}
    }
    return w;
  }

  if (methodUpper === "GET" && pathname === "/api/v1/vendor/me") {
    const orgId = vendorOrgId(request);
    getOrProvisionVendorWallet(orgId);
    return {
      status: 200,
      body: {
        id: orgId,
        email: "vendor@demo.beverly.ng",
        full_name: "Demo Vendor",
        phone: null,
        vendor_organization_id: orgId,
        organization_name: "Demo Vendor Org",
        role: "vendor_user",
        mfa_enrolled: false,
        password_reset_required: false
      }
    };
  }

  if (methodUpper === "GET" && pathname === "/api/v1/vendor/wallet") {
    const orgId = vendorOrgId(request);
    const w = getOrProvisionVendorWallet(orgId);
    if (!w) return { status: 404, body: { message: "Wallet not found" } };
    try {
      const sum = walletLedger.walletSummary(w.id);
      return localJobResponse({
        wallet_id: w.id,
        currency: w.currency || "NGN",
        status: w.status || "active",
        balance_minor: sum.ledgerBalanceMinor,
        holds_minor: sum.heldBalanceMinor,
        available_minor: sum.availableBalanceMinor,
        daily_cap_minor: null
      });
    } catch {
      return localJobResponse({ wallet_id: w.id, currency: "NGN", status: w.status || "active", balance_minor: 0, holds_minor: 0, available_minor: 0, daily_cap_minor: null });
    }
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/vendor/wallet/ledger")) {
    const orgId = vendorOrgId(request);
    const w = getOrProvisionVendorWallet(orgId);
    const sp = adminQueryParams(request.url);
    const limit = Math.min(Number(sp.get("limit") || 50), 500);
    const entries = w ? walletLedger.ledgerRows(w.id).slice(-limit).reverse().map(e => ({
      id: e.id,
      direction: e.direction,
      amount_minor: e.amountMinor,
      balance_after_minor: 0,
      entry_type: e.entryType,
      reference_type: e.referenceType || null,
      reference_id: e.referenceId || null,
      memo: e.details?.note || null,
      created_at: e.createdAt
    })) : [];
    return localJobResponse({ entries });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/vendor/disputes")) {
    const orgId = vendorOrgId(request);
    const id = adminPathId("/api/v1/vendor/disputes");
    if (id) {
      const all = walletDisputes.listDisputes({ organizationId: orgId, limit: 5000 });
      const dispute = all.find(d => d.id === id) || null;
      const db = require("../backend/src/services/local-database").ensureDatabase();
      let notes = [];
      try {
        if (db.memoryStore) {
          notes = (db.memoryStore.wallet_dispute_notes || []).filter(n => n.disputeId === id);
        } else {
          notes = db.prepare("SELECT * FROM wallet_dispute_notes WHERE dispute_id = ? ORDER BY created_at ASC").all(id)
            .map(n => ({ id: n.id, disputeId: n.dispute_id, note: n.note, actorId: n.actor_id, createdAt: n.created_at }));
        }
      } catch {}
      return localJobResponse({
        dispute,
        messages: notes.map(n => ({ id: n.id, sender_actor_type: n.actorId === "staff" ? "staff" : "vendor", body: n.note, created_at: n.createdAt }))
      });
    }
    const rows = walletDisputes.listDisputes({ organizationId: orgId, limit: 200 });
    const disputes = rows.map(d => ({
      id: d.id,
      reference: d.id.slice(0, 8).toUpperCase(),
      subject: `${(d.disputeType || "other").replace(/_/g, " ")}: ${(d.description || "").slice(0, 60)}`,
      description: d.description,
      status: d.status,
      amount_minor: d.amountMinor,
      created_at: d.createdAt
    }));
    return localJobResponse({ disputes });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/vendor/transactions")) {
    const orgId = vendorOrgId(request);
    const sp = adminQueryParams(request.url);
    const limit = Math.min(Number(sp.get("limit") || 100), 500);
    const w = getOrProvisionVendorWallet(orgId);
    const walletId = w?.id;
    const purchases = walletPurchase.listPurchaseOrders({ actorId: orgId, limit }).map(p => ({
      id: p.id,
      meter_id: p.targetMeter || p.meterId || "—",
      customer_name: p.customerName || null,
      station_id: p.stationId || null,
      amount_minor: p.amountMinor,
      units_kwh: p.unitsKwh || null,
      token: p.token || null,
      purchase_mode: p.mode || "wallet",
      status: p.status,
      delivery_state: p.deliveryState || null,
      created_at: p.createdAt
    }));
    return localJobResponse({ purchases });
  }

  if (methodUpper === "GET" && pathname === "/api/v1/vendor/settlement") {
    const orgId = vendorOrgId(request);
    const all = walletSettlement.listSettlementBatches({ limit: 200 });
    const batches = all.map(b => ({
      id: b.id,
      period_start: b.periodStart || b.createdAt,
      period_end: b.periodEnd || b.updatedAt,
      total_vends: (b.purchaseCount || 0) + (b.fundingCount || 0),
      gross_amount_minor: b.totalPurchaseMinor || 0,
      fee_minor: 0,
      net_amount_minor: b.netMinor || 0,
      status: b.status,
      settled_at: b.status === "settled" ? (b.updatedAt || b.createdAt) : null
    }));
    return localJobResponse({ batches });
  }

  // ── Admin v1 REST GET endpoints ─────────────────────────────────────────────
  if (methodUpper === "GET" && pathname === "/api/v1/admin/funding/pending") {
    const rows = walletFunding.listFundingRequests({ limit: 200 });
    const pending = rows.filter(r => ["proof_uploaded", "under_review"].includes(r.status));
    return localJobResponse({ funding: pending });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/vending")) {
    const sp = adminQueryParams(request.url);
    const status = sp.get("status") || undefined;
    const q = (sp.get("q") || "").toLowerCase();
    let rows = walletPurchase.listPurchaseOrders({ status, limit: 500 });
    if (q) rows = rows.filter(r =>
      (r.meterId || "").toLowerCase().includes(q) ||
      (r.customerName || "").toLowerCase().includes(q)
    );
    return localJobResponse({ purchases: rows });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/disputes")) {
    const id = adminPathId("/api/v1/admin/disputes");
    if (id) {
      const all = walletDisputes.listDisputes({ limit: 5000 });
      const dispute = all.find(d => d.id === id) || null;
      const db = require("../backend/src/services/local-database").ensureDatabase();
      let notes = [];
      try {
        if (db.memoryStore) {
          notes = (db.memoryStore.wallet_dispute_notes || []).filter(n => n.disputeId === id);
        } else {
          notes = db.prepare("SELECT * FROM wallet_dispute_notes WHERE dispute_id = ? ORDER BY created_at ASC").all(id)
            .map(n => ({ id: n.id, disputeId: n.dispute_id, note: n.note, actorId: n.actor_id, createdAt: n.created_at }));
        }
      } catch {}
      return localJobResponse({ dispute, messages: notes.map(n => ({ id: n.id, sender_actor_type: "staff", body: n.note, created_at: n.createdAt })) });
    }
    const sp = adminQueryParams(request.url);
    const status = sp.get("status") || undefined;
    const rows = walletDisputes.listDisputes({ status, limit: 200 });
    return localJobResponse({ disputes: rows, total: rows.length });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/refunds")) {
    const sp = adminQueryParams(request.url);
    const status = sp.get("status") || undefined;
    const rows = walletRefunds.listRefunds({ status, limit: 200 });
    return localJobResponse({ refunds: rows, total: rows.length });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/settlement")) {
    const rows = walletSettlement.listSettlementBatches({ limit: 200 });
    return localJobResponse({ batches: rows, total: rows.length });
  }

  if (methodUpper === "GET" && pathname === "/api/v1/admin/reconciliation") {
    const db = require("../backend/src/services/local-database").ensureDatabase();
    let runs = [];
    try {
      if (db.memoryStore) {
        runs = [...(db.memoryStore.wallet_reconciliation_runs || [])].reverse();
      } else {
        runs = db.prepare("SELECT * FROM wallet_reconciliation_runs ORDER BY created_at DESC LIMIT 100").all()
          .map(r => ({ id: r.id, status: r.status, mismatchCount: r.mismatch_count, details: JSON.parse(r.detail_json || "{}"), createdAt: r.created_at }));
      }
    } catch {}
    return localJobResponse({ runs, total: runs.length });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/feature-flags")) {
    return localJobResponse({ flags: walletFeatureFlags.listFlags() });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/privacy/deletions")) {
    const sp = adminQueryParams(request.url);
    const status = sp.get("status") || undefined;
    return localJobResponse({ requests: walletPrivacy.listDeletionRequests({ status }) });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/vendor-applications")) {
    const sp = adminQueryParams(request.url);
    const status = sp.get("status") || "submitted";
    const seed = [
      { id: "app-001", legal_name: "Sunrise Energy Ltd", contact_name: "Emeka Okonkwo", contact_email: "emeka@sunrise.ng", contact_phone: "+2348011223344", business_type: "retail_energy", operating_stations: ["Lagos Island", "Surulere"], notes: null, status: "submitted", created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: "app-002", legal_name: "GreenPower Co", contact_name: "Fatima Yusuf", contact_email: "f.yusuf@greenpower.ng", contact_phone: "+2348099887766", business_type: "commercial", operating_stations: ["Abuja Central"], notes: "Has existing NERC license", status: "contacted", created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
      { id: "app-003", legal_name: "Bright Connections", contact_name: "Chidi Eze", contact_email: "chidi@bright.ng", contact_phone: "+2349012345678", business_type: "residential", operating_stations: ["Port Harcourt"], notes: null, status: "submitted", created_at: new Date(Date.now() - 1 * 86400000).toISOString() },
    ];
    const filtered = status ? seed.filter(a => a.status === status) : seed;
    return localJobResponse({ applications: filtered });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/vendors")) {
    const sp = adminQueryParams(request.url);
    const statusFilter = sp.get("status") || "";
    const q = (sp.get("q") || "").toLowerCase();
    const seed = [
      { id: "vo-001", legal_name: "Sunrise Energy Ltd", trading_name: "Sunrise Power", contact_email: "ops@sunrise.ng", contact_phone: "+2348011223344", risk_level: "low", status: "approved", approved_at: new Date(Date.now() - 30 * 86400000).toISOString(), created_at: new Date(Date.now() - 45 * 86400000).toISOString() },
      { id: "vo-002", legal_name: "GreenPower Co", trading_name: null, contact_email: "admin@greenpower.ng", contact_phone: "+2348099887766", risk_level: "medium", status: "approved", approved_at: new Date(Date.now() - 10 * 86400000).toISOString(), created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
      { id: "vo-003", legal_name: "Bright Connections", trading_name: null, contact_email: "chidi@bright.ng", contact_phone: "+2349012345678", risk_level: "low", status: "pending", approved_at: null, created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    ];
    let rows = seed;
    if (statusFilter) rows = rows.filter(v => v.status === statusFilter);
    if (q) rows = rows.filter(v => v.legal_name.toLowerCase().includes(q) || v.contact_email.toLowerCase().includes(q));
    return localJobResponse({ vendors: rows });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/fraud")) {
    const sp = adminQueryParams(request.url);
    const resolved = sp.get("resolved");
    const minScore = parseInt(sp.get("min_score") || "0", 10);
    const seed = [
      { id: "fa-001", customer_id: "cust-1", purchase_order_id: "po-1", meter_id: "44120000001", amount_minor: 500000, score: 92, action: "block", resolved: false, resolution_note: null, resolved_at: null, created_at: new Date(Date.now() - 3600000).toISOString(), fraud_signals: [{ id: "s1", signal_type: "amount_spike", weight: 45, detail: "3× normal spend" }, { id: "s2", signal_type: "new_meter", weight: 30, detail: "First vend on meter" }], customers: { users: { full_name: "Musa Abubakar", phone: "+2348012345678" } } },
      { id: "fa-002", customer_id: "cust-2", purchase_order_id: "po-2", meter_id: "44120000002", amount_minor: 200000, score: 72, action: "step_up", resolved: false, resolution_note: null, resolved_at: null, created_at: new Date(Date.now() - 7200000).toISOString(), fraud_signals: [{ id: "s3", signal_type: "rapid_retry", weight: 35, detail: "4 attempts in 10 min" }], customers: { users: { full_name: "Amina Bello", phone: "+2348023456789" } } },
      { id: "fa-003", customer_id: "cust-3", purchase_order_id: "po-3", meter_id: "44120000003", amount_minor: 100000, score: 55, action: "step_up", resolved: true, resolution_note: "Customer verified via phone", resolved_at: new Date(Date.now() - 1800000).toISOString(), created_at: new Date(Date.now() - 10800000).toISOString(), fraud_signals: [{ id: "s4", signal_type: "location_change", weight: 25, detail: "Different LGA than usual" }], customers: { users: { full_name: "Chukwuemeka Obi", phone: "+2349034567890" } } },
    ];
    let rows = seed.filter(a => a.score >= minScore);
    if (resolved === "true") rows = rows.filter(a => a.resolved === true);
    else if (resolved === "false") rows = rows.filter(a => a.resolved === false);
    return localJobResponse({ assessments: rows });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/meter-orders")) {
    const sp = adminQueryParams(request.url);
    const statusFilter = sp.get("status") || "";
    const seed = [
      { id: "mo-001", meter_type: "single_phase", property_address: "12 Broad St, Lagos Island", service_area: "Lagos Island", contact_phone: "+2348011223344", amount_minor: 8500000, status: "paid", payment_reference: "PAY-001", technician_name: null, notes: null, created_at: new Date(Date.now() - 5 * 86400000).toISOString(), updated_at: new Date(Date.now() - 4 * 86400000).toISOString(), customers: { users: { full_name: "Tunde Adeyemi", email: "tunde@example.com", phone: "+2348011223344" } } },
      { id: "mo-002", meter_type: "three_phase", property_address: "45 Adeola Odeku, Victoria Island", service_area: "Victoria Island", contact_phone: "+2349099887766", amount_minor: 18000000, status: "pending_payment", payment_reference: "PAY-002", technician_name: null, notes: "Commercial property", created_at: new Date(Date.now() - 2 * 86400000).toISOString(), updated_at: new Date(Date.now() - 2 * 86400000).toISOString(), customers: { users: { full_name: "Ngozi Okafor", email: "ngozi@biz.ng", phone: "+2349099887766" } } },
    ];
    const rows = statusFilter ? seed.filter(o => o.status === statusFilter) : seed;
    return localJobResponse({ orders: rows });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/audit/summary")) {
    return localJobResponse({ counts: [
      { action: "purchase_order.created", count: 47 },
      { action: "funding.approved", count: 12 },
      { action: "dispute.opened", count: 5 },
      { action: "refund.approved", count: 3 },
      { action: "vendor.status_changed", count: 2 },
    ]});
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/audit")) {
    return localJobResponse({ entries: [], nextCursor: null });
  }

  if (methodUpper === "GET" && pathname.startsWith("/api/v1/admin/security-events")) {
    return localJobResponse({ events: [] });
  }

  // ── PATCH endpoints ─────────────────────────────────────────────────────────
  if (methodUpper === "PATCH" && pathname.startsWith("/api/v1/admin/disputes/")) {
    const id = adminPathId("/api/v1/admin/disputes");
    const body = requestData.parsedBody || {};
    const actorId = request.__auth?.userId || "staff";
    try {
      if (body.status) walletDisputes.updateDisputeStatus({ disputeId: id, status: body.status, resolutionNote: body.resolution_note || "", actorId });
      if (body.message) walletDisputes.addNote({ disputeId: id, note: body.message, actorId });
      return localJobResponse({ updated: true });
    } catch (e) {
      return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
    }
  }

  if (methodUpper === "PATCH" && pathname.startsWith("/api/v1/admin/feature-flags/")) {
    const key = decodeURIComponent(adminPathId("/api/v1/admin/feature-flags") || "");
    const body = requestData.parsedBody || {};
    try {
      return localJobResponse(walletFeatureFlags.updateFlag(key, body));
    } catch (e) {
      return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
    }
  }

  if (methodUpper === "PATCH" && pathname.startsWith("/api/v1/admin/privacy/deletions/")) {
    const id = adminPathId("/api/v1/admin/privacy/deletions");
    const body = requestData.parsedBody || {};
    const actorId = request.__auth?.userId || "staff";
    try {
      return localJobResponse(walletPrivacy.reviewDeletionRequest({ id, approve: body.approve, note: body.note, actorId }));
    } catch (e) {
      return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
    }
  }

  if (methodUpper === "PATCH" && pathname.match(/^\/api\/v1\/admin\/vendors\/[^/]+\/status$/)) {
    return localJobResponse({ updated: true });
  }

  if (methodUpper === "PATCH" && pathname.match(/^\/api\/v1\/admin\/fraud\/[^/]+\/resolve$/)) {
    return localJobResponse({ resolved: true });
  }

  if (methodUpper === "PATCH" && pathname.match(/^\/api\/v1\/admin\/meter-orders\/[^/]+$/)) {
    return localJobResponse({ updated: true });
  }

  if (methodUpper === "GET" && pathname === "/api/auth/mfa/factors") {
    return localJobResponse({ factors: [] });
  }

  if ((request.method || "GET").toUpperCase() !== "POST") return null;
  const payload = requestData.parsedBody || {};
  if (pathname === "/api/notifications/sms/status") {
    try {
      return localJobResponse(smsNotifications.recordSmsStatusCallback({ request, pathname, payload }));
    } catch (error) {
      const status = Number(error.status || 500);
      return {
        status,
        body: {
          code: status,
          msg: error instanceof Error ? error.message : "SMS status callback failed",
          reason: error instanceof Error ? error.message : "SMS status callback failed",
          data: null,
          result: null,
          _proxy: { source: "twilio-status-callback", pathname }
        }
      };
    }
  }
  if (pathname === "/api/notifications/sms/send") {
    try {
      return localJobResponse(await smsNotifications.sendSmsNotification(payload));
    } catch (error) {
      const status = Number(error.status || (/configured|required|must be/i.test(String(error.message || "")) ? 400 : 502));
      return {
        status,
        body: {
          code: status,
          msg: error instanceof Error ? error.message : "SMS send failed",
          reason: error instanceof Error ? error.message : "SMS send failed",
          data: null,
          result: null,
          details: error.details || null,
          _proxy: { source: "twilio-send", pathname }
        }
      };
    }
  }
  if (pathname === "/api/notifications/sms/list") {
    return localJobResponse(smsNotifications.listSmsNotifications(payload));
  }
  if (pathname === "/api/notifications/verify/send") {
    try {
      return localJobResponse(await smsNotifications.sendVerification(payload));
    } catch (error) {
      const status = Number(error.status || (/configured|required|must be/i.test(String(error.message || "")) ? 400 : 502));
      return {
        status,
        body: {
          code: status,
          msg: error instanceof Error ? error.message : "Verification send failed",
          reason: error instanceof Error ? error.message : "Verification send failed",
          data: null,
          result: null,
          details: error.details || null,
          _proxy: { source: "twilio-verify-send", pathname }
        }
      };
    }
  }
  if (pathname === "/api/notifications/verify/check") {
    try {
      return localJobResponse(await smsNotifications.checkVerification(payload));
    } catch (error) {
      const status = Number(error.status || (/configured|required|must be/i.test(String(error.message || "")) ? 400 : 502));
      return {
        status,
        body: {
          code: status,
          msg: error instanceof Error ? error.message : "Verification check failed",
          reason: error instanceof Error ? error.message : "Verification check failed",
          data: null,
          result: null,
          details: error.details || null,
          _proxy: { source: "twilio-verify-check", pathname }
        }
      };
    }
  }
  if (isTokenGeneratePath(pathname) && payload.isPreview !== false) {
    return localTokenPreviewResponse(pathname, payload);
  }
  if (pathname === "/api/vendor/organization/create") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletLedger.createVendorOrganization({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/vendor/organization/approve") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    const organization = walletLedger.updateVendorStatus(payload.organizationId, "active", actorId);
    const wallet = walletLedger.provisionWalletForOrganization({
      organizationId: payload.organizationId,
      actorId
    });
    return localJobResponse({
      organization,
      wallet,
      walletSummary: walletLedger.walletSummary(wallet.id)
    });
  }
  if (pathname === "/api/vendor/onboarding/submit") {
    const actorId = request.__auth?.userId || payload.actorId || "vendor-user";
    return localJobResponse(vendorOnboarding.submitOnboarding({ ...payload, actorId }));
  }
  if (pathname === "/api/vendor/onboarding/document") {
    const actorId = request.__auth?.userId || payload.actorId || "vendor-user";
    return localJobResponse(vendorOnboarding.attachDocument({ ...payload, actorId }));
  }
  if (pathname === "/api/vendor/onboarding/review") {
    const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
    return localJobResponse(vendorOnboarding.reviewOnboarding({ ...payload, actorId }));
  }
  if (pathname === "/api/vendor/onboarding/list") {
    const rows = vendorOnboarding.listOnboardingSubmissions(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/summary") {
    const wallet = payload.walletId
      ? walletLedger.walletById(payload.walletId)
      : walletLedger.walletForOrganization(payload.organizationId);
    if (!wallet) {
      return {
        status: 404,
        body: {
          code: 404,
          msg: "Wallet not found",
          reason: "Wallet not found",
          data: null,
          result: null,
          _proxy: { source: "wallet", pathname }
        }
      };
    }
    return localJobResponse(walletLedger.walletSummary(wallet.id));
  }
  if (pathname === "/api/wallet/funding/create") {
    const actorId = request.__auth?.userId || payload.actorId || payload.requestedBy || "system";
    return localJobResponse(walletFunding.createFundingRequest({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/funding/upload-proof") {
    const actorId = request.__auth?.userId || payload.actorId || payload.uploadedBy || "system";
    return localJobResponse(walletFunding.uploadFundingProof({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/funding/approve") {
    const actorId = request.__auth?.userId || payload.actorId || payload.reviewedBy || "system";
    return localJobResponse(walletFunding.approveFundingRequest({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/funding/reject") {
    const actorId = request.__auth?.userId || payload.actorId || payload.reviewedBy || "system";
    return localJobResponse(walletFunding.rejectFundingRequest({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/funding/list") {
    return localJobResponse({
      rows: walletFunding.listFundingRequests(payload),
      total: walletFunding.listFundingRequests(payload).length
    });
  }
  if (pathname === "/api/wallet/purchase/create") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletPurchase.createPurchaseOrder({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/purchase/complete-token") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletPurchase.completeTokenPurchase({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/purchase/remote-pending") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletPurchase.markRemoteSendPending({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/purchase/complete-remote") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletPurchase.completeRemoteSend({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/purchase/fail") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletPurchase.failPurchase({
      ...payload,
      actorId
    }));
  }
  if (pathname === "/api/wallet/purchase/detail") {
    return localJobResponse(walletPurchase.purchaseDetail(payload.purchaseOrderId));
  }
  if (pathname === "/api/wallet/purchase/list") {
    const rows = walletPurchase.listPurchaseOrders(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/freeze") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletLedger.freezeWallet({
      walletId: payload.walletId,
      actorId,
      reason: payload.reason || "manual_freeze"
    }));
  }
  if (pathname === "/api/wallet/unfreeze") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletLedger.unfreezeWallet({
      walletId: payload.walletId,
      actorId,
      reason: payload.reason || "manual_unfreeze"
    }));
  }
  if (pathname === "/api/wallet/ledger/list") {
    const wallet = payload.walletId
      ? walletLedger.walletById(payload.walletId)
      : walletLedger.walletForOrganization(payload.organizationId);
    if (!wallet) {
      return localJobResponse({ rows: [], total: 0 });
    }
    const rows = walletLedger.ledgerRows(wallet.id);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/manual-credit/request") {
    const actorId = request.__auth?.userId || payload.actorId || "system";
    return localJobResponse(walletApproval.requestManualCredit({
      ...payload,
      actorId,
      idempotencyKey: payload.idempotencyKey || `manual-credit:${payload.organizationId}:${payload.amountMinor}:${Date.now()}`
    }));
  }
  if (pathname === "/api/wallet/manual-credit/approve") {
    const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
    return localJobResponse(walletApproval.approveManualCredit({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/manual-credit/reject") {
    const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
    return localJobResponse(walletApproval.rejectManualCredit({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/manual-credit/list") {
    const rows = walletApproval.listApprovalRequests(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/reconciliation/report") {
    return localJobResponse(walletReconciliation.reportSummary(payload));
  }
  if (pathname === "/api/wallet/reconciliation/run") {
    return localJobResponse(walletReconciliation.runReconciliation());
  }
  // Disputes
  if (pathname === "/api/wallet/disputes/list") {
    const rows = walletDisputes.listDisputes(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/disputes/summary") {
    return localJobResponse(walletDisputes.disputeSummary());
  }
  if (pathname === "/api/wallet/disputes/open") {
    const actorId = request.__auth?.userId || payload.actorId || "staff";
    return localJobResponse(walletDisputes.openDispute({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/disputes/update-status") {
    const actorId = request.__auth?.userId || payload.actorId || "staff";
    return localJobResponse(walletDisputes.updateDisputeStatus({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/disputes/add-note") {
    const actorId = request.__auth?.userId || payload.actorId || "staff";
    return localJobResponse(walletDisputes.addNote({ ...payload, actorId }));
  }
  // Refunds
  if (pathname === "/api/wallet/refunds/list") {
    const rows = walletRefunds.listRefunds(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/refunds/summary") {
    return localJobResponse(walletRefunds.refundSummary());
  }
  if (pathname === "/api/wallet/refunds/request") {
    const actorId = request.__auth?.userId || payload.actorId || "staff";
    return localJobResponse(walletRefunds.requestRefund({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/refunds/approve") {
    const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
    return localJobResponse(walletRefunds.approveRefund({ ...payload, actorId }));
  }
  if (pathname === "/api/wallet/refunds/reject") {
    const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
    return localJobResponse(walletRefunds.rejectRefund({ ...payload, actorId }));
  }
  // Settlement
  if (pathname === "/api/wallet/settlement/list") {
    const rows = walletSettlement.listSettlementBatches(payload);
    return localJobResponse({ rows, total: rows.length });
  }
  if (pathname === "/api/wallet/settlement/summary") {
    return localJobResponse(walletSettlement.settlementSummary());
  }
  if (pathname === "/api/wallet/settlement/generate") {
    const initiatedBy = request.__auth?.userId || payload.initiatedBy || "staff";
    return localJobResponse(walletSettlement.generateSettlementBatch({ ...payload, initiatedBy }));
  }
  if (pathname === "/api/wallet/settlement/settle") {
    const actorId = request.__auth?.userId || payload.actorId || "staff";
    return localJobResponse(walletSettlement.settleSettlementBatch({ ...payload, actorId }));
  }
  // ── Vendor v1 REST POST endpoints ───────────────────────────────────────────
  if (pathname === "/api/v1/vendor/logout") {
    return localJobResponse({ ok: true });
  }

  if (pathname === "/api/v1/vendor/password-change") {
    const { currentPassword, newPassword } = payload;
    if (!newPassword || String(newPassword).length < 8) {
      return { status: 400, body: { code: 400, msg: "New password must be at least 8 characters", reason: "validation_error", data: null, result: null, _proxy: { source: "local", pathname } } };
    }
    return localJobResponse({ ok: true });
  }

  if (pathname === "/api/v1/vendor/disputes") {
    const orgId = (request.__auth?.organizationId) || "demo-vendor-org-01";
    const actorId = request.__auth?.userId || orgId;
    const { subject, description, purchase_order_id, disputeType } = payload;
    if (!description) {
      return { status: 400, body: { code: 400, msg: "description is required", reason: "validation_error", data: null, result: null, _proxy: { source: "local", pathname } } };
    }
    try {
      const dispute = walletDisputes.openDispute({
        organizationId: orgId,
        walletId: "",
        purchaseOrderId: purchase_order_id || "",
        disputeType: disputeType || "other",
        amountMinor: Number(payload.amountMinor || 0),
        description: subject ? `${subject}: ${description}` : description,
        actorId
      });
      return localJobResponse({ dispute });
    } catch (e) {
      return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
    }
  }

  {
    const disputeMsgMatch = pathname.match(/^\/api\/v1\/vendor\/disputes\/([^/]+)\/messages$/);
    if (disputeMsgMatch) {
      const disputeId = disputeMsgMatch[1];
      const actorId = request.__auth?.userId || "vendor";
      const note = payload.body || payload.message || "";
      if (!note) return { status: 400, body: { code: 400, msg: "body is required", reason: "validation_error", data: null, result: null, _proxy: { source: "local", pathname } } };
      try {
        const entry = walletDisputes.addNote({ disputeId, note, actorId });
        return localJobResponse({ message: { id: entry.id, sender_actor_type: "vendor", body: entry.note, created_at: entry.createdAt } });
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
  }

  if (pathname === "/api/v1/vendor/vend/preview") {
    const meterId = String(payload.meterId || "").trim();
    const amtMinor = Number(payload.amountMinor || 200000);
    if (!meterId) return { status: 400, body: { code: 400, msg: "meterId is required", reason: "validation_error", data: null, result: null, _proxy: { source: "local", pathname } } };
    const unitsKwh = parseFloat((amtMinor / 100 / 55).toFixed(2));
    return localJobResponse({
      meter: { meterId, customerId: `CUST-${meterId.slice(-4)}`, customerName: "Customer " + meterId.slice(-4), stationId: "TUNGA", tariffId: "TARIFF-01" },
      preview: { amountMinor: amtMinor, units: unitsKwh, effectivePricePerKwh: 5500, tariffId: "TARIFF-01" }
    });
  }

  if (pathname === "/api/v1/vendor/vend") {
    const orgId = request.__auth?.organizationId || "demo-vendor-org-01";
    const actorId = request.__auth?.userId || orgId;
    const meterId = String(payload.meterId || "").trim();
    const amtMinor = Number(payload.amountMinor || 0);
    if (!meterId || !amtMinor) return { status: 400, body: { code: 400, msg: "meterId and amountMinor are required", reason: "validation_error", data: null, result: null, _proxy: { source: "local", pathname } } };
    try {
      let wallet = walletLedger.walletForOrganization(orgId);
      if (!wallet) {
        walletLedger.createVendorOrganization({ organizationId: orgId, name: "Demo Vendor" });
        walletLedger.provisionWalletForOrganization({ organizationId: orgId, currency: "NGN", actorId: "system" });
        wallet = walletLedger.walletForOrganization(orgId);
      }
      const ikey = `vend:${orgId}:${meterId}:${amtMinor}:${Date.now()}`;
      const order = walletPurchase.createPurchaseOrder({ organizationId: orgId, targetMeter: meterId, amountMinor: amtMinor, mode: "token", actorId, idempotencyKey: ikey });
      const units = parseFloat((amtMinor / 100 / 55).toFixed(2));
      const token = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("").replace(/(.{4})/g, "$1-").slice(0, -1);
      try { walletPurchase.completeTokenPurchase({ purchaseOrderId: order.id, token, unitsKwh: units, actorId: "system", idempotencyKey: `complete:${ikey}` }); } catch {}
      return localJobResponse({ token, units, receiptId: order.receiptNumber, purchaseOrder: order });
    } catch (e) {
      return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
    }
  }

  if (pathname === "/api/v1/vendor/funding/paystack") {
    return localJobResponse({ authorizationUrl: "https://checkout.paystack.com/demo-beverly-funding-local" });
  }

  // ── Admin v1 REST POST endpoints ────────────────────────────────────────────
  {
    const fundingApproveMatch = pathname.match(/^\/api\/v1\/admin\/funding\/([^/]+)\/approve$/);
    if (fundingApproveMatch) {
      const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
      try {
        return localJobResponse(walletFunding.approveFundingRequest({ fundingRequestId: fundingApproveMatch[1], actorId }));
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
    const fundingRejectMatch = pathname.match(/^\/api\/v1\/admin\/funding\/([^/]+)\/reject$/);
    if (fundingRejectMatch) {
      const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
      try {
        return localJobResponse(walletFunding.rejectFundingRequest({ fundingRequestId: fundingRejectMatch[1], reason: payload.reason || "Rejected by admin", actorId }));
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
    const refundApproveMatch = pathname.match(/^\/api\/v1\/admin\/refunds\/([^/]+)\/approve$/);
    if (refundApproveMatch) {
      const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
      const approvedAmountMinor = Number(payload.approvedAmountMinor || payload.amount_minor || 0);
      try {
        return localJobResponse(walletRefunds.approveRefund({ refundId: refundApproveMatch[1], approvedAmountMinor: approvedAmountMinor || 1, actorId, reviewerNote: payload.reason || "" }));
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
    const refundRejectMatch = pathname.match(/^\/api\/v1\/admin\/refunds\/([^/]+)\/reject$/);
    if (refundRejectMatch) {
      const actorId = request.__auth?.userId || payload.actorId || "finance-checker";
      try {
        return localJobResponse(walletRefunds.rejectRefund({ refundId: refundRejectMatch[1], actorId, reviewerNote: payload.reason || "" }));
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
    if (pathname === "/api/v1/admin/feature-flags") {
      try {
        return localJobResponse(walletFeatureFlags.createFlag({ key: payload.key, description: payload.description }));
      } catch (e) {
        return { status: 400, body: { code: 400, msg: e.message, reason: e.message, data: null, result: null, _proxy: { source: "local", pathname } } };
      }
    }
    if (pathname === "/api/v1/admin/reconciliation/run") {
      const actorId = request.__auth?.userId || "staff";
      return localJobResponse(walletReconciliation.runReconciliation());
    }
    if (pathname === "/api/v1/admin/vendors") {
      const id = "vo-" + Math.random().toString(36).slice(2, 8);
      return localJobResponse({ id, ...payload, status: "pending", created_at: new Date().toISOString() });
    }
  }

  // Vending Monitor
  if (pathname === "/api/wallet/vending-monitor/summary") {
    return localJobResponse(walletVendingMonitor.vendMonitorSummary());
  }
  if (pathname === "/api/wallet/vending-monitor/list") {
    return localJobResponse(walletVendingMonitor.listVendOrders(payload));
  }

  // ── Reports ──
  if (pathname === "/api/reports/revenue") {
    const reportService = require("../backend/src/services/report-service");
    return localJobResponse(await reportService.revenueReport(payload.dateRange, payload.filters));
  }
  if (pathname === "/api/reports/wallet") {
    const reportService = require("../backend/src/services/report-service");
    return localJobResponse(await reportService.walletReport(payload.dateRange, payload.filters));
  }
  if (pathname === "/api/reports/customers") {
    const reportService = require("../backend/src/services/report-service");
    return localJobResponse(await reportService.customerReport(payload.dateRange, payload.filters));
  }
  if (pathname === "/api/reports/audit") {
    const reportService = require("../backend/src/services/report-service");
    return localJobResponse(await reportService.auditReport(payload.dateRange, payload.filters));
  }
  if (pathname === "/api/reports/settlement") {
    const reportService = require("../backend/src/services/report-service");
    return localJobResponse(await reportService.settlementReport(payload.dateRange, payload.filters));
  }

  // ── MFA / 2FA ──
  if (pathname === "/api/auth/mfa/enroll") {
    const nodeCrypto = require("crypto");
    const secretBytes = nodeCrypto.randomBytes(20);
    const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const secret = Array.from(secretBytes).map((b) => base32Chars[b % 32]).join("");
    const factorId = nodeCrypto.randomUUID();
    const recoveryCodes = Array.from({ length: 10 }, () => {
      const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const part = () => Array.from(nodeCrypto.randomBytes(5)).map((b) => charset[b % 36]).join("");
      return `${part()}-${part()}`;
    });
    return localJobResponse({
      factorId,
      totpUri: `otpauth://totp/Beverly:user?secret=${secret}&issuer=Beverly&digits=6&period=30`,
      secret,
      recoveryCodes
    });
  }
  if (pathname === "/api/auth/mfa/verify-enrollment") {
    const code = String(payload.code || "");
    return localJobResponse({ verified: /^\d{6}$/.test(code) });
  }
  if (pathname === "/api/auth/mfa/challenge") {
    const nodeCrypto = require("crypto");
    return localJobResponse({ challengeId: nodeCrypto.randomUUID() });
  }
  if (pathname === "/api/auth/mfa/verify-challenge") {
    const code = String(payload.code || "");
    return localJobResponse({ verified: /^\d{6}$/.test(code) });
  }
  if (pathname === "/api/auth/mfa/unenroll") {
    return localJobResponse({ success: true });
  }
  if (pathname === "/api/auth/mfa/factors") {
    return localJobResponse({ factors: [] });
  }
  if (pathname === "/api/auth/mfa/verify-recovery") {
    const code = String(payload.code || "").trim();
    return localJobResponse({ verified: code.length >= 10 });
  }

  if (pathname === "/api/user/login") {
    return loginResponse(payload);
  }
  if (pathname === "/api/user/profile") {
    return localJobResponse({
      saved: true,
      profile: {
        name: String(payload.name || ""),
        email: String(payload.email || ""),
        phone: String(payload.phone || "")
      }
    });
  }
  if (pathname === "/api/user/changePassword") {
    if (!payload.currentPassword || !payload.newPassword || String(payload.newPassword).length < 8) {
      return {
        status: 400,
        body: {
          code: 400,
          msg: "Invalid password payload",
          reason: "Invalid password payload",
          data: null,
          result: null,
          _proxy: { source: "local-auth", pathname }
        }
      };
    }
    return localJobResponse({ changed: true });
  }
  if (pathname === "/api/system/automation-control") {
    return localJobResponse(saveAutomationControl({
      webhooks: Array.isArray(payload.webhooks) ? payload.webhooks : [],
      remediation: payload.remediation || {},
      deliveryPolicy: payload.deliveryPolicy || {}
    }));
  }
  if (pathname === "/api/system/automation-hooks/test") {
    const incidentKind = payload.kind || "manual-test";
    const outcome = await handleAutomationIncident({
      kind: incidentKind,
      severity: payload.severity || "info",
      title: payload.title || "Manual test alert",
      message: payload.message || "Manual automation hook test.",
      source: "automation-command-page",
      details: payload.details || {}
    });
    if (incidentKind === "smoke-failure" && readAutomationControl().remediation.runHotRefreshOnSmokeFailure) {
      const smokeRefresh = await runRefreshJob("hot");
      outcome.incident.remediation.push({
        type: "run-hot-refresh",
        status: smokeRefresh.failed ? "degraded" : "applied",
        refreshed: smokeRefresh.refreshed,
        failed: smokeRefresh.failed
      });
      const control = readAutomationControl();
      saveAutomationControl({
        ...control,
        incidents: [outcome.incident, ...control.incidents.filter((entry) => entry.id !== outcome.incident.id)].slice(0, 20)
      });
      return localJobResponse({
        ...outcome.incident,
        smokeRefresh
      });
    }
    return localJobResponse(outcome.incident);
  }
  if (pathname === "/api/local/importJobs/read") {
    return localJobResponse(await listImportJobs({
      routeHash: payload.routeHash || "",
      pageSize: payload.pageSize || 500,
      offset: payload.offset || 0
    }));
  }
  if (pathname === "/api/local/snapshots/read") {
    return localJobResponse(await readSnapshot({
      type: payload.type || "",
      scope: payload.scope || "global",
      limit: payload.limit || payload.pageSize || 20
    }));
  }
  if (pathname === "/api/local/governance/cleanup") {
    return localJobResponse(await runRetentionCleanup({
      dryRun: payload.dryRun !== false
    }));
  }
  if (pathname === "/api/local/governance/role-audit") {
    return localJobResponse(await rolePermissionAudit());
  }
  if (pathname === "/api/local/exportJob/create") {
    const artifact = payload.content ? await saveArtifact({
      bucket: "exports",
      routeHash: payload.routeHash || "",
      filename: payload.fileName || `export.${payload.format || "txt"}`,
      content: payload.content,
      contentType: payload.contentType || "text/plain;charset=utf-8"
    }) : null;
    await recordExportJob({
      routeHash: payload.routeHash || "",
      rowCount: payload.rowCount || 0,
      format: payload.format || "csv",
      status: payload.status || "completed",
      storageBucket: artifact?.bucket,
      storagePath: artifact?.path,
      details: { ...payload, content: payload.content ? "[stored]" : undefined, storage: artifact }
    });
    return localJobResponse({ saved: true, kind: "export", storage: artifact });
  }
  if (pathname === "/api/local/printJob/create") {
    const artifact = payload.content ? await saveArtifact({
      bucket: "receipts",
      routeHash: payload.routeHash || "",
      filename: payload.fileName || `receipt.${payload.format || "html"}`,
      content: payload.content,
      contentType: payload.contentType || "text/html;charset=utf-8"
    }) : null;
    await recordPrintJob({
      routeHash: payload.routeHash || "",
      receiptType: payload.receiptType || "credit",
      status: payload.status || "completed",
      storageBucket: artifact?.bucket,
      storagePath: artifact?.path,
      details: { ...payload, content: payload.content ? "[stored]" : undefined, storage: artifact }
    });
    return localJobResponse({ saved: true, kind: "print", storage: artifact });
  }

  // --- SUPABASE AUTH SYNC INTERCEPT ---
  if (supabaseAuthEnabled()) {
    try {
      if (pathname === "/api/user/create") {
        const item = Array.isArray(payload) ? payload[0] : payload;
        await createAuthUser(item);
      } else if (pathname === "/api/user/update") {
        const item = Array.isArray(payload) ? payload[0] : payload;
        await updateAuthUser(item.userId, item);
      } else if (pathname === "/api/user/delete") {
        const item = Array.isArray(payload) ? payload[0] : payload;
        await deleteAuthUser(item.userId);
      }
    } catch (err) {
      console.error("[supabase-auth-sync-error]", err);
      return {
        status: 400,
        body: {
          code: 400,
          msg: "Supabase Auth Sync Failed: " + err.message,
          reason: "Supabase Auth Sync Failed: " + err.message,
          data: null,
          result: null,
          _proxy: { source: "supabase-auth", pathname }
        }
      };
    }
  }

  // Return null to allow proxyLive to handle it upstream
  return null;
}

async function runRefreshJob(scope) {
  const control = readAutomationControl();
  const targets = refreshTargets(scope);
  const results = [];
  for (const target of targets) {
    let attempts = 1;
    let execution = await runRefreshTarget(target);
    if (!execution.ok && control.remediation.retryFailedRefreshOnce) {
      attempts += 1;
      execution = await runRefreshTarget(target);
    }
    if (!execution.ok) {
      const incident = await handleAutomationIncident({
        kind: "refresh-failure",
        severity: "warning",
        title: `Refresh failed for ${target.name}`,
        message: `Automation refresh could not complete for ${target.path}.`,
        source: "refresh-cron",
        details: {
          scope,
          target,
          attempts
        }
      });
      results.push({
        name: target.name,
        path: target.path,
        status: 502,
        source: "unavailable",
        retries: attempts - 1,
        alerts: incident.incident.alerts.length
      });
      continue;
    }
    results.push({
      ...execution.entry,
      retries: attempts - 1
    });
  }
  return {
    ok: true,
    scope,
    refreshed: results.filter((entry) => entry.status < 400).length,
    failed: results.filter((entry) => entry.status >= 400).length,
    governance: scope === "hourly" && new Date().getUTCHours() === 0 ? await runGovernance() : null,
    results
  };
}

async function runRefreshTarget(target) {
  let pageNumber = Math.max(1, Number(target.payload?.pageNumber || 1));
  let fetchedRows = 0;
  let totalRows = Infinity;
  let result = null;
  const maxPages = Math.max(1, Number(target.maxPages || 100));

  do {
    const pageTarget = {
      ...target,
      payload: target.paginate ? { ...(target.payload || {}), pageNumber } : target.payload
    };
    const refreshRequest = syntheticRefreshRequest(pageTarget);
    const refreshData = syntheticRefreshRequestData(pageTarget);
    result = await proxyLive(refreshRequest, target.path, refreshData);
    if (!result && !isWriteRequest(target.path, "POST") && !requiresLiveRead(target.path)) {
      result = sampleReadResponse(target.path, refreshData);
    }
    if (!result) return { ok: false };
    await cacheResponseIfNeeded(refreshRequest, target.path, refreshData, result);
    await writeSnapshot({
      pathname: target.path,
      requestKey: buildCacheKey(refreshRequest, refreshData),
      requestPayload: refreshData.parsedBody,
      responsePayload: result.body
    }).catch((error) => {
      console.error("[snapshot-refresh]", error instanceof Error ? error.message : String(error));
    });

    const rows = collectionRowsFromPayload(result.body);
    if (result?.body?._proxy?.source === "live") {
      await writeDailyMeterRows({
        pathname: target.path,
        requestPayload: pageTarget.payload,
        responsePayload: result.body
      }).catch((error) => {
        console.error("[consumption-store-refresh-write]", error instanceof Error ? error.message : String(error));
      });
    }
    const pageTotal = Number(result.body?.result?.total ?? result.body?.data?.total);
    totalRows = Number.isFinite(pageTotal) && pageTotal >= 0 ? pageTotal : rows.length;
    fetchedRows += rows.length;
    pageNumber++;
    if (!target.paginate || !rows.length) break;
  } while (fetchedRows < totalRows && (pageNumber - Number(target.payload?.pageNumber || 1)) < maxPages);

  return {
    ok: true,
    entry: {
      name: target.name,
      path: target.path,
      status: result.status,
      source: result.body?._proxy?.source || "unknown",
      cadence: target.cadence,
      rows: fetchedRows
    }
  };
}

function fallbackRemoteTask(pathname, requestData) {
  void requestData;
  const remoteTaskPaths = [
    "/API/RemoteMeterTask/CreateReadingTask",
    "/API/RemoteMeterTask/CreateControlTask",
    "/API/RemoteMeterTask/CreateTokenTask"
  ];
  if (!remoteTaskPaths.some((p) => pathname.toLowerCase() === p.toLowerCase())) return null;
  const taskKind = pathname.toLowerCase().includes("control") ? "control"
    : pathname.toLowerCase().includes("token") ? "token"
    : "reading";
  return {
    status: 502,
    body: {
      code: 502,
      msg: `Live ${taskKind} task API unavailable`,
      reason: `Live ${taskKind} task API unavailable`,
      data: null,
      result: null,
      _proxy: {
        source: "live-required",
        pathname
      }
    }
  };
}
async function auditResult(request, pathname, result) {
  await recordAuditLog({
    method: request.method || "GET",
    path: pathname,
    outcome: result.status < 400 ? "success" : "error",
    statusCode: result.status,
    proxySource: result.body?._proxy?.source || "unknown",
    details: result.body
  });
}

async function tryLivePath(request, liveUrl, requestData, token) {
  const axios = require("axios");
  const http = require("http");
  const https = require("https");
  
  if (!global.liveAxios) {
    global.liveAxios = axios.create({
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
      validateStatus: () => true // Resolve all statuses
    });
  }

  const response = await global.liveAxios({
    method: request.method || "GET",
    url: liveUrl,
    headers: buildLiveHeaders(request, requestData, token),
    data: request.method === "GET" ? undefined : requestData.rawBody,
    responseType: "text" // Get raw text to match previous fetch behavior
  });

  let payload;
  const contentType = String(response.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(response.data);
    } catch {
      payload = { raw: response.data };
    }
  } else {
    payload = { raw: response.data };
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    payload,
    headers: response.headers
  };
}

async function proxyLive(request, pathname, requestData) {
  const env = getEnv();
  if (!env.liveProxyEnabled) return null;
  const liveRequestData = sanitizeLiveRequestData(pathname, requestData);
  if (isGuardedWriteRequest(pathname, request.method, requestData) && !env.allowLiveWrites) {
    return {
      status: 403,
      body: {
        code: 403,
        msg: "Writes are blocked until ALLOW_LIVE_WRITES=true",
        reason: "Writes are blocked until ALLOW_LIVE_WRITES=true",
        data: null,
        result: null,
        _proxy: {
          source: "guard",
          pathname
        }
      }
    };
  }

  const token = env.liveBearerToken ? `Bearer ${env.liveBearerToken}` : (request.headers.authorization || "");
  const candidates = candidatePaths(pathname);
  const query = querySuffix(request.url);
  let lastFailure = null;

  for (const candidate of candidates) {
    const liveUrl = `${env.liveBaseUrl}${candidate}${query}`;
    try {
      const liveResult = await tryLivePath(request, liveUrl, liveRequestData, token);
      if (liveResult.status === 401 || liveResult.status === 403) {
        console.error("[live-auth-failure]", JSON.stringify({ pathname, candidate, status: liveResult.status }));
        await handleAutomationIncident({
          kind: "live-auth-failure",
          severity: "error",
          title: "Live auth failure",
          message: `Live upstream rejected ${pathname} with ${liveResult.status}.`,
          source: "live-proxy",
          details: {
            pathname,
            candidate,
            status: liveResult.status
          }
        }).catch((error) => {
          console.error("[automation-live-auth-hook]", error instanceof Error ? error.message : String(error));
        });
      }
      if (liveResult.ok || (liveResult.status < 500 && liveResult.status !== 404)) {
        if (!isWriteRequest(candidate, request.method) && hasBusinessFailure(liveResult.payload)) {
          console.error("[live-schema-drift]", JSON.stringify({ pathname, candidate, status: liveResult.status, payload: liveResult.payload }));
          lastFailure = {
            pathname,
            candidate,
            status: liveResult.status,
            payload: liveResult.payload
          };
          continue;
        }
        if (isWriteRequest(candidate, request.method) && hasBusinessFailure(liveResult.payload)) {
          if (isAccountCreatePath(candidate)) {
            lastFailure = {
              pathname,
              candidate,
              status: liveResult.status,
              payload: liveResult.payload
            };
            continue;
          }
          return {
            status: liveResult.status,
            body: normalizeLivePayload(liveResult.payload, liveResult.status, candidate)
          };
        }
        if (isAccountCreatePath(candidate) && String(request.method || "GET").toUpperCase() === "POST") {
          await persistLocalAccountBindings(requestData, "live");
        }
        if (isAccountDeletePath(candidate) && String(request.method || "GET").toUpperCase() === "POST") {
          await removeLocalAccountBindings(requestData);
        }
        if (isGuardedWriteRequest(candidate, request.method, requestData)) {
          logWriteEvent("request", { pathname: candidate, payload: requestData.parsedBody });
          logWriteEvent("response", { pathname: candidate, payload: liveResult.payload, status: liveResult.status });
        }
        return {
          status: liveResult.status,
          body: normalizeLivePayload(liveResult.payload, liveResult.status, candidate)
        };
      }
      lastFailure = {
        pathname,
        candidate,
        status: liveResult.status,
        payload: liveResult.payload
      };
    } catch (error) {
      lastFailure = {
        pathname,
        candidate,
        error: error instanceof Error ? error.message : String(error),
        cause: error.cause ? String(error.cause) : undefined,
        stack: error.stack
      };
    }
  }

  if (lastFailure) logProxyFailure(lastFailure);
  if (isAccountCreatePath(pathname) && String(request.method || "GET").toUpperCase() === "POST") {
    const rows = await persistLocalAccountBindings(requestData, "local-fallback");
    if (rows.length) return localAccountCreateResponse(pathname, rows, lastFailure);
  }
  return null;
}

async function handler(request, response) {
  try {
    ensureDatabase();
    applyCorsHeaders(request, response);
    if (String(request.method || "GET").toUpperCase() === "OPTIONS") {
      response.status(204).json({});
      return;
    }
    const pathname = normalizeRequestPath(request.url);
    let result = rateLimitResult(request);
    if (result) {
      await auditResult(request, pathname, result);
      response.status(result.status).json(result.body);
      return;
    }
    const requestData = await readRequest(request);
    result = await authorizeRequest(request, pathname, requestData);
    if (result) {
      await auditResult(request, pathname, result);
      response.status(result.status).json(result.body);
      return;
    }
    result = await dispatchLocalDatabaseAction(request, pathname, requestData);

    if (!result && isGuardedWriteRequest(pathname, request.method, requestData) && !getEnv().allowLiveWrites && !pathname.startsWith("/api/local/")) {
      result = {
        status: 403,
        body: {
          code: 403,
          msg: "Writes are blocked until ALLOW_LIVE_WRITES=true",
          reason: "Writes are blocked until ALLOW_LIVE_WRITES=true",
          data: null,
          result: null,
          _proxy: {
            source: "guard",
            pathname
          }
        }
      };
    }

    if (!result) {
      result = await readDailyMeterRows({
        pathname,
        requestPayload: requestData.parsedBody
      }).catch((error) => {
        console.error("[consumption-store-read]", error instanceof Error ? error.message : String(error));
        return null;
      });
    }

    if (!result) {
      result = await proxyLive(request, pathname, requestData);
      if (result?.body?._proxy?.source === "live") {
        await writeDailyMeterRows({
          pathname,
          requestPayload: requestData.parsedBody,
          responsePayload: result.body
        }).catch((error) => {
          console.error("[consumption-store-write]", error instanceof Error ? error.message : String(error));
        });
      }
    }

    if (result?.status >= 500 && canUseSampleFallback(pathname)) {
      const sample = sampleReadResponse(pathname, requestData);
      if (sample) {
        result = {
          ...sample,
          body: {
            ...sample.body,
            _proxy: {
              ...(sample.body?._proxy || {}),
              source: "sample-after-live-failure",
              pathname,
              upstreamStatus: result.status
            }
          }
        };
      }
    }

    if (!result && !requiresLiveRead(pathname)) {
      result = await cachedReadResponse(request, pathname, requestData);
    }

    if (!result && !isWriteRequest(pathname, request.method) && !requiresLiveRead(pathname)) {
      result = sampleReadResponse(pathname, requestData);
    }

    if (!result) {
      result = fallbackRemoteTask(pathname, requestData);
    }

    result = await mergeLocalAccountBindings(pathname, requestData, result);

    if (!result) {
      result = {
        status: 502,
        body: {
          code: 502,
          msg: "Live API unavailable",
          reason: "Live API unavailable",
          data: null,
          result: null,
          _proxy: {
            source: "live-required",
            pathname
          }
        }
      };
    }

    await cacheResponseIfNeeded(request, pathname, requestData, result);
    await writeSnapshot({
      pathname,
      requestKey: buildCacheKey(request, requestData),
      requestPayload: requestData.parsedBody,
      responsePayload: result.body
    }).catch((error) => {
      console.error("[snapshot-write]", error instanceof Error ? error.message : String(error));
    });
    if (isGuardedWriteRequest(pathname, request.method, requestData) && !pathname.startsWith("/api/local/")) {
      await recordWriteArtifacts(pathname, requestData, result.status);
    }
    await auditResult(request, pathname, result);
    response.status(result.status).json(result.body);
  } catch (error) {
    console.error("[reference-facade-crash]", error);
    response.status(500).json({
      code: 500,
      msg: "Internal Server Error",
      reason: error instanceof Error ? error.message : String(error),
      _proxy: {
        source: "facade-crash",
        pathname: request.url
      }
    });
  }
}


module.exports = handler;
module.exports._test = {
  candidatePaths,
  normalizeLivePayload,
  normalizeRequestPath,
  readRequest,
  rateLimitResult,
  refreshTargets,
  runRefreshJob,
  resetContractCache() {
    contractAliasMap = null;
    accessControlModulePromise = null;
    rateLimitBuckets.clear();
    resetForTests();
  }
};
