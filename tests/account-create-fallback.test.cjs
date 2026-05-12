"use strict";

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
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

function request(port, method, targetPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: targetPath,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length,
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
    if (payload.length) req.write(payload);
    req.end();
  });
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
      res.end(JSON.stringify({ code: 500, reason: error.message }));
    });
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
  const dbPath = path.join(__dirname, "..", "tmp", `account-fallback-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const upstream = await startServer((req, res) => {
    if (req.url.startsWith("/api/account/create")) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 502, reason: "upstream account create failed", result: null }));
      return;
    }
    if (req.url.startsWith("/api/account/read")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 503, reason: "upstream account read unavailable", result: null }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 404, reason: "not found", result: null }));
  });
  const proxy = await createProxyServer();

  try {
    await withEnv({
      LOCAL_DB_PATH: dbPath,
      SESSION_STORE_MODE: "local",
      SUPABASE_AUTH_ENABLED: "false",
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
      LIVE_API_BEARER_TOKEN: "env-token",
      ALLOW_LIVE_WRITES: "true"
    }, async () => {
      const created = await request(proxy.address().port, "POST", "/api/account/create", [{
        customerId: "CUS-9001",
        meterId: "MTR-9001",
        tariffId: "RESIDENTIAL",
        ctRatio: "200/5",
        stationId: "TUNGA",
        remark: "fallback test"
      }], {
        Authorization: "Bearer caller-token"
      });
      assert.strictEqual(created.status, 200);
      assert.strictEqual(created.body._proxy.source, "local-fallback");

      const read = await request(proxy.address().port, "POST", "/api/account/read", {
        stationId: "TUNGA",
        pageNumber: 1,
        pageSize: 20
      }, {
        Authorization: "Bearer caller-token"
      });
      assert.strictEqual(read.status, 200);
      assert(read.body._proxy.source.includes("local"));
      const rows = read.body.result?.data || read.body.data?.data || [];
      const createdRow = rows.find((row) => row.customerId === "CUS-9001" && row.meterId === "MTR-9001");
      assert(createdRow, "created local fallback row should be readable");
      assert.strictEqual(createdRow.stationId, "TUNGA");
    });

    console.log("account-create-fallback ok");
  } finally {
    await closeServer(proxy);
    await closeServer(upstream);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
