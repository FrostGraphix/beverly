const fs = require("fs");
const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outDir = path.resolve("tmp", "remote-support-verification");
const routes = [
  "#/remote-support/gprs-tasks",
  "#/remote-support/gprs-online-status",
  "#/remote-support/load-profile",
  "#/remote-support/event-notification",
  "#/remote-support/firmware-update",
  "#/remote-support/file-upload"
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1009 }, deviceScaleFactor: 1 });
  const results = [];

  for (const route of routes) {
    const network = [];
    page.removeAllListeners("response");
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/")) network.push({ status: response.status(), url });
    });
    await page.goto(`http://127.0.0.1:9311/${route}`, { waitUntil: "networkidle", timeout: 30000 });
    const slug = route.replace("#/remote-support/", "");
    const screenshot = path.join(outDir, `${slug}.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(async () => {
      await page.setViewportSize({ width: 1365, height: 768 });
      await page.screenshot({ path: screenshot, fullPage: false });
    });
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      hasError: Boolean(document.querySelector(".table-error")),
      emptyText: document.querySelector(".empty-cell")?.textContent?.trim() || "",
      rows: document.querySelectorAll("tbody tr").length
    }));
    results.push({ route, screenshot, network, state });
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map((result) => ({
    route: result.route,
    hasError: result.state.hasError,
    emptyText: result.state.emptyText,
    failedResponses: result.network.filter((entry) => entry.status >= 400),
    screenshot: result.screenshot
  })), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
