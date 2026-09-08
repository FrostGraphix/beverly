const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const customerRoutes = read('backend/wallet/src/routes/customer.ts');
const fundingService = read('backend/wallet/src/services/funding.ts');
const fundWallet = read('apps/customer/src/views/FundWallet.vue');
const fundingHistory = read('apps/customer/src/views/FundingHistory.vue');
const staffScope = read('backend/wallet/src/services/staff-station-scope.ts');
const staffMigration = read('supabase/migrations/20260905110000_staff_all_stations_scope.sql');
const fundingMigration = read('supabase/migrations/20260905112000_customer_bank_funding_requests.sql');
const permissionMigration = read('supabase/migrations/20260905111000_wallet_permission_catalog_alignment.sql');
const rbac = read('backend/wallet/src/services/rbac.ts');
const roles = read('apps/admin/src/views/RolesPermissions.vue');
const emailValidation = read('backend/wallet/src/services/email-validation.ts');
const notifications = read('backend/wallet/src/services/admin-notifications.ts');

assert.match(customerRoutes, /post\('\/funding\/bank-transfer'/);
assert.match(customerRoutes, /ownerType: 'customer'/);
assert.match(customerRoutes, /removeBankFundingProof/);
assert.match(customerRoutes, /listCustomerFunding\([^\n]+cursor\)/);
assert.match(fundingService, /customer_id: input\.ownerType === 'customer'/);
assert.match(fundingService, /getOrCreateWallet\(ownerType, ownerId\)/);
assert.match(fundingService, /idempotencyKey: `funding\.\$\{funding\.id\}\.credit`/);
assert.match(fundingMigration, /funding_requests_exactly_one_owner_check/);
assert.match(fundingMigration, /funding_requests_customer_proof_hash_idx/);
assert.match(fundWallet, /4011606766/);
assert.match(fundWallet, /ACOB LIGHTING TECHNOLOGY LTD/);
assert.match(fundWallet, /proofBase64/);
assert.match(fundingHistory, /approved/);
assert.match(fundingHistory, /fundingReference/);

assert.match(staffScope, /ALL_STATIONS_SCOPE = '\*'/);
assert.match(staffMigration, /current_staff_has_all_stations/);
assert.match(staffMigration, /or public\.current_staff_has_all_stations\(\)/);
assert.match(roles, /allStations/);
assert.match(roles, /future stations/);

assert.match(emailValidation, /domain === 'acoblighting\.com'/);
assert.match(notifications, /staffEmailVerificationEmail/);
assert.match(notifications, /staff-welcome/);
assert.match(permissionMigration, /wallet\.reports\.view/);
assert.match(rbac, /wallet\.announcements\.manage/);
assert.match(rbac, /wallet\.vendor_transfers\.manage/);

for (const portal of ['customer', 'vendor']) {
  const viewDir = path.join(root, 'apps', portal, 'src', 'views');
  for (const file of fs.readdirSync(viewDir).filter((name) => name.endsWith('.vue'))) {
    const source = fs.readFileSync(path.join(viewDir, file), 'utf8');
    if (/WalletExport(?:Menu|Wizard)/.test(source)) {
      assert.match(source, /:formats="\['pdf'\]"/, `${portal}/${file} must be PDF-only.`);
    }
  }
}

console.log('customer bank funding, staff scope, and portal export contracts passed');
