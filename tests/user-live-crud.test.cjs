"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
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
      setHeader(name, value) {
        res.setHeader(name, value);
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
      res.end(JSON.stringify({ code: 500, reason: error.message }));
    });
  });
}

function post(port, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers: {
        Authorization: "Bearer local-dev-token",
        "Content-Type": "application/json",
        "Content-Length": body.length
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function main() {
  const dbPath = path.join(__dirname, "..", "tmp", `user-live-crud-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const received = [];
  const upstream = await startServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, reason: "success", result: { accepted: true } }));
    });
  });
  const proxy = await createProxyServer();

  const environment = {
    LOCAL_DB_PATH: dbPath,
    LIVE_API_PROXY_ENABLED: "true",
    LIVE_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    LIVE_API_BEARER_TOKEN: "calinmeter-token",
    ALLOW_LIVE_WRITES: "true",
    APPROVED_LIVE_WRITES: "true",
    DEMO_AUTH_ENABLED: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: ""
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  handler._test.resetContractCache();

  try {
    const cases = [
      {
        pathname: "/api/user/create",
        payload: [{ userId: "CRUD_TEST", nickName: "Crud Test", roleId: "admin", stationId: "KYAKALE", status: true }]
      },
      {
        pathname: "/api/user/update",
        payload: [{ userId: "CRUD_TEST", nickName: "Updated Test", roleId: "admin", stationId: "KYAKALE", status: false }]
      },
      {
        pathname: "/api/user/delete",
        payload: [{ userId: "CRUD_TEST" }]
      }
    ];

    for (const testCase of cases) {
      const response = await post(proxy.address().port, testCase.pathname, testCase.payload);
      assert.strictEqual(response.status, 200, `${testCase.pathname} must return Calinmeter's response`);
      assert.strictEqual(response.body._proxy?.source, "live", `${testCase.pathname} must identify the live source`);
    }

    assert.deepStrictEqual(received.map((entry) => entry.url), cases.map((entry) => entry.pathname));
    assert.deepStrictEqual(received.map((entry) => entry.body), cases.map((entry) => entry.payload));
    assert(received.every((entry) => entry.method === "POST"), "Every Calinmeter user mutation must use POST.");
    assert(received.every((entry) => entry.authorization === "Bearer calinmeter-token"), "Every mutation must use server-held Calinmeter credentials.");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
    handler._test.resetContractCache();
    await closeServer(proxy);
    await closeServer(upstream);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().then(() => {
  console.log("user live CRUD passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
