"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist", "wallet-admin");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname.replace(/^\/wallet-admin\/?/, "");
    const requested = path.resolve(dist, relative || "index.html");
    const safe = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = safe ? requested : path.join(dist, "index.html");
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

(async () => {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "Build wallet-admin before running this browser test.");
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem("beverly.staff.access_token", "existing-session");
      localStorage.setItem("beverly.staff.user", JSON.stringify({ id: "existing-admin", email: "admin@acoblighting.com", role: "super-admin", password_reset_required: false }));
    });
    await context.route("**/api/v1/admin/me", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "existing-admin", email: "admin@acoblighting.com", role: "super-admin", password_reset_required: false }, permissions: [] }),
    }));
    const page = await context.newPage();
    await page.goto(`${base}/wallet-admin/setup-account#access_token=invitation-test-token`);
    await page.getByRole("heading", { name: "Set up your account" }).waitFor({ timeout: 10000 });
    assert.equal(new URL(page.url()).pathname, "/wallet-admin/setup-account");
    assert.equal(new URL(page.url()).hash, "", "The recovery token must be cleared from browser history.");
    await context.close();

    const inviteContext = await browser.newContext();
    let usedInvitationToken = false;
    await inviteContext.route("**/api/v1/admin/account-setup", (route) => {
      usedInvitationToken = route.request().headers().authorization === "Bearer invitation-test-token";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    const invitePage = await inviteContext.newPage();
    await invitePage.goto(`${base}/wallet-admin/setup-account#access_token=invitation-test-token`);
    await invitePage.getByLabel("Password", { exact: true }).fill("AcoB!2026SecurePass1");
    await invitePage.getByLabel("Confirm password").fill("AcoB!2026SecurePass1");
    await invitePage.getByRole("button", { name: "Set password" }).click();
    await invitePage.getByRole("heading", { name: "Your password is set" }).waitFor();
    assert.equal(usedInvitationToken, true, "Password setup must authorize with the invitation token.");
    await inviteContext.close();
    console.log("Staff invitation opens account setup, including in a browser with an existing admin session.");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
