const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const views = [
  'apps/admin/src/views',
  'apps/vendor/src/views',
  'apps/customer/src/views',
];
const gridNames = [
  'announcements-kpis', 'dispute-stat-grid', 'fh-kpi-row', 'kpi-grid',
  'kpi-row', 'kpis', 'mo-kpi-row', 'refund-kpis', 'rp-kpis',
  'sandbox-kpis', 'statement-stat-grid', 'stat-grid', 'va-kpi-grid',
  'vendor-kpi-grid', 'vendor-kpis', 'wallet-stat-grid',
];

for (const directory of views) {
  for (const file of fs.readdirSync(path.join(root, directory))) {
    if (!file.endsWith('.vue')) continue;
    const source = fs.readFileSync(path.join(root, directory, file), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (!line.includes('class="')) continue;
      if (!gridNames.some((name) => line.includes(name))) continue;
      if (line.includes('bw-kpi-row')) continue;
      assert.ok(
        line.includes('bw-mobile-kpi-grid'),
        `${directory}/${file} has an unregistered mobile KPI grid: ${line.trim()}`,
      );
    }
  }
}

const tokens = fs.readFileSync(path.join(root, 'packages/tokens/wallet.css'), 'utf8');
assert.match(tokens, /\.bw-mobile-kpi-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\) !important;/);
assert.match(tokens, /\.bw-mobile-kpi-grid > :last-child:nth-child\(odd\)/);
assert.match(tokens, /@keyframes bw-kpi-enter/);
assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(tokens, /font-size: 12px !important;/);
assert.match(tokens, /\.bw-mobile-kpi-grid \.bw-kpi-icon/);
assert.match(tokens, /\.bw-mobile-kpi-grid :is\([\s\S]*?\[class\$="-kpi-label"\][\s\S]*?\)\s*\{[\s\S]*?font-size: 6px !important;/);
assert.match(tokens, /\.bw-mobile-kpi-grid \.bw-kpi-row \.bw-kpi-label[\s\S]*?grid-row: 1;/);

console.log('mobile KPI grid contract passed');
