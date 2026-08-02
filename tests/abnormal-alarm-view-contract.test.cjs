const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'src/components/AbnormalAlarmPage.vue'), 'utf8');

assert.ok(page.includes('aria-label="List view"'), 'list view icon missing');
assert.ok(page.includes('aria-label="Table view"'), 'table view icon missing');
assert.ok(!page.includes("setViewMode('cards')"), 'cards view must not remain selectable');

console.log('abnormal-alarm-view-contract ok');
