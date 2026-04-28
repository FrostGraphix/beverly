const fs = require("fs");
const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outDir = path.resolve("replica-screenshots");
const fileUrl = `file:///${path.resolve("index.html").replace(/\\/g, "/")}`;
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
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(fileUrl, { waitUntil: "load", timeout: 30000 });
    const loginShot = path.join(outDir, `replica-login-${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: loginShot, fullPage: false });

    await page.goto(`${fileUrl}#/dashboard`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector(".card-panel"), null, { timeout: 5000 });
    const dashShot = path.join(outDir, `replica-dashboard-${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: dashShot, fullPage: false });

    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      };
      return {
        pageClass: document.querySelector("#app > div")?.className || "",
        body: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
        header: box(".fixed-header"),
        firstPanel: box(".card-panel"),
        secondPanel: box(".card-panel:nth-child(2)"),
        chart: box(".chart-wrapper")
      };
    });
    report.push({ viewport, loginShot, dashShot, metrics });
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.resolve("replica-screenshots/report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
