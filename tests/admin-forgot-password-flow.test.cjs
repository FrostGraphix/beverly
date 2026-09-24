const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin login exposes self-service recovery', () => {
  const login = read('apps/admin/src/views/Login.vue');
  assert.match(login, /to="\/forgot-password"/);
  const router = read('apps/admin/src/router/index.ts');
  assert.match(router, /path: '\/forgot-password'/);
  assert.match(router, /path: '\/reset-password'/);
});

test('admin recovery uses public one-time endpoints', () => {
  const routes = read('backend/wallet/src/routes/admin-password-recovery.ts');
  assert.match(routes, /'\/reset-request'/);
  assert.match(routes, /'\/reset-verify'/);
  assert.match(routes, /'\/reset-confirm'/);
  assert.match(routes, /requestPasswordReset\(.*'staff'/s);
  assert.match(routes, /verifyPasswordResetOtp\(.*'staff'/s);
  assert.match(routes, /confirmPasswordReset\(.*'staff'/s);
});

test('admin recovery requires emailed OTP', () => {
  const forgot = read('apps/admin/src/views/ForgotPassword.vue');
  const reset = read('apps/admin/src/views/ResetPassword.vue');
  assert.match(forgot, /autocomplete="one-time-code"/);
  assert.match(forgot, /admin\/auth\/reset-verify/);
  assert.match(reset, /sessionStorage\.getItem\('beverly\.admin\.password-reset-grant'\)/);
  assert.doesNotMatch(reset, /route\.query\.token/);
});

test('staff recovery persists its security boundary', () => {
  const service = read('backend/wallet/src/services/password-reset.ts');
  assert.match(service, /ResetUserType = 'customer' \| 'vendor_user' \| 'staff'/);
  assert.match(service, /password_reset_required: true/);
  assert.match(service, /password_session_id: `password-reset:/);
  assert.match(service, /signOut\(.*'global'/s);
});
