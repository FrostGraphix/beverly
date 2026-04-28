"use strict";

const assert = require("assert");
const http = require("http");
const handler = require("../api/reference");

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const apiResponse = {
        statusCode: 200,
        setHeader(name, value) {
          res.setHeader(name, value);
        },
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
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: options.path || "/api/system/health",
      method: options.method || "GET",
      headers: options.headers || {}
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: text ? JSON.parse(text) : {}
        });
      });
    });
    req.on("error", reject);
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
  const server = await startServer();
  const port = server.address().port;

  try {
    await withEnv({
      CORS_ORIGINS: "https://preview.example.test",
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_MS: "60000",
      LIVE_API_PROXY_ENABLED: "false"
    }, async () => {
      const options = await request(port, {
        method: "OPTIONS",
        headers: {
          Origin: "https://preview.example.test"
        }
      });
      assert.strictEqual(options.status, 204);
      assert.strictEqual(options.headers["access-control-allow-origin"], "https://preview.example.test");

      const first = await request(port, {
        headers: {
          Origin: "https://preview.example.test"
        }
      });
      const second = await request(port, {
        headers: {
          Origin: "https://preview.example.test"
        }
      });

      assert.strictEqual(first.status, 200);
      assert.strictEqual(second.status, 429);
      assert.strictEqual(second.body._proxy.source, "rate-limit");
    });

    console.log(JSON.stringify({
      status: "rate limit and cors passed"
    }, null, 2));
  } finally {
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
