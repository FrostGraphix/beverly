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
  const componentSource = fs.readFileSync(path.join(root, "src/components/StationAlertsBell.vue"), "utf8");
  assert.match(componentSource, /setInterval\(this\.refresh, 60000\)/);
  const server = http.createServer((request, response) => {
    const file = staticFile(request.url);
    response.writeHead(200, { "Content-Type": contentType(file) });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const errors = [];
  const gatewayMethods = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url().toLowerCase();
    let data = { data: [], total: 0 };
    let meta = {};
    if (url.includes("/user/login")) {
      data = { token: "station-alert-test", userId: "admin", userName: "ACB(admin)", roleId: "super-admin" };
    } else if (url.includes("/auth/me")) {
      data = { userId: "admin", userName: "ACB(admin)", roleId: "super-admin" };
    } else if (url.includes("/user/read")) {
      data = { data: [{ userId: "admin", name: "ACB(admin)", roleId: "super-admin" }], total: 1 };
    } else if (url.includes("/notifications/gateway-health")) {
      gatewayMethods.push(route.request().method());
      data = {
        data: [
          {
            id: "incident-1",
            gateway: "GW-KYA",
            gatewayName: "Kyakale",
            station: "KYAKALE",
            kind: "down",
            status: "false",
            successRate: 0,
            startedAt: new Date().toISOString(),
            lastReportedAt: new Date().toISOString(),
            source: "live-gateway+supabase",
          },
          {
            id: "incident-2",
            gateway: "GW-MUS",
            gatewayName: "Musha",
            station: "MUSHA",
            kind: "recovered",
            status: "true",
            successRate: 98,
            startedAt: new Date(Date.now() - 60000).toISOString(),
            endedAt: new Date().toISOString(),
            lastReportedAt: new Date().toISOString(),
            source: "live-gateway+supabase",
          },
        ],
        total: 2,
      };
      meta = { eventIds: ["incident-1"] };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data, result: data, meta }),
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
    await page.locator(".station-alert-popover").getByText("Kyakale", { exact: true }).waitFor({ timeout: 5000 }).catch(async (error) => {
      throw new Error(`${error.message}\nmethods=${gatewayMethods.join(",")}\npanel=${await page.locator(".station-alert-popover").innerText()}`);
    });
    await page.locator(".station-alert-popover").getByText("GW-KYA", { exact: true }).waitFor();
    await page.locator(".station-alert-popover").getByText("Station ID KYAKALE", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Mark all read" }).isEnabled(), true);
    await page.getByRole("button", { name: "Mark all read" }).click();
    assert.equal(await page.getByRole("button", { name: "Mark all read" }).isEnabled(), false);
    await page.getByRole("button", { name: "Read more" }).click();
    await assert.doesNotReject(() => page.locator(".station-alert-details").getByText("GW-KYA").waitFor());
    await assert.doesNotReject(() => page.locator(".station-alert-details").getByText("KYAKALE", { exact: true }).waitFor());
    await assert.doesNotReject(() => page.locator(".station-alert-details").getByText("Less than one minute").waitFor());
    await assert.doesNotReject(() => page.getByText("Response SOP", { exact: true }).waitFor());
    await assert.doesNotReject(() => page.getByText("Confirm station power", { exact: true }).waitFor());
    const sop = await page.locator(".station-alert-sop").boundingBox();
    const details = await page.locator(".station-alert-details").boundingBox();
    assert(sop && details && sop.y < details.y, "Response SOP must precede diagnostics.");
    await page.getByRole("tab", { name: "History 1" }).click();
    await page.getByText("Musha", { exact: true }).waitFor();
    assert.equal(await page.locator(".station-alert-popover").getAttribute("role"), "dialog");
    assert.equal(await page.locator(".station-bell").getAttribute("aria-expanded"), "true");

    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator(".station-alert-popover").boundingBox();
    assert(panel, "Mobile notification panel must remain visible.");
    assert(panel.x >= 0 && panel.x + panel.width <= 390, "Mobile notification panel must stay onscreen.");
    assert(panel.y >= 0 && panel.y + panel.height <= 844, "Mobile notification panel must fit vertically.");
    assert.deepEqual(gatewayMethods, ["GET"]);

    await page.click(".station-alert-popover footer a");
    await page.waitForFunction(() => window.location.hash === "#/prepay-report/station-consumption");
    await page.locator(".station-alert-popover").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "station alerts browser test passed",
      coverage: ["bell", "active and history", "unread", "gateway outage", "SOP", "details", "mobile bounds", "monitoring link", "console"],
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
