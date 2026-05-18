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

const allBrowsers = [
  { name: "edge", type: chromium, options: fs.existsSync(edgePath) ? { executablePath: edgePath } : {} },
  { name: "chromium", type: chromium, options: {}, optional: true },
  { name: "firefox", type: firefox, options: {}, optional: true },
  { name: "webkit", type: webkit, options: {}, optional: true }
];

const defaultBrowserTarget = fs.existsSync(edgePath) ? "edge" : "chromium";
const browserTargets = String(process.env.BROWSER_QA_TARGETS || defaultBrowserTarget)
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const browsers = browserTargets.includes("all")
  ? allBrowsers
  : allBrowsers.filter((target) => browserTargets.includes(target.name));

const qaRoutes = [
  { hash: "#/dashboard", selector: "text=Account Count" },
  { hash: "#/management/account", selector: 'th[data-column-key="customerId"]' },
  { hash: "#/token-record/credit-token-record", selector: 'th[data-column-key="receiptId"]' },
  { hash: "#/remote-operation-record/remote-meter-reading-task", selector: 'th[data-column-key="dataItem"]' },
  { hash: "#/prepay-report/long-nonpurchase-situation", selector: 'th[data-column-key="nonpurchaseDays"]' },
  { hash: "#/management/customer", selector: 'th[data-column-key="phone"]' }
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

function dailyMeterRows() {
  return [
    {
      customerId: "C-1001",
      customerName: "QA Customer",
      meterId: "M-1001",
      gatewayId: "G-1001",
      currentDate: "2026-01-01",
      total1: 100,
      remain1: 20,
      power: 2.5,
      status: "Online",
      stationId: "KYAKALE"
    },
    {
      customerId: "C-1001",
      customerName: "QA Customer",
      meterId: "M-1001",
      gatewayId: "G-1001",
      currentDate: "2026-01-02",
      total1: 112,
      remain1: 8,
      power: 2.9,
      status: "Online",
      stationId: "KYAKALE"
    }
  ];
}

function creditTokenRows() {
  return [
    {
      receiptId: "R-1001",
      customerId: "C-1001",
      customerName: "QA Customer",
      meterId: "M-1001",
      meterType: "Electricity",
      tariffId: "T-1",
      totalUnit: 10,
      totalPaid: 3500,
      token: "1234 5678 9012 3456",
      vend: true,
      stationId: "KYAKALE",
      createDate: "2026-01-02"
    }
  ];
}

function accountRows() {
  return [
    {
      customerId: "C-1001",
      customerName: "QA Customer",
      meterId: "M-1001",
      tariffId: "T-1",
      stationId: "KYAKALE"
    },
    {
      customerId: "C-1002",
      customerName: "QA Customer 2",
      meterId: "M-1002",
      tariffId: "T-1",
      stationId: "MUSHA"
    }
  ];
}

function apiBody(url) {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("/user/login")) {
    return { code: 0, data: { token: "qa-token", userId: "admin", userName: "ACB(admin)" } };
  }
  if (normalizedUrl.includes("/user/read")) {
    return { code: 0, data: { userId: "admin", userName: "ACB(admin)", roleId: "super-admin" } };
  }
  if (normalizedUrl.includes("/dashboard/readpanelgroup")) {
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
  if (normalizedUrl.includes("/dashboard/readlinechart")) {
    return { code: 0, data: { title: "Purchase Money", xData: ["Jan", "Feb"], yData: [10, 20] } };
  }
  if (normalizedUrl.includes("/tariff/read")) {
    return { code: 0, data: { data: [{ tariffId: "T-1", id: "T-1", name: "QA Tariff", price: "350" }], total: 1 } };
  }
  if (normalizedUrl.includes("/token/credittokenrecord/read")) {
    return { code: 0, data: { data: creditTokenRows(), total: 1 }, result: { data: creditTokenRows(), total: 1 } };
  }
  if (normalizedUrl.includes("/dailydatameter/read")) {
    return { code: 0, data: { data: dailyMeterRows(), total: 2 }, result: { data: dailyMeterRows(), total: 2 } };
  }
  if (normalizedUrl.includes("/account/read")) {
    return { code: 0, data: { data: accountRows(), total: 2 }, result: { data: accountRows(), total: 2 } };
  }
  if (normalizedUrl.includes("/token/credittoken/generate")) {
    return { code: 0, data: { token: "1234 5678 9012 3456", createDate: "2026-01-01 00:00:00" } };
  }
  if (normalizedUrl.includes("/account/create")) {
    return { code: 403, reason: "Live writes are guarded" };
  }
  if (normalizedUrl.includes("/wallet/summary")) {
    return {
      code: 0,
      data: {
        wallet: {
          id: "wallet-browser",
          organizationId: "vendor-browser",
          walletNumber: "VW-BROWSER",
          status: "active"
        },
        ledgerBalanceMinor: 100000,
        heldBalanceMinor: 0,
        availableBalanceMinor: 100000
      }
    };
  }
  if (normalizedUrl.includes("/wallet/funding/list") || normalizedUrl.includes("/wallet/purchase/list")) {
    return { code: 0, data: { rows: [], total: 0 } };
  }
  return { code: 0, data: { data: [sampleRow()], total: 1 } };
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.toLowerCase().includes("/api/")) return route.continue();
    return route.fulfill({
      status: url.toLowerCase().includes("/account/create") ? 403 : 200,
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

async function runFlow(browserName, page) {
  await login(page);

  for (const route of qaRoutes) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, route.hash);
    await page.waitForTimeout(250);
    await page.waitForSelector(route.selector, { timeout: 10000 });
  }

  await page.click('[data-testid="table-toolbar-action-export"]');
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/token-generate/credit-token";
  });
  await page.waitForSelector("text=Recharge", { timeout: 10000 });
  await page.click('[data-testid="table-row-action-recharge-1"]');
  await page.waitForSelector("text=Total Paid(MMK)", { timeout: 10000 });
  await page.locator(".modal-field", { hasText: "Total Paid(MMK)" }).locator("input").fill("350");
  await page.evaluate(() => {
    document.querySelector(".modal-actions .base-button--primary")?.click();
  });
  await page.waitForSelector(".token-review-hero", { timeout: 10000 });
  await page.waitForSelector(".token-review-amount", { timeout: 10000 });
  await page.waitForSelector("text=Payment Method", { timeout: 10000 });
  await page.waitForSelector("text=Authorization Password", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/token-record/credit-token-record";
  });
  await page.waitForSelector('th[data-column-key="receiptId"]', { timeout: 10000 });
  await page.locator('[data-testid^="table-row-action-print-"]').first().click();
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/management/account";
  });
  await page.waitForSelector("text=Add", { timeout: 10000 });
  await page.click('[data-testid="table-toolbar-action-add"]');
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  await closeModal(page);

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
  await closeModal(page);

  await page.evaluate(() => {
    window.location.hash = "#/prepay-report/site-consumption";
  });
  await page.waitForSelector("text=Site Performance", { timeout: 10000 });
  await page.waitForSelector("text=Revenue Shortfall", { timeout: 10000 });
  await page.click("text=Fraud");
  await page.waitForSelector("text=Risk Investigation", { timeout: 10000 });

  await page.waitForSelector('a.sidebar-item[href*="5175"], a.sidebar-item[href*="admin.beverly.acoblighting.com"]', { timeout: 10000 });

  return browserName;
}

async function closeModal(page) {
  await page.locator(".modal-close").click();
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
    flows: ["login", "dashboard", "account table", "credit token confirmation", "credit token record", "remote task table", "report page", "external wallet link", "export", "print", "guarded write"],
    status: "browser qa passed"
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
