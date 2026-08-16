const path = require("path");
require("module").Module._initPaths();
const { chromium } = require("playwright");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const sourceUrl = String(process.env.SOURCE_SITE_URL || "").replace(/\/+$/, "");
const sourceUsername = String(process.env.SOURCE_USERNAME || "");
const sourcePassword = String(process.env.SOURCE_PASSWORD || "");

async function main() {
  if (!sourceUrl || !sourceUsername || !sourcePassword) {
    throw new Error("Set SOURCE_SITE_URL, SOURCE_USERNAME, and SOURCE_PASSWORD.");
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
  await page.goto(`${sourceUrl}/#/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('input[placeholder="Username"]').fill(sourceUsername);
  await page.locator('input[placeholder="Password"]').fill(sourcePassword);
  const screenshot = path.resolve("source-crawl/live-login-prefilled-desktop-1365x768.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  const fields = await page.locator("input").evaluateAll((nodes) => nodes.map((node) => ({
    type: node.getAttribute("type"),
    placeholder: node.getAttribute("placeholder"),
    value: node.value ? (node.getAttribute("type") === "password" ? "[filled password]" : node.value) : ""
  })));
  console.log(JSON.stringify({
    title: await page.title(),
    url: page.url(),
    fields,
    screenshot
  }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
