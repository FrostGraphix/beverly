const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const api = read('apps/admin/src/lib/api.ts');
const authStore = read('apps/admin/src/stores/auth.ts');
const login = read('apps/admin/src/views/Login.vue');
const stationSelect = read('apps/admin/src/components/StationMultiSelect.vue');
const walletAuthPlugin = read('backend/wallet/src/plugins/auth.ts');
const pkg = JSON.parse(read('package.json'));

assert.match(api, /const STAFF_ACCESS_TOKEN_KEY = 'beverly\.staff\.access_token'/);
assert.match(api, /const STAFF_USER_KEY = 'beverly\.staff\.user'/);
assert.match(api, /function clearStaffSession\(\): void/);
assert.match(api, /localStorage\.removeItem\(STAFF_ACCESS_TOKEN_KEY\)/);
assert.match(api, /localStorage\.removeItem\(STAFF_USER_KEY\)/);
assert.match(api, /function handleUnauthorized\(\): void/);
assert.match(api, /if \(res\.status === 401\) handleUnauthorized\(\)/);
assert.match(api, /loginUrl\.searchParams\.set\('reason', 'session_expired'\)/);
assert.match(api, /window\.location\.assign\(loginUrl\.toString\(\)\)/);
assert.match(api, /function parseJson\(text: string\): any/);

assert.match(authStore, /catch \{\s*this\.logout\(\);\s*\}/s);
assert.match(login, /reason === 'session_timeout' \|\| reason === 'session_expired'/);
assert.match(login, /Your session expired or is invalid\. Please sign in again\./);
assert.match(login, /user\?\.user_metadata\?\.role_key/);
assert.match(login, /user\?\.user_metadata\?\.role/);
assert.match(walletAuthPlugin, /user\.user_metadata\?\.\['role_key'\]/);
assert.match(walletAuthPlugin, /user\.user_metadata\?\.\['role'\]/);
assert.match(stationSelect, /onUnmounted/);
assert.match(stationSelect, /document\.removeEventListener\('click', onDocClick\)/);

assert.match(
    pkg.scripts['test:security'],
    /tests\/admin-auth-expiry-contract\.test\.cjs/,
    'test:security must include the admin auth expiry contract',
);

console.log('admin auth expiry contract passed');
