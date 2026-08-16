"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const handler = require("../api/reference");

const app = fs.readFileSync(path.join(__dirname, "../api/reference.js"), "utf8");
const supabase = fs.readFileSync(path.join(__dirname, "../backend/src/services/supabase-service.js"), "utf8");

assert.match(app, /if \(pathname === "\/api\/user\/login"\) \{[\s\S]*?dispatchLocalDatabaseAction[\s\S]*?\} else \{\s*await refreshLiveWriteControl\(\)/, "Login must bypass the optional live-write flag refresh.");
assert.match(supabase, /AbortSignal\.timeout\(supabaseRequestTimeoutMs\(timeoutMs\)\)/, "Supabase calls must have a bounded timeout.");
assert.match(supabase, /const authRequestTimeoutMs = 45000;/, "Login must have enough time to complete before the browser deadline.");
assert.match(supabase, /auth\/v1\/token\?grant_type=password`, \{\s*timeoutMs: authRequestTimeoutMs,/, "Password login must use the authentication timeout.");
assert.match(app, /if \(pathname\.toLowerCase\(\) === "\/api\/user\/login"\) \{\s*\/\/ Login responses contain session material and must not wait on optional persistence\.\s*void auditResult\(request, pathname, result\);\s*response\.status\(result\.status\)\.json\(result\.body\);\s*return;/, "Login must respond before optional persistence work.");

const originalFetch = global.fetch;
const previousEnv = {
  SUPABASE_AUTH_ENABLED: process.env.SUPABASE_AUTH_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
  handler._test.resetContractCache();
}

function request(port) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ userId: "admin@acoblighting.com", password: "password" }));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/user/login",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": body.length }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

(async () => {
  process.env.SUPABASE_AUTH_ENABLED = "true";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.JWT_SECRET = "test-session-secret";
  process.env.VERCEL_ENV = "production";
  handler._test.resetContractCache();
  global.fetch = async (url) => {
    assert(!String(url).includes("/feature_flags"), "Login must not query the live-write feature flag.");
    assert(String(url).includes("/auth/v1/token?grant_type=password"), "Login must call Supabase Auth directly.");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        user: { id: "admin-auth", email: "admin@acoblighting.com", user_metadata: { user_id: "admin", role_key: "super-admin" } }
      })
    };
  };
  const server = http.createServer((req, res) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { res.setHeader(name, value); },
      json(body) { res.statusCode = this.statusCode; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); }
    };
    Promise.resolve(handler(req, response)).catch((error) => { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await request(server.address().port);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.data.roleId, "super-admin");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnvironment();
  }
  console.log("login-timeout-resilience ok");
})().catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exit(1);
});
