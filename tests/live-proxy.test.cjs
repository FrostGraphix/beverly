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

      if (req.url.startsWith("/API/GPRSMeterTask/GPRSGetReadingTask")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 0, reason: "success", result: { records: [{ id: "GPRS-1", gatewayId: "GW-01" }], total: 1 } }));
        return;
      }

      if (req.url.startsWith("/api/account/read")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 99, reason: "Query failed, please try again", result: null }));
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
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify({ page: 1 }))
      });
      assert.strictEqual(accountRead.status, 502);
      assert.strictEqual(accountRead.body._proxy.source, "live-required");

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
      assert.strictEqual(readMore.status, 502);
      assert.strictEqual(readMore.body._proxy.source, "live-required");
    });

    await withEnv({
      LOCAL_DB_PATH: dbPath,
      LIVE_API_PROXY_ENABLED: "false",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      LIVE_API_BEARER_TOKEN: "env-token",
      ALLOW_LIVE_WRITES: "false"
    }, async () => {
      const blockedWrite = await request(proxyPort, "POST", "/api/account/create", {
        headers: {
          "Content-Type": "application/json"
        },
        body: Buffer.from(JSON.stringify([{ customerId: "1" }]))
      });
      assert.strictEqual(blockedWrite.status, 403);
      assert.strictEqual(blockedWrite.body._proxy.source, "guard");
    });

    assert(upstreamRequests.some((entry) => entry.url === "/API/RemoteMeterTask/GetReadingTask?SITE_ID=KYAKALE"), "query string or path normalization failed");
    assert(upstreamRequests.some((entry) => entry.url === "/API/GPRSMeterTask/GPRSGetReadingTask"), "uppercase API proxy prefix normalization failed");
    assert(upstreamRequests.some((entry) => entry.authorization === "Bearer caller-token"), "caller bearer token not forwarded");
    assert(upstreamRequests.some((entry) => entry.url === "/api/account/read" && entry.authorization === "Bearer env-token"), "env bearer token not used");
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
