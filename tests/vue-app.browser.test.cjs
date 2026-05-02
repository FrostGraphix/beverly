"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
require("module").Module._initPaths();

const { chromium, firefox, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const distRoot = path.join(root, "dist");
let appUrl = "";

const browsers = [
  { name: "edge", type: chromium, options: fs.existsSync(edgePath) ? { executablePath: edgePath } : {} },
  { name: "chromium", type: chromium, options: {}, optional: true },
  { name: "firefox", type: firefox, options: {}, optional: true },
  { name: "webkit", type: webkit, options: {}, optional: true }
];

const qaRoutes = [
  { hash: "#/dashboard", text: "Account Count" },
  { hash: "#/management/account", text: "customerId" },
  { hash: "#/token-record/credit-token-record", text: "receiptId" },
  { hash: "#/remote-operation-record/remote-meter-reading-task", text: "dataItem" },
  { hash: "#/prepay-report/long-nonpurchase-situation", text: "nonpurchaseDays" },
  { hash: "#/management/customer", text: "phone" }
];

function sampleRow() {
  return {
    id: "QA-1",
    name: "QA Sample",
    customerId: "C-1001",
    customerName: "QA Customer",
    meterId: "M-1001",
    meterType: "Electricity",
    communicationWay: "GPRS",
    tariffId: "T-1",
    receiptId: "R-1001",
    totalUnit: 12,
    totalPaid: 40,
    token: "1234 5678 9012 3456",
    dataItem: "Total Energy",
    dataValue: "42",
    status: "Success",
    nonpurchaseDays: 31,
    phone: "000",
    address: "QA Address",
    stationId: "KYAKALE",
    createDate: "2026-01-01",
    updateDate: "2026-01-02",
    remark: "QA"
  };
}

function apiBody(url) {
  if (url.includes("/user/login")) {
    return { code: 0, data: { token: "qa-token", userId: "admin", userName: "ACB(admin)" } };
  }
  if (url.includes("/dashboard/readPanelGroup")) {
    return {
      code: 0,
      data: {
        totalAccountCount: 100,
        totalPurchaseTimes: 20,
        totalPurchaseUnit: 300,
        totalPurchaseMoney: 400
      }
    };
  }
  if (url.includes("/dashboard/readLineChart")) {
    return { code: 0, data: { title: "Purchase Money", xData: ["Jan", "Feb"], yData: [10, 20] } };
  }
  if (url.includes("/tariff/read")) {
    return { code: 0, data: { data: [{ tariffId: "T-1", id: "T-1", name: "QA Tariff", price: "350" }], total: 1 } };
  }
  if (url.includes("/token/creditToken/generate")) {
    return { code: 0, data: { token: "1234 5678 9012 3456", createDate: "2026-01-01 00:00:00" } };
  }
  if (url.includes("/account/create")) {
    return { code: 403, reason: "Live writes are guarded" };
  }
  return { code: 0, data: { data: [sampleRow()], total: 1 } };
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    return route.fulfill({
      status: url.includes("/account/create") ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify(apiBody(url))
    });
  });
}

async function login(page) {
  await page.goto(appUrl, { waitUntil: "load" });
  await page.fill('input[name="userId"]', "admin");
  await page.fill('input[name="password"]', "admin");
  await page.click("button.login-button");
  await page.waitForSelector(".dashboard-editor-container", { timeout: 10000 });
}

async function runFlow(browserName, page) {
  await login(page);

  for (const route of qaRoutes) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, route.hash);
    await page.waitForTimeout(250);
    await page.waitForSelector(`text=${route.text}`, { timeout: 10000 });
  }

  await page.click("text=Export");
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/token-generate/credit-token";
  });
  await page.waitForSelector("text=Recharge", { timeout: 10000 });
  await page.click("text=Recharge");
  await page.waitForSelector("text=Total Paid(MMK)", { timeout: 10000 });
  await page.locator(".modal-field", { hasText: "Total Paid(MMK)" }).locator("input").fill("350");
  await page.evaluate(() => {
    document.querySelector(".modal-actions .btn.primary")?.click();
  });
  await page.waitForSelector(".enterprise-reference-summary", { timeout: 10000 });
  await page.waitForFunction(() => document.body.innerText.includes("Customer Id"));
  await page.waitForFunction(() => document.body.innerText.includes("Customer Name"));
  await page.waitForFunction(() => document.body.innerText.includes("Meter Id"));
  await page.waitForFunction(() => document.body.innerText.includes("Pay Debt(MMK)"));
  await page.waitForFunction(() => document.body.innerText.includes("Monthly Charge(MMK)"));
  await page.waitForFunction(() => document.body.innerText.includes("Total Unit(kWh)"));
  await page.waitForFunction(() => document.body.innerText.includes("Total Paid(MMK)"));
  await page.waitForSelector("text=Payment Method", { timeout: 10000 });
  await page.waitForSelector("text=Authorization Password", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/token-record/credit-token-record";
  });
  await page.waitForSelector("text=receiptId", { timeout: 10000 });
  await page.locator("button.link-btn", { hasText: "Print" }).first().click();
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/management/account";
  });
  await page.waitForSelector("text=Add", { timeout: 10000 });
  await page.click("text=Add");
  await page.waitForSelector("text=Authorization Password", { timeout: 10000 });
  await page.fill('input[name="authorizationPassword"]', "qa-password");
  await page.evaluate(() => {
    document.querySelector(".modal-actions .btn.primary")?.click();
  });
  await page.waitForSelector(".modal-error", { timeout: 10000 });

  return browserName;
}

async function closeModal(page) {
  await page.evaluate(() => {
    document.querySelector(".modal-actions .btn")?.click();
  });
  await page.waitForSelector(".modal-backdrop", { state: "detached", timeout: 10000 });
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/html";
}

function safeAssetPath(urlPath) {
  const requestedPath = decodeURIComponent(urlPath.split("?")[0]);
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
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      appUrl = `http://127.0.0.1:${address.port}`;
      resolve(server);
    });
  });
}

async function runBrowser(target) {
  let browser;
  try {
    browser = await target.type.launch({ headless: true, ...target.options });
  } catch (error) {
    if (target.optional) return { browser: target.name, skipped: true, reason: error.message.split("\n")[0] };
    throw error;
  }

  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  await installApiMocks(page);
  const browserName = await runFlow(target.name, page);
  await browser.close();
  return { browser: browserName, skipped: false };
}

async function main() {
  const server = await startStaticServer();
  const results = [];
  try {
    for (const browserTarget of browsers) {
      results.push(await runBrowser(browserTarget));
    }
  } finally {
    server.close();
  }

  const passed = results.filter((result) => !result.skipped).map((result) => result.browser);
  if (!passed.length) throw new Error("no browsers passed");

  console.log(JSON.stringify({
    passed,
    skipped: results.filter((result) => result.skipped),
    flows: ["login", "dashboard", "account table", "credit token confirmation", "credit token record", "remote task table", "report page", "export", "print", "guarded write"],
    status: "browser qa passed"
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
