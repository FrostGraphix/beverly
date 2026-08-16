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

  let rejectCreateWithBusinessError = false;
  const upstream = await startServer((req, res) => {
    if (req.url.startsWith("/api/account/create")) {
      if (rejectCreateWithBusinessError) {
        // Upstream answered — it just refused the data. Mirrors the real code 99
        // "The meter and the customer are not under the same Station."
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 99, reason: "The meter and the customer are not under the same Station.", result: null }));
        return;
      }
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
      ALLOW_LIVE_WRITES: "true",
      APPROVED_LIVE_WRITES: "true"
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
      // Upstream unreachable: the rows are queued, and the response says so
      // instead of claiming success.
      assert.strictEqual(created.status, 202);
      assert.strictEqual(created.body.code, 202);
      assert.strictEqual(created.body._proxy.source, "local-queue");
      assert.strictEqual(created.body.result.synced, false);

      const queue = await request(proxy.address().port, "POST", "/api/local/accountBindings/read", {
        status: "pending"
      }, {
        Authorization: "Bearer caller-token"
      });
      assert.strictEqual(queue.status, 200);
      const queuedRows = queue.body.result?.data || [];
      const queuedRow = queuedRows.find((row) => row.customerId === "CUS-9001" && row.meterId === "MTR-9001");
      assert(queuedRow, "unsynced binding should be visible in the pending queue");
      assert.strictEqual(queuedRow.status, "pending");
      assert(queuedRow.lastError, "pending row should carry the reason it is not live");

      // A read must never be padded with, or substituted by, queued rows —
      // that is what made totals and pagination wrong and what dressed stale
      // local rows up as the live register. A failed read fails visibly.
      const read = await request(proxy.address().port, "POST", "/api/account/read", {
        stationId: "TUNGA",
        pageNumber: 1,
        pageSize: 20
      }, {
        Authorization: "Bearer caller-token"
      });
      assert.notStrictEqual(read.body._proxy?.source, "local-fallback");
      const readRows = read.body.result?.data || read.body.data?.data || [];
      assert.strictEqual(
        readRows.some((row) => row.customerId === "CUS-9001"),
        false,
        "queued rows must never appear in the account list"
      );

      // Upstream answered with a business rejection: return it verbatim, and
      // never report the row as created.
      rejectCreateWithBusinessError = true;
      const rejected = await request(proxy.address().port, "POST", "/api/account/create", [{
        customerId: "CUS-9002",
        meterId: "MTR-9002",
        tariffId: "RESIDENTIAL",
        ctRatio: "200/5",
        stationId: "BONDU",
        remark: "rejection test"
      }], {
        Authorization: "Bearer caller-token"
      });
      assert.strictEqual(rejected.body.code, 99);
      assert.match(rejected.body.reason, /not under the same Station/);
      assert.notStrictEqual(rejected.body._proxy?.source, "local-fallback");

      const rejectedQueue = await request(proxy.address().port, "POST", "/api/local/accountBindings/read", {
        status: "pending"
      }, {
        Authorization: "Bearer caller-token"
      });
      const rejectedRow = (rejectedQueue.body.result?.data || []).find((row) => row.meterId === "MTR-9002");
      assert(rejectedRow, "rejected row should be queued for review");
      assert.match(rejectedRow.lastError, /not under the same Station/);
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
