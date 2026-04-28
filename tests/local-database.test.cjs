"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const handler = require("../api/reference");
const localDatabase = require("../backend/src/services/local-database");

function startServer(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, method, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload)) : Buffer.alloc(0);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length
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
  const dbPath = path.join(__dirname, "..", "tmp", `phase9-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const upstream = await startServer((req, res) => {
    if (req.url === "/api/cache-only/read?scope=test") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 200, msg: "success", data: { records: [{ cacheId: "live-1" }], total: 1 } }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 404, msg: "not found", data: null }));
  });
  const proxy = await createProxyServer();
  const proxyPort = proxy.address().port;
  const upstreamPort = upstream.address().port;

  try {
    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      ALLOW_LIVE_WRITES: "true"
    }, async () => {
      const liveRead = await request(proxyPort, "POST", "/api/cache-only/read?scope=test", { page: 1 });
      assert.strictEqual(liveRead.status, 200);
      assert.strictEqual(liveRead.body._proxy.source, "live");
    });

    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: "http://127.0.0.1:1",
      ALLOW_LIVE_WRITES: "true"
    }, async () => {
      const cachedRead = await request(proxyPort, "POST", "/api/cache-only/read?scope=test", { page: 1 });
      assert.strictEqual(cachedRead.status, 200);
      assert.strictEqual(cachedRead.body._proxy.source, "cache");

      const exportJob = await request(proxyPort, "POST", "/api/local/exportJob/create", {
        routeHash: "#/management/account",
        rowCount: 2,
        format: "csv",
        status: "completed"
      });
      assert.strictEqual(exportJob.status, 200);
      assert.strictEqual(exportJob.body.data.kind, "export");

      const printJob = await request(proxyPort, "POST", "/api/local/printJob/create", {
        routeHash: "#/token/credit-token-record",
        receiptType: "credit",
        mode: "pdf",
        status: "completed"
      });
      assert.strictEqual(printJob.status, 200);
      assert.strictEqual(printJob.body.data.kind, "print");

      const importWrite = await request(proxyPort, "POST", "/api/account/import", [{
        routeHash: "#/management/account",
        fileName: "accounts.csv",
        rows: [{ customerId: "4700" }],
        items: [{ customerId: "4700" }],
        confirmationText: "Confirm import for Account",
        authorizationProvided: true,
        action: "Import"
      }]);
      assert.strictEqual(importWrite.status, 200);
    });

    await withEnv({
      LOCAL_DB_PATH: dbPath
    }, async () => {
      const counts = localDatabase.tableCounts();
      assert.strictEqual(fs.existsSync(dbPath), true);
      assert(counts.users >= 3);
      assert(counts.roles >= 3);
      assert(counts.permissions >= 5);
      assert(counts.api_cache >= 1);
      assert(counts.audit_logs >= 4);
      assert(counts.import_jobs >= 1);
      assert(counts.export_jobs >= 1);
      assert(counts.print_jobs >= 1);
      assert(counts.write_confirmations >= 1);

      console.log(JSON.stringify({
        cacheRows: counts.api_cache,
        auditRows: counts.audit_logs,
        importJobs: counts.import_jobs,
        exportJobs: counts.export_jobs,
        printJobs: counts.print_jobs,
        status: "local database passed"
      }, null, 2));
    });
  } finally {
    await closeServer(proxy);
    await closeServer(upstream);
    localDatabase.resetForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
