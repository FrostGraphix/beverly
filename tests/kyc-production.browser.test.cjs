"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const identityTypes = ["national_id", "voters_card", "passport", "drivers_license"];

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".webmanifest")) return "application/manifest+json";
  return "text/html";
}

function startServer(distName, routeBase) {
  const dist = path.join(root, "dist", distName);
  assert.ok(fs.existsSync(path.join(dist, "index.html")), `build ${distName} first`);
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = pathname.replace(new RegExp(`^/${routeBase}/?`), "");
    const requested = path.resolve(dist, relative || "index.html");
    const safe = requested.startsWith(path.resolve(dist)) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = safe ? requested : path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function addressOf(server, routeBase) {
  return `http://127.0.0.1:${server.address().port}/${routeBase}`;
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function installQuietRoutes(context) {
  return Promise.all([
    context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" })),
    context.route("https://fonts.gstatic.com/**", (route) => route.fulfill({ status: 204, body: "" })),
    context.route("https://upload.test/**", (route) => route.fulfill({ status: 200, body: "" })),
  ]);
}

async function verifyCustomer(browser, base) {
  const context = await browser.newContext();
  await installQuietRoutes(context);
  const profile = {
    id: "11111111-1111-4111-8111-111111111111", full_name: "Test Customer",
    email: "customer@example.test", phone: "+2348000000000", profile_picture_url: null,
    kyc_tier: 0, kyc_status: "rejected", kyc_data: { basic_info: { completed_at: "2026-09-09T12:00:00Z" } },
    status: "active", auth_provider: "email_password", email_verified_at: "2026-09-09T12:00:00Z",
  };
  await context.addInitScript((user) => {
    localStorage.setItem("beverly.customer.access_token", "customer-test-token");
    localStorage.setItem("beverly.customer.profile", JSON.stringify(user));
  }, profile);
  const uploadRequests = [];
  let submittedDocuments = null;
  await context.route("**/api/v1/customer/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/me")) return json(route, profile);
    if (pathname.endsWith("/kyc/status")) return json(route, {
      ...profile, review: { id: "rejected-review", requested_tier: 1, status: "rejected", reviewer_note: "Upload clearer evidence." }, documents: [],
    });
    if (pathname.endsWith("/kyc/documents/upload-url")) {
      const body = request.postDataJSON();
      uploadRequests.push(body);
      const id = `00000000-0000-4000-8000-${String(uploadRequests.length).padStart(12, "0")}`;
      return json(route, { documentId: id, uploadUrl: `https://upload.test/${id}` });
    }
    if (/\/kyc\/documents\/[^/]+\/activate$/.test(pathname)) return json(route, { ok: true });
    if (pathname.endsWith("/kyc/tier1/submit")) {
      submittedDocuments = request.postDataJSON().document_ids;
      return json(route, { review: { id: "review-1", requested_tier: 1, status: "pending" } });
    }
    return json(route, {});
  });

  const page = await context.newPage();
  await page.goto(`${base}/kyc`, { waitUntil: "networkidle" });
  await page.getByText("Changes requested: Upload clearer evidence.").waitFor();
  const selector = page.getByLabel("Identity document type");
  assert.deepEqual(await selector.locator("option").evaluateAll((items) => items.map((item) => item.value)), identityTypes);
  await selector.selectOption("passport");
  const fields = page.locator(".upload-field");
  await fields.nth(0).locator('input[type="file"]').setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await fields.nth(1).locator('input[type="file"]').setInputFiles({ name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await page.getByRole("button", { name: "Submit Tier 1 review" }).click();
  await page.getByText("Review in progress").waitFor();
  assert.equal(uploadRequests[0].document_type, "passport");
  assert.equal(uploadRequests[1].document_type, "selfie");
  assert.equal(submittedDocuments.length, 2);
  await context.close();
}

async function verifyVendor(browser, base) {
  const context = await browser.newContext();
  await installQuietRoutes(context);
  const user = {
    id: "22222222-2222-4222-8222-222222222222", vendor_organization_id: "33333333-3333-4333-8333-333333333333",
    role: "vendor", full_name: "Vendor Owner", phone: "+2348000000001", email: "vendor@example.test",
    profile_picture_url: null, mfa_enrolled: true, mfa_verified: true, password_reset_required: false,
    vend_credential_configured: true, vend_credential_type: "pin", organization_name: "Grid Vendor",
    kyc_tier: 1, kyc_status: "verified",
  };
  await context.addInitScript((profile) => {
    localStorage.setItem("beverly.vendor.access_token", "vendor-test-token");
    localStorage.setItem("beverly.vendor.user", JSON.stringify(profile));
  }, user);
  let failStatus = true;
  const uploadRequests = [];
  let submittedDocuments = null;
  await context.route("**/api/v1/vendor/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/me")) return json(route, user);
    if (pathname.endsWith("/kyc/status")) {
      if (failStatus) return json(route, { error: "status_unavailable", message: "KYC status failed." }, 503);
      return json(route, { kyc_tier: 1, kyc_status: "verified", review: null, documents: [] });
    }
    if (pathname.endsWith("/kyc/documents/upload-url")) {
      const body = request.postDataJSON();
      uploadRequests.push(body);
      const id = `10000000-0000-4000-8000-${String(uploadRequests.length).padStart(12, "0")}`;
      return json(route, { documentId: id, uploadUrl: `https://upload.test/${id}` });
    }
    if (/\/kyc\/documents\/[^/]+\/activate$/.test(pathname)) return json(route, { ok: true });
    if (pathname.endsWith("/kyc/tier2/submit")) {
      submittedDocuments = request.postDataJSON().document_ids;
      return json(route, { review: { id: "review-2", requested_tier: 2, status: "pending" } });
    }
    return json(route, {});
  });

  const page = await context.newPage();
  await page.goto(`${base}/kyc`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Status unavailable" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Request Tier 2" }).count(), 0);
  failStatus = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("heading", { name: "Request Tier 2" }).waitFor();
  const selector = page.getByLabel("Identity document type");
  assert.deepEqual(await selector.locator("option").evaluateAll((items) => items.map((item) => item.value)), identityTypes);
  await selector.selectOption("drivers_license");
  const fields = page.locator(".upload-field");
  await fields.nth(0).locator('input[type="file"]').setInputFiles({ name: "licence.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await fields.nth(1).locator('input[type="file"]').setInputFiles({ name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await fields.nth(2).locator('input[type="file"]').setInputFiles({ name: "utility.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await page.getByRole("button", { name: "Submit Tier 2 review" }).click();
  await page.getByText("Tier 2 review submitted.").waitFor();
  assert.deepEqual(uploadRequests.map((item) => item.document_type), ["drivers_license", "selfie", "utility_bill"]);
  assert.equal(submittedDocuments.length, 3);
  await context.close();
}

async function verifyAdmin(browser, base) {
  const context = await browser.newContext();
  await installQuietRoutes(context);
  const staff = { id: "44444444-4444-4444-8444-444444444444", email: "staff@example.test", full_name: "KYC Reviewer", role: "operations-manager", profile_picture_url: null };
  await context.addInitScript((user) => {
    localStorage.setItem("beverly.staff.access_token", "staff-test-token");
    localStorage.setItem("beverly.staff.user", JSON.stringify(user));
    localStorage.setItem("beverly.staff.permissions", JSON.stringify(["wallet.kyc.view", "wallet.kyc.review"]));
  }, staff);
  let includeAddress = false;
  let decisionBody = null;
  const review = () => ({
    id: "55555555-5555-4555-8555-555555555555", subject_type: "customer", customer_id: "11111111-1111-4111-8111-111111111111",
    current_tier: 1, requested_tier: 2, status: "pending", submitted_at: "2026-09-09T12:00:00Z",
    submission_json: { method: "manual_document_review" }, subject: { id: "11111111-1111-4111-8111-111111111111", full_name: "Test Customer", email: "customer@example.test" },
    documents: [
      { id: "66666666-6666-4666-8666-666666666666", doc_type: "passport", mime_type: "application/pdf", size_bytes: 1024, status: "pending" },
      { id: "77777777-7777-4777-8777-777777777777", doc_type: "selfie", mime_type: "image/jpeg", size_bytes: 1024, status: "pending" },
      ...(includeAddress ? [{ id: "88888888-8888-4888-8888-888888888888", doc_type: "bank_statement", mime_type: "application/pdf", size_bytes: 1024, status: "pending" }] : []),
    ],
  });
  await context.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/me")) return json(route, { user: staff, permissions: ["wallet.kyc.view", "wallet.kyc.review"] });
    if (pathname.endsWith("/kyc/reviews")) return json(route, { reviews: [review()], nextCursor: null });
    if (pathname.endsWith("/approve")) {
      decisionBody = request.postDataJSON();
      return json(route, { ok: true, review: { ...review(), status: "approved" } });
    }
    return json(route, {});
  });

  const page = await context.newPage();
  await page.goto(`${base}/kyc-reviews`, { waitUntil: "networkidle" });
  await page.getByText("Test Customer").click();
  const approve = page.getByRole("button", { name: "Approve tier" });
  assert.equal(await approve.isDisabled(), true);
  includeAddress = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  assert.equal(await approve.isEnabled(), true);
  await approve.click();
  await page.getByLabel("Review note").fill("Evidence verified securely.");
  await page.getByRole("button", { name: "Approve tier", exact: true }).last().click();
  await page.getByText("Tier approved.").waitFor();
  assert.equal(decisionBody.note, "Evidence verified securely.");
  await context.close();
}

(async () => {
  const servers = await Promise.all([
    startServer("wallet-customer", "wallet-customer"),
    startServer("wallet-vendor", "wallet-vendor"),
    startServer("wallet-admin", "wallet-admin"),
  ]);
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    await verifyCustomer(browser, addressOf(servers[0], "wallet-customer"));
    await verifyVendor(browser, addressOf(servers[1], "wallet-vendor"));
    await verifyAdmin(browser, addressOf(servers[2], "wallet-admin"));
  } finally {
    await browser.close();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
  console.log(JSON.stringify({ status: "KYC browser verification passed", coverage: ["customer resubmission", "customer Tier 1", "vendor fail-closed", "vendor Tier 2", "identity types", "admin evidence guard", "admin approval"] }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
