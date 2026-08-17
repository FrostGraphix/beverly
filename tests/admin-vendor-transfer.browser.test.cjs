"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist", "wallet-admin");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sourceId = "11111111-1111-4111-8111-111111111111";
const destinationId = "22222222-2222-4222-8222-222222222222";

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".webmanifest")) return "application/manifest+json";
  return "text/html";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/wallet-admin\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const safe = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = safe ? requested : path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function transfer(overrides = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    status: "completed",
    source_vendor_id: sourceId,
    destination_vendor_id: destinationId,
    source_vendor_name: "North Grid Energy",
    destination_vendor_name: "South Grid Power",
    amount_minor: 125050,
    currency: "NGN",
    reason: "Approved inter-vendor balance correction",
    idempotency_key: "browser-test-idempotency-key",
    source_balance_after_minor: 874950,
    destination_balance_after_minor: 625050,
    created_at: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

(async () => {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-admin before browser verification");
  const server = await startServer();
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem("beverly.staff.access_token", "browser-test-token");
    localStorage.setItem("beverly.staff.user", JSON.stringify({ id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer", profile_picture_url: null }));
    localStorage.setItem("beverly.staff.permissions", JSON.stringify(["dev.console", "wallet.vendor_transfers.manage"]));
  });

  let createRequest = null;
  await context.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/me")) return json({ user: { id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer", profile_picture_url: null }, permissions: ["dev.console", "wallet.vendor_transfers.manage"] });
    if (url.pathname.endsWith("/vendor-transfers/vendors")) return json({ vendors: [
      { vendorId: sourceId, walletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "North Grid Energy", currency: "NGN", availableMinor: 1000000 },
      { vendorId: destinationId, walletId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "South Grid Power", currency: "NGN", availableMinor: 500000 },
    ] });
    if (url.pathname.endsWith("/vendor-transfers/preview")) return json({ preview: { amountMinor: 125050, currency: "NGN", sourceBalanceAfterMinor: 874950, destinationBalanceAfterMinor: 625050 } });
    if (url.pathname.endsWith("/vendor-transfers") && request.method() === "POST") {
      createRequest = { body: request.postDataJSON(), idempotencyKey: request.headers()["idempotency-key"] };
      return json({ transfer: transfer({ idempotency_key: createRequest.idempotencyKey }) }, 201);
    }
    if (url.pathname.endsWith("/vendor-transfers")) return json({ transfers: [transfer({ amount_minor: 50000 })], nextCursor: null });
    return json({});
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(`${base}/wallet-admin/vendor-transfers`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Transfer vendor balance" }).waitFor();
  assert.equal(await page.locator(".vite-error-overlay").count(), 0, "Vite error overlay must not render");
  await page.getByLabel("Source vendor").selectOption(sourceId);
  await page.getByLabel("Destination vendor").selectOption(destinationId);
  await page.getByLabel("Amount (₦)").fill("1250.50");
  await page.getByLabel("Reason").fill("Approved inter-vendor balance correction");
  await page.getByText("After transfer:").waitFor();
  await page.getByRole("button", { name: "Review transfer" }).click();
  await page.getByRole("heading", { name: "Approve and confirm vendor transfer" }).waitFor();
  await page.getByRole("button", { name: "Confirm and transfer" }).click();
  await page.getByText("Transfer completed").waitFor();
  await page.getByText("Transfer receipt").waitFor();
  assert.equal(createRequest.body.confirmed, true, "create request must carry explicit confirmation");
  assert.ok(createRequest.idempotencyKey, "create request must carry an idempotency key");
  assert.equal(createRequest.body.amount_minor, 125050, "UI must send integer minor units");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile layout must not overflow horizontally");
  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(" | ")}`);

  // A feature-route 401 must surface locally. It must not erase a valid staff
  // session or redirect the user to login; /me remains auth-store authority.
  const failureContext = await browser.newContext();
  await failureContext.addInitScript(() => {
    localStorage.setItem("beverly.staff.access_token", "valid-session-token");
    localStorage.setItem("beverly.staff.user", JSON.stringify({ id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer", profile_picture_url: null }));
    localStorage.setItem("beverly.staff.permissions", JSON.stringify(["dev.console", "wallet.vendor_transfers.manage"]));
  });
  await failureContext.route("**/api/v1/admin/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/me")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer", profile_picture_url: null }, permissions: ["dev.console", "wallet.vendor_transfers.manage"] }) });
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "route_unavailable", message: "Temporary route failure" }) });
  });
  const failurePage = await failureContext.newPage();
  await failurePage.goto(`${base}/wallet-admin/vendor-transfers`, { waitUntil: "networkidle" });
  await failurePage.getByRole("heading", { name: "Transfer vendor balance" }).waitFor();
  await failurePage.getByText("Temporary route failure").waitFor();
  assert.match(failurePage.url(), /\/wallet-admin\/vendor-transfers$/);
  assert.equal(await failurePage.evaluate(() => localStorage.getItem("beverly.staff.access_token")), "valid-session-token");
  await failureContext.close();

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(JSON.stringify({ status: "admin vendor transfer browser verification passed", coverage: ["developer route", "preview", "approval confirmation", "idempotency", "receipt", "mobile bounds", "console"] }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
