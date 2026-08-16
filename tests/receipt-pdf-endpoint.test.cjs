"use strict";

// These tests exercise only the auth-gate and input-sanitization logic in
// api/receipt-pdf.js — they never invoke the Puppeteer/Chromium render path
// (require("puppeteer-core") is lazy, inside renderReceiptPdf), so this stays
// fast and dependency-light like the rest of the contract suite.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const handlerModule = require(path.join("..", "api", "receipt-pdf.js"));
const rootPackage = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

// --- Chromium pack URL ---
// Production once ran with RECEIPT_PDF_CHROMIUM_PACK_URL set to an empty string, which made
// every /api/receipt-pdf call answer 502 and silently drop clients onto the fallback PDF.
// The endpoint now carries a pinned default, so a blank/absent env var must still resolve.
assert.ok(handlerModule.CHROMIUM_PACK_URL, "a Chromium pack URL must always resolve");
assert.ok(
  handlerModule.CHROMIUM_PACK_URL.startsWith("https://"),
  "Chromium pack URL must be https"
);

// The pack tar and the installed @sparticuz/chromium-min build must be the same release —
// a version bump without a matching URL bump breaks Chromium launch at runtime.
const chromiumRange = rootPackage.dependencies["@sparticuz/chromium-min"];
const chromiumVersion = String(chromiumRange).replace(/^[^0-9]*/, "");
assert.strictEqual(
  handlerModule.DEFAULT_CHROMIUM_PACK_URL,
  `https://github.com/Sparticuz/chromium/releases/download/v${chromiumVersion}/chromium-v${chromiumVersion}-pack.x64.tar`,
  "default Chromium pack URL must match the installed @sparticuz/chromium-min version"
);

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

// --- single-page fit ---
// Receipts with ~22 or more fields laid out taller than one A4 sheet and spilled a sliver onto
// a second page. The render now scales to fit; these cover the pure math (the Chromium round
// trip itself is exercised by the render probe, not this dependency-light suite).
assert.strictEqual(handlerModule.fitScaleForHeight(900), 1, "short receipts must not be scaled");
assert.strictEqual(handlerModule.fitScaleForHeight(1123), 1, "an exact-A4 layout must not be scaled");
const slightOverflow = handlerModule.fitScaleForHeight(1173);
assert.ok(slightOverflow > 0.9 && slightOverflow < 1, `slight overflow should scale just under 1, got ${slightOverflow}`);
assert.ok(1173 * slightOverflow <= 1123, "scaled height must fit the page");
const bigOverflow = handlerModule.fitScaleForHeight(1286);
assert.ok(1286 * bigOverflow <= 1123, "scaled height must fit the page");
assert.strictEqual(handlerModule.fitScaleForHeight(99999), 0.5, "scale is floored so text stays legible");
assert.strictEqual(handlerModule.fitScaleForHeight(0), 1, "unmeasurable height falls back to unscaled");
assert.strictEqual(handlerModule.fitScaleForHeight(undefined), 1, "unmeasurable height falls back to unscaled");

// Page counting reads Chromium's uncompressed page tree; /Pages must not be miscounted.
assert.strictEqual(handlerModule.pdfPageCount(Buffer.from("/Type /Pages /Count 1 /Type /Page ")), 1);
assert.strictEqual(handlerModule.pdfPageCount(Buffer.from("/Type /Page /Type /Page ")), 2);
assert.strictEqual(typeof handlerModule.renderReceiptPdf, "function");

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

// Non-string / malformed field entries are dropped, not rendered as "[object Object]".
const malformed = handlerModule.sanitizeModel({
  title: "Receipt",
  fields: [{ label: "Receipt Id", value: "123" }, { label: 42, value: {} }, null, "not-an-object"]
}, brand);
assert.strictEqual(malformed.fields.length, 1);

// --- handler: method + auth gates (no Chromium involved) ---
(async () => {
  const { puppeteer, chromium } = await handlerModule.loadBrowserRuntime(true);
  assert.strictEqual(typeof puppeteer.launch, "function");
  assert.strictEqual(typeof puppeteer.defaultArgs, "function");
  assert.ok(Array.isArray(chromium.args));
  assert.strictEqual(typeof chromium.executablePath, "function");

  const getResponse = mockResponse();
  await handlerModule(mockRequest({ method: "GET" }), getResponse);
  assert.strictEqual(getResponse.statusCode, 405);

  const noCookieResponse = mockResponse();
  await handlerModule(mockRequest({ cookie: "" }), noCookieResponse);
  assert.strictEqual(noCookieResponse.statusCode, 401);

  console.log("receipt-pdf-endpoint.test.cjs passed");
})();
