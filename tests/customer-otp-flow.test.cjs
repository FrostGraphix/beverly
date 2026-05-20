"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const service = read("backend/wallet/src/services/customer-auth.ts");
  const routes = read("backend/wallet/src/routes/customer.ts");
  const verify = read("apps/customer/src/views/Verify.vue");
  const recover = read("apps/customer/src/views/Recover.vue");
  const login = read("apps/customer/src/views/Login.vue");
  const signup = read("apps/customer/src/views/Signup.vue");
  const migration = read("supabase/migrations/20260519150000_customer_otp_challenge_recovery.sql");
  const packageJson = JSON.parse(read("package.json"));

  assert(service.includes("export type OtpPurpose = 'signup' | 'login' | 'recovery'"));
  assert(service.includes("signupWithEmail"));
  assert(service.includes("loginWithEmail"));
  assert(service.includes("email_confirm: true"));
  assert(service.includes("authProvider: 'email_password'"));
  assert(service.includes("OTP_TTL_MS = 5 * 60 * 1000"));
  assert(service.includes("OTP_RATE_LIMIT_MAX = env.SMS_OTP_RATE_LIMIT_MAX"));
  assert(service.includes("assertCustomerOtpTrafficAllowed"));
  assert(service.includes("OTP_MAX_ATTEMPTS = 5"));
  assert(service.includes("CUSTOMER_OTP_RETRY_AFTER_SECONDS"));
  assert(service.includes("ensurePurposeAllowed(normalised, purpose, metadata)"));
  assert(service.includes(".is('consumed_at', null)"));
  assert(service.includes("recordFailedAttempt(challengeId"));
  assert(service.includes("consumeChallenge(challengeId"));
  assert(service.includes("idempotencyKey: `customer-otp.${challengeId}`"));
  assert(service.includes("delivery_reference: sms.sid"));
  assert(service.includes("delivery_reference: verification.sid"));
  assert(service.includes("action: purpose === 'recovery' ? 'customer.recovery' : 'customer.login'"));

  assert(routes.includes("fastify.post('/auth/recover'"));
  assert(routes.includes("fastify.post('/auth/email/signup'"));
  assert(routes.includes("fastify.post('/auth/email/login'"));
  assert(routes.includes("customerAuthPayload(result)"));
  assert(routes.includes("expires_at: result.expiresAt"));
  assert(routes.includes("retry_after_seconds: result.retryAfterSeconds"));
  assert(routes.includes("code === 'invalid_otp' || code === 'otp_expired' || code === 'max_attempts' ? 401"));

  assert(recover.includes("/api/v1/customer/auth/recover"));
  for (const page of [login, signup, verify]) {
    assert(page.includes("expires_at"));
    assert(page.includes("retry_after_seconds"));
  }
  assert(verify.includes("challengeId.value = response.challenge_id"));
  assert(verify.includes("response = await api.post('/api/v1/customer/auth/recover'"));

  assert(migration.includes("check (purpose in ('signup', 'login', 'recovery'))"));
  assert(migration.includes("add column if not exists consumed_at"));
  assert(migration.includes("add column if not exists last_sent_at"));
  assert(migration.includes("add column if not exists send_count"));
  assert(migration.includes("add column if not exists delivery_provider"));
  assert(migration.includes("add column if not exists delivery_reference"));

  assert(packageJson.scripts["test:auth"].includes("tests/customer-otp-flow.test.cjs"));

  console.log(JSON.stringify({
    status: "customer otp flow smoke passed",
    purposes: ["signup", "login", "recovery"]
  }, null, 2));
}

main();
