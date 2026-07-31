"use strict";

// Covers the account page's live-data contract:
//   1. the unfiltered upstream read reports total = page length, so the proxy
//      resolves the real total by walking pages;
//   2. queued bindings are pushed to the live API on retry and leave the queue
//      only when upstream accepts them;
//   3. the import pre-check catches the station mismatch upstream rejects.

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

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    });
  });
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
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
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

const totalAccounts = 1250;
const totalMeters = 1300;
// Meters whose index is divisible by 5 are switched off upstream.
const meterIsActive = (index) => index % 5 !== 0;
const activeMeters = Array.from({ length: totalAccounts }, (_, i) => i).filter(meterIsActive).length;

function meterRow(index) {
  return {
    meterId: `M-${String(index).padStart(5, "0")}`,
    status: meterIsActive(index),
    stationId: "UMAISHA"
  };
}

function accountRow(index) {
  return {
    customerId: `C-${String(index).padStart(5, "0")}`,
    meterId: `M-${String(index).padStart(5, "0")}`,
    tariffId: "RESIDENTIAL",
    ctRatio: "1",
    stationId: "UMAISHA",
    customerName: `CUSTOMER ${index}`,
    remark: null
  };
}

async function main() {
  const dbPath = path.join(__dirname, "..", "tmp", `account-live-sync-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const accepted = [];
  let acceptCreates = false;
  let readCalls = 0;

  const upstream = await startServer(async (req, res) => {
    const payload = await readBody(req);
    const send = (body) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (/\/account\/read/i.test(req.url)) {
      readCalls += 1;
      const pageSize = Math.max(1, Number(payload.pageSize) || 20);
      const pageNumber = Math.max(1, Number(payload.pageNumber) || 1);
      const start = (pageNumber - 1) * pageSize;
      const rows = [];
      for (let index = start; index < Math.min(start + pageSize, totalAccounts); index += 1) {
        rows.push(accountRow(index));
      }
      // The real upstream reports the page length as the total for unfiltered reads.
      send({ code: 0, reason: "success", result: { total: rows.length, data: rows } });
      return;
    }
    if (/\/meter\/read/i.test(req.url)) {
      const pageSize = Math.max(1, Number(payload.pageSize) || 20);
      const pageNumber = Math.max(1, Number(payload.pageNumber) || 1);
      const start = (pageNumber - 1) * pageSize;
      const rows = [];
      for (let index = start; index < Math.min(start + pageSize, totalMeters); index += 1) {
        rows.push(meterRow(index));
      }
      send({ code: 0, reason: "success", result: { total: totalMeters, data: rows } });
      return;
    }
    if (/\/account\/import/i.test(req.url)) {
      // Real upstream behaviour: one bad row rejects the whole batch.
      send({ code: 99, reason: "Please check the information and try again", result: null });
      return;
    }
    if (/\/account\/create/i.test(req.url)) {
      const rows = Array.isArray(payload) ? payload : [payload];
      if (rows.some((row) => String(row.stationId || "") === "BADSTATION")) {
        send({ code: 99, reason: "The meter and the customer are not under the same Station.", result: null });
        return;
      }
      if (!acceptCreates) {
        send({ code: 99, reason: "The meter and the customer are not under the same Station.", result: null });
        return;
      }
      accepted.push(...rows);
      send({ code: 0, reason: "success", result: { data: payload } });
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
      const port = proxy.address().port;
      const auth = { Authorization: "Bearer caller-token" };

      // 1. Total resolution — a saturated page whose declared total only covers
      // that page must come back with the real count behind it.
      const firstPage = await request(port, "POST", "/api/account/read", { pageNumber: 1, pageSize: 10 }, auth);
      assert.strictEqual(firstPage.status, 200);
      assert.strictEqual(firstPage.body.result.data.length, 10, "page size must be respected");
      assert.strictEqual(firstPage.body.result.total, totalAccounts, "total must be resolved, not echoed from the page");
      assert.strictEqual(firstPage.body._proxy.totalSource, "resolved-page-walk");

      // The resolved total is cached, so a second read does not re-walk.
      const callsBefore = readCalls;
      const secondPage = await request(port, "POST", "/api/account/read", { pageNumber: 2, pageSize: 10 }, auth);
      assert.strictEqual(secondPage.body.result.total, totalAccounts);
      assert(readCalls - callsBefore <= 2, `expected the walk to be cached, saw ${readCalls - callsBefore} upstream reads`);
      assert.notStrictEqual(
        secondPage.body.result.data[0].meterId,
        firstPage.body.result.data[0].meterId,
        "pages must advance"
      );

      // A short page needs no walk and keeps upstream's own total.
      const lastPage = await request(port, "POST", "/api/account/read", { pageNumber: 125, pageSize: 10 }, auth);
      assert.strictEqual(lastPage.body.result.data.length, 10);

      // 2. Queue then retry against the live API.
      const rejected = await request(port, "POST", "/api/account/create", [{
        customerId: "C-90001",
        meterId: "M-90001",
        tariffId: "RESIDENTIAL",
        ctRatio: "1",
        stationId: "BONDU",
        remark: ""
      }], auth);
      assert.strictEqual(rejected.body.code, 99, "upstream rejection must reach the caller");

      const pending = await request(port, "POST", "/api/local/accountBindings/read", { status: "pending" }, auth);
      assert.strictEqual((pending.body.result.data || []).length, 1);

      const failedRetry = await request(port, "POST", "/api/local/accountBindings/retry", {}, auth);
      assert.strictEqual(failedRetry.body.result.synced, 0);
      assert.strictEqual(failedRetry.body.result.failed, 1);

      acceptCreates = true;
      const retry = await request(port, "POST", "/api/local/accountBindings/retry", {}, auth);
      assert.strictEqual(retry.body.result.synced, 1, "retry must push the row to the live API");
      assert.strictEqual(retry.body.result.failed, 0);
      assert.strictEqual(accepted.length, 1, "upstream must have received the binding");
      assert.strictEqual(accepted[0].meterId, "M-90001");

      const drained = await request(port, "POST", "/api/local/accountBindings/read", { status: "pending" }, auth);
      assert.strictEqual((drained.body.result.data || []).length, 0, "synced rows must leave the queue");

      // 3. A batch import rejected as a whole still lands the good rows.
      const acceptedBefore = accepted.length;
      const mixedImport = await request(port, "POST", "/api/account/import", [
        { customerId: "C-70001", meterId: "M-70001", tariffId: "RESIDENTIAL", ctRatio: "1", stationId: "UMAISHA", remark: "" },
        { customerId: "C-70002", meterId: "M-70002", tariffId: "RESIDENTIAL", ctRatio: "1", stationId: "BADSTATION", remark: "" },
        { customerId: "C-70003", meterId: "M-70003", tariffId: "RESIDENTIAL", ctRatio: "1", stationId: "UMAISHA", remark: "" }
      ], auth);
      assert.strictEqual(mixedImport.body.code, 207, "a partly-accepted import must report itself as partial");
      assert.strictEqual(mixedImport.body.result.synced, 2);
      assert.strictEqual(mixedImport.body.result.failed, 1);
      assert.strictEqual(accepted.length - acceptedBefore, 2, "good rows must reach upstream");

      const afterImport = await request(port, "POST", "/api/local/accountBindings/read", { status: "pending" }, auth);
      const failedRows = afterImport.body.result.data || [];
      assert.strictEqual(failedRows.length, 1, "only the rejected row stays queued");
      assert.strictEqual(failedRows[0].meterId, "M-70002");
      assert.match(failedRows[0].lastError, /not under the same Station/);

      // 4. KPI figures are counted, not sampled.
      const stats = await request(port, "POST", "/api/local/meterStats/read", {}, auth);
      assert.strictEqual(stats.status, 200);
      const figures = stats.body.result;
      assert.strictEqual(figures.exact, true);
      assert.strictEqual(figures.totalMeters, totalMeters);
      assert.strictEqual(figures.connectedMeters, totalAccounts);
      assert.strictEqual(figures.activeMeters, activeMeters, "active = connected meters that are switched on");
      assert.strictEqual(figures.inactiveMeters, totalAccounts - activeMeters);
      assert.strictEqual(figures.unassignedMeters, totalMeters - totalAccounts);
    });

    // 3. Import pre-check catches the mismatch before anything is submitted.
    const { accountPreflightIssue } = await import("../src/services/account-import-preflight.mjs");
    const mismatch = accountPreflightIssue(
      { customerId: "C-1", meterId: "M-1", stationId: "BONDU" },
      { customerId: "C-1", stationId: "BONDU" },
      { meterId: "M-1", stationId: "0001" }
    );
    assert.strictEqual(mismatch.kind, "station-mismatch");
    assert.strictEqual(mismatch.blocking, true);
    assert.deepStrictEqual(mismatch.fix, {
      action: "align-meter-station",
      meterId: "M-1",
      fromStation: "0001",
      toStation: "BONDU"
    });

    const missingMeter = accountPreflightIssue(
      { customerId: "C-1", meterId: "M-404", stationId: "BONDU" },
      { customerId: "C-1", stationId: "BONDU" },
      null
    );
    assert.strictEqual(missingMeter.kind, "missing-meter");

    const clean = accountPreflightIssue(
      { customerId: "C-1", meterId: "M-1", stationId: "BONDU" },
      { customerId: "C-1", stationId: "BONDU" },
      { meterId: "M-1", stationId: "BONDU" }
    );
    assert.strictEqual(clean, null);

    console.log("account-live-sync ok");
  } finally {
    await closeServer(proxy);
    await closeServer(upstream);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
