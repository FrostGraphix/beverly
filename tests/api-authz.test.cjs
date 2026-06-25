"use strict";

const assert = require("assert");
const http = require("http");
const handler = require("../api/reference");

function startServer(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createProxyServer() {
  return startServer((req, res) => {
    const apiResponse = {
      statusCode: 200,
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
}

function request(port, method, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload)) : Buffer.alloc(0);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          body: text ? JSON.parse(text) : {}
        });
      });
    });
    req.on("error", reject);
    if (body.length) req.write(body);
    req.end();
  });
}

async function withEnv(env, run) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  handler._test.resetContractCache();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
    handler._test.resetContractCache();
  }
}

async function main() {
  const authServer = await startServer((req, res) => {
    if (req.url !== "/auth/v1/user") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token === "ops-token") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "ops-auth",
        email: "ops@org.acoblighting.com",
        user_metadata: {
          user_id: "ops",
          user_name: "Ops User",
          role_key: "operations-manager",
          station_id: "UMAISHA",
          remark: ""
        }
      }));
      return;
    }
    if (token === "vendor-token" || token === "self-token") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "vendor-auth",
        email: "temper@org.acoblighting.com",
        user_metadata: {
          user_id: "TEMPER",
          user_name: "TEMPER",
          role_key: "VENDOR",
          station_id: "UMAISHA",
          remark: "Token.CreditToken,RemoteMeterTask.CreateTokenTask,RemoteMeterTaskRecord.GetTokenTask"
        }
      }));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid token" }));
  });
  const proxy = await createProxyServer();
  const port = proxy.address().port;
  const authPort = authServer.address().port;

  try {
    await withEnv({
      SUPABASE_AUTH_ENABLED: "true",
      SUPABASE_URL: `http://127.0.0.1:${authPort}`,
      SUPABASE_ANON_KEY: "anon-test",
      LIVE_API_PROXY_ENABLED: "false",
      ALLOW_LIVE_WRITES: "false"
    }, async () => {
      const unauthenticated = await request(port, "POST", "/api/user/read", { userId: "admin", pageNumber: 1, pageSize: 1 });
      assert.strictEqual(unauthenticated.status, 401);
      assert.strictEqual(unauthenticated.body._proxy.source, "authz");

      const forbiddenAdminRead = await request(port, "POST", "/api/user/read", { userId: "admin", pageNumber: 1, pageSize: 1 }, {
        Authorization: "Bearer ops-token"
      });
      assert.strictEqual(forbiddenAdminRead.status, 403);
      assert.strictEqual(forbiddenAdminRead.body.reason, "Super admin required");

      const selfRead = await request(port, "POST", "/api/user/read", { userId: "TEMPER", pageNumber: 1, pageSize: 1 }, {
        Authorization: "Bearer self-token"
      });
      assert.notStrictEqual(selfRead.status, 401);
      assert.notStrictEqual(selfRead.status, 403);

      const permittedVendorWrite = await request(port, "POST", "/API/RemoteMeterTask/CreateTokenTask", [{ meterId: "4700", stationId: "UMAISHA" }], {
        Authorization: "Bearer vendor-token",
        "X-Route-Hash": "#/remote-operation/remote-meter-token",
        "X-Route-Action": "Add Task"
      });
      assert.strictEqual(permittedVendorWrite.status, 403);
      assert.strictEqual(permittedVendorWrite.body._proxy.source, "guard");

      const blockedStationWrite = await request(port, "POST", "/API/RemoteMeterTask/CreateTokenTask", [{ meterId: "4700", stationId: "TUNGA" }], {
        Authorization: "Bearer vendor-token",
        "X-Route-Hash": "#/remote-operation/remote-meter-token",
        "X-Route-Action": "Add Task"
      });
      assert.strictEqual(blockedStationWrite.status, 403);
      assert.strictEqual(blockedStationWrite.body.reason, "Station scope violation");
    });

    console.log(JSON.stringify({
      status: "api authz passed"
    }, null, 2));
  } finally {
    await closeServer(proxy);
    await closeServer(authServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
