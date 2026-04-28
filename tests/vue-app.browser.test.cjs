"use strict";

const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const fileUrl = `file:///${path.resolve("dist/index.html").replace(/\\/g, "/")}`;
  await page.goto(fileUrl, { waitUntil: "load" });
  await browser.close();
  console.log(JSON.stringify({ status: "dist smoke passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
