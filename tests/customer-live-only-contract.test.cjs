const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = fs.readFileSync(path.join(root, 'api/reference.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(reference, /function requiresLiveRead\(pathname\) \{/);
assert.match(reference, /\/\\\/api\\\/customer\\\/read\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /\/\\\/api\\\/account\\\/read\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /\/\\\/api\\\/RemoteMeterTask\\\/Get\(\?:Reading\|Control\|Token\)Task\$\/i\.test\(normalizedPath\)/);
assert.match(reference, /function canUseSampleFallback\(_pathname\) \{\s*return false;\s*\}/s);
assert.match(reference, /function sampleReadResponse\(pathname, requestData\) \{\s*if \(requiresLiveRead\(pathname\)\) return null;/s);
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
