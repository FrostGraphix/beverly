"use strict";

const { checkProductionConfig } = require("../tools/production-env-check.cjs");
const fs = require("node:fs");
const path = require("node:path");

const secureProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "a-secure-production-secret-with-32-characters-minimum",
  APP_ENCRYPTION_KEY: "a-separate-production-encryption-key-32chars",
  WEBHOOK_SECRET: "a-separate-webhook-secret-with-32-characters",
  CORS_ORIGINS: "https://beverly.acoblighting.com",
  SUPABASE_ANON_KEY: "a-public-anonymous-key-for-production",
  SUPABASE_SERVICE_ROLE_KEY: "a-private-service-role-key-for-production",
  LIVE_API_BEARER_TOKEN: "token",
  PROFILE_PICTURE_SCAN_COMMAND: "malware-scanner"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(checkProductionConfig(secureProduction).ok, "secure production should pass");
assert(!checkProductionConfig({ ...secureProduction, JWT_SECRET: "acob-crm3-jwt-secret-2026" }).ok, "default jwt should fail");
assert(!checkProductionConfig({ ...secureProduction, APP_ENCRYPTION_KEY: "short" }).ok, "short encryption key should fail");
assert(!checkProductionConfig({ ...secureProduction, WEBHOOK_SECRET: "short" }).ok, "short webhook secret should fail");
assert(!checkProductionConfig({ ...secureProduction, CORS_ORIGINS: "http://localhost:5173" }).ok, "localhost cors should fail");
assert(!checkProductionConfig({ ...secureProduction, ALLOW_LIVE_WRITES: "true" }).ok, "legacy write flags should fail");
assert(!checkProductionConfig({ ...secureProduction, VITE_ALLOW_LIVE_WRITES: "true" }).ok, "client write flags should fail");
assert(!checkProductionConfig({ ...secureProduction, PROFILE_PICTURE_SCAN_COMMAND: "" }).ok, "production malware scanner should be required");
assert(!checkProductionConfig({ ...secureProduction, SUPABASE_SERVICE_ROLE_KEY: "" }).ok, "production service-role credentials should be required");
assert(!checkProductionConfig({ ...secureProduction, SUPABASE_SERVICE_ROLE_KEY: "same-as-anon", SUPABASE_ANON_KEY: "same-as-anon" }).ok, "production service-role credentials must not reuse the anonymous key");

const walletEnvSource = fs.readFileSync(path.join(__dirname, "..", "backend", "wallet", "src", "config", "env.ts"), "utf8");
assert(!walletEnvSource.includes("SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY"), "backend config must never fall back from service credentials to anonymous credentials");

console.log(JSON.stringify({
  status: "security config passed"
}, null, 2));
