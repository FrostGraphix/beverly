const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = fs.readFileSync(path.join(root, 'api/reference.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(reference, /function requiresLiveRead\(pathname\) \{/);
assert.match(reference, /\/\\\/api\\\/customer\\\/read\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /\/\\\/api\\\/account\\\/read\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /\/\\\/api\\\/RemoteMeterTask\\\/Get\(\?:Reading\|Control\)Task\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /\/\\\/api\\\/dashboard\\\/read\(\?:PanelGroup\|LineChart\)\$\/i\.test\(normalizedPath\)/);
// station/read is intentionally EXCLUDED from the sample-fallback whitelist:
// it is a mutable admin CRUD table, and silently serving a frozen fixture on
// a live failure would hide real edits from the admin. See
// tests/station-live-fallback-contract.test.cjs for the full fix contract.
assert.doesNotMatch(reference, /\/\\\/api\\\/station\\\/read\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /function sampleReadResponse\(pathname, requestData\) \{\s*if \(requiresLiveRead\(pathname\) && !canUseSampleFallback\(pathname\)\) return null;/s);
assert.doesNotMatch(reference, /lowerPath === "\/api\/customer\/read"/);
assert.doesNotMatch(reference, /lowerPath === "\/api\/account\/read"/);
assert.doesNotMatch(reference, /clone\.customerName = rowIndex < 20/);
assert.doesNotMatch(reference, /clone\.meterId = syntheticRowValue/);

assert.match(
  pkg.scripts.test,
  /tests\/customer-live-only-contract\.test\.cjs/,
  'npm test must include the customer live-only contract',
);
assert.match(
  pkg.scripts['test:contracts'],
  /tests\/customer-live-only-contract\.test\.cjs/,
  'test:contracts must include the customer live-only contract',
);

console.log('live-only table source contract passed');
