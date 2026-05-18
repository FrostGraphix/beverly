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

function request(port, method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || Buffer.alloc(0);
    const headers = { ...(options.headers || {}) };
    if (body.length && !headers["Content-Length"]) headers["Content-Length"] = body.length;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers
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
  const dbPath = path.join(__dirname, "..", "tmp", `live-proxy-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const upstreamRequests = [];
  const upstream = await startServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      upstreamRequests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || "",
        contentType: req.headers["content-type"] || "",
        body: Buffer.concat(chunks).toString("utf8")
      });

      if (req.url.startsWith("/API/RemoteMeterTask/GetReadingTask")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { records: [{ meterId: "4700" }], total: 1 } }));
        return;
      }

      if (req.url.startsWith("/API/RemoteMeterTask/CreateControlTask")) {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "[]");
        const row = Array.isArray(body) ? body[0] : body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { created: true, echo: row } }));
        return;
      }

      if (req.url.startsWith("/API/GPRSMeterTask/GPRSGetReadingTask")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { records: [{ id: "GPRS-1", gatewayId: "GW-01" }], total: 1 } }));
        return;
      }

      if (req.url.startsWith("/api/account/read")) {
        if (req.headers.authorization !== "Bearer env-token") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 401, reason: "wrong token", result: null }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 99, reason: "Query failed, please try again", result: null }));
        return;
      }

      if (req.url.startsWith("/api/customer/read")) {
        if (req.headers.authorization !== "Bearer env-token") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 401, reason: "wrong token", result: null }));
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const pageNumber = Number(body.pageNumber || 1);
        const pageSize = Number(body.pageSize || 20);
        const start = (pageNumber - 1) * pageSize;
        const rows = Array.from({ length: pageSize }, (_, index) => {
          const rowNumber = start + index + 1;
          return {
            customerId: `LIVE-CUSTOMER-${String(rowNumber).padStart(4, "0")}`,
            customerName: `Live Customer ${rowNumber}`,
            stationId: "KYAKALE"
          };
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { total: 2456, data: rows } }));
        return;
      }

      if (req.url.startsWith("/api/item/read")) {
        if (req.headers.authorization !== "Bearer env-token") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 401, reason: "wrong token", result: null }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { total: 1, data: [{ itemType: "PAYMENT_METHOD", itemName: "Cash" }] } }));
        return;
      }

      if (req.url.startsWith("/api/account/create")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { created: true } }));
        return;
      }

      if (req.url.startsWith("/API/File/Upload")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "upload success", result: { uploaded: true } }));
        return;
      }

      if (req.url.startsWith("/api/fail/network")) {
        req.socket.destroy();
        return;
      }

      if (req.url.startsWith("/api/fail/server")) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 503, reason: "upstream down", result: null }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 404, reason: "not found", result: null }));
    });
  });

  const proxy = await createProxyServer();
  const upstreamPort = upstream.address().port;
  const proxyPort = proxy.address().port;
  const originalError = console.error;
  const originalInfo = console.info;
  const errors = [];
  const infos = [];
  console.error = (...args) => errors.push(args.join(" "));
  console.info = (...args) => infos.push(args.join(" "));

  try {
    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      LIVE_API_BEARER_TOKEN: "env-token",
      ALLOW_LIVE_WRITES: "true"
    }, async () => {
      const liveRead = await request(proxyPort, "POST", "/api/remoteMeterTask/getReadingTask?SITE_ID=KYAKALE", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ page: 1 }))
      });
      assert.strictEqual(liveRead.status, 200);
      assert.strictEqual(liveRead.body.reason, "success");
      assert.strictEqual(liveRead.body.msg, "success");
      assert.deepStrictEqual(liveRead.body.data, liveRead.body.result);
      assert.strictEqual(liveRead.body._proxy.source, "live");

      // --- Meter Control Task smoke tests ---
      const controlSwitchOn = await request(proxyPort, "POST", "/api/API/RemoteMeterTask/CreateControlTask", {
        headers: { "Content-Type": "application/json", Authorization: "Bearer caller-token" },
        body: Buffer.from(JSON.stringify([{
          customerId: "C001", customerName: "Test", meterId: "M001",
          version: "2.2", flag: "1", name: "Switch On",
          dataItem: "Switch On", dataDefault: "1", dataPrefix: "",
          data: "1", stationId: "0001", remark: ""
        }]))
      });
      assert.strictEqual(controlSwitchOn.status, 200, "Switch On: expected 200");
      assert.strictEqual(controlSwitchOn.body.reason, "success", "Switch On: expected success");
      const echoOn = controlSwitchOn.body.result?.echo || controlSwitchOn.body.data?.result?.echo;
      assert.strictEqual(echoOn?.flag, "1", "Switch On: flag must be '1', not label string");
      assert.strictEqual(echoOn?.data, "1", "Switch On: data must be '1'");

      const controlSwitchOff = await request(proxyPort, "POST", "/api/API/RemoteMeterTask/CreateControlTask", {
        headers: { "Content-Type": "application/json", Authorization: "Bearer caller-token" },
        body: Buffer.from(JSON.stringify([{
          customerId: "C001", customerName: "Test", meterId: "M001",
          version: "2.2", flag: "0", name: "Switch Off",
          dataItem: "Switch Off", dataDefault: "0", dataPrefix: "",
          data: "0", stationId: "0001", remark: ""
        }]))
      });
      assert.strictEqual(controlSwitchOff.status, 200, "Switch Off: expected 200");
      assert.strictEqual(controlSwitchOff.body.reason, "success", "Switch Off: expected success");
      const echoOff = controlSwitchOff.body.result?.echo || controlSwitchOff.body.data?.result?.echo;
      assert.strictEqual(echoOff?.flag, "0", "Switch Off: flag must be '0', not label string");
      assert.strictEqual(echoOff?.data, "0", "Switch Off: data must be '0'");

      const gprsRead = await request(proxyPort, "POST", "/api/API/GPRSMeterTask/GPRSGetReadingTask", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({ pageNumber: 1, pageSize: 10 }))
      });
      assert.strictEqual(gprsRead.status, 200);
      assert.strictEqual(gprsRead.body.reason, "success");
      assert.strictEqual(gprsRead.body._proxy.pathname, "/API/GPRSMeterTask/GPRSGetReadingTask");
      assert.strictEqual(gprsRead.body.result.records[0].gatewayId, "GW-01");

      const accountRead = await request(proxyPort, "POST", "/api/account/read", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ page: 1 }))
      });
      assert.strictEqual(accountRead.status, 200);
      assert.strictEqual(accountRead.body._proxy.source, "sample");
      assert(accountRead.body.result.data.length > 0);

      const customerRead = await request(proxyPort, "POST", "/api/customer/read", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ pageNumber: 1, pageSize: 500 }))
      });
      assert.strictEqual(customerRead.status, 200);
      assert.strictEqual(customerRead.body._proxy.source, "live");
      assert.strictEqual(customerRead.body.result.total, 2456);
      assert.strictEqual(customerRead.body.result.data.length, 500);
      assert.strictEqual(customerRead.body.result.data[0].customerId, "LIVE-CUSTOMER-0001");

      const customerReadPage2 = await request(proxyPort, "POST", "/api/customer/read", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ pageNumber: 2, pageSize: 500 }))
      });
      assert.strictEqual(customerReadPage2.status, 200);
      assert.strictEqual(customerReadPage2.body._proxy.source, "live");
      assert.strictEqual(customerReadPage2.body.result.total, 2456);
      assert.strictEqual(customerReadPage2.body.result.data.length, 500);
      assert.strictEqual(customerReadPage2.body.result.data[0].customerId, "LIVE-CUSTOMER-0501");

      const itemRead = await request(proxyPort, "POST", "/api/item/read", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ pageNumber: 1, pageSize: 20 }))
      });
      assert.strictEqual(itemRead.status, 200);
      assert.strictEqual(itemRead.body.reason, "success");
      assert.strictEqual(itemRead.body.result.data[0].itemType, "PAYMENT_METHOD");

      const accountCreate = await request(proxyPort, "POST", "/api/account/create", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify([{ customerId: "1" }]))
      });
      assert.strictEqual(accountCreate.status, 200);
      assert.strictEqual(accountCreate.body._proxy.source, "live");

      const uploadBoundary = "----acob-boundary";
      const uploadBody = Buffer.from(`--${uploadBoundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sample.txt\"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${uploadBoundary}--\r\n`);
      const upload = await request(proxyPort, "POST", "/api/file/upload", {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${uploadBoundary}`
        },
        body: uploadBody
      });
      assert.strictEqual(upload.status, 200);
      assert.strictEqual(upload.body.reason, "upload success");
      assert.strictEqual(upload.body._proxy.source, "live");

      const fallback = await request(proxyPort, "POST", "/api/fail/server", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({}))
      });
      assert.strictEqual(fallback.status, 502);
      assert.strictEqual(fallback.body._proxy.source, "live-required");

      const readMore = await request(proxyPort, "GET", "/api/token/creditTokenRecord/readMore?FROM=2026-01-01T00:00:00.000Z&TO=2026-01-17T00:00:00.000Z&SITE_ID=KYAKALE");
      assert.strictEqual(readMore.status, 200);
      assert.strictEqual(readMore.body._proxy.source, "sample");
      const readMoreRows = readMore.body.result?.data || readMore.body.data?.data || readMore.body.payments || readMore.body.result || readMore.body.data || [];
      assert(readMoreRows.length > 0);

      const dashboardHourly = await request(proxyPort, "GET", "/api/dashboard/hourly?from=2026-03-29T00:00:00.000Z&to=2026-04-27T23:59:59.999Z&siteId=KYAKALE&pageNumber=1&pageSize=50");
      assert.strictEqual(dashboardHourly.status, 200);
      assert.strictEqual(dashboardHourly.body._proxy.pathname, "/api/dashboard/hourly");

      const dashboardGprs = await request(proxyPort, "GET", "/api/dashboard/gprs?from=2026-03-29T00:00:00.000Z&to=2026-04-27T23:59:59.999Z&siteId=KYAKALE&pageNumber=1&pageSize=48");
      assert.strictEqual(dashboardGprs.status, 200);
      assert.strictEqual(dashboardGprs.body._proxy.pathname, "/api/dashboard/gprs");

      const dashboardEvents = await request(proxyPort, "GET", "/api/dashboard/events?from=2026-03-29T00:00:00.000Z&to=2026-04-27T23:59:59.999Z&siteId=KYAKALE&pageNumber=1&pageSize=20");
      assert.strictEqual(dashboardEvents.status, 200);
      assert.strictEqual(dashboardEvents.body._proxy.pathname, "/api/dashboard/events");
    });

    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "false",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      LIVE_API_BEARER_TOKEN: "env-token",
      ALLOW_LIVE_WRITES: "false",
      DEMO_AUTH_ENABLED: "true",
      DEMO_AUTH_PASSWORD: "test-demo-password"
    }, async () => {
      const localLogin = await request(proxyPort, "POST", "/api/user/login", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({ userId: "admin", password: "test-demo-password" }))
      });
      assert.strictEqual(localLogin.status, 200);
      assert.strictEqual(localLogin.body.data.userId, "admin");
      assert.strictEqual(localLogin.body._proxy.source, "local-auth");

      const blockedWrite = await request(proxyPort, "POST", "/api/account/create", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify([{ customerId: "1" }]))
      });
      assert.strictEqual(blockedWrite.status, 403);
      assert.strictEqual(blockedWrite.body._proxy.source, "guard");

      const tokenPreview = await request(proxyPort, "POST", "/api/token/creditToken/generate", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({
          customerId: "C-1",
          meterId: "M-1",
          amount: 500,
          totalUnit: 1.4,
          isPreview: true
        }))
      });
      assert.strictEqual(tokenPreview.status, 200);
      assert.strictEqual(tokenPreview.body.code, 0);
      assert.strictEqual(tokenPreview.body._proxy.source, "local-token-preview");
      assert.ok(tokenPreview.body.data.token);

      const tokenConfirm = await request(proxyPort, "POST", "/api/token/creditToken/generate", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({
          customerId: "C-1",
          meterId: "M-1",
          amount: 500,
          totalUnit: 1.4,
          isPreview: false
        }))
      });
      assert.strictEqual(tokenConfirm.status, 403);
      assert.strictEqual(tokenConfirm.body._proxy.source, "guard");
    });

    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: "http://127.0.0.1:1",
      LIVE_API_BEARER_TOKEN: "env-token",
      ALLOW_LIVE_WRITES: "true"
    }, async () => {
      const customerUnavailable = await request(proxyPort, "POST", "/api/customer/read", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer caller-token"
        },
        body: Buffer.from(JSON.stringify({ pageNumber: 1, pageSize: 500 }))
      });
      assert.strictEqual(customerUnavailable.status, 200);
      assert.strictEqual(customerUnavailable.body._proxy.source, "sample");
      assert(customerUnavailable.body.result.data.length > 0);
    });

    assert(upstreamRequests.some((entry) => entry.url === "/API/RemoteMeterTask/GetReadingTask?SITE_ID=KYAKALE"), "query string or path normalization failed");
    assert(upstreamRequests.some((entry) => entry.url === "/API/GPRSMeterTask/GPRSGetReadingTask"), "uppercase API proxy prefix normalization failed");
    assert(upstreamRequests.some((entry) => entry.url === "/API/RemoteMeterTask/GetReadingTask?SITE_ID=KYAKALE" && entry.authorization === "Bearer env-token"), "env bearer token not used for remote reads");
    assert(upstreamRequests.some((entry) => entry.url === "/api/account/read" && entry.authorization === "Bearer env-token"), "env bearer token not used for account reads");
    assert(upstreamRequests.some((entry) => entry.url === "/api/item/read" && entry.authorization === "Bearer env-token"), "env bearer token not used for item reads");
    assert(upstreamRequests.some((entry) => entry.url === "/API/File/Upload" && entry.contentType.includes("multipart/form-data") && entry.body.includes("hello")), "upload passthrough failed");
    assert(errors.some((entry) => entry.includes("[live-proxy]")), "proxy failures were not logged");
    assert(infos.some((entry) => entry.includes("[write-request]")), "write requests were not logged");
    assert(infos.some((entry) => entry.includes("[write-response]")), "write responses were not logged");

    console.log(JSON.stringify({
      requestsCaptured: upstreamRequests.length,
      loggedFailures: errors.length,
      loggedWrites: infos.length,
      status: "live proxy tests passed"
    }, null, 2));
  } finally {
    console.error = originalError;
    console.info = originalInfo;
    await closeServer(proxy);
    await closeServer(upstream);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
