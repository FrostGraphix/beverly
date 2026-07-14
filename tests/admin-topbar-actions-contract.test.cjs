const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminViews = path.join(root, 'apps/admin/src/views');

const offenders = ['admin', 'vendor', 'customer'].flatMap((portal) => {
  const views = path.join(root, `apps/${portal}/src/views`);
  return fs.readdirSync(views)
    .filter((file) => file.endsWith('.vue'))
    .filter((file) => fs.readFileSync(path.join(views, file), 'utf8').includes('<template #topbar-end>'))
    .map((file) => `${portal}/${file}`);
});

assert.deepEqual(offenders, [], 'Portal page actions must render in page content, not the topbar.');

for (const file of [
  'DevApiKeys.vue',
  'DevWebhooks.vue',
  'FeatureFlags.vue',
  'DevApiLog.vue',
  'DevErrorExplorer.vue',
  'DevQueueMonitor.vue',
  'DevServiceHealth.vue',
  'Fraud.vue',
]) {
  const source = fs.readFileSync(path.join(adminViews, file), 'utf8');
  assert.match(source, /class="bw-page-actions"/, `${file} should place actions in the main page.`);
}

const walletCss = fs.readFileSync(path.join(root, 'packages/tokens/wallet.css'), 'utf8');
assert.match(walletCss, /\.bw-page-actions\s*\{/);

console.log('admin topbar actions contract ok');
