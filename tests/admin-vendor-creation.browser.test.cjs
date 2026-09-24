"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist", "wallet-admin");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".webmanifest")) return "application/manifest+json";
  if (file.endsWith(".png")) return "image/png";
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

async function completeVendorForm(page) {
  await page.getByPlaceholder("Acob Lighting Ltd").fill("Browser Test Vendor Limited");
  await page.locator(".msel-input").click();
  await page.getByRole("option", { name: /TUNGA/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByPlaceholder("Amaka Obi").fill("Ada Browser");
  await page.getByPlaceholder("user@vendor.com").fill("ada.browser@example.test");
  await page.getByPlaceholder("+2348012345678").fill("09010000001");
  await page.getByPlaceholder("ops@vendor.com").fill("operations@example.test");
  await page.getByPlaceholder("+2348000000000").fill("09010000002");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
}

(async () => {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-admin before browser verification");
  const server = await startServer();
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await context.route("https://fonts.gstatic.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await context.addInitScript(() => {
    localStorage.setItem("beverly.staff.access_token", "browser-test-token");
    localStorage.setItem("beverly.staff.user", JSON.stringify({ id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer", profile_picture_url: null }));
    localStorage.setItem("beverly.staff.permissions", JSON.stringify(["wallet.vendors.manage", "wallet.vendors.review"]));
  });

  let createRequest;
  await context.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/me")) return json({ user: { id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer" }, permissions: ["wallet.vendors.manage", "wallet.vendors.review"] });
    if (pathname.endsWith("/stations")) return json({ stations: [{ stationId: "TUNGA", name: "Tunga", oemId: "oem-1", oemName: "Test OEM", status: "active" }], count: 1 });
    if (pathname.endsWith("/vendors") && request.method() === "POST") {
      createRequest = { body: request.postDataJSON(), key: request.headers()["idempotency-key"] };
      return json({ error: "internal_error", message: "new row for relation vendor_organizations violates check constraint vendor_organizations_status_check", correlationId: "corr-test" }, 500);
    }
    return json({});
  });

  const page = await context.newPage();
  await page.goto(`${base}/wallet-admin/vendors/new`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "New vendor" }).waitFor();
  await completeVendorForm(page);
  await page.getByRole("button", { name: "Create vendor" }).click();

  await page.getByText("Vendor creation could not be completed. Retry once. Contact support if it continues.").waitFor();
  assert.equal(await page.getByText(/violates check constraint/).count(), 0, "database details must stay hidden");
  assert.equal(createRequest.body.stationId, "TUNGA");
  assert.equal(createRequest.body.dailyLimitMinor, 1000000000);
  assert.ok(createRequest.key, "vendor creation must carry an idempotency key");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile layout must not overflow");

  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("admin vendor creation browser verification passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
