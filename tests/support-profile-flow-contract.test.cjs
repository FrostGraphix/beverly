"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function assertIncludes(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${file} missing ${marker}`);
  }
}

function main() {
  assertIncludes("src/components/ProfilePage.vue", [
    "grid-template-columns: 64px minmax(0, 1fr)",
    ".wallet-profile-meta strong",
    "text-align: right",
  ]);

  assertIncludes("apps/admin/src/views/Support.vue", [
    "/api/v1/admin/support/tickets",
    "/api/v1/admin/support/tickets/stats",
    "/api/v1/admin/support/chat/sessions",
    "/api/v1/admin/support/faq-categories",
    "/api/v1/admin/support/faqs",
    "internalNote",
    "MobileActionMenu",
  ]);

  assertIncludes("apps/vendor/src/views/Help.vue", [
    "/api/v1/public/faqs/categories?audience=vendor",
    "/api/v1/public/faqs?audience=vendor",
    "/api/v1/vendor/support/tickets",
    "selected.value = {",
    "ticket_closed",
  ]);

  assertIncludes("apps/vendor/src/views/Profile.vue", [
    "/api/v1/vendor/me",
    "/api/v1/vendor/profile-picture/scan",
    "/api/v1/vendor/profile-picture/upload-url",
    "/api/v1/vendor/profile-picture",
    "if (!uploadResponse.ok) throw new Error('profile_picture_upload_failed')",
    "profile_picture_upload_unavailable",
    "Picture upload failed.",
    "Account Information",
    "KYC Status",
  ]);

  assertIncludes("apps/admin/src/views/Profile.vue", [
    "/api/v1/admin/me",
    "/api/v1/admin/profile-picture/scan",
    "/api/v1/admin/profile-picture/upload-url",
    "/api/v1/admin/profile-picture",
    "if (!uploadResponse.ok) throw new Error('profile_picture_upload_failed')",
    "profile_picture_upload_unavailable",
    "Picture upload failed.",
    "Staff Identity",
    "aria-label=\"Edit profile picture\"",
    "aria-label=\"Edit full name\"",
    "Remove profile picture?",
    "Name updated.",
  ]);

  assertIncludes("apps/customer/src/views/Profile.vue", [
    "/api/v1/customer/profile-picture/scan",
    "/api/v1/customer/profile-picture/upload-url",
    "if (!uploadResponse.ok) throw new Error('profile_picture_upload_failed')",
    "profile_picture_upload_unavailable",
    "await auth.refreshProfile();",
  ]);

  assertIncludes("backend/wallet/src/routes/customer.ts", [
    "fastify.post('/support/tickets'",
    "fastify.get('/support/tickets'",
    "fastify.get('/support/tickets/:id'",
    "fastify.post('/support/tickets/:id/messages'",
    "ticket_closed",
    "filter((m: any) => !m.is_internal)",
  ]);

  assertIncludes("backend/wallet/src/services/data-privacy.ts", [
    "wallet_ledger_entries",
    ".in('wallet_id', walletIds)",
    "entry_type",
  ]);

  assertIncludes("backend/wallet/src/routes/admin.ts", [
    "customer_risk_baselines",
    "customer_known_ips",
    "customer_known_devices",
    "account_deletion_requests",
    "data_export_requests",
    "support_chat_sessions",
  ]);

  const adminRoutes = read("backend/wallet/src/routes/admin.ts");
  assert.ok(!adminRoutes.includes("customer_risk_profiles"), "admin customer deletion must use customer_risk_baselines");
  assert.ok(!adminRoutes.includes("fraud_signal_events"), "fraud_signals cascade from fraud_assessments");
  assert.ok(!adminRoutes.includes("privacy_deletion_requests"), "admin customer deletion must use account_deletion_requests");
  assert.ok(!adminRoutes.includes("support_chats"), "admin customer deletion must use support_chat_sessions");

  const privacyService = read("backend/wallet/src/services/data-privacy.ts");
  assert.ok(!privacyService.includes("wallet_transactions"), "data export must use wallet_ledger_entries");

  assertIncludes("backend/wallet/src/routes/customer.ts", [
    "email_change_forbidden",
    "Registration email cannot be changed.",
  ]);
  assertIncludes("apps/customer/src/views/Profile.vue", [
    "Registration email cannot be changed.",
    "aria-describedby=\"email-lock-note\"",
    "bw-input bw-file-input",
  ]);
  assertIncludes("apps/vendor/src/views/Profile.vue", ["bw-input bw-file-input"]);
  assertIncludes("apps/admin/src/views/Profile.vue", ["bw-input bw-file-input"]);
  assertIncludes("packages/tokens/wallet.css", [
    ".bw-file-input",
    ".bw-file-input::file-selector-button",
  ]);

  assertIncludes("backend/wallet/src/routes/vendor.ts", [
    "fastify.patch('/me'",
    "fastify.post('/profile-picture/upload-url'",
    "fastify.post('/support/tickets'",
    "fastify.get('/support/tickets'",
    "fastify.get('/support/tickets/:id'",
    "fastify.post('/support/tickets/:id/messages'",
    "vendorContext(req.actor!.actorId, req.actor!.vendorOrganizationId)",
    "vendor_organization_required",
    "ticket_closed",
    "filter((m: any) => !m.is_internal)",
  ]);

  assertIncludes("backend/wallet/src/routes/admin.ts", [
    "fastify.patch('/me'",
    "fastify.post('/profile-picture/upload-url'",
    "fastify.post('/profile-picture/scan'",
    "fastify.delete('/profile-picture'",
    "shapeStaffProfile",
    "profile_picture_url",
  ]);

  console.log(JSON.stringify({
    status: "support and profile flow contract passed",
    coverage: ["admin support console", "vendor support", "vendor profile", "customer ticket guard"],
  }, null, 2));
}

main();
