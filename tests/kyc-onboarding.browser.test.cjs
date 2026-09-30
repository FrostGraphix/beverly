"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function startCustomerServer() {
  const dist = path.join(root, "dist", "wallet-customer");
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-customer first");
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = pathname.replace(/^\/wallet-customer\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const isAsset = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = isAsset ? requested : path.join(dist, "index.html");
    const contentType = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startVendorServer() {
  const dist = path.join(root, "dist", "wallet-vendor");
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-vendor first");
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = pathname.replace(/^\/wallet-vendor\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const isAsset = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = isAsset ? requested : path.join(dist, "index.html");
    const contentType = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function respond(route, payload) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
}

(async () => {
  const server = await startCustomerServer();
  const vendorServer = await startVendorServer();
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const customer = {
      id: "11111111-1111-4111-8111-111111111111",
      full_name: "Ada Customer",
      email: "ada@example.test",
      phone: "+2348000000000",
      kyc_tier: 0,
      kyc_status: "unverified",
      kyc_data: {},
      status: "active",
      email_verified_at: "2026-09-30T10:00:00.000Z",
    };
    await context.addInitScript((profile) => {
      localStorage.setItem("beverly.customer.access_token", "customer-test-token");
      localStorage.setItem("beverly.customer.profile", JSON.stringify(profile));
    }, customer);
    await context.route("**/api/v1/customer/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/me")) return respond(route, customer);
      if (pathname.endsWith("/kyc/status")) return respond(route, {
        ...customer,
        review: null,
        documents: [],
        policy: {
          tier0DailyLimitMinor: 20_000_000,
          tier1DailyLimitMinor: 70_000_000,
          tier2DailyLimitMinor: null,
          version: 1,
          updatedAt: "2026-09-30T10:00:00.000Z",
        },
      });
      return respond(route, {});
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/wallet-customer/kyc`, { waitUntil: "domcontentloaded" });
    await page.getByText("Your wallet is ready").waitFor({ timeout: 5_000 });
    await page.getByText("Up to ₦200,000 daily", { exact: true }).waitFor({ timeout: 5_000 });
    assert.equal(await page.getByLabel("Full legal name").count(), 0, "Tier 0 must not request duplicate profile details");
    assert.equal(await page.getByLabel("Identity document type").count(), 0, "Tier 0 must not request documents");

    await page.goto(`http://127.0.0.1:${server.address().port}/wallet-customer/kyc?upgrade=tier1`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Request Tier 1" }).waitFor({ timeout: 5_000 });
    await page.getByLabel("Identity document type").waitFor({ timeout: 5_000 });
    await context.close();

    const vendorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const vendor = {
      id: "22222222-2222-4222-8222-222222222222",
      vendor_organization_id: "33333333-3333-4333-8333-333333333333",
      role: "vendor",
      full_name: "Vendor Owner",
      email: "vendor@example.test",
      organization_name: "Grid Vendor",
      kyc_tier: 0,
      kyc_status: "unverified",
      password_reset_required: false,
      mfa_enrolled: true,
      mfa_verified: true,
    };
    await vendorContext.addInitScript((profile) => {
      localStorage.setItem("beverly.vendor.access_token", "vendor-test-token");
      localStorage.setItem("beverly.vendor.user", JSON.stringify(profile));
    }, vendor);
    await vendorContext.route("**/api/v1/vendor/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/me")) return respond(route, vendor);
      if (pathname.endsWith("/kyc/status")) return respond(route, {
        ...vendor,
        review: null,
        documents: [],
        policy: {
          tier0DailyLimitMinor: 20_000_000,
          tier1DailyLimitMinor: 70_000_000,
          tier2DailyLimitMinor: null,
          version: 1,
          updatedAt: "2026-09-30T10:00:00.000Z",
        },
      });
      return respond(route, {});
    });
    const vendorPage = await vendorContext.newPage();
    await vendorPage.goto(`http://127.0.0.1:${vendorServer.address().port}/wallet-vendor/kyc`, { waitUntil: "domcontentloaded" });
    await vendorPage.getByRole("heading", { name: "Request Tier 1" }).waitFor({ timeout: 5_000 });
    await vendorPage.getByLabel("Identity document type").waitFor({ timeout: 5_000 });
    await vendorPage.getByText("0 of 2 required files ready.").waitFor({ timeout: 5_000 });
    await vendorContext.close();
  } finally {
    await browser.close();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => vendorServer.close(resolve)),
    ]);
  }
  console.log(JSON.stringify({ status: "KYC onboarding browser verification passed" }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
