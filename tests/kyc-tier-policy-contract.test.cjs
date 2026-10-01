const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const migration = read('supabase/migrations/20260929100000_configurable_kyc_tier_policy.sql');
const hardeningMigration = read('supabase/migrations/20260930120000_harden_tier2_kyc_evidence.sql');
const policy = read('backend/wallet/src/services/kyc-tier-policy.ts');
const wallets = read('backend/wallet/src/services/wallets.ts');
const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const customerRoutes = read('backend/wallet/src/routes/customer.ts');
const customerKyc = read('apps/customer/src/views/Kyc.vue');
const vendorKyc = read('apps/vendor/src/views/Kyc.vue');
const settings = read('apps/admin/src/views/KycSettings.vue');
const rbac = read('backend/wallet/src/services/rbac.ts');
const ledger = read('backend/wallet/src/services/ledger.ts');

assert.match(migration, /create table if not exists public\.kyc_tier_settings/);
assert.match(migration, /values \(true, 20000000, 70000000, null\)/);
assert.match(migration, /trg_reconcile_kyc_policy_wallets/);
assert.match(migration, /trg_record_kyc_tier_policy_history/);
assert.match(migration, /change_reason text not null/);
assert.match(migration, /fn_apply_kyc_wallet_policy/);
assert.match(migration, /kyc_policy_managed boolean not null default false/);
assert.match(migration, /alter column daily_limit_minor drop not null/);
assert.match(hardeningMigration, /create or replace function public\.submit_kyc_evidence_review/);
assert.match(hardeningMigration, /v_address_count integer := 0/);
assert.match(hardeningMigration, /p_requested_tier = 2 and v_address_count < 1/);
assert.match(hardeningMigration, /create or replace function public\.fn_create_hold/);
assert.match(hardeningMigration, /create or replace function public\.fn_post_ledger_entry/);
assert.match(hardeningMigration, /v_daily_debits \+ v_holds \+ p_amount_minor > v_wallet\.daily_debit_cap_minor/);
assert.match(hardeningMigration, /v_monthly_debits \+ v_holds \+ p_amount_minor > v_wallet\.monthly_debit_cap_minor/);
assert.match(ledger, /daily_debit_cap_exceeded/);
assert.match(ledger, /monthly_debit_cap_exceeded/);
assert.equal((ledger.match(/daily_debit_cap_exceeded/g) || []).length, 2, 'hold and direct debit paths must map daily cap errors');

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

const customerStyles = read('apps/customer/src/styles/app.css');
const onboardingChecklist = read('apps/customer/src/components/OnboardingChecklist.vue');
assert.match(customerStyles, /prefers-reduced-motion: reduce[\s\S]*\.bw-token-shimmer[\s\S]*animation: none/);
assert.match(onboardingChecklist, /prefers-reduced-motion: reduce[\s\S]*transition: none/);

console.log('KYC tier policy contract passed.');
