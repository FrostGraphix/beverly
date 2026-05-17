"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
require("module").Module._initPaths();

const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "dist");

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/html";
}

function safeAssetPath(urlPath) {
  const requestedPath = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distRoot, relativePath);
  if (!resolvedPath.startsWith(distRoot)) return path.join(distRoot, "index.html");
  return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()
    ? resolvedPath
    : path.join(distRoot, "index.html");
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const filePath = safeAssetPath(request.url || "/");
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function row() {
  return {
    id: "SMOKE-1",
    name: "Smoke Sample",
    status: "Success",
    successRate: "99%",
    customerId: "C-1001",
    customerName: "Smoke Customer",
    meterId: "M-1001",
    meterType: "Electricity",
    communicationWay: "GPRS",
    protocolVersion: "2.2",
    tariffId: "T-1",
    receiptId: "R-1001",
    totalUnit: 12,
    totalPaid: 4200,
    token: "1234 5678 9012 3456",
    vend: true,
    dataItem: "Credit balance",
    dataValue: "42",
    gatewayId: "G-1001",
    eventCode: "E001",
    eventContent: "Smoke event",
    collectionDate: "2026-01-01",
    currentDate: "2026-01-01",
    createDate: "2026-01-01",
    updateDate: "2026-01-02",
    nonpurchaseDays: 31,
    phone: "000",
    address: "Smoke Address",
    certifiName: "Smoke",
    certifiNo: "ID-1",
    stationId: "KYAKALE",
    remark: "Smoke"
  };
}

function apiBody(url) {
  const value = url.toLowerCase();
  if (value.includes("/user/login")) return { code: 0, data: { token: "smoke-token", userId: "admin", userName: "ACB(admin)", roleId: "super-admin" } };
  if (value.includes("/user/read")) return { code: 0, data: { data: [{ ...row(), userId: "admin", name: "ACB(admin)" }], total: 1 } };
  if (value.includes("/role/read")) return { code: 0, data: { data: [{ id: "super-admin", name: "Super Admin", remark: "ALL" }], total: 1 } };
  if (value.includes("/station/read")) return { code: 0, data: { data: [{ id: "KYAKALE", name: "Kyakale", stationId: "KYAKALE" }], total: 1 } };
  if (value.includes("/tariff/read")) return { code: 0, data: { data: [{ tariffId: "T-1", id: "T-1", name: "Smoke Tariff", price: "350" }], total: 1 } };
  if (value.includes("/dashboard/readpanelgroup")) return { code: 0, data: { totalAccountCount: 100, totalPurchaseTimes: 20, totalPurchaseUnit: 300, totalPurchaseMoney: 400 } };
  if (value.includes("/dashboard/readlinechart")) return { code: 0, data: { title: "Purchase Money", xData: ["Jan", "Feb"], yData: [10, 20] } };
  if (value.includes("/wallet/summary")) return { code: 0, data: { wallet: { id: "wallet-smoke", walletNumber: "VW-SMOKE", status: "active" }, availableBalanceMinor: 100000, ledgerBalanceMinor: 100000, heldBalanceMinor: 0 } };
  if (value.includes("/wallet/funding/list") || value.includes("/wallet/purchase/list") || value.includes("/wallet/ledger/list") || value.includes("/wallet/manual-credit/list")) return { code: 0, data: { rows: [], total: 0 } };
  if (value.includes("/wallet/reconciliation/report")) return { code: 0, data: { exceptions: [], total: 0, balanced: true } };
  if (value.includes("/vendor/onboarding/list")) return { code: 0, data: { rows: [], total: 0 } };
  if (value.includes("/system/automation-report")) return { code: 0, data: { total: 0, automations: [] } };
  if (value.includes("/system/automation-control")) return { code: 0, data: { enabled: true, deliveries: [] } };
  if (value.includes("/token/credittoken/generate")) return { code: 0, data: { token: "1234 5678 9012 3456", createDate: "2026-01-01" } };
  return { code: 0, data: { data: [row()], rows: [row()], total: 1 }, result: { data: [row()], rows: [row()], total: 1 } };
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.toLowerCase().includes("/api/")) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(apiBody(url))
    });
  });
}

async function login(page, appUrl) {
  await page.goto(appUrl, { waitUntil: "load" });
  await page.fill('[data-testid="login-user-id"]', "admin");
  await page.fill('[data-testid="login-password"]', "admin");
  await page.click('[data-testid="login-submit"]');
  await page.waitForSelector(".dashboard-editor-container", { timeout: 10000 });
}

async function smokeRoutes(page, routes) {
  const visited = [];
  for (const route of routes) {
    await page.evaluate((hash) => { window.location.hash = hash; }, route.hash);
    await page.waitForTimeout(150);
    await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 10000 });
    const bodyText = await page.locator("body").innerText();
    assert(!/Load failed|Unable to load|Cannot read properties|Unhandled/i.test(bodyText), `${route.hash} displayed failure copy`);
    visited.push(route.hash);
  }
  return visited;
}

async function main() {
  assert(fs.existsSync(path.join(distRoot, "index.html")), "Run npm run build before browser smoke");
  const manifest = await import(pathToFileURL(path.join(root, "src/data/route-manifest.js")).href);
  const adminRoutes = manifest.routeManifest.filter((route) => manifest.roleAllowsRoute(route, "super-admin"));
  const vendorRoutes = manifest.routeManifest.filter((route) => manifest.roleAllowsRoute(route, "vendor_user"));

  const server = await startStaticServer();
  const appUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await installApiMocks(page);

  try {
    await login(page, appUrl);
    const adminVisited = await smokeRoutes(page, adminRoutes);
    await page.evaluate(() => {
      document.cookie = "roleId=vendor_user; path=/";
      document.cookie = "userRemark=Vendor; path=/";
      document.cookie = "vendorOrganizationId=vendor-demo-org; path=/";
    });
    const vendorVisited = await smokeRoutes(page, vendorRoutes);
    assert.deepStrictEqual(consoleErrors, [], "Browser console errors found");
    console.log(JSON.stringify({
      adminRoutes: adminVisited.length,
      vendorRoutes: vendorVisited.length,
      totalRoutes: adminVisited.length + vendorVisited.length,
      status: "full crm browser smoke passed"
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
