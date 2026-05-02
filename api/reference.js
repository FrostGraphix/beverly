const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("../tools/env-loader.cjs");
const {
  ensureDatabase,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  listImportJobs,
  recordPrintJob,
  recordWriteConfirmation,
  resetForTests,
  tableCounts
} = require("../backend/src/services/local-database");

const liveBaseUrlDefault = "http://8.208.16.168:9310";
const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "reference-contract.json");
const jsonContentType = "application/json";
const writePattern = /\/(create|update|delete|import|generate|cancel|reset|modify|addread|upload)\b/i;
const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
];
const rateLimitBuckets = new Map();

loadEnvFile();

let contractAliasMap = null;

function getEnv() {
  const readMode = process.env.LIVE_READ_MODE || (process.env.LIVE_API_PROXY_ENABLED === "false" ? "local" : "live");
  return {
    readMode,
    liveBaseUrl: process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || liveBaseUrlDefault,
    liveProxyEnabled: readMode !== "local" && (process.env.LIVE_API_PROXY_ENABLED === "true" || Boolean(process.env.UPSTREAM_API_URL)),
    liveBearerToken: process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "",
    allowLiveWrites: process.env.ALLOW_LIVE_WRITES === "true",
    corsOrigins: splitCsv(process.env.CORS_ORIGINS || defaultCorsOrigins.join(",")),
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300)
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
  setResponseHeader(response, "Access-Control-Allow-Headers", "Content-Type,Authorization,X-Authorization-Password");
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

function normalizeRequestPath(urlValue) {
  const pathname = String(urlValue || "/")
    .replace(/^\/api\/reference(?:\.js)?/i, "/api")
    .split("?")[0];
  if (/^\/api\/API\//.test(pathname)) return pathname.replace(/^\/api\/API\//, "/API/");
  if (/^\/api\/api\//.test(pathname)) return pathname.replace(/^\/api\/api\//, "/api/");
  return pathname;
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

function buildCacheKey(request, requestData) {
  return JSON.stringify({
    query: querySuffix(request.url),
    body: requestData.parsedBody || {}
  });
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

function logProxyFailure(details) {
  console.error("[live-proxy]", JSON.stringify(details));
}

function cacheResponseIfNeeded(request, pathname, requestData, result) {
  void request;
  void pathname;
  void requestData;
  void result;
}

function recordWriteArtifacts(pathname, requestData, status) {
  const payload = Array.isArray(requestData.parsedBody) ? requestData.parsedBody[0] || {} : requestData.parsedBody || {};
  recordWriteConfirmation({
    endpoint: pathname,
    action: payload.action || pathname.split("/").pop() || "write",
    confirmationText: payload.confirmationText || "",
    authorizationProvided: Boolean(payload.authorizationProvided || payload.authorizationPassword),
    status: status < 400 ? "completed" : "blocked",
    details: payload
  });
  if (/\/import\b/i.test(pathname)) {
    recordImportJob({
      routeHash: payload.routeHash || "",
      fileName: payload.fileName || "unknown",
      rowCount: Array.isArray(payload.rows) ? payload.rows.length : Array.isArray(payload.items) ? payload.items.length : 0,
      status: status < 400 ? "completed" : "blocked",
      details: payload
    });
  }
  if (/\/upload\b/i.test(pathname)) {
    recordImportJob({
      routeHash: payload.routeHash || "#/remote-support/file-upload",
      fileName: payload.fileName || "upload",
      rowCount: 1,
      status: status < 400 ? "completed" : "blocked",
      details: { ...payload, kind: "upload" }
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

function dispatchLocalDatabaseAction(request, pathname, requestData) {
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
      storage: tableCounts()
    });
  }
  if ((request.method || "GET").toUpperCase() !== "POST") return null;
  const payload = requestData.parsedBody || {};
  if (pathname === "/api/local/importJobs/read") {
    return localJobResponse(listImportJobs({
      routeHash: payload.routeHash || "",
      pageSize: payload.pageSize || 500,
      offset: payload.offset || 0
    }));
  }
  if (pathname === "/api/local/exportJob/create") {
    recordExportJob({
      routeHash: payload.routeHash || "",
      rowCount: payload.rowCount || 0,
      format: payload.format || "csv",
      status: payload.status || "completed",
      details: payload
    });
    return localJobResponse({ saved: true, kind: "export" });
  }
  if (pathname === "/api/local/printJob/create") {
    recordPrintJob({
      routeHash: payload.routeHash || "",
      receiptType: payload.receiptType || "credit",
      status: payload.status || "completed",
      details: payload
    });
    return localJobResponse({ saved: true, kind: "print" });
  }

  return null;
}

function fallbackRemoteTask(pathname, requestData) {
  const remoteTaskPaths = [
    "/API/RemoteMeterTask/CreateReadingTask",
    "/API/RemoteMeterTask/CreateControlTask",
    "/API/RemoteMeterTask/CreateTokenTask"
  ];
  if (!remoteTaskPaths.some((p) => pathname.toLowerCase() === p.toLowerCase())) return null;
  const rows = Array.isArray(requestData.parsedBody) ? requestData.parsedBody : [requestData.parsedBody || {}];
  const taskKind = pathname.toLowerCase().includes("control") ? "control"
    : pathname.toLowerCase().includes("token") ? "token"
    : "reading";
  recordWriteConfirmation({
    endpoint: pathname,
    action: `create-${taskKind}-task`,
    confirmationText: "",
    authorizationProvided: false,
    status: "queued-local",
    details: rows[0] || {}
  });
  return localJobResponse({
    submitted: rows.length,
    taskKind,
    queued: true,
    note: "Task queued locally — live backend unavailable"
  });
}
function auditResult(request, pathname, result) {
  recordAuditLog({
    method: request.method || "GET",
    path: pathname,
    outcome: result.status < 400 ? "success" : "error",
    statusCode: result.status,
    proxySource: result.body?._proxy?.source || "unknown",
    details: result.body
  });
}

async function tryLivePath(request, liveUrl, requestData, token) {
  const response = await fetch(liveUrl, {
    method: request.method || "GET",
    headers: buildLiveHeaders(request, requestData, token),
    body: request.method === "GET" ? undefined : requestData.rawBody
  });
  const payload = await parseLiveResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    headers: response.headers
  };
}

async function proxyLive(request, pathname, requestData) {
  const env = getEnv();
  if (!env.liveProxyEnabled) return null;
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

  const token = request.headers.authorization || (env.liveBearerToken ? `Bearer ${env.liveBearerToken}` : "");
  const candidates = candidatePaths(pathname);
  const query = querySuffix(request.url);
  let lastFailure = null;

  for (const candidate of candidates) {
    const liveUrl = `${env.liveBaseUrl}${candidate}${query}`;
    try {
      const liveResult = await tryLivePath(request, liveUrl, requestData, token);
      if (liveResult.status === 401 || liveResult.status === 403) {
        console.error("[live-auth-failure]", JSON.stringify({ pathname, candidate, status: liveResult.status }));
      }
      if (liveResult.ok || (liveResult.status < 500 && liveResult.status !== 404)) {
        if (hasBusinessFailure(liveResult.payload)) {
          console.error("[live-schema-drift]", JSON.stringify({ pathname, candidate, status: liveResult.status, payload: liveResult.payload }));
          lastFailure = {
            pathname,
            candidate,
            status: liveResult.status,
            payload: liveResult.payload
          };
          continue;
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
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  if (lastFailure) logProxyFailure(lastFailure);
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
      auditResult(request, pathname, result);
      response.status(result.status).json(result.body);
      return;
    }
    const requestData = await readRequest(request);
    result = dispatchLocalDatabaseAction(request, pathname, requestData);

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
      result = await proxyLive(request, pathname, requestData);
    }

    if (!result) {
      result = fallbackRemoteTask(pathname, requestData);
    }

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

    cacheResponseIfNeeded(request, pathname, requestData, result);
    if (isGuardedWriteRequest(pathname, request.method, requestData) && !pathname.startsWith("/api/local/")) {
      recordWriteArtifacts(pathname, requestData, result.status);
    }
    auditResult(request, pathname, result);
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
  resetContractCache() {
    contractAliasMap = null;
    rateLimitBuckets.clear();
    resetForTests();
  }
};
