const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const customerApi = read('apps/customer/src/lib/api.ts');
const customerFlow = read('apps/customer/src/lib/auth-flow.ts');
const customerStore = read('apps/customer/src/stores/auth.ts');
const customerLogin = read('apps/customer/src/views/Login.vue');
const customerAuthService = read('backend/wallet/src/services/customer-auth.ts');
const vendorApi = read('apps/vendor/src/lib/api.ts');
const vendorStore = read('apps/vendor/src/stores/auth.ts');
const vendorLogin = read('apps/vendor/src/views/Login.vue');
const pkg = JSON.parse(read('package.json'));

assert.match(customerFlow, /CUSTOMER_REFRESH_TOKEN_KEY/);
assert.match(customerFlow, /CUSTOMER_TOKEN_EXPIRES_AT_KEY/);
assert.match(customerFlow, /readCustomerRefreshToken/);
assert.match(customerFlow, /readCustomerTokenExpiresAt/);
assert.match(customerFlow, /storeCustomerToken\(token: string, remember = true, options: CustomerTokenOptions = \{\}\)/);
assert.match(customerAuthService, /refresh_token: session\.refreshToken/);
assert.match(customerAuthService, /expires_at: session\.expiresAt/);
assert.match(customerLogin, /refreshToken: r\.refresh_token/);
assert.match(customerStore, /setSession\(token: string, customer: CustomerProfile, remember = true, tokenOptions: CustomerTokenOptions = \{\}\)/);
assert.match(customerApi, /readCustomerToken/);
assert.match(customerApi, /grant_type=refresh_token/);
assert.match(customerApi, /function shouldRedirectUnauthorized\(path: string\): boolean/);
assert.match(customerApi, /path !== '\/api\/v1\/customer\/me'/);
assert.match(customerApi, /!path\.startsWith\('\/api\/v1\/customer\/auth\/'\)/);
assert.match(customerApi, /if \(res\.status === 401 && shouldRedirectUnauthorized\(path\)\)/);

assert.match(vendorStore, /REFRESH_TOKEN_KEY/);
assert.match(vendorStore, /TOKEN_EXPIRES_AT_KEY/);
assert.match(vendorStore, /setSession\(token: string, user: VendorUserProfile, remember = true, tokenOptions: VendorTokenOptions = \{\}\)/);
assert.match(vendorLogin, /refreshToken: typeof tokData\.refresh_token === 'string'/);
assert.match(vendorApi, /grant_type=refresh_token/);
assert.match(vendorApi, /function shouldRedirectUnauthorized\(path: string\): boolean/);
assert.match(vendorApi, /path !== '\/api\/v1\/vendor\/me'/);
assert.match(vendorApi, /if \(res\.status === 401 && shouldRedirectUnauthorized\(path\)\)/);

assert.match(pkg.scripts['test:auth'], /tests\/customer-vendor-session-refresh-contract\.test\.cjs/);

console.log('customer/vendor session refresh contract passed');
