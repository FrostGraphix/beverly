"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "dist");
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
let appUrl = "";

function accountRows() {
  return [
    { customerId: "C-1001", customerName: "QA Customer", meterId: "M-1001", stationId: "KYAKALE" },
    { customerId: "C-1002", customerName: "QA Customer 2", meterId: "M-1002", stationId: "MUSHA" }
  ];
}

function apiBody(url) {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("/user/login")) {
    return { code: 0, data: { token: "qa-token", userId: "admin", userName: "ACB(admin)" } };
  }
  if (normalizedUrl.includes("/dashboard/readpanelgroup")) {
    return { code: 0, data: { totalAccountCount: 2, totalPurchaseTimes: 2, totalPurchaseUnit: 2, totalPurchaseMoney: 2 } };
  }
  if (normalizedUrl.includes("/dashboard/readlinechart")) {
    return { code: 0, data: { title: "Purchase Money", xData: ["Jan"], yData: [10] } };
  }
  if (normalizedUrl.includes("/account/read")) {
    return { code: 0, data: { data: accountRows(), total: 2 }, result: { data: accountRows(), total: 2 } };
  }
  if (normalizedUrl.includes("/station/read")) {
    return { code: 0, data: { data: [{ stationId: "KYAKALE" }, { stationId: "MUSHA" }], total: 2 }, result: { data: [{ stationId: "KYAKALE" }, { stationId: "MUSHA" }], total: 2 } };
  }
  return { code: 0, data: { data: [], total: 0 }, result: { data: [], total: 0 } };
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

async function login(page) {
  await page.goto(appUrl, { waitUntil: "load" });
  await page.fill('[data-testid="login-user-id"]', "admin");
  await page.fill('[data-testid="login-password"]', "admin");
  await page.click('[data-testid="login-submit"]');
  await page.waitForSelector(".dashboard-editor-container", { timeout: 10000 });
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/html";
}

function safeAssetPath(urlPath) {
  const requestedPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distRoot, relativePath);
  if (!resolvedPath.startsWith(distRoot)) return path.join(distRoot, "index.html");
  return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()
    ? resolvedPath
    : path.join(distRoot, "index.html");
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const filePath = safeAssetPath(request.url);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      appUrl = `http://127.0.0.1:${address.port}`;
      resolve(server);
    });
  });
}

async function main() {
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edgePath) ? { executablePath: edgePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    await installApiMocks(page);
    await login(page);
    await page.evaluate(() => {
      window.location.hash = "#/remote-operation/remote-meter-reading";
    });
    await page.waitForSelector("text=Add Batch Task", { timeout: 10000 });
    await page.check('[data-testid="table-select-all"]', { force: true });
    await page.click('[data-testid="table-toolbar-action-add-batch-task"]');
    await page.waitForSelector(".modal-title", { timeout: 10000 });
    await page.click(".modal-actions .base-button--primary");
    await page.waitForSelector("text=Selected Meter", { timeout: 10000 });
    await page.waitForSelector("text=Station Count", { timeout: 10000 });
    await page.waitForSelector("text=Data Item", { timeout: 10000 });
    console.log("batch-task browser test passed");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
