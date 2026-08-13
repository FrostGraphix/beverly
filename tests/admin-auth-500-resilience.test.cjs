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

  console.log("admin auth 500 resilience contract test passed successfully.");
}

runTest().catch((err) => {
  console.error("admin auth 500 resilience test failed:", err);
  process.exit(1);
});
