"use strict";

// Resolves which upstream OEM (Calinmeter, Sparkmeter, Ihemeter, ...) a proxied
// request targets, and returns that OEM's base URL / bearer token / endpoint
// config. Callers MUST treat a null return as "fall back to the legacy
// process.env-driven config" — this is the mechanism that keeps the live proxy
// byte-identical to today's behavior until an OEM is actually seeded/configured.

const storage = require("./storage-adapter");
const { encryptSecret, decryptSecret } = require("./oem-credential-crypto");

const DEFAULT_OEM_SLUG = "calinmeter";
const CACHE_TTL_MS = Number(process.env.OEM_CONFIG_CACHE_TTL_MS || 30000);

const configCache = new Map(); // cacheKey -> { config, expiresAt }

function registryDisabled() {
  return String(process.env.OEM_REGISTRY_DISABLED || "").toLowerCase() === "true";
}

function cacheKeyFor(oemIdOrSlug) {
  return String(oemIdOrSlug || DEFAULT_OEM_SLUG).trim().toLowerCase();
}

function invalidateOemCache(oemIdOrSlug) {
  if (oemIdOrSlug) {
    configCache.delete(cacheKeyFor(oemIdOrSlug));
    dynamicTokenCache.delete(oemIdOrSlug);
  } else {
    configCache.clear();
    dynamicTokenCache.clear();
  }
}

async function loadOemConfig(oemIdOrSlug) {
  const manufacturer = await storage.getOemManufacturer(oemIdOrSlug);
  if (!manufacturer) return null;
  const [credentials, endpoints] = await Promise.all([
    storage.getOemCredentials(manufacturer.id),
    storage.listOemEndpointConfigs(manufacturer.id)
  ]);
  const endpointsByLogicalKey = new Map();
  const pathToLogicalKey = new Map();
  for (const endpoint of endpoints) {
    endpointsByLogicalKey.set(endpoint.logicalKey, endpoint);
    if (endpoint.upstreamPath) pathToLogicalKey.set(String(endpoint.upstreamPath).toLowerCase(), endpoint.logicalKey);
  }
  return {
    oemId: manufacturer.id,
    slug: manufacturer.slug,
    displayName: manufacturer.displayName,
    status: manufacturer.status,
    isSeedDefault: manufacturer.isSeedDefault,
    capabilities: manufacturer.capabilities,
    vendingStrategy: manufacturer.vendingStrategy,
    rateLimitWindowMs: manufacturer.rateLimitWindowMs,
    rateLimitMaxRequests: manufacturer.rateLimitMaxRequests,
    authStrategy: credentials?.authStrategy || "bearer_static",
    liveBaseUrl: String(credentials?.baseUrl || "").trim().replace(/\/+$/, ""),
    liveBearerToken: credentials ? decryptSecret(credentials.encryptedBearerToken) : "",
    tokenEndpointPath: credentials?.tokenEndpointPath || "",
    apiKeyHeaderName: credentials?.apiKeyHeaderName || "",
    // Kept encrypted here; only decrypted lazily inside fetchLoginToken/
    // fetchOAuth2Token right before use, so a long-lived cached config object
    // never holds plaintext login credentials in memory longer than necessary.
    encryptedUsername: credentials?.encryptedUsername || "",
    encryptedPassword: credentials?.encryptedPassword || "",
    endpointsByLogicalKey,
    pathToLogicalKey
  };
}

async function resolveOemConfig(oemIdOrSlug) {
  const key = cacheKeyFor(oemIdOrSlug);
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  const config = await loadOemConfig(oemIdOrSlug || DEFAULT_OEM_SLUG);
  configCache.set(key, { config, expiresAt: Date.now() + CACHE_TTL_MS });
  return config;
}

