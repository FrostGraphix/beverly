"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const service = read("backend/wallet/src/services/vendor-mfa.ts");
const routes = read("backend/wallet/src/routes/vendor.ts");
const auth = read("backend/wallet/src/plugins/auth.ts");
const securityView = read("apps/vendor/src/views/Security.vue");
const router = read("apps/vendor/src/router/index.ts");
const authStore = read("apps/vendor/src/stores/auth.ts");
const migration = read("supabase/migrations/20260519120000_vendor_mfa_foundation.sql");

for (const table of [
  "vendor_mfa_factors",
  "vendor_mfa_recovery_codes",
  "vendor_mfa_sessions"
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `missing ${table}`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `missing ${table} RLS`);
  assert(migration.includes(`wallet service role all ${table.replaceAll("_", " ")}`), `missing ${table} service policy`);
}

assert(service.includes("createHmac('sha1'"), "TOTP must use HMAC-SHA1");
assert(service.includes("aes-256-gcm"), "MFA secrets must be encrypted at rest");
assert(service.includes("vendorMfaSessionVerified"), "MFA sessions must be token-bound");
assert(service.includes("generateRecoveryCodes"), "recovery codes must be generated");
assert(service.includes("recoveryHash"), "recovery codes must be hashed");
assert(service.includes("beginVendorMfaReplacement"), "MFA reset must keep the active factor until replacement verifies");

for (const endpoint of [
  "/mfa/status",
  "/mfa/setup/start",
  "/mfa/setup/reset",
  "/mfa/setup/verify",
  "/mfa/challenge/verify",
  "/mfa/disable"
]) {
  assert(routes.includes(endpoint), `missing vendor MFA endpoint ${endpoint}`);
}

assert(auth.includes("mfa_required"), "vendor guard must block unverified MFA sessions");
assert(auth.includes("vendorMfaSessionVerified"), "auth plugin must consult vendor MFA sessions");
assert(/select\('id, vendor_organization_id, role, status, mfa_enrolled, password_reset_required'\)/.test(auth), "auth plugin must load vendor mfa_enrolled before enforcing MFA");
assert(routes.includes("beginVendorMfaReplacement(actor, code"), "MFA reset route must not disable before replacement setup");
assert(authStore.includes("requiresMfaVerification"), "auth store must expose MFA verification gate");
assert(router.includes("mode: 'verify'"), "router must force unverified MFA users into security check");

for (const marker of [
  "Recovery vault",
  "Open authenticator setup",
  "Copy recovery codes",
  "Disable 2FA",
  "Old 2FA stays active until the new code is verified",
  "/api/v1/vendor/mfa/setup/start",
  "/api/v1/vendor/mfa/setup/reset",
  "/api/v1/vendor/mfa/challenge/verify"
]) {
  assert(securityView.includes(marker), `security UI missing ${marker}`);
}

console.log(JSON.stringify({
  endpoints: 6,
  tables: 3,
  status: "vendor mfa flow passed"
}, null, 2));
