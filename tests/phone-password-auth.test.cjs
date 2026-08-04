"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  console.log("Running phone-password-auth contract tests...");

  // 1. Customer Auth Service
  const service = read("backend/wallet/src/services/customer-auth.ts");
  assert(service.includes("signupWithPhone"), "customer-auth.ts must export signupWithPhone");
  assert(service.includes("loginWithPhone"), "customer-auth.ts must export loginWithPhone");
  assert(service.includes("phonePasswordToken"), "customer-auth.ts must include phonePasswordToken");
  assert(service.includes("export interface PhoneSignupInput"), "customer-auth.ts must export PhoneSignupInput");
  assert(service.includes("export interface PhoneLoginInput"), "customer-auth.ts must export PhoneLoginInput");
  assert(service.includes("authProvider: 'phone_password'"), "customer-auth.ts must set phone_password authProvider");

  // 2. Customer Fastify Routes
  const routes = read("backend/wallet/src/routes/customer.ts");
  assert(routes.includes("fastify.post('/auth/phone/signup'"), "customer.ts must register /auth/phone/signup");
  assert(routes.includes("fastify.post('/auth/phone/login'"), "customer.ts must register /auth/phone/login");
  assert(routes.includes("signupWithPhone"), "customer.ts must import signupWithPhone");
  assert(routes.includes("loginWithPhone"), "customer.ts must import loginWithPhone");

  // 3. Route Policy
  const routePolicy = read("backend/wallet/src/contracts/route-policy.ts");
  assert(routePolicy.includes("'phone/signup'"), "route-policy.ts must include phone/signup in public routes");
  assert(routePolicy.includes("'phone/login'"), "route-policy.ts must include phone/login in public routes");

  // 4. Vendor Onboarding Service
  const vendorOnboarding = read("backend/wallet/src/services/vendor-onboarding.ts");
  assert(vendorOnboarding.includes("phone: phone || undefined"), "vendor-onboarding.ts must pass phone to admin.createUser");
  assert(vendorOnboarding.includes("phone_confirm: phone ? true : undefined"), "vendor-onboarding.ts must pass phone_confirm to admin.createUser");

  // 5. Vendor Login View
  const vendorLogin = read("apps/vendor/src/views/Login.vue");
  assert(vendorLogin.includes("normaliseVendorIdentifier"), "Vendor Login.vue must normalize identifier");
  assert(vendorLogin.includes("Email or Phone Number"), "Vendor Login.vue label must state Email or Phone Number");
  assert(vendorLogin.includes("{ phone: idInfo.phone, password: password.value }"), "Vendor Login.vue must support phone+password payload");

  // 6. Customer Signup View
  const customerSignup = read("apps/customer/src/views/Signup.vue");
  assert(customerSignup.includes("/api/v1/customer/auth/phone/signup"), "Customer Signup.vue must call /auth/phone/signup");
  assert(customerSignup.includes("submitPhonePassword"), "Customer Signup.vue must include submitPhonePassword");

  // 7. Customer Login View
  const customerLogin = read("apps/customer/src/views/Login.vue");
  assert(customerLogin.includes("/api/v1/customer/auth/phone/login"), "Customer Login.vue must call /auth/phone/login");

  console.log("✓ phone-password-auth contract tests passed successfully.");
}

main();