// Returns the OEM-scoped { liveBaseUrl, liveBearerToken, ... } for the given
// OEM, or null when the registry is disabled, unreachable, or the OEM/its
// credentials aren't configured yet. Never throws.
async function getOemScopedLiveConfig(oemIdOrSlug) {
  if (registryDisabled()) return null;
  try {
    const config = await resolveOemConfig(oemIdOrSlug || DEFAULT_OEM_SLUG);
    if (!config || !config.liveBaseUrl) return null;
    return config;
  } catch (error) {
    console.error("[oem-registry] resolve failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Synchronous, allocation-free peek at an OEM's rate-limit overrides. Returns
// null unless the OEM's config is ALREADY in the in-process cache (populated by a
// prior proxyLive resolution for that OEM). Deliberately never triggers a DB read,
// so it's safe to call on the hot pre-auth rate-limit path — the worst case is
// "fall back to the global env-var default limit", never added latency.
function peekOemRateLimit(oemIdOrSlug) {
  if (registryDisabled()) return null;
  const cached = configCache.get(cacheKeyFor(oemIdOrSlug));
  const config = cached && cached.expiresAt > Date.now() ? cached.config : null;
  if (!config) return null;
  return {
    windowMs: config.rateLimitWindowMs || null,
    maxRequests: config.rateLimitMaxRequests || null
  };
}

// ── Dynamic auth strategies (bearer_login, oauth2_client_credentials) ──────
// Neither strategy has an existing precedent in this codebase — every prior
// upstream integration used a single static bearer token forever. This is the
// net-new piece: fetch a token from the OEM's own login/OAuth2 endpoint, cache
// it in-process with an expiry, and refetch lazily once it's stale. Refreshing
// 30s before the OEM's stated expiry (or a 1h default when it doesn't say)
// avoids a request racing an already-expired token.
const dynamicTokenCache = new Map(); // oemId -> { token, expiresAt }
const REFRESH_SKEW_MS = 30000;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

function extractTokenFromResponse(body) {
  const candidates = [
    body?.token, body?.access_token, body?.accessToken,
    body?.data?.token, body?.data?.access_token, body?.data?.accessToken,
    body?.result?.token, body?.result?.access_token
  ];
  return candidates.find((value) => typeof value === "string" && value.length > 0) || "";
}

function extractExpiresInSeconds(body) {
  const candidates = [
    body?.expires_in, body?.expiresIn,
    body?.data?.expires_in, body?.data?.expiresIn,
    body?.result?.expires_in, body?.result?.expiresIn
  ];
  const found = candidates.find((value) => Number.isFinite(Number(value)));
  return found ? Number(found) : DEFAULT_TOKEN_TTL_SECONDS;
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// bearer_login: POST { username, password } to tokenEndpointPath, expect a
// token field back. Field-name extraction is deliberately flexible (see
// extractTokenFromResponse) since the real response shape is unknown until a
// real OEM is onboarded — adjust the extraction helpers once we see it.
async function fetchLoginToken(oemConfig) {
  if (!oemConfig.liveBaseUrl) throw new Error("No base URL configured");
  if (!oemConfig.tokenEndpointPath) throw new Error("No token endpoint path configured");
  const url = `${oemConfig.liveBaseUrl}${oemConfig.tokenEndpointPath}`;
  const username = decryptSecret(oemConfig.encryptedUsername);
  const password = decryptSecret(oemConfig.encryptedPassword);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await readJsonSafely(response);
  if (!response.ok) throw new Error(`Login endpoint returned HTTP ${response.status}`);
  const token = extractTokenFromResponse(body);
  if (!token) throw new Error("Login response had no recognizable token field (token/access_token/accessToken)");
  return { token, expiresAt: Date.now() + extractExpiresInSeconds(body) * 1000 - REFRESH_SKEW_MS };
}

// oauth2_client_credentials: standard RFC 6749 client-credentials grant —
// HTTP Basic auth of client_id:client_secret, body grant_type=client_credentials.
// The "username" field doubles as client_id and "password" as client_secret
// (same fields the Settings UI labels "Username / client ID" and
// "Password / client secret" for exactly this strategy).
async function fetchOAuth2Token(oemConfig) {
  if (!oemConfig.liveBaseUrl) throw new Error("No base URL configured");
  if (!oemConfig.tokenEndpointPath) throw new Error("No token endpoint path configured");
  const url = `${oemConfig.liveBaseUrl}${oemConfig.tokenEndpointPath}`;
  const clientId = decryptSecret(oemConfig.encryptedUsername);
  const clientSecret = decryptSecret(oemConfig.encryptedPassword);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`
    },
    body: "grant_type=client_credentials"
  });
  const body = await readJsonSafely(response);
  if (!response.ok) throw new Error(`Token endpoint returned HTTP ${response.status}`);
  const token = extractTokenFromResponse(body);
  if (!token) throw new Error("OAuth2 response had no recognizable access_token field");
  return { token, expiresAt: Date.now() + extractExpiresInSeconds(body) * 1000 - REFRESH_SKEW_MS };
}

async function resolveDynamicToken(oemConfig) {
  const cached = dynamicTokenCache.get(oemConfig.oemId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const fetcher = oemConfig.authStrategy === "oauth2_client_credentials" ? fetchOAuth2Token : fetchLoginToken;
  const { token, expiresAt } = await fetcher(oemConfig);
  dynamicTokenCache.set(oemConfig.oemId, { token, expiresAt });
  return token;
}

// The single entry point every proxied call goes through to get its auth
// header. Strategy-aware; never throws — a failed dynamic-token fetch logs
// and returns null (the caller then sends no auth header, which the upstream
// will reject with 401/403, surfacing clearly rather than silently retrying
// with a stale value).
async function resolveAuthHeader(oemConfig) {
  if (!oemConfig) return null;
  if (oemConfig.authStrategy === "api_key_header") {
    if (!oemConfig.liveBearerToken) return null;
    return { name: oemConfig.apiKeyHeaderName || "X-Api-Key", value: oemConfig.liveBearerToken };
  }
  if (oemConfig.authStrategy === "bearer_login" || oemConfig.authStrategy === "oauth2_client_credentials") {
    try {
      const token = await resolveDynamicToken(oemConfig);
      return token ? { name: "Authorization", value: `Bearer ${token}` } : null;
    } catch (error) {
      console.error(`[oem-registry] token fetch failed for ${oemConfig.slug}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  // bearer_static (default)
  return oemConfig.liveBearerToken ? { name: "Authorization", value: `Bearer ${oemConfig.liveBearerToken}` } : null;
}

function invalidateDynamicToken(oemId) {
  dynamicTokenCache.delete(oemId);
}

// Exercises the configured credentials end to end without needing a real
// endpoint config yet: resolves an auth header (fetching/caching a token for
// login/OAuth2 strategies), and — if the OEM has at least one enabled GET
// endpoint configured — makes one real call and reports its status. Designed
// to be safe to call repeatedly from a "Test Connection" button the moment
// credentials are pasted in, before any endpoint paths are filled in.
async function testOemConnection(oemIdOrSlug) {
  invalidateOemCache(oemIdOrSlug);
  const config = await resolveOemConfig(oemIdOrSlug);
  if (!config) return { ok: false, stage: "resolve", error: "OEM not found" };
  // Force a fresh token fetch keyed by the real id (the input above may have been
  // a slug, which the dynamic-token cache — keyed only by real oemId — wouldn't match).
  invalidateDynamicToken(config.oemId);
  if (!config.liveBaseUrl) return { ok: false, stage: "config", error: "No base URL configured yet" };

  let authHeader;
  try {
    authHeader = await resolveAuthHeader(config);
  } catch (error) {
    return { ok: false, stage: "auth", error: error instanceof Error ? error.message : String(error) };
  }
  if (!authHeader) {
    return { ok: false, stage: "auth", error: "Could not resolve an auth header — check credentials are filled in" };
  }

  const sampleEndpoint = Array.from(config.endpointsByLogicalKey.values())
    .find((endpoint) => endpoint.enabled !== false && endpoint.upstreamPath && endpoint.method === "GET");
  if (!sampleEndpoint) {
    return {
      ok: true,
      stage: "auth",
      authStrategy: config.authStrategy,
      message: "Credentials resolved successfully. No enabled GET endpoint is configured yet to test a live call — add one in the endpoint editor to test further."
    };
  }

  try {
    const startedAt = Date.now();
    const response = await fetch(`${config.liveBaseUrl}${sampleEndpoint.upstreamPath}`, {
      method: "GET",
      headers: { Accept: "application/json", [authHeader.name]: authHeader.value }
    });
    return {
      ok: response.status < 400,
      stage: "sample-call",
      authStrategy: config.authStrategy,
      testedPath: sampleEndpoint.upstreamPath,
      status: response.status,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return { ok: false, stage: "sample-call", testedPath: sampleEndpoint.upstreamPath, error: error instanceof Error ? error.message : String(error) };
  }
}

function requestedOemId(request) {
  const header = request?.headers?.["x-oem-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return String(value || "").trim() || DEFAULT_OEM_SLUG;
}

// Translate a CRM-canonical (Calinmeter-shaped) upstream path into the equivalent
// path for `oemConfig`, via the shared logical key. The CRM frontend always speaks
// Calinmeter's path vocabulary; this maps it to whatever the target OEM actually
// exposes for the same operation. Identity (returns the path unchanged) whenever:
//   - the target IS the seeded default OEM (Calinmeter) → zero regression, OR
//   - the incoming path isn't a known default-OEM endpoint, OR
//   - the target OEM has no enabled config for that logical key.
// Never throws; worst case returns the original path.
async function translateEndpointPathForOem(oemConfig, incomingPath) {
  try {
    if (!oemConfig || oemConfig.isSeedDefault) return incomingPath;
    const defaultConfig = await resolveOemConfig(DEFAULT_OEM_SLUG);
    if (!defaultConfig) return incomingPath;
    const logicalKey = defaultConfig.pathToLogicalKey.get(String(incomingPath).toLowerCase());
    if (!logicalKey) return incomingPath;
    const target = oemConfig.endpointsByLogicalKey.get(logicalKey);
    if (!target || target.enabled === false || !target.upstreamPath) return incomingPath;
    return target.upstreamPath;
  } catch {
    return incomingPath;
  }
}

module.exports = {
  DEFAULT_OEM_SLUG,
  encryptSecret,
  decryptSecret,
  invalidateOemCache,
  resolveOemConfig,
  getOemScopedLiveConfig,
  peekOemRateLimit,
  translateEndpointPathForOem,
  resolveAuthHeader,
  testOemConnection,
  requestedOemId
};
