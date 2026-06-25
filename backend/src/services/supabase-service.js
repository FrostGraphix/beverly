"use strict";

const defaultBuckets = ["uploads", "imports", "exports", "receipts"];
const defaultLoginDomain = "org.acoblighting.com";

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
}

function authEnabled() {
  return process.env.SUPABASE_AUTH_ENABLED === "true";
}

function storageEnabled() {
  return process.env.SUPABASE_STORAGE_ENABLED === "true" || process.env.SESSION_STORE_MODE === "supabase";
}

function configured() {
  return Boolean(supabaseUrl() && (serviceRoleKey() || anonKey()));
}

function serviceConfigured() {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

function jsonHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}

function restHeaders(prefer) {
  const headers = jsonHeaders(serviceRoleKey());
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function restRequest(pathname, options = {}) {
  if (!serviceConfigured()) throw new Error("Supabase service role is not configured");
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/rest/v1${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...restHeaders(options.prefer),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }));
  if (!response.ok) {
    throw new Error(body.message || body.msg || body.error || `Supabase REST failed: ${response.status}`);
  }
  return body;
}

async function restRequestWithResponse(pathname, options = {}) {
  if (!serviceConfigured()) throw new Error("Supabase service role is not configured");
  const result = await readJsonResponse(await fetch(`${supabaseUrl()}/rest/v1${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...restHeaders(options.prefer),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }));
  if (!result.response.ok) {
    throw new Error(result.body.message || result.body.msg || result.body.error || `Supabase REST failed: ${result.response.status}`);
  }
  return result;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { response, body };
}

function loginDomain() {
  return String(process.env.LOGIN_EMAIL_DOMAIN || defaultLoginDomain).trim().replace(/^@+/, "").toLowerCase();
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function emailFromLogin(userId) {
  const value = normalizeIdentifier(userId);
  if (value.includes("@")) return value;
  const adminEmails = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => normalizeIdentifier(entry))
    .filter(Boolean);
  if (value === "admin" && adminEmails[0]) return adminEmails[0];
  const domain = loginDomain();
  return value ? `${value}@${domain}`.toLowerCase() : "";
}

function authUsersFromBody(body) {
  return Array.isArray(body) ? body : Array.isArray(body?.users) ? body.users : [];
}

function normalizedActorFromAuthUser(user = {}, fallbackEmail = "") {
  const emailValue = user.email || fallbackEmail || "";
  const roleId = user.user_metadata?.role_key || user.app_metadata?.role_key || "";
  return {
    authUserId: user.id || "",
    userId: user.user_metadata?.user_id || (emailValue === adminEmailsFallback() ? "admin" : emailValue),
    userName: user.user_metadata?.user_name || user.email || emailValue,
    roleId,
    remark: user.user_metadata?.remark || "",
    stationId: user.user_metadata?.station_id || "",
    email: emailValue
  };
}

async function listAuthUsers() {
  const key = serviceRoleKey();
  if (!supabaseUrl() || !key) return [];
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "GET",
    headers: jsonHeaders(key)
  }));
  if (!response.ok) return [];
  return authUsersFromBody(body);
}

async function getAuthUserByIdentifier(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) return null;
  const users = await listAuthUsers();
  return users.find((user) => {
    const email = normalizeIdentifier(user?.email);
    const metadataUserId = normalizeIdentifier(user?.user_metadata?.user_id);
    return email === normalizedIdentifier || metadataUserId === normalizedIdentifier;
  }) || null;
}

async function resolveAuthEmail(identifier, explicitEmail = "") {
  const normalizedEmail = normalizeIdentifier(explicitEmail);
  if (normalizedEmail) return normalizedEmail;
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) return "";
  if (normalizedIdentifier.includes("@")) return normalizedIdentifier;
  const authUser = await getAuthUserByIdentifier(normalizedIdentifier);
  return normalizeIdentifier(authUser?.email) || emailFromLogin(normalizedIdentifier);
}

async function signInWithPassword({ userId, password }) {
  if (!authEnabled() || !configured()) return null;
  const key = anonKey() || serviceRoleKey();
  const email = await resolveAuthEmail(userId);
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: jsonHeaders(key),
    body: JSON.stringify({
      email,
      password
    })
  }));

  if (!response.ok) {
    return {
      status: response.status,
      body: {
        code: response.status,
        msg: body.error_description || body.msg || body.error || "Supabase login failed",
        reason: body.error_description || body.msg || body.error || "Supabase login failed",
        data: null,
        result: null,
        _proxy: {
          source: "supabase-auth",
          pathname: "/api/user/login"
        }
      }
    };
  }

  const user = body.user || {};
  const actor = normalizedActorFromAuthUser(user, email);
  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: {
        token: body.access_token,
        refreshToken: body.refresh_token,
        expiresIn: body.expires_in,
        userId: actor.userId,
        userName: actor.userName,
        roleId: actor.roleId,
        remark: actor.remark,
        stationId: actor.stationId,
        email: actor.email
      },
      result: {
        token: body.access_token,
        refreshToken: body.refresh_token,
        expiresIn: body.expires_in,
        userId: actor.userId,
        userName: actor.userName,
        roleId: actor.roleId,
        remark: actor.remark,
        stationId: actor.stationId,
        email: actor.email
      },
      _proxy: {
        source: "supabase-auth",
        pathname: "/api/user/login"
      }
    }
  };
}

async function authUserFromAccessToken(accessToken) {
  const token = String(accessToken || "").trim();
  const key = anonKey() || serviceRoleKey();
  if (!authEnabled() || !configured() || !token || !key) return null;
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`
    }
  }));
  if (!response.ok) return null;
  return normalizedActorFromAuthUser(body || {});
}

