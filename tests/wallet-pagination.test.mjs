import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_PAGE_SIZE,
    clampPage,
    pageCount,
    pageRange,
    paginate,
} from '../packages/tokens/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── The contract the user asked for: 10 rows a page, next control, page count ─
assert.equal(DEFAULT_PAGE_SIZE, 10, 'tables paginate at 10 rows per page');

// ── pageCount ────────────────────────────────────────────────────────────────
assert.equal(pageCount(0), 1, 'an empty table still reads "Page 1 of 1"');
assert.equal(pageCount(1), 1);
assert.equal(pageCount(10), 1, 'exactly one full page is one page, not two');
assert.equal(pageCount(11), 2);
assert.equal(pageCount(317), 32, 'MUSHA: 317 meters');
assert.equal(pageCount(726), 73, 'UMAISHA: 726 meters');
assert.equal(pageCount(13), 2, '13 months of history');

// ── clampPage — the "filter shrank the list" guard ───────────────────────────
assert.equal(clampPage(1, 0), 1);
assert.equal(clampPage(0, 100), 1, 'page 0 clamps up to the first page');
assert.equal(clampPage(-5, 100), 1);
assert.equal(clampPage(99, 25), 3, 'a page past the end clamps to the last page');
assert.equal(clampPage(2, 25), 2);
assert.equal(clampPage(NaN, 25), 1, 'a non-numeric page must not produce NaN slicing');

// ── paginate ─────────────────────────────────────────────────────────────────
const rows = Array.from({ length: 25 }, (_, i) => i + 1);
assert.deepEqual(paginate(rows, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(paginate(rows, 3), [21, 22, 23, 24, 25], 'last page is partial');
assert.deepEqual(
    paginate(rows, 9), [21, 22, 23, 24, 25],
    'an out-of-range page shows the last page, never an empty table'
);
assert.deepEqual(paginate([], 1), []);
assert.deepEqual(paginate(null, 1), [], 'a missing list must not throw');

// Every row appears exactly once across all pages — no gaps, no duplicates.
const seen = [];
for (let p = 1; p <= pageCount(rows.length); p += 1) seen.push(...paginate(rows, p));
assert.deepEqual(seen, rows, 'paging must cover the list exactly once');

// ── pageRange — the "Showing 11–20 of 317" line ──────────────────────────────
assert.deepEqual(pageRange(1, 0), { first: 0, last: 0 }, 'empty reads 0–0');
assert.deepEqual(pageRange(1, 317), { first: 1, last: 10 });
assert.deepEqual(pageRange(2, 317), { first: 11, last: 20 });
assert.deepEqual(pageRange(32, 317), { first: 311, last: 317 }, 'last page stops at the total');
assert.deepEqual(pageRange(99, 317), { first: 311, last: 317 }, 'out-of-range clamps');

// A custom page size still lines up.
assert.equal(pageCount(25, 5), 5);
assert.deepEqual(paginate(rows, 2, 5), [6, 7, 8, 9, 10]);
assert.deepEqual(pageRange(2, 25, 5), { first: 6, last: 10 });

// ── One implementation, reused ───────────────────────────────────────────────
const component = read('packages/tokens/WalletPagination.vue');
assert.ok(
    component.includes("from './index.js'"),
    'the control must use the shared maths, not its own copy'
);
for (const control of ['Prev', 'Next', 'Page {{ current']) {
    assert.ok(component.includes(control), `pagination must expose ${control}`);
}
assert.ok(component.includes('aria-live="polite"'), 'the row summary must be announced');
assert.ok(component.includes(':disabled="current <= 1"'), 'Prev must disable on the first page');
assert.ok(component.includes(':disabled="current >= pageCount"'), 'Next must disable on the last page');

// Theme-aware: the shared control must not bake in a palette.
const hardCoded = component.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
assert.deepEqual(hardCoded, [], `pagination must use theme tokens only, found: ${hardCoded.join(', ')}`);

// ── Wired into every consumption table ───────────────────────────────────────
for (const [view, label] of [
    ['apps/admin/src/views/Consumption.vue', 'admin'],
    ['apps/vendor/src/views/Consumption.vue', 'vendor'],
    ['apps/customer/src/views/Consumption.vue', 'customer'],
]) {
    const source = read(view);
    assert.ok(
        source.includes("import WalletPagination from '@beverly/tokens/WalletPagination.vue'"),
        `${label} must use the shared pagination control`
    );
    assert.ok(
        source.includes('paginate(') && source.includes('DEFAULT_PAGE_SIZE'),
        `${label} must slice rows with the shared helper at the shared page size`
    );
    assert.ok(
        source.includes('<WalletPagination'),
        `${label} must render the pagination control`
    );
    // Rendering the unpaginated array would defeat the whole thing.
    assert.ok(
        !/v-for="\(row, index\) in rows"/.test(source),
        `${label} must render the paged slice, not the full row list`
    );
}

// The admin page has four tables; the three long ones each need their own page
// state, or paging the meter list would also jump the period tables.
const admin = read('apps/admin/src/views/Consumption.vue');
for (const state of ['cumulPage', 'stationPage', 'meterPage']) {
    assert.ok(admin.includes(state), `admin needs independent page state: ${state}`);
}
assert.ok(
    admin.includes('uniqueMetersPaged'),
    'the meter list is the longest table on the page and must paginate'
);

console.log(JSON.stringify({ status: 'wallet pagination contract passed', pageSize: DEFAULT_PAGE_SIZE }, null, 2));
