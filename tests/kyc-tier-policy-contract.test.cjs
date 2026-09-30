const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const migration = read('supabase/migrations/20260929100000_configurable_kyc_tier_policy.sql');
const policy = read('backend/wallet/src/services/kyc-tier-policy.ts');
const wallets = read('backend/wallet/src/services/wallets.ts');
const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const customerRoutes = read('backend/wallet/src/routes/customer.ts');
const customerKyc = read('apps/customer/src/views/Kyc.vue');
const vendorKyc = read('apps/vendor/src/views/Kyc.vue');
const settings = read('apps/admin/src/views/KycSettings.vue');
const rbac = read('backend/wallet/src/services/rbac.ts');

assert.match(migration, /create table if not exists public\.kyc_tier_settings/);
assert.match(migration, /values \(true, 20000000, 70000000, null\)/);
assert.match(migration, /trg_reconcile_kyc_policy_wallets/);
assert.match(migration, /trg_record_kyc_tier_policy_history/);
assert.match(migration, /change_reason text not null/);
assert.match(migration, /fn_apply_kyc_wallet_policy/);
assert.match(migration, /kyc_policy_managed boolean not null default false/);
assert.match(migration, /alter column daily_limit_minor drop not null/);

assert.match(policy, /tier1 <= tier0/);
assert.match(policy, /tier2 !== null && tier2 <= tier1/);
assert.match(policy, /eq\('version', input\.expectedVersion\)/);
assert.match(wallets, /getOrCreateOwnerKycWallet/);

assert.match(adminRoutes, /'PUT \/kyc\/settings': 'wallet\.kyc\.settings\.manage'/);
assert.match(adminRoutes, /action: 'kyc\.policy\.updated'/);
assert.match(adminRoutes, /from\('kyc_tier_policy_history'\)/);
assert.match(rbac, /wallet\.kyc\.settings\.manage/);
assert.match(settings, /expectedVersion: policy\.value\.version/);
assert.match(settings, /No daily cap/);
assert.match(settings, /reason\.value\.trim\(\)\.length >= 4/);

for (const route of ['/meters', '/wallet/fund', '/purchase/preview', '/purchase', '/purchase/step-up-verify']) {
  assert.match(customerRoutes, new RegExp(`'${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'.*requireKycTier\\(0\\)`));
}

assert.match(customerKyc, /tierLimitLabel/);
assert.match(vendorKyc, /requestedTier/);
assert.match(vendorKyc, /needsAddress/);
assert.doesNotMatch(customerKyc, /₦50,000|₦200,000/);
assert.doesNotMatch(vendorKyc, /₦50,000|₦200,000/);

console.log('KYC tier policy contract passed.');
