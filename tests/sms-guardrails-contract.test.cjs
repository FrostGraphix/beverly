const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const env = read('backend/wallet/src/config/env.ts');
const walletEnvExample = read('backend/wallet/.env.example');
const guardrails = read('backend/wallet/src/services/sms-guardrails.ts');
const customerAuth = read('backend/wallet/src/services/customer-auth.ts');
const stepUp = read('backend/wallet/src/services/step-up-auth.ts');
const customerPurchase = read('backend/wallet/src/services/customer-purchase.ts');
const customerRoutes = read('backend/wallet/src/routes/customer.ts');
const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const audit = read('backend/wallet/src/services/audit.ts');
const legacySms = read('backend/src/services/sms-notification-service.js');
const migration = read('supabase/migrations/20260520133000_sms_guardrails.sql');
const smsApiTest = read('tests/sms-notification-api.test.cjs');
const customerOtpTest = read('tests/customer-otp-flow.test.cjs');

for (const marker of [
  'SMS_ALLOWED_COUNTRY_CODES',
  'SMS_BLOCKED_COUNTRY_CODES',
  'SMS_HIGH_RISK_COUNTRY_CODES',
  'SMS_OTP_RATE_LIMIT_MAX',
  'SMS_OTP_RESEND_COOLDOWN_SECONDS',
  'SMS_TOKEN_RESEND_DAILY_MAX',
]) {
  assert.ok(env.includes(marker), `env missing ${marker}`);
  assert.ok(walletEnvExample.includes(marker), `.env.example missing ${marker}`);
}

for (const marker of [
  'normalizeSmsPhone',
  'smsCountryCode',
  'assertSmsCountryAllowed',
  'assertCustomerOtpTrafficAllowed',
  'assertTokenSmsResendAllowed',
  "'sms_blocked'",
  "'sms_allowed'",
  "'rate_limit_hit'",
  'SMS_ALLOWED_COUNTRY_CODES',
]) {
  assert.ok(guardrails.includes(marker), `guardrails missing ${marker}`);
}

assert.match(customerAuth, /assertCustomerOtpTrafficAllowed/);
assert.match(customerAuth, /CUSTOMER_OTP_RETRY_AFTER_SECONDS = env\.SMS_OTP_RESEND_COOLDOWN_SECONDS/);
assert.match(customerAuth, /OTP_RATE_LIMIT_MAX = env\.SMS_OTP_RATE_LIMIT_MAX/);
assert.match(customerAuth, /sms_high_risk_geo/);
assert.match(customerRoutes, /sms_otp_rate_limited/);
assert.match(customerRoutes, /sms_country_not_allowed/);

assert.match(stepUp, /assertCustomerOtpTrafficAllowed/);
assert.match(stepUp, /kind: 'step_up_otp'/);
assert.match(customerPurchase, /assertTokenSmsResendAllowed/);
assert.match(customerPurchase, /input\.trafficKind === 'token_resend'/);
assert.match(customerPurchase, /customer\.purchase\.token_sms_sent/);
assert.match(customerRoutes, /trafficKind: 'token_resend'/);
assert.match(adminRoutes, /trafficKind: 'token_resend'/);
assert.match(adminRoutes, /result\.reason/);

assert.match(audit, /'sms_allowed' \| 'sms_blocked'/);
assert.match(migration, /add value if not exists 'sms_allowed'/);
assert.match(migration, /add value if not exists 'sms_blocked'/);

assert.match(legacySms, /assertSmsDestinationAllowed/);
assert.match(legacySms, /assertSmsTrafficLimit/);
assert.match(legacySms, /recordSmsGuardrailDecision/);
assert.match(legacySms, /SMS_ALLOWED_COUNTRY_CODES/);
assert.match(legacySms, /sms_country_not_allowed/);
assert.match(smsApiTest, /SMS_ALLOWED_COUNTRY_CODES/);
assert.match(smsApiTest, /sms-guardrail/);
assert.match(customerOtpTest, /SMS_OTP_RATE_LIMIT_MAX/);

console.log('sms guardrails contract passed');
