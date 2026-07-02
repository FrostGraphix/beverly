"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const provenance = read("docs/recovery/JUNE24_PROVENANCE.md");
for (let phase = 1; phase <= 7; phase += 1) {
  assert.match(
    provenance,
    new RegExp(`### Phase ${phase}:`),
    `June 24 provenance must document security phase ${phase}`
  );
}

const referenceApi = read("api/reference.js");
assert.match(referenceApi, /isCanonicalFinancialMutation/);
assert.match(referenceApi, /const deployed = Boolean\(process\.env\.VERCEL_ENV\)/);
assert.match(referenceApi, /if \(!secret\) return !deployed/);

const atomicHolds = read("supabase/migrations/20260622140000_wallet_atomic_holds.sql");
assert.match(atomicHolds, /function public\.fn_create_hold/);
assert.match(atomicHolds, /function public\.fn_capture_hold/);
assert.match(atomicHolds, /function public\.fn_claim_wallet_idempotency/);
assert.match(atomicHolds, /function public\.fn_complete_wallet_idempotency/);

const fulfillment = read("supabase/migrations/20260622150000_payment_fulfillment_leases.sql");
assert.match(fulfillment, /payment_webhooks_gateway_event_uidx/);
assert.match(fulfillment, /function public\.fn_claim_payment_fulfillment/);
assert.match(fulfillment, /function public\.fn_release_payment_fulfillment/);

const otp = read("backend/wallet/src/services/customer-auth.ts");
assert.match(otp, /OTP_MEMORY_FALLBACK_ENABLED = env\.NODE_ENV === 'test'/);
assert.match(otp, /&& !OTP_MEMORY_FALLBACK_ENABLED/);
assert.match(otp, /throw otpChallengeCreateError/);

const server = read("backend/wallet/src/server.ts");
assert.match(server, /CORS_ORIGINS is required in production/);
assert.match(server, /route_policy_missing/);
assert.match(server, /env\.NODE_ENV === 'production' \|\| !env\.DEV_CONSOLE_ENABLED/);

const profile = read("backend/wallet/src/services/profile-picture.ts");
assert.match(profile, /PROFILE_PICTURE_MAX_BYTES/);
assert.match(profile, /assertProfilePictureSop/);
assert.match(profile, /activateProfilePicture/);

const announcementRls = read("supabase/migrations/20260622160000_announcement_rls.sql");
assert.match(announcementRls, /force row level security/i);
assert.match(announcementRls, /recipient_type = 'customer'/);
assert.match(announcementRls, /recipient_type = 'vendor'/);

const worker = read("backend/wallet/src/worker.ts");
assert.match(worker, /repeat: \{ pattern: schedule\.pattern \}/);
assert.match(worker, /backoff: \{ type: 'exponential'/);

const health = read("backend/wallet/src/routes/health.ts");
assert.doesNotMatch(health, /node: process\.version/);
assert.doesNotMatch(health, /env: process\.env\.NODE_ENV/);

const routePolicy = read("backend/wallet/src/contracts/route-policy.ts");
assert.match(routePolicy, /developerOnly/);
assert.match(routePolicy, /money/);

const governance = read("supabase/migrations/20260624100000_phase7_data_governance.sql");
assert.match(governance, /purge_expired_payment_webhooks/);
assert.match(governance, /create table if not exists public\.vat_policies/);
assert.match(governance, /rate_basis_points integer not null check/);
assert.match(governance, /select 'NG', 'Nigeria VAT 7\.5%', 750/);

console.log("june24-security-provenance ok");
