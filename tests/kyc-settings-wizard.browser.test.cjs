"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist", "wallet-admin");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function startServer() {
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/wallet-admin\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const file = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

(async () => {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-admin before browser verification");
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("beverly.staff.access_token", "browser-test-token");
    localStorage.setItem("beverly.staff.user", JSON.stringify({ id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer" }));
    localStorage.setItem("beverly.staff.permissions", JSON.stringify(["wallet.kyc.view", "wallet.kyc.settings.manage"]));
  });

  const requirement = () => ({ identity: ["national_id"], selfie: true, address: [] });
  const availability = {
    customer_enabled: true, vendor_enabled: true, customer_scope: "all", vendor_scope: "new",
    customer_enforced_from: null, vendor_enforced_from: "2026-10-12T12:00:00.000Z",
    allowed_mime_types: ["image/jpeg", "application/pdf"],
    customer: { tier1: requirement(), tier2: requirement() }, vendor: { tier2: requirement() },
  };
  let savedPolicy;
  await context.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/me")) return json({ user: { id: "staff-1", email: "dev@example.test", full_name: "Developer", role: "developer" }, permissions: ["wallet.kyc.view", "wallet.kyc.settings.manage"] });
    if (pathname.endsWith("/kyc/settings/history")) return json({ history: [] });
    if (pathname.endsWith("/kyc/settings")) return json({ policy: { tier0DailyLimitMinor: 20000000, tier1DailyLimitMinor: 70000000, tier2DailyLimitMinor: null, version: 1, updatedAt: "2026-10-12T12:00:00.000Z" } });
    if (pathname.endsWith("/kyc-policy") && request.method() === "PUT") {
      savedPolicy = request.postDataJSON().policy;
      return json({ policy: savedPolicy });
    }
    if (pathname.endsWith("/kyc-policy")) return json({ policy: availability });
    return json({});
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(`${base}/wallet-admin/kyc-settings`, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "Choose who must complete KYC" }).waitFor();
  assert.equal(await page.locator(".stepper-item").count(), 4);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Choose customer evidence" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Choose vendor evidence" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Review KYC requirements" }).waitFor();
  await page.getByRole("button", { name: "Save KYC requirements" }).click();
  await page.getByText("KYC requirements updated for customers and vendors.").waitFor();

  assert.equal(savedPolicy.customer_scope, "all");
  assert.equal(savedPolicy.vendor_scope, "new");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile wizard must not overflow");
  assert.deepEqual(consoleErrors, []);

  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("KYC settings wizard browser verification passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
