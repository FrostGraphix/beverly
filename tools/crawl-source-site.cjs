const fs = require("fs");
const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = "http://8.208.16.168:9311/";
const outDir = path.resolve("source-crawl/screenshots");

const viewports = [
  { name: "mobile", width: 399, height: 557 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1365, height: 768 }
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const report = [];

  for (const viewport of viewports) {
    const requests = [];
    const responses = [];
    const consoleLogs = [];
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on("request", (request) => requests.push(request.url()));
    page.on("response", (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes("/api/") || responseUrl.includes("/static/")) {
        responses.push({ status: response.status(), url: responseUrl });
      }
    });
    page.on("console", (message) => consoleLogs.push({ type: message.type(), text: message.text() }));

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const loginPath = path.join(outDir, `source-login-${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: loginPath, fullPage: false });

    await page.goto("http://8.208.16.168:9311/#/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    const dashboardRedirectPath = path.join(outDir, `source-dashboard-redirect-${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: dashboardRedirectPath, fullPage: false });

    const fields = await page.locator("input").evaluateAll((nodes) => nodes.map((node) => ({
      type: node.getAttribute("type"),
      placeholder: node.getAttribute("placeholder"),
      className: node.className
    }))).catch(() => []);

    const nav = {
      title: await page.title(),
      url: page.url(),
      bodyText: (await page.locator("body").innerText().catch(() => "")).slice(0, 1000),
      fields
    };

    report.push({
      viewport,
      nav,
      requests: [...new Set(requests)].slice(0, 120),
      responses: responses.slice(0, 120),
      consoleLogs: consoleLogs.slice(-30),
      screenshots: {
        login: loginPath,
        dashboardRedirect: dashboardRedirectPath
      }
    });

    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.resolve("source-crawl/crawl-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.map((item) => ({
    viewport: item.viewport,
    title: item.nav.title,
    url: item.nav.url,
    text: item.nav.bodyText,
    fields: item.nav.fields,
    screenshots: item.screenshots
  })), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
