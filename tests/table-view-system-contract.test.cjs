const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const packageJson = JSON.parse(read('packages/tokens/package.json'));
const switchComponent = read('packages/tokens/WalletDataViewSwitch.vue');
const switchTypes = read('packages/tokens/WalletDataViewSwitch.vue.d.ts');
const walletCss = read('packages/tokens/wallet.css');

assert(packageJson.exports['./WalletDataViewSwitch.vue'], 'shared view switch must be exported');
assert(switchComponent.includes("type DataView = 'grid' | 'list' | 'table'"), 'view switch must support grid, list, and table layouts');
assert(switchComponent.includes("grid:"), 'view switch must expose grid mode');
assert(switchTypes.includes("'grid'"), 'view switch types must expose grid mode');
assert(switchComponent.includes('role="group"'), 'view switch must expose an accessible group');
assert(switchComponent.includes(':aria-label="`${mode} view`"'), 'view icons must retain accessible labels');
assert(switchComponent.includes('class="bw-data-view-icon"'), 'view switch must render icons');
assert(!switchComponent.includes('>{{ mode }}</button>'), 'view switch must not render visible text labels');
assert(walletCss.includes('.bw-data-region[data-view="table"]'), 'table layout must remain available');
assert(walletCss.includes('[data-view="grid"]'), 'grid layout must remain available');
assert(walletCss.includes('.bw-table-head-bar'), 'table controls must share responsive grid styling');

for (const file of [
  'apps/admin/src/views/Vendors.vue',
  'apps/admin/src/views/Customers.vue',
  'apps/admin/src/views/Wallets.vue',
  'apps/admin/src/views/Purchases.vue',
  'apps/admin/src/views/Vending.vue',
  'apps/vendor/src/views/Transactions.vue',
  'apps/vendor/src/views/Wallet.vue',
  'apps/vendor/src/views/MeterOrders.vue',
  'apps/customer/src/views/Transactions.vue',
  'apps/customer/src/views/Wallet.vue',
]) {
  const page = read(file);
  assert(page.includes('WalletDataViewSwitch'), `${file} must use the shared view switch`);
  assert(page.includes('bw-data-region'), `${file} must declare its data region`);
  assert(!page.includes("? 'grid' : 'table'"), `${file} must not default to grid view`);
}

const dashboard = read('apps/admin/src/views/Dashboard.vue');
assert(dashboard.includes(":modes=\"['grid', 'table']\""), 'dashboard must offer grid and table views');

const vendors = read('apps/admin/src/views/Vendors.vue');
const actionMenu = read('apps/admin/src/components/MobileActionMenu.vue');
assert(vendors.includes('<MobileActionMenu label="Vendor actions" @click.stop>'), 'vendor cards must use dots actions');
assert(actionMenu.includes('display: flex'), 'dots actions must work across breakpoints');

console.log('table-view-system-contract ok');
