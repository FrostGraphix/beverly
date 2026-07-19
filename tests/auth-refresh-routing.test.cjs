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

function request(port, path) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({}));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        });
      });
    });
    req.on("error", reject);
    req.write(body);
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
      if (value === undefined) delete process.env[key];
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
      setHeader(name, value) {
        res.setHeader(name, value);
      },
      json(body) {
        res.statusCode = this.statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
      },
    };

    Promise.resolve(handler(req, apiResponse)).catch((error) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ code: 500, msg: error.message, data: null }));
    });
  });

  try {
    await withEnv({
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_API_BASE_URL: "http://127.0.0.1:1",
      LIVE_READ_MODE: "live",
      SUPABASE_AUTH_ENABLED: "false",
    }, async () => {
      for (const path of ["/api/auth/refresh", "/API/auth/refresh", "/api/API/auth/refresh", "/api/reference.js?__pathname=/api/auth/refresh"]) {
        const res = await request(server.address().port, path);
        assert.strictEqual(res.status, 400, `${path} must fail locally`);
        assert.strictEqual(res.body.reason, "refreshToken required", `${path} must not proxy live`);
      }
    });
  } finally {
    await closeServer(server);
  }

  console.log(JSON.stringify({
    status: "auth refresh routing passed",
    paths: ["/api/auth/refresh", "/API/auth/refresh", "/api/API/auth/refresh"],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
