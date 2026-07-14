const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const adminLogin = read('apps/admin/src/views/Login.vue');
const adminVite = read('apps/admin/vite.config.ts');
const vendorLogin = read('apps/vendor/src/views/Login.vue');
const vendorVite = read('apps/vendor/vite.config.ts');
const vendorSecurity = read('apps/vendor/src/views/Security.vue');
const vendorVendAccess = read('apps/vendor/src/views/VendAccess.vue');
const vendorStore = read('apps/vendor/src/stores/auth.ts');
const vendorApi = read('apps/vendor/src/lib/api.ts');
const customerLogin = read('apps/customer/src/views/Login.vue');
const customerSignup = read('apps/customer/src/views/Signup.vue');
const customerVerify = read('apps/customer/src/views/Verify.vue');
const customerStore = read('apps/customer/src/stores/auth.ts');
const customerApi = read('apps/customer/src/lib/api.ts');
const customerFlow = read('apps/customer/src/lib/auth-flow.ts');

assert.match(adminLogin, /safeRedirectTarget/);
assert.match(adminLogin, /REMEMBERED_EMAIL_KEY/);
assert.match(adminLogin, /showPassword/);
assert.match(adminLogin, /Authentication is not configured/);
assert.doesNotMatch(adminLogin, /startsWith\('\/'\) \? r :/);
assert.match(adminVite, /loadEnv\(mode, resolve\(__dirname, '\.\.\/\.\.'\), ''\)/);
assert.match(adminVite, /env\.VITE_SUPABASE_URL \|\| env\.SUPABASE_URL/);
assert.match(adminVite, /env\.VITE_SUPABASE_ANON_KEY \|\| env\.SUPABASE_ANON_KEY/);

assert.match(vendorLogin, /safeRedirectTarget/);
assert.match(vendorLogin, /REMEMBERED_VENDOR_EMAIL_KEY/);
assert.match(vendorLogin, /showPassword/);
assert.match(vendorLogin, /Authentication is not configured/);
assert.match(vendorVite, /loadEnv\(mode, resolve\(__dirname, '\.\.\/\.\.'\), ''\)/);
assert.match(vendorVite, /env\.VITE_SUPABASE_URL \|\| env\.SUPABASE_URL/);
assert.match(vendorVite, /env\.VITE_SUPABASE_ANON_KEY \|\| env\.SUPABASE_ANON_KEY/);
assert.match(vendorLogin, /auth\.setSession\(accessToken, me, rememberEmail\.value, \{/);
assert.match(vendorLogin, /password-change', query: \{ redirect: redirectTarget\.value \}/);
assert.match(vendorStore, /storeToken\(token: string, remember = true, options: VendorTokenOptions = \{\}\)/);
assert.match(vendorStore, /sessionStorage\.getItem\(TOKEN_KEY\) \?\? localStorage\.getItem\(TOKEN_KEY\)/);
assert.match(vendorApi, /sessionStorage\.getItem\(TOKEN_KEY\)/);
assert.match(vendorSecurity, /safeRedirectTarget/);
assert.match(vendorVendAccess, /safeRedirectTarget/);
assert.doesNotMatch(vendorVendAccess, /router\.push\(String\(route\.query\.redirect/);

assert.match(customerFlow, /safeAuthRedirect/);
assert.match(customerFlow, /normaliseNigerianPhone/);
assert.match(customerFlow, /isValidNigerianPhone/);
assert.match(customerLogin, /rememberLogin/);
assert.match(customerLogin, /showPassword/);
assert.match(customerLogin, /redirect: redirectTarget\.value/);
assert.match(customerLogin, /submitLabel/);
assert.match(customerLogin, /loadingLabel/);
assert.match(customerVerify, /safeAuthRedirect/);
assert.match(customerVerify, /rememberSession/);
assert.match(customerSignup, /showPassword/);
assert.match(customerStore, /setSession\(token: string, customer: CustomerProfile, remember = true, tokenOptions: CustomerTokenOptions = \{\}\)/);
assert.match(customerApi, /sessionStorage\.getItem\(TOKEN_KEY\)/);

console.log('auth-pages-hardening: ok');
