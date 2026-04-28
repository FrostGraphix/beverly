const fs = require("fs");
const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outDir = path.resolve("source-crawl/authenticated");
const credentials = {
  username: "admin",
  password: "ACOB_ADMIN",
  captcha: "8920"
};

const viewports = [
  { name: "desktop", width: 1365, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 399, height: 557 }
];

async function login(page) {
  await page.goto("http://8.208.16.168:9311/#/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('input[placeholder="Username"]').fill(credentials.username);
  await page.locator('input[placeholder="Password"]').fill(credentials.password);
  await page.locator('input[placeholder="Verification Code"]').fill(credentials.captcha);
  await page.locator("button:has-text('Login')").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: edge
  });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const network = [];
  const consoleLogs = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/")) network.push({ method: request.method(), url, postData: request.postData() });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/")) network.push({ status: response.status(), url });
  });
  page.on("console", (message) => consoleLogs.push({ type: message.type(), text: message.text() }));

  await login(page);

  const loginResult = {
    title: await page.title(),
    url: page.url(),
    bodyText: (await page.locator("body").innerText().catch(() => "")).slice(0, 2000)
  };

  const shots = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://8.208.16.168:9311/#/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    const visiblePath = path.join(outDir, `live-dashboard-${viewport.name}-${viewport.width}x${viewport.height}.png`);
    const fullPath = path.join(outDir, `live-dashboard-${viewport.name}-${viewport.width}x${viewport.height}-full.png`);
    await page.screenshot({ path: visiblePath, fullPage: false });
    await page.screenshot({ path: fullPath, fullPage: true });
    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      };
      return {
        url: location.href,
        title: document.title,
        appClass: document.querySelector(".app-wrapper")?.className || "",
        header: box(".fixed-header"),
        sidebar: box(".sidebar-container"),
        firstPanel: box(".card-panel"),
        chartWrapper: box(".chart-wrapper"),
        scroll: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        },
        text: document.body.innerText.slice(0, 1500)
      };
    });
    shots.push({ viewport, visiblePath, fullPath, metrics });
  }

  const storage = await context.storageState();
  fs.writeFileSync(path.join(outDir, "storage-state.json"), JSON.stringify(storage, null, 2));
  fs.writeFileSync(path.join(outDir, "auth-crawl-report.json"), JSON.stringify({ loginResult, network, consoleLogs, shots }, null, 2));
  console.log(JSON.stringify({ loginResult, shots, report: path.join(outDir, "auth-crawl-report.json") }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
