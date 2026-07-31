"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

async function captureBeverlyLogs() {
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const options = fs.existsSync(edgePath) ? { executablePath: edgePath, headless: true } : { headless: true };
  const browser = await chromium.launch(options);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const allLogs = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const networkRequests = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
    allLogs.push(entry);
    if (msg.type() === "error") consoleErrors.push(entry);
    if (msg.type() === "warning" || msg.type() === "warn") consoleWarnings.push(entry);
  });

  page.on("request", (req) => {
    networkRequests.push({ method: req.method(), url: req.url() });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      networkErrors.push({ url: res.url(), status: res.status(), statusText: res.statusText() });
    }
  });

  console.log("Navigating browser to https://beverly.acoblighting.com...");
  await page.goto("https://beverly.acoblighting.com", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  const currentUrl = page.url();

  const screenshotPath = "C:/Users/ACOB/.gemini/antigravity/brain/555e45fc-76ba-423e-8008-c6309a318873/beverly_live_console_audit.png";
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await browser.close();

  console.log(JSON.stringify({
    title,
    currentUrl,
    screenshotPath: "file:///" + screenshotPath,
    totalConsoleLogs: allLogs.length,
    consoleErrorsCount: consoleErrors.length,
    consoleWarningsCount: consoleWarnings.length,
    totalNetworkRequests: networkRequests.length,
    networkErrorsCount: networkErrors.length,
    allLogs,
    networkErrors
  }, null, 2));
}

captureBeverlyLogs().catch((err) => {
  console.error("Failed to capture logs:", err);
  process.exit(1);
});
