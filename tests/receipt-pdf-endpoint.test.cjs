"use strict";

// These tests exercise only the auth-gate and input-sanitization logic in
// api/receipt-pdf.js — they never invoke the Puppeteer/Chromium render path
// (require("puppeteer-core") is lazy, inside renderReceiptPdf), so this stays
// fast and dependency-light like the rest of the contract suite.

const assert = require("node:assert");
const path = require("node:path");

const handlerModule = require(path.join("..", "api", "receipt-pdf.js"));

const brand = { name: "Beverly", company: "ACOB Lighting Technology Limited" };

function mockRequest({ method = "POST", cookie = "", body } = {}) {
  return {
    method,
    headers: { cookie, "content-type": "application/json" },
    body,
    on() {}
  };
}

function mockResponse() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    setHeader(name, value) {
      res.headers[name] = value;
    },
    send(payload) {
      res.body = payload;
      return res;
    }
  };
  return res;
}

// --- cookieValue ---
assert.strictEqual(handlerModule.cookieValue(mockRequest({ cookie: "bev_token=abc123; other=1" }), "bev_token"), "abc123");
assert.strictEqual(handlerModule.cookieValue(mockRequest({ cookie: "" }), "bev_token"), "");

// --- sanitizeModel ---
assert.strictEqual(handlerModule.sanitizeModel(null, brand), null);
assert.strictEqual(handlerModule.sanitizeModel({}, brand), null);
assert.strictEqual(handlerModule.sanitizeModel({ fields: [] }, brand), null);

const oversizedFields = Array.from({ length: 200 }, (_, i) => ({ label: `Field ${i}`, value: `Value ${i}` }));
const sanitizedOversized = handlerModule.sanitizeModel({ title: "Receipt", fields: oversizedFields }, brand);
assert.ok(sanitizedOversized.fields.length <= 60, "field count must be bounded");

const longString = "x".repeat(5000);
const sanitizedLong = handlerModule.sanitizeModel({ title: longString, fields: [{ label: "Receipt Id", value: longString }] }, brand);
assert.ok(sanitizedLong.title.length <= 500, "title must be bounded");
assert.ok(sanitizedLong.fields[0].value.length <= 500, "field value must be bounded");

// Client-supplied brand must never survive — brand is always the server's own constant.
const spoofed = handlerModule.sanitizeModel({
  title: "Receipt",
  fields: [{ label: "Receipt Id", value: "123" }],
  brand: { name: "NotBeverly", company: "Attacker Inc" }
}, brand);
assert.strictEqual(spoofed.brand, brand);
assert.strictEqual(spoofed.status, "Client-generated copy");
assert.strictEqual(spoofed.subject, "Amount");

// Non-string / malformed field entries are dropped, not rendered as "[object Object]".
const malformed = handlerModule.sanitizeModel({
  title: "Receipt",
  fields: [{ label: "Receipt Id", value: "123" }, { label: 42, value: {} }, null, "not-an-object"]
}, brand);
assert.strictEqual(malformed.fields.length, 1);

// --- handler: method + auth gates (no Chromium involved) ---
(async () => {
  const getResponse = mockResponse();
  await handlerModule(mockRequest({ method: "GET" }), getResponse);
  assert.strictEqual(getResponse.statusCode, 405);

  const noCookieResponse = mockResponse();
  await handlerModule(mockRequest({ cookie: "" }), noCookieResponse);
  assert.strictEqual(noCookieResponse.statusCode, 401);

  console.log("receipt-pdf-endpoint.test.cjs passed");
})();
