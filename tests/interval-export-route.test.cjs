"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");

process.env.SESSION_STORE_MODE = "memory";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.DEMO_AUTH_ENABLED = "true";
process.env.INTERVAL_EXPORT_RETRY_DELAY_MS = "1";

const handler = require("../api/reference");

assert.deepEqual(
  handler._test.sanitizeDailyMeterReadPayload({
    lang: "en",
    FROM: "2026-07-07T00:00:00.000Z",
    TO: "2026-07-14T23:59:59.999Z",
    SITE_ID: "TUNGA",
    compact: true,
  }),
  {
    lang: "en",
    currentDateRange: ["2026-07-07T00:00:00.000Z", "2026-07-14T23:59:59.999Z"],
    stationId: "TUNGA",
  },
);

function listen(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      headers: { Cookie: "bev_token=local-dev-token" },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
  });
}

function vercelResponse(res) {
  return {
    get headersSent() { return res.headersSent; },
    get statusCode() { return res.statusCode; },
    set statusCode(value) { res.statusCode = value; },
    setHeader: res.setHeader.bind(res),
    flushHeaders: res.flushHeaders.bind(res),
    write: res.write.bind(res),
    end: res.end.bind(res),
    destroy: res.destroy.bind(res),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(body) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    },
  };
}

(async () => {
  const upstreamPages = [];
  const upstream = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      upstreamPages.push(payload.pageNumber);
      const data = payload.pageNumber === 1
        ? [{ meterId: "M-1", customerName: "Ada", currentDate: "2026-07-14" }, { meterId: "M-2", customerName: "Bola", currentDate: "2026-07-14" }]
        : [{ meterId: "M-3", customerName: "Ada Two", currentDate: "2026-07-13" }];
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, result: { total: 3, data } }));
    });
  });

  process.env.LIVE_READ_MODE = "live";
  process.env.LIVE_API_PROXY_ENABLED = "true";
  process.env.LIVE_API_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  handler._test.resetContractCache();

  const facade = await listen((req, res) => {
    Promise.resolve(handler(req, vercelResponse(res))).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    });
  });

  try {
    const result = await request(facade.address().port, "/api/reference?__pathname=/api/DailyDataMeter/export.csv&range=7d&search=ada&sort=desc");
    assert.equal(result.status, 200);
    assert.match(result.headers["content-type"], /text\/csv/);
    assert.match(result.headers["content-disposition"], /interval_data_7d_/);
    assert.deepEqual(upstreamPages, [1, 2]);
    assert.match(result.body, /"M-1"/);
    assert.match(result.body, /"M-3"/);
    assert.doesNotMatch(result.body, /"M-2"/);
    console.log("interval-export-route ok");
  } finally {
    await close(facade);
    await close(upstream);
    handler._test.resetContractCache();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
