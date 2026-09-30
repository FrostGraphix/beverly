"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function startServer() {
  const dist = path.join(root, "dist", "wallet-customer");
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build wallet-customer first");
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = pathname.replace(/^\/wallet-customer\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const file = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested : path.join(dist, "index.html");
    response.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function reply(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

function customer() {
  return { id: "customer-1", full_name: "Ada Customer", email: "ada@example.test", kyc_tier: 1, kyc_status: "verified", status: "active", email_verified_at: "2026-09-30T10:00:00.000Z" };
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const url = `http://127.0.0.1:${server.address().port}/wallet-customer/`;
    const noneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await noneContext.addInitScript((profile) => {
      localStorage.setItem("beverly.customer.access_token", "test-token");
      localStorage.setItem("beverly.customer.profile", JSON.stringify(profile));
    }, customer());
    await noneContext.route("**/api/v1/customer/**", (route) => {
      const pathName = new URL(route.request().url()).pathname;
      if (pathName.endsWith("/me")) return reply(route, customer());
      if (pathName.endsWith("/wallet")) return reply(route, { balance_minor: 0, available_minor: 0, holds_minor: 0 });
      if (pathName.includes("/wallet/ledger")) return reply(route, { entries: [] });
      if (pathName.endsWith("/meters")) return reply(route, { meters: [] });
      if (pathName.endsWith("/meters/balances")) return reply(route, { balances: [] });
      if (pathName.includes("/transactions")) return reply(route, { purchases: [] });
      return reply(route, {});
    });
    const nonePage = await noneContext.newPage();
    await nonePage.goto(url, { waitUntil: "domcontentloaded" });
    await nonePage.getByText("No meter connected").waitFor({ timeout: 5_000 });
    await nonePage.getByRole("link", { name: "Add meter" }).waitFor({ timeout: 5_000 });
    await noneContext.close();

    const meterContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await meterContext.addInitScript((profile) => {
      localStorage.setItem("beverly.customer.access_token", "test-token");
      localStorage.setItem("beverly.customer.profile", JSON.stringify(profile));
    }, customer());
    await meterContext.route("**/api/v1/customer/**", (route) => {
      const pathName = new URL(route.request().url()).pathname;
      if (pathName.endsWith("/me")) return reply(route, customer());
      if (pathName.endsWith("/wallet")) return reply(route, { balance_minor: 0, available_minor: 0, holds_minor: 0 });
      if (pathName.includes("/wallet/ledger")) return reply(route, { entries: [] });
      if (pathName.endsWith("/meters")) return reply(route, { meters: [{ id: "meter-link", meter_id: "MTR-1", nickname: "Home", status: "approved" }] });
      if (pathName.endsWith("/meters/balances")) return reply(route, { balances: [{ meterId: "MTR-1", status: "available", balanceKwh: 12.5, readingDate: "2026-09-29", reportedAt: "2026-09-29T10:00:00.000Z" }] });
      if (pathName.includes("/transactions")) return reply(route, { purchases: [{ id: "purchase-1" }] });
      return reply(route, {});
    });
    const meterPage = await meterContext.newPage();
    await meterPage.goto(url, { waitUntil: "domcontentloaded" });
    await meterPage.getByText("Meter balance").waitFor({ timeout: 5_000 });
    await meterPage.getByText("12.5 kWh").waitFor({ timeout: 5_000 });
    await meterPage.getByText("Reported").waitFor({ timeout: 5_000 });
    await meterPage.getByText("You're all set!").waitFor({ timeout: 5_000 });
    await meterPage.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await meterPage.getByText("You're all set!").count(), 0, "completion celebration must show once per customer");
    await meterContext.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(JSON.stringify({ status: "Customer home browser verification passed" }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
