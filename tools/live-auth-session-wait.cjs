const fs = require("fs");
const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outDir = path.resolve("source-crawl/authenticated");
const answerFile = path.join(outDir, "captcha-answer.txt");
const readyFile = path.join(outDir, "captcha-ready.json");
const viewports = [
  { name: "desktop", width: 1365, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 399, height: 557 }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gotoWithRetry(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(1500);
    }
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(answerFile, { force: true });
  fs.rmSync(readyFile, { force: true });

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

  await gotoWithRetry(page, "http://8.208.16.168:9311/#/dashboard");
  await page.locator('input[placeholder="Username"]').fill("admin");
  await page.locator('input[placeholder="Password"]').fill("ACOB_ADMIN");
  const captchaShot = path.join(outDir, "live-captcha-session-desktop-1365x768.png");
  await page.screenshot({ path: captchaShot, fullPage: false });
  fs.writeFileSync(readyFile, JSON.stringify({
    status: "waiting_for_user_captcha",
    captchaShot,
    answerFile
  }, null, 2));
  console.log(JSON.stringify({ status: "waiting_for_user_captcha", captchaShot, answerFile }, null, 2));

  const started = Date.now();
  while (!fs.existsSync(answerFile)) {
    if (Date.now() - started > 10 * 60 * 1000) {
      throw new Error("Timed out waiting for captcha-answer.txt");
    }
    await sleep(1000);
  }

  const captcha = fs.readFileSync(answerFile, "utf8").trim();
  await page.locator('input[placeholder="Verification Code"]').fill(captcha);
  await page.locator("button:has-text('Login')").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  const loginState = {
    title: await page.title(),
    url: page.url(),
    text: (await page.locator("body").innerText().catch(() => "")).slice(0, 2000)
  };

  const shots = [];
  if (!page.url().includes("#/dashboard") || loginState.text.includes("Verification Code Tips")) {
    const failedShot = path.join(outDir, "live-login-failed-after-answer.png");
    await page.screenshot({ path: failedShot, fullPage: false });
    fs.writeFileSync(path.join(outDir, "auth-crawl-report.json"), JSON.stringify({ loginState, failedShot, network, consoleLogs }, null, 2));
    console.log(JSON.stringify({ status: "login_failed", loginState, failedShot }, null, 2));
    await browser.close();
    return;
  }

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoWithRetry(page, "http://8.208.16.168:9311/#/dashboard");
    await sleep(1000);
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
        secondPanel: box(".card-panel:nth-child(2)"),
        chartWrapper: box(".chart-wrapper"),
        scroll: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        },
        text: document.body.innerText.slice(0, 2500)
      };
    });
    shots.push({ viewport, visiblePath, fullPath, metrics });
  }

  const storage = await context.storageState();
  fs.writeFileSync(path.join(outDir, "storage-state.json"), JSON.stringify(storage, null, 2));
  fs.writeFileSync(path.join(outDir, "auth-crawl-report.json"), JSON.stringify({ loginState, network, consoleLogs, shots }, null, 2));
  console.log(JSON.stringify({ status: "complete", loginState, shots, report: path.join(outDir, "auth-crawl-report.json") }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
