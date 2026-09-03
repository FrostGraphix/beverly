import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrintDocument, exportTimestamp, resolveWalletPrintBranding, rowsToCsv, sanitizeSpreadsheetValue } from '../packages/tokens/wallet-export.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(sanitizeSpreadsheetValue('=SUM(A1:A2)'), "'=SUM(A1:A2)");
assert.equal(sanitizeSpreadsheetValue('+441234'), "'+441234");
assert.equal(sanitizeSpreadsheetValue('normal'), 'normal');
assert.equal(exportTimestamp(new Date('2026-09-01T10:11:12.000Z')), '2026-09-01-10-11-12');

const columns = [
  { key: 'name', header: 'Name', value: (row) => row.name },
  { key: 'note', header: 'Note', value: (row) => row.note },
];
const csv = rowsToCsv([{ name: '=1+1', note: 'quoted, value' }], columns);
assert.equal(csv, `Name,Note\r\n'=1+1,"quoted, value"`);

const printDocument = buildPrintDocument({ title: '<Wallet Report>', rows: [{ name: 'Ada', note: '<script>alert(1)</script>' }], columns });
assert.match(printDocument, /&lt;Wallet Report&gt;/);
assert.doesNotMatch(printDocument, /<script>alert\(1\)<\/script>/);
assert.match(printDocument, /@page\{size:landscape/);

const darkPrintDocument = buildPrintDocument({ title: 'Dark report', rows: [{ name: 'Ada', note: 'Ready' }], columns, theme: 'dark', logoUrl: 'https://example.test/beverly-mark-light.png' });
assert.match(darkPrintDocument, /<html lang="en" data-theme="dark">/);
assert.match(darkPrintDocument, /beverly-mark-light\.png/);
assert.match(darkPrintDocument, /document\.images/);
assert.deepEqual(resolveWalletPrintBranding(null), { theme: 'dark', logoUrl: '/brand/beverly-mark-light.png' });
const lightBranding = resolveWalletPrintBranding({
  documentElement: { getAttribute: () => 'light' },
  defaultView: { getComputedStyle: () => ({ getPropertyValue: () => 'url("/brand/beverly-mark.png")' }) },
  baseURI: 'https://wallet.example.test/wallet-admin/',
});
assert.deepEqual(lightBranding, { theme: 'light', logoUrl: 'https://wallet.example.test/brand/beverly-mark.png' });
const darkBranding = resolveWalletPrintBranding({
  documentElement: { getAttribute: () => 'executive' },
  defaultView: { getComputedStyle: () => ({ getPropertyValue: () => 'url("/brand/beverly-mark-light.png")' }) },
  baseURI: 'https://wallet.example.test/wallet-admin/',
});
assert.deepEqual(darkBranding, { theme: 'dark', logoUrl: 'https://wallet.example.test/brand/beverly-mark-light.png' });

const requiredExportSurfaces = [
  'apps/admin/src/views/Applications.vue', 'apps/admin/src/views/Announcements.vue',
  'apps/admin/src/views/Consumption.vue', 'apps/admin/src/views/CustomerDetail.vue',
  'apps/admin/src/views/Dashboard.vue', 'apps/admin/src/views/Disputes.vue',
  'apps/admin/src/views/Fraud.vue', 'apps/admin/src/views/Funding.vue',
  'apps/admin/src/views/MeterApprovals.vue', 'apps/admin/src/views/Privacy.vue',
  'apps/admin/src/views/Support.vue', 'apps/admin/src/views/Vending.vue',
  'apps/admin/src/views/VendorAnalytics.vue', 'apps/admin/src/views/VendorDetail.vue',
  'apps/admin/src/views/VendorTransfers.vue', 'apps/admin/src/views/Vendors.vue',
  'apps/admin/src/views/Wallets.vue', 'apps/customer/src/views/Consumption.vue',
  'apps/customer/src/views/Disputes.vue', 'apps/customer/src/views/FundingHistory.vue',
  'apps/customer/src/views/Home.vue', 'apps/customer/src/views/MeterOrders.vue',
  'apps/customer/src/views/Meters.vue', 'apps/customer/src/views/Receipts.vue',
  'apps/customer/src/views/Transactions.vue', 'apps/customer/src/views/Wallet.vue',
  'apps/vendor/src/views/Consumption.vue', 'apps/vendor/src/views/Dashboard.vue',
  'apps/vendor/src/views/Disputes.vue', 'apps/vendor/src/views/FundingHistory.vue',
  'apps/vendor/src/views/MeterOrders.vue', 'apps/vendor/src/views/Receipts.vue',
  'apps/vendor/src/views/Statement.vue', 'apps/vendor/src/views/Transactions.vue',
  'apps/vendor/src/views/Wallet.vue',
];

for (const relativePath of requiredExportSurfaces) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.match(source, /WalletExportMenu|WalletExportWizard|exportCsv|downloadAuthedCsv|printPdf/, `${relativePath} must expose a working export path.`);
}

const menu = fs.readFileSync(path.join(root, 'packages/tokens/WalletExportMenu.vue'), 'utf8');
assert.match(menu, /:aria-haspopup="formats\.length > 1 \? 'menu' : undefined"/);
assert.match(menu, /aria-live="polite"/);
assert.match(menu, /@click="run\('csv'\)"/);
assert.match(menu, /@click="run\('pdf'\)"/);
assert.match(menu, /formats\.length === 1/);

const adminExport = fs.readFileSync(path.join(root, 'apps/admin/src/lib/export.ts'), 'utf8');
assert.match(adminExport, /resolveWalletPrintBranding\(\)/);
assert.match(adminExport, /<img src="\$\{escapeHtml\(logoUrl\)\}" alt="Beverly"/);
assert.doesNotMatch(adminExport, /<div class="mark">B<\/div>/);

const wizard = fs.readFileSync(path.join(root, 'packages/tokens/WalletExportWizard.vue'), 'utf8');
assert.match(wizard, /Choose record scope/);
assert.match(wizard, /Choose exported fields/);
assert.match(wizard, /Choose export format/);
assert.match(wizard, /resolveRows/);
assert.match(wizard, /All stations/);
assert.match(wizard, /All statuses/);

const purchases = fs.readFileSync(path.join(root, 'apps/admin/src/views/Purchases.vue'), 'utf8');
assert.match(purchases, /purchase-filter-button/);
assert.match(purchases, /aria-controls="purchase-filters"/);
assert.match(purchases, /WalletTablePagination/);
assert.doesNotMatch(purchases, /class="bw-card filter-card"/);

const walletCss = fs.readFileSync(path.join(root, 'packages/tokens/wallet.css'), 'utf8');
assert.match(walletCss, /max-height:calc\(100dvh - 16px\)/);
assert.match(walletCss, /grid-template-columns:repeat\(2, minmax\(0,1fr\)\)/);

console.log('wallet export experience passed');
