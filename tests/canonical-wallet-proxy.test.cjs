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

function startFacade() {
  return startServer((req, res) => {
    const response = {
      statusCode: 200,
      setHeader(name, value) { res.setHeader(name, value); },
      status(code) { this.statusCode = code; return this; },
      json(body) {
        res.statusCode = this.statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
      },
    };
    Promise.resolve(handler(req, response)).catch((error) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    });
  });
}

function request(port, method, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const raw = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...headers,
        ...(raw ? { "Content-Type": "application/json", "Content-Length": raw.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    req.on("error", reject);
    if (raw) req.write(raw);
    req.end();
  });
}

async function main() {
  let forwarded = 0;
  const wallet = await startServer((req, res) => {
    forwarded += 1;
    res.setHeader("Content-Type", "application/json");
    if (req.url.includes("/remote-send")) {
      res.statusCode = 503;
      res.end(JSON.stringify({
        error: "remote_send_service_unavailable",
        message: "Remote delivery is temporarily unavailable. The token remains valid for manual meter entry.",
        details: { tokenRemainsValid: true },
      }));
      return;
    }
    res.end(JSON.stringify({
      path: req.url,
      method: req.method,
      authorization: req.headers.authorization ?? null,
      paystackSignature: req.headers["x-paystack-signature"] ?? null,
    }));
  });
  const facade = await startFacade();
  const walletPort = wallet.address().port;
  const facadePort = facade.address().port;
  const previous = {
    walletApi: process.env.WALLET_API_BASE_URL,
    writes: process.env.ALLOW_LIVE_WRITES,
    approved: process.env.APPROVED_LIVE_WRITES,
    proxyWrites: process.env.WALLET_PROXY_MONEY_WRITES_ENABLED,
    vercelEnv: process.env.VERCEL_ENV,
  };

  process.env.WALLET_API_BASE_URL = `http://127.0.0.1:${walletPort}`;
  process.env.ALLOW_LIVE_WRITES = "false";
  process.env.APPROVED_LIVE_WRITES = "false";
  process.env.WALLET_PROXY_MONEY_WRITES_ENABLED = "false";
  delete process.env.VERCEL_ENV;

  try {
    const read = await request(facadePort, "GET", "/api/v1/vendor/wallet", undefined, {
      Authorization: "Bearer test-token",
    });
    assert.strictEqual(read.status, 200);
    assert.strictEqual(read.body.path, "/api/v1/vendor/wallet");
    assert.strictEqual(read.body.authorization, "Bearer test-token");

    const remoteFailure = await request(
      facadePort,
      "POST",
      "/api/v1/vendor/vend/11111111-1111-4111-8111-111111111111/remote-send",
      {},
      { Authorization: "Bearer test-token" },
    );
    assert.strictEqual(remoteFailure.status, 503);
    assert.strictEqual(remoteFailure.body.error, "remote_send_service_unavailable");
    assert.strictEqual(remoteFailure.body.details.tokenRemainsValid, true);

    const webhook = await request(facadePort, "POST", "/api/v1/webhook/paystack", { event: "charge.success" }, {
      "x-paystack-signature": "signed-payload",
    });
    assert.strictEqual(webhook.status, 503);

    const blocked = await request(facadePort, "POST", "/api/v1/vendor/vend", { amountMinor: 10000 });
    assert.strictEqual(blocked.status, 503);
    assert.strictEqual(blocked.body.error, "money_writes_disabled");
    assert.strictEqual(forwarded, 2);

    process.env.ALLOW_LIVE_WRITES = "true";
    process.env.APPROVED_LIVE_WRITES = "true";
    process.env.WALLET_PROXY_MONEY_WRITES_ENABLED = "true";

    const forwardedWebhook = await request(facadePort, "POST", "/api/v1/webhook/paystack", { event: "charge.success" }, {
      "x-paystack-signature": "signed-payload",
    });
    assert.strictEqual(forwardedWebhook.status, 200);
    assert.strictEqual(forwardedWebhook.body.paystackSignature, "signed-payload");
    process.env.VERCEL_ENV = "preview";
    const previewBlocked = await request(facadePort, "POST", "/api/v1/vendor/vend", { amountMinor: 10000 });
    assert.strictEqual(previewBlocked.status, 503);
    assert.strictEqual(forwarded, 3);

    delete process.env.WALLET_API_BASE_URL;
    process.env.VERCEL_ENV = "production";
    const unconfigured = await request(facadePort, "POST", "/api/v1/vendor/vend/preview", { meterId: "47005376315", amountMinor: 10600 });
    assert.strictEqual(unconfigured.status, 503);
    assert.strictEqual(unconfigured.body.error, "wallet_backend_not_configured");
    assert.strictEqual(unconfigured.body.details.noVendAttempted, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = key === "walletApi" ? "WALLET_API_BASE_URL"
        : key === "writes" ? "ALLOW_LIVE_WRITES"
          : key === "approved" ? "APPROVED_LIVE_WRITES"
            : key === "proxyWrites" ? "WALLET_PROXY_MONEY_WRITES_ENABLED"
              : "VERCEL_ENV";
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    await closeServer(facade);
    await closeServer(wallet);
  }
}

main()
  .then(() => console.log(JSON.stringify({ status: "canonical wallet proxy passed" }, null, 2)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