function adminEmailsFallback() {
  return String(process.env.ADMIN_EMAILS || "").split(",").map((entry) => entry.trim()).filter(Boolean)[0] || "";
}

async function createAdminUser({ email, password }) {
  const key = serviceRoleKey();
  if (!supabaseUrl() || !key) throw new Error("Supabase service role is not configured");
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: jsonHeaders(key),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "super-admin",
        user_name: "ACB(admin)"
      }
    })
  }));
  if (response.ok) return body;
  if (response.status === 422 || /already/i.test(JSON.stringify(body))) return body;
  throw new Error(body.msg || body.error || "Supabase user creation failed");
}

async function getAuthUserByUserId(userId) {
  return getAuthUserByIdentifier(userId);
}

async function createAuthUser(payload) {
  const key = serviceRoleKey();
  if (!supabaseUrl() || !key) return null;
  const email = await resolveAuthEmail(payload.userId, payload.email);
  const password = payload.password;
  if (!password) {
    return {
      code: 400,
      msg: "Password is required",
      reason: "Password is required",
      data: null
    };
  }
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: jsonHeaders(key),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role_key: payload.roleId || "operations-manager",
        user_name: payload.name || payload.nickName || payload.userName || payload.userId,
        user_id: String(payload.userId || "").trim(),
        login_email: email,
        station_id: String(payload.stationId || "").trim(),
        remark: payload.remark || ""
      }
    })
  }));
  if (response.ok) return body;
  if (response.status === 422 || /already/i.test(JSON.stringify(body))) {
    // If exists, try to update it
    const existing = await getAuthUserByUserId(payload.userId);
    if (existing) {
      return updateAuthUser(payload.userId, payload);
    }
    return body;
  }
  throw new Error(body.msg || body.error || body.message || "Supabase user creation failed");
}

async function updateAuthUser(userId, payload) {
  const key = serviceRoleKey();
  if (!supabaseUrl() || !key) return null;
  const user = await getAuthUserByUserId(userId);
  if (!user) throw new Error("User not found in Supabase Auth");
  const nextEmail = await resolveAuthEmail(userId, payload.email);
  
  const updateBody = {
    user_metadata: {
      ...user.user_metadata,
      ...(payload.roleId ? { role_key: payload.roleId } : {}),
      ...(payload.name || payload.nickName || payload.userName ? { user_name: payload.name || payload.nickName || payload.userName } : {}),
      ...(payload.userId ? { user_id: String(payload.userId).trim() } : {}),
      ...(nextEmail ? { login_email: nextEmail } : {}),
      ...(payload.stationId !== undefined ? { station_id: String(payload.stationId || "").trim() } : {}),
      ...(payload.remark !== undefined ? { remark: payload.remark } : {})
    }
  };
  if (nextEmail && normalizeIdentifier(nextEmail) !== normalizeIdentifier(user.email)) {
    updateBody.email = nextEmail;
  }
  if (payload.password) {
    updateBody.password = payload.password;
  }
  
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: jsonHeaders(key),
    body: JSON.stringify(updateBody)
  }));
  if (!response.ok) throw new Error(body.msg || body.error || body.message || "Supabase user update failed");
  return body;
}

async function deleteAuthUser(userId) {
  const key = serviceRoleKey();
  if (!supabaseUrl() || !key) return null;
  const user = await getAuthUserByUserId(userId);
  if (!user) return null; 
  
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: jsonHeaders(key)
  }));
  if (!response.ok) throw new Error(body.msg || body.error || body.message || "Supabase user deletion failed");
  return body;
}

async function ensureStorageBuckets(bucketNames = defaultBuckets) {
  const key = serviceRoleKey();
  if (!storageEnabled() || !supabaseUrl() || !key) return [];
  const results = [];
  for (const name of bucketNames) {
    const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
      method: "POST",
      headers: jsonHeaders(key),
      body: JSON.stringify({
        id: name,
        name,
        public: false,
        file_size_limit: 52428800
      })
    }));
    results.push({
      name,
      ok: response.ok || response.status === 409,
      status: response.status,
      body
    });
  }
  return results;
}

async function storageReport() {
  const key = serviceRoleKey();
  if (!storageEnabled() || !supabaseUrl() || !key) {
    return {
      enabled: false,
      buckets: []
    };
  }
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "GET",
    headers: jsonHeaders(key)
  }));
  return {
    enabled: response.ok,
    buckets: Array.isArray(body) ? body.map((bucket) => bucket.name || bucket.id).filter(Boolean) : []
  };
}

async function uploadStorageObject(bucket, objectPath, content, contentType = "application/octet-stream") {
  const key = serviceRoleKey();
  if (!storageEnabled() || !supabaseUrl() || !key) return null;
  const payload = Buffer.isBuffer(content) || content instanceof Uint8Array
    ? content
    : Buffer.from(String(content || ""), "utf8");
  const { response, body } = await readJsonResponse(await fetch(`${supabaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body: payload
  }));
  if (!response.ok) throw new Error(body.message || body.msg || body.error || "Supabase storage upload failed");
  return {
    bucket,
    path: objectPath,
    contentType,
    size: payload.length
  };
}

module.exports = {
  authEnabled,
  configured,
  createAdminUser,
  createAuthUser,
  updateAuthUser,
  deleteAuthUser,
  resolveAuthEmail,
  emailFromLogin,
  getAuthUserByIdentifier,
  getAuthUserByUserId,
  ensureStorageBuckets,
  restRequest,
  restRequestWithResponse,
  serviceConfigured,
  signInWithPassword,
  authUserFromAccessToken,
  storageEnabled,
  storageReport,
  uploadStorageObject
};
