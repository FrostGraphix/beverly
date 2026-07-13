"use strict";

const { checkProductionConfig } = require("../tools/production-env-check.cjs");

const secureProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "a-secure-production-secret-with-32-characters-minimum",
  APP_ENCRYPTION_KEY: "a-separate-production-encryption-key-32chars",
  CORS_ORIGINS: "https://beverly.acoblighting.com",
  LIVE_API_BEARER_TOKEN: "token"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(checkProductionConfig(secureProduction).ok, "secure production should pass");
assert(!checkProductionConfig({ ...secureProduction, JWT_SECRET: "acob-crm3-jwt-secret-2026" }).ok, "default jwt should fail");
assert(!checkProductionConfig({ ...secureProduction, APP_ENCRYPTION_KEY: "short" }).ok, "short encryption key should fail");
assert(!checkProductionConfig({ ...secureProduction, CORS_ORIGINS: "http://localhost:5173" }).ok, "localhost cors should fail");
assert(!checkProductionConfig({ ...secureProduction, ALLOW_LIVE_WRITES: "true" }).ok, "legacy write flags should fail");
assert(!checkProductionConfig({ ...secureProduction, VITE_ALLOW_LIVE_WRITES: "true" }).ok, "client write flags should fail");

console.log(JSON.stringify({
  status: "security config passed"
}, null, 2));
