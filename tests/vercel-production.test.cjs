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

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload.length ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}
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
  const server = await startServer((req, res) => {
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
      res.end(JSON.stringify({ code: 500, msg: error.message }));
    });
  });

  try {
    const port = server.address().port;
    await withEnv({
      LIVE_API_PROXY_ENABLED: "false",
      LIVE_READ_MODE: "local",
      ALLOW_LIVE_WRITES: "false",
      LOCAL_DB_PATH: "./tmp/vercel-production-test.sqlite"
    }, async () => {
      const health = await request(port, "GET", "/api/system/health");
      const automation = await request(port, "GET", "/api/system/automation-report");
      const read = await request(port, "POST", "/api/dashboard/readPanelGroup", {});
      const write = await request(port, "POST", "/api/account/create", [{ customerId: "x" }]);

      assert.strictEqual(health.status, 200);
      assert.strictEqual(health.body.data.ok, true);
      assert.strictEqual(automation.status, 200);
      assert.strictEqual(automation.body.data.direction, "Operational Command");
      assert(automation.body.data.summary.total >= 18);
      assert.strictEqual(read.status, 200);
      assert.strictEqual(read.body._proxy.source, "sample");
      assert.strictEqual(write.status, 403);

      console.log(JSON.stringify({
        healthStatus: health.status,
        automationStatus: automation.status,
        readStatus: read.status,
        writeStatus: write.status,
        status: "vercel production passed"
      }, null, 2));
    });
  } finally {
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
