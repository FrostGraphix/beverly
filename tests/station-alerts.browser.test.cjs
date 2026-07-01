"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

function staticFile(url) {
  const pathname = decodeURIComponent(String(url || "/").split("?")[0]);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(dist, relative);
  return candidate.startsWith(dist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(dist, "index.html");
}

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".png")) return "image/png";
  return "text/html";
}

async function main() {
  assert(fs.existsSync(path.join(dist, "index.html")), "Run the build before browser tests.");
  const server = http.createServer((request, response) => {
    const file = staticFile(request.url);
    response.writeHead(200, { "Content-Type": contentType(file) });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const errors = [];
  const stationMethods = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url().toLowerCase();
    let data = { data: [], total: 0 };
    if (url.includes("/user/login")) {
      data = { token: "station-alert-test", userId: "admin", userName: "ACB(admin)", roleId: "super-admin" };
    } else if (url.includes("/user/read")) {
      data = { data: [{ userId: "admin", name: "ACB(admin)", roleId: "super-admin" }], total: 1 };
    } else if (url.includes("/station/read")) {
      stationMethods.push(route.request().method());
      data = [
        { stationId: "KYAKALE", name: "Kyakale", status: "offline", successRate: 0 },
        { stationId: "CENTRAL", name: "Central", status: "online", successRate: 100 },
      ];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data, result: data }),
    });
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base, { waitUntil: "load" });
    await page.fill('[data-testid="login-user-id"]', "admin");
    await page.fill('[data-testid="login-password"]', "admin");
    await page.click('[data-testid="login-submit"]');
    await page.waitForSelector(".station-bell");
    await page.click(".station-bell");
    await page.waitForSelector(".station-alert-popover");
    await assert.doesNotReject(() => page.locator(".station-alert-popover").getByText("Kyakale is down").waitFor());
    assert.equal(await page.locator(".station-alert-popover").getAttribute("role"), "dialog");
    assert.equal(await page.locator(".station-bell").getAttribute("aria-expanded"), "true");

    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator(".station-alert-popover").boundingBox();
    assert(panel, "Mobile notification panel must remain visible.");
    assert(panel.x >= 0 && panel.x + panel.width <= 390, "Mobile notification panel must stay onscreen.");
    assert.deepEqual(stationMethods, ["POST"]);

    await page.click(".station-alert-popover footer a");
    await page.waitForFunction(() => window.location.hash === "#/prepay-report/station-consumption");
    await page.locator(".station-alert-popover").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "station alerts browser test passed",
      coverage: ["bell", "panel", "offline alert", "mobile bounds", "monitoring link", "console"],
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
