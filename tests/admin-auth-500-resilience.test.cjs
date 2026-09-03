"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

async function runTest() {
  const walletServicePath = path.resolve(__dirname, "../api/wallet-service.mjs");
  const { injectWallet } = await import(`file:///${walletServicePath.replace(/\\/g, "/")}`);

  console.log("1. Testing GET /api/v1/admin/me without token...");
  const res1 = await injectWallet({
    method: "GET",
    url: "/api/wallet-service/api/v1/admin/me",
    headers: {},
  });
  assert.equal(res1.statusCode, 401, `Expected 401, got ${res1.statusCode}: ${res1.body}`);
  assert.notEqual(res1.statusCode, 500, "GET /me returned 500 without token");

  console.log("2. Testing GET /api/v1/admin/me with invalid bearer token...");
  const res2 = await injectWallet({
    method: "GET",
    url: "/api/wallet-service/api/v1/admin/me",
    headers: { authorization: "Bearer invalid-token-xyz" },
  });
  assert.equal(res2.statusCode, 401, `Expected 401, got ${res2.statusCode}: ${res2.body}`);
  assert.notEqual(res2.statusCode, 500, "GET /me returned 500 with invalid token");

  console.log("3. Testing POST /api/v1/admin/logout with invalid bearer token...");
  const res3 = await injectWallet({
    method: "POST",
    url: "/api/wallet-service/api/v1/admin/logout",
    headers: {
      authorization: "Bearer invalid-token-xyz",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(res3.statusCode, 401, `Expected 401, got ${res3.statusCode}: ${res3.body}`);
  assert.notEqual(res3.statusCode, 500, "POST /logout returned 500 with invalid token");

  console.log("4. Testing POST /api/v1/admin/logout without body...");
  const res4 = await injectWallet({
    method: "POST",
    url: "/api/wallet-service/api/v1/admin/logout",
    headers: {
      authorization: "Bearer invalid-token-xyz",
    },
  });
  assert.notEqual(res4.statusCode, 500, "POST /logout returned 500 without body");

  console.log("5. Testing api/wallet.mjs directly for GET /api/v1/admin/me...");
  const walletHandlerPath = path.resolve(__dirname, "../api/wallet.mjs");
  const { default: walletHandler } = await import(`file:///${walletHandlerPath.replace(/\\/g, "/")}`);

  let status1 = 0;
  let body1 = "";
  const mockRes1 = {
    statusCode: 200,
    setHeader() {},
    end(data) { body1 = data ? String(data) : ""; },
  };
  Object.defineProperty(mockRes1, "statusCode", {
    get() { return status1; },
    set(v) { status1 = v; },
  });
  await walletHandler({
    method: "GET",
    url: "/api/wallet?__pathname=/api/v1/admin/me",
    headers: {},
  }, mockRes1);
  assert.equal(status1, 401, `Expected 401 from wallet.mjs, got ${status1}: ${body1}`);

  console.log("6. Testing api/wallet.mjs directly for POST /api/v1/admin/logout with empty body...");
  let status2 = 0;
  let body2 = "";
  const mockRes2 = {
    statusCode: 200,
    setHeader() {},
    end(data) { body2 = data ? String(data) : ""; },
  };
  Object.defineProperty(mockRes2, "statusCode", {
    get() { return status2; },
    set(v) { status2 = v; },
  });
  await walletHandler({
    method: "POST",
    url: "/api/wallet?__pathname=/api/v1/admin/logout",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer invalid-token-xyz",
    },
    body: "",
  }, mockRes2);
  assert.notEqual(status2, 500, `POST /logout returned 500: ${body2}`);

  console.log("admin auth 500 resilience contract test passed successfully.");
}

runTest().catch((err) => {
  console.error("admin auth 500 resilience test failed:", err);
  process.exit(1);
});

