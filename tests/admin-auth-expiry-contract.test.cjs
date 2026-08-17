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
const referenceApi = read('api/reference.js');
const pkg = JSON.parse(read('package.json'));

assert.doesNotMatch(api, /res\.status === 401.*handleUnauthorized/);
assert.match(api, /Only the auth store may end a session/);
assert.match(api, /method !== 'GET' && method !== 'HEAD'.*mfa_required/);
assert.match(api, /transient deployment, route rollout, or backend/);
assert.match(api, /function parseJson\(text: string\): any/);

assert.match(authStore, /import \{ ApiError, api \} from '\.\.\/lib\/api'/);
assert.match(authStore, /function isSessionTerminalError\(error: unknown\): boolean/);
assert.match(authStore, /error instanceof ApiError && error\.status === 401/);
assert.match(authStore, /if \(!isSessionTerminalError\(error\)\) \{[\s\S]*?return;/);
assert.match(authStore, /async ensureFreshSession\(maxAgeMs = 60_000\)/);
assert.match(authStore, /if \(isSessionTerminalError\(error\)\) \{\s*this\.logout\(\);\s*throw error;\s*\}/s);
assert.match(login, /authReason\.value === 'session_timeout' \|\| authReason\.value === 'session_expired'/);
assert.match(login, /showSessionEnded/);
assert.match(login, /Session timed out after inactivity\. Sign in to continue\./);
assert.match(login, /Session ended\. Sign in to continue\./);
assert.match(login, /user\?\.user_metadata\?\.role_key/);
assert.match(login, /user\?\.user_metadata\?\.role/);
assert.match(walletAuthPlugin, /const staffRole = \(staffRow as \{ role_key\?: string \} \| null\)\?\.role_key/);
assert.doesNotMatch(walletAuthPlugin, /staffRole\s*=.*rawRole/);
assert.match(referenceApi, /pathname === "\/api\/v1\/admin\/me"/);
assert.match(referenceApi, /wallet\.dashboard\.view/);
assert.match(stationSelect, /onUnmounted/);
assert.match(stationSelect, /document\.removeEventListener\('click', onDocClick\)/);

assert.match(
    pkg.scripts['test:security'],
    /tests\/admin-auth-expiry-contract\.test\.cjs/,
    'test:security must include the admin auth expiry contract',
);

console.log('admin auth expiry contract passed');
