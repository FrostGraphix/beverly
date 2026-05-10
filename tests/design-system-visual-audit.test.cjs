"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
require("module").Module._initPaths();

const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "dist");
const artifactDir = path.join(root, "tmp", "design-system-audit");
const themes = ["light", "dark", "executive", "ocean", "contrast"];
const viewports = [
  { name: "desktop", width: 1365, height: 768 },
  { name: "mobile", width: 390, height: 844 }
];
const routes = [
  { name: "login", hash: "#/login", ready: ".login-card" },
  { name: "dashboard", hash: "#/dashboard", ready: ".dashboard-editor-container" },
  { name: "table", hash: "#/management/account", ready: ".table-page" },
  { name: "site-consumption", hash: "#/prepay-report/site-consumption", ready: ".eih-page" }
];

let appUrl = "";

function sampleRow() {
  return {
    id: "QA-1",
    customerId: "C-1001",
    customerName: "QA Customer",
    meterId: "M-1001",
    tariffId: "T-1",
    stationId: "KYAKALE",
    receiptId: "R-1001",
    dataItem: "Total Energy",
    nonpurchaseDays: 31,
    phone: "000",
    status: "Success",
    createDate: "2026-01-01"
  };
}

function apiBody(url) {
  if (url.includes("/user/login")) return { code: 0, data: { token: "qa-token", userId: "admin" } };
  if (url.includes("/dashboard/readPanelGroup")) {
    return { code: 0, data: { totalAccountCount: 100, totalPurchaseTimes: 20, totalPurchaseUnit: 300, totalPurchaseMoney: 400 } };
  }
  if (url.includes("/dashboard/readLineChart")) return { code: 0, data: { title: "Purchase Money", xData: ["Jan", "Feb"], yData: [10, 20] } };
  if (url.includes("/DailyDataMeter/read")) {
    return {
      code: 0,
      data: {
        data: [
          { customerId: "C-1001", meterId: "M-1001", currentDate: "2026-01-01", total1: 100, remain1: 20, stationId: "KYAKALE" },
          { customerId: "C-1001", meterId: "M-1001", currentDate: "2026-01-02", total1: 112, remain1: 8, stationId: "KYAKALE" }
        ],
        total: 2
      }
    };
  }
  if (url.includes("/token/creditTokenRecord/read")) {
    return { code: 0, data: { data: [{ ...sampleRow(), totalUnit: 10, totalPaid: 3500, token: "1234 5678 9012 3456" }], total: 1 } };
  }
  if (url.includes("/account/read")) return { code: 0, data: { data: [sampleRow()], total: 1 }, result: { data: [sampleRow()], total: 1 } };
  return { code: 0, data: { data: [sampleRow()], total: 1 }, result: { data: [sampleRow()], total: 1 } };
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
  return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile() ? resolvedPath : path.join(distRoot, "index.html");
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const filePath = safeAssetPath(request.url || "/");
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      appUrl = `http://127.0.0.1:${server.address().port}`;
      resolve(server);
    });
  });
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(apiBody(url)) });
  });
}

async function login(page) {
  await page.goto(`${appUrl}/#/login`, { waitUntil: "load" });
  await page.fill('input[name="userId"]', "admin");
  await page.fill('input[name="password"]', "admin");
  await page.click("button.login-button");
  await page.waitForSelector(".dashboard-editor-container", { timeout: 10000 });
}

async function assertKeyboardHealth(page) {
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return { valid: false, reason: "no active focus" };
    const styles = window.getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    return {
      valid: true,
      tag: active.tagName,
      className: active.className,
      visible: rect.width > 0 && rect.height > 0,
      hasFocusTreatment: styles.outlineStyle !== "none" || styles.boxShadow !== "none"
    };
  });
  assert(focus.valid, focus.reason || "Focus missing.");
  assert(focus.visible, `Focused element invisible: ${focus.tag}.${focus.className}`);
  assert(focus.hasFocusTreatment, `Focused element lacks treatment: ${focus.tag}.${focus.className}`);
}

async function assertPageHealth(page, expectedTheme) {
  const metrics = await page.evaluate(() => {
    const focusable = [...document.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")];
    const rawButtons = [...document.querySelectorAll("button")]
      .filter((button) => button.offsetParent !== null)
      .filter((button) => !button.classList.contains("base-button"))
      .filter((button) => !button.classList.contains("base-icon-button"))
      .filter((button) => !button.classList.contains("base-toggle"));
    return {
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      emptyBody: document.body.innerText.trim().length === 0,
      focusedCount: focusable.length,
      rawButtons: rawButtons.length,
      rawButtonSamples: rawButtons.slice(0, 5).map((button) => `${button.className}:${button.textContent.trim()}`),
      rawInputs: [...document.querySelectorAll("input")]
        .filter((input) => input.type !== "hidden")
        .filter((input) => input.type !== "file")
        .filter((input) => !input.classList.contains("base-input"))
        .filter((input) => !input.closest(".base-checkbox")).length,
      baseControls: document.querySelectorAll(".base-button, .base-icon-button, .base-input, .base-select, .base-checkbox, .base-toggle").length
    };
  });
  const theme = await page.evaluate(() => document.documentElement.dataset.theme || "");

  assert(metrics.width <= metrics.viewport, `Horizontal overflow ${metrics.width}/${metrics.viewport}`);
  assert(!metrics.emptyBody, "Page rendered empty.");
  assert(metrics.focusedCount > 0, "No focusable controls found.");
  assert(metrics.rawButtons === 0, `Raw buttons found: ${metrics.rawButtons} ${metrics.rawButtonSamples.join(" | ")}`);
  assert(metrics.rawInputs === 0, `Raw inputs found: ${metrics.rawInputs}`);
  assert(metrics.baseControls > 0, "Base controls missing.");
  assert.strictEqual(theme, expectedTheme, `Theme mismatch: ${theme}`);
  await assertKeyboardHealth(page);
}

async function main() {
  assert(fs.existsSync(path.join(distRoot, "index.html")), "Run npm run build before visual audit.");
  fs.mkdirSync(artifactDir, { recursive: true });
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await installApiMocks(page);
      await login(page);

      for (const theme of themes) {
        await page.evaluate((nextTheme) => {
          localStorage.setItem("beverly.theme", nextTheme);
          document.documentElement.dataset.theme = nextTheme;
        }, theme);

        for (const route of routes) {
          await page.goto(`${appUrl}/${route.hash}`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(route.ready, { timeout: 10000 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await assertPageHealth(page, theme);
          const screenshot = path.join(artifactDir, `${viewport.name}-${theme}-${route.name}.png`);
          await page.screenshot({ path: screenshot, fullPage: false });
          results.push(path.relative(root, screenshot).replace(/\\/g, "/"));
        }

        await page.goto(`${appUrl}/#/management/account`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".table-page", { timeout: 10000 });
        await page.evaluate(() => {
          const exportButton = [...document.querySelectorAll(".table-page .base-button")]
            .find((button) => button.textContent.includes("Export"));
          exportButton?.click();
        });
        await page.waitForSelector(".modal-backdrop", { timeout: 10000 });
        await assertPageHealth(page, theme);
        await page.keyboard.press("Escape");
        await page.locator(".modal-close").click();
        await page.waitForSelector(".modal-backdrop", { state: "detached", timeout: 10000 });
      }

      assert.deepStrictEqual(errors, [], "Console errors found.");
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  assert.strictEqual(results.length, themes.length * viewports.length * routes.length);
  console.log(JSON.stringify({ screenshots: results.length, artifactDir: path.relative(root, artifactDir).replace(/\\/g, "/"), status: "design system visual audit passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
