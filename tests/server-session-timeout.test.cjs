"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JWT_SECRET = "server-session-test-secret-at-least-32-characters";
process.env.SESSION_IDLE_TIMEOUT_MS = "1800000";
process.env.SESSION_ABSOLUTE_TIMEOUT_MS = "28800000";

const handler = require("../api/reference");
const { _test } = handler;
const referenceSource = require("node:fs").readFileSync(require.resolve("../api/reference"), "utf8");

const authMeBranch = referenceSource.match(/if \(lowerPathForSession === "\/api\/auth\/me"[\s\S]*?\/\/ --- end HttpOnly session endpoints ---/)?.[0] || "";
assert.match(authMeBranch, /msg: "Access token expired"/);
assert.doesNotMatch(
  authMeBranch.match(/if \(!actor\) \{[\s\S]*?\n\s*\}/)?.[0] || "",
  /clearCrmSessionCookies/,
  "an expired access token must preserve the refresh cookie"
);

const token = "verified-access-token";
const startedAt = 1_700_000_000_000;
const session = {
  startedAt,
  lastActiveAt: startedAt,
  tokenFingerprint: _test.crmTokenFingerprint(token)
};
const signed = _test.signCrmSession(session);

assert.deepStrictEqual(_test.readCrmSession(signed), session);
assert.equal(_test.readCrmSession(`${signed}x`), null);
assert.equal(_test.crmSessionStatus(session, token, startedAt + 1_000).valid, true);
assert.deepStrictEqual(
  _test.crmSessionStatus(session, token, startedAt + 1_800_000),
  { valid: false, reason: "Session idle timeout" }
);

const activeNearAbsolute = { ...session, lastActiveAt: startedAt + 28_799_000 };
assert.deepStrictEqual(
  _test.crmSessionStatus(activeNearAbsolute, token, startedAt + 28_800_000),
  { valid: false, reason: "Session absolute timeout" }
);
assert.equal(_test.crmSessionStatus(session, "different-token", startedAt + 1_000).valid, false);

function startServer(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload || {}));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          cookies: res.headers["set-cookie"] || [],
          body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
        });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function cookieHeader(cookies) {
  return cookies.map((cookie) => String(cookie).split(";")[0]).join("; ");
}

async function withEnv(env, run) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  _test.resetContractCache();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
    _test.resetContractCache();
  }
}

async function main() {
  const server = await startServer((req, res) => {
    const apiResponse = {
      statusCode: 200,
      setHeader: (...args) => res.setHeader(...args),
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        res.statusCode = this.statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
      }
    };
    Promise.resolve(handler(req, apiResponse)).catch((error) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ code: 500, msg: error.message, data: null }));
    });
  });

  try {
    await withEnv({
      SUPABASE_AUTH_ENABLED: "false",
      DEMO_AUTH_ENABLED: "true",
      DEMO_AUTH_PASSWORD: "correct-password",
      LIVE_API_PROXY_ENABLED: "false"
    }, async () => {
      const bootstrap = await request(server.address().port, "/api/auth/session", {
        token: "local-dev-token",
        refreshToken: "local-dev-refresh-token"
      });
      assert.equal(bootstrap.status, 401);
      assert.equal(bootstrap.body.reason, "Reauthentication required");

      const login = await request(server.address().port, "/api/user/login", {
        userId: "admin",
        password: "correct-password"
      });
      assert.equal(login.status, 200);
      assert.equal(login.cookies.some((cookie) => String(cookie).startsWith("bev_session=")), true);
      assert.equal(login.cookies.some((cookie) => String(cookie).startsWith("bev_token=")), true);
      assert.equal(Number.isFinite(Number(login.body.data.startedAt)), true);

      const rotated = await request(server.address().port, "/api/auth/session", {
        token: "local-dev-token",
        refreshToken: "local-dev-refresh-token"
      }, { Cookie: cookieHeader(login.cookies) });
      assert.equal(rotated.status, 200);
      assert.equal(rotated.body.data.startedAt, login.body.data.startedAt);
    });
  } finally {
    await closeServer(server);
  }

  console.log("server session timeout passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
