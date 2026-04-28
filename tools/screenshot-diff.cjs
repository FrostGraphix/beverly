"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
require("module").Module._initPaths();
const { PNG } = require("pngjs");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const referenceRoot = "C:/Users/ACOB/Desktop/VS Code/acob-crm3/tmp";
const outDir = path.join(root, "replica-screenshots", "diffs");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const targets = [
  {
    name: "login-load",
    url: "http://127.0.0.1:9311/#/login?redirect=%2Fdashboard",
    reference: path.join(referenceRoot, "reference-login-load.png")
  },
  {
    name: "dashboard",
    url: "http://127.0.0.1:9311/#/dashboard",
    reference: path.join(referenceRoot, "reference-dashboard.png")
  },
  {
    name: "credit-token",
    url: "http://127.0.0.1:9311/#/token-generate/credit-token",
    reference: path.join(referenceRoot, "crawl-token-generate-credit-token.png")
  }
];

async function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

async function main() {
  const { default: pixelmatch } = await import(pathToFileURL(require.resolve("pixelmatch")).href);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const results = [];

  for (const target of targets) {
    const localPath = path.join(outDir, `${target.name}-local.png`);
    const diffPath = path.join(outDir, `${target.name}-diff.png`);
    const reference = await readPng(target.reference);
    const page = await browser.newPage({
      viewport: { width: reference.width, height: reference.height },
      deviceScaleFactor: 1
    });
    await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: localPath, fullPage: false });
    const local = await readPng(localPath);
    const result = {
      name: target.name,
      reference: target.reference,
      local: localPath,
      diff: diffPath,
      width: local.width,
      height: local.height,
      referenceWidth: reference.width,
      referenceHeight: reference.height,
      pixelsDifferent: null,
      percentDifferent: null
    };
    if (reference.width === local.width && reference.height === local.height) {
      const diff = new PNG({ width: local.width, height: local.height });
      const pixelsDifferent = pixelmatch(reference.data, local.data, diff.data, local.width, local.height, { threshold: 0.1 });
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      result.pixelsDifferent = pixelsDifferent;
      result.percentDifferent = Number((pixelsDifferent / (local.width * local.height) * 100).toFixed(2));
    }
    results.push(result);
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
