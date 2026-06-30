const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function main() {
  const router = read('apps/customer/src/router/index.ts');
  const signup = read('apps/customer/src/views/Signup.vue');
  const login = read('apps/customer/src/views/Login.vue');
  const verify = read('apps/customer/src/views/Verify.vue');
  const recover = read('apps/customer/src/views/Recover.vue');
  const shell = read('apps/customer/src/components/CustomerAuthShell.vue');
  const api = read('apps/customer/src/lib/api.ts');
  const styles = read('apps/customer/src/styles/app.css');
  const customerAuthService = read('backend/wallet/src/services/customer-auth.ts');
  const walletEnv = read('backend/wallet/src/config/env.ts');

  assert(router.includes("path: '/signup'"));
  assert(router.includes("path: '/login'"));
  assert(router.includes("path: '/recover'"));
  assert(router.includes("path: '/verify'"));

  assert(shell.includes('title: string;'));
  assert(shell.includes('auth-brand'));
  assert(shell.includes('auth-mark'));

  assert(signup.includes('Create account'));
  assert(signup.includes('/api/v1/customer/auth/email/signup'));
  assert(signup.includes("accountMode"));
  assert(signup.includes("Password must be at least 8 characters"));
  assert(signup.includes('Buy electricity tokens in seconds'));
  assert(signup.includes('CustomerAuthShell'));

  assert(login.includes('Welcome back'));
  assert(login.includes('/api/v1/customer/auth/email/login'));
  assert(login.includes("loginMode"));
  assert(login.includes('Enter your phone number to receive a sign-in code'));

  assert(recover.includes('Recover access'));
  assert(recover.includes('/api/v1/customer/auth/recover'));

  assert(verify.includes('isRecovery'));
  assert(verify.includes("authPurpose"));
  assert(verify.includes("expires_at"));
  assert(verify.includes("retry_after_seconds"));
  assert(verify.includes('Check your phone'));
  assert(verify.includes('Enter your code'));

  assert(api.includes('REQUEST_TIMEOUT_MS'));
  assert(api.includes('request_timeout'));

  assert(styles.includes('.bw-auth-header'));
  assert(styles.includes('.bw-auth-mark'));
  assert(styles.includes('.bw-auth-footer'));
  assert(styles.includes('.bw-auth-inline-link'));

  assert(customerAuthService.includes('fallbackOtpChallenges'));
  assert(customerAuthService.includes('signupWithEmail'));
  assert(customerAuthService.includes('loginWithEmail'));
  assert(customerAuthService.includes("authProvider: 'email_password'"));
  assert(customerAuthService.includes('isOtpStorageMissing'));
  assert(customerAuthService.includes('storeFallbackOtpChallenge'));
  assert(customerAuthService.includes("export type OtpPurpose = 'signup' | 'login' | 'recovery'"));
  assert(customerAuthService.includes('CUSTOMER_OTP_RETRY_AFTER_SECONDS'));
  assert(customerAuthService.includes('consumeChallenge(challengeId'));
  assert(customerAuthService.includes("action: purpose === 'recovery' ? 'customer.recovery' : 'customer.login'"));
  assert(walletEnv.includes('if (key && !process.env[key]) process.env[key] = value;'));

  const migration = read('supabase/migrations/20260519150000_customer_otp_challenge_recovery.sql');
  assert(migration.includes("'signup', 'login', 'recovery'"));
  assert(migration.includes('consumed_at'));
  assert(migration.includes('delivery_reference'));

  const emailMigration = read('supabase/migrations/20260520100000_customer_email_auth.sql');
  assert(emailMigration.includes('auth_provider'));
  assert(emailMigration.includes('customers_email_lower_idx'));
}

main();
console.log('customer-auth-ui-contract ok');
