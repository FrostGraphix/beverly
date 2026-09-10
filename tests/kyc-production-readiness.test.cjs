const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const admin = read('apps/admin/src/views/KycReviews.vue');
const customer = read('apps/customer/src/views/Kyc.vue');
const vendor = read('apps/vendor/src/views/Kyc.vue');
const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const reviewMigration = read('supabase/migrations/20260909120000_kyc_tier_review_pipeline.sql');
const hardening = read('supabase/migrations/20260909133000_kyc_production_hardening.sql');

assert.match(admin, /hasRequiredEvidence\(row\)/, 'admin approvals must use evidence-type validation');
assert.match(admin, /:disabled="!hasRequiredEvidence\(row\)"/, 'admin approval must stay disabled until evidence is complete');

for (const source of [customer, vendor]) {
  assert.match(source, /v-model="identityDocumentType"/, 'identity evidence must expose its document type');
  for (const type of ['national_id', 'voters_card', 'passport', 'drivers_license']) {
    assert.match(source, new RegExp(`value="${type}"`), `identity selector must support ${type}`);
  }
  assert.match(source, /upload\w*\(identityFile\.value, identityDocumentType\.value/, 'uploads must preserve the selected identity type');
}

assert.match(vendor, /const stateLoaded = ref\(false\)/, 'vendor status must track successful loading');
assert.match(vendor, /v-else-if="!stateLoaded"/, 'vendor status failures must fail closed');
assert.doesNotMatch(vendor, /\?\? 1\)\)/, 'vendor tier must not default to Tier 1');
assert.doesNotMatch(vendor, /\?\? 'verified'/, 'vendor status must not default verified');

assert.doesNotMatch(customer, /crime under NDPR/i, 'unreviewed legal claims must be removed');
assert.match(customer, /account restrictions or regulatory review/i, 'submission consequences must remain clear');

assert.match(hardening, /drop function if exists public\.submit_kyc_tier_review/, 'deprecated KYC RPC must be removed');
assert.match(hardening, /revoke all on function public\.submit_kyc_evidence_review/, 'active RPC must remain service-only');
assert.match(hardening, /revoke all on function public\.review_kyc_tier_request\(uuid, uuid, text, text\)/, 'decision RPC must remain service-only');

assert.match(adminRoutes, /customerIds: \[\.\.\.owners\.customers\]/, 'review pagination must receive customer station scope');
assert.match(adminRoutes, /vendorIds: \[\.\.\.owners\.vendors\]/, 'review pagination must receive vendor station scope');
assert.match(adminRoutes, /enforceResourceStation\(req, reply\)/, 'individual review resources must enforce station scope');

assert.match(reviewMigration, /when 1 then 5000000 when 2 then 20000000/, 'daily wallet limits must follow approved tiers');
assert.match(reviewMigration, /when 1 then 100000000 when 2 then 400000000/, 'monthly wallet limits must follow approved tiers');
assert.match(reviewMigration, /where id = p_request_id for update/, 'review decisions must lock their request');
assert.match(reviewMigration, /kyc_review_already_decided/, 'review decisions must reject replay');

console.log('KYC production-readiness contract passed.');
