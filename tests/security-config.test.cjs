"use strict";

const { checkProductionConfig } = require("../tools/production-env-check.cjs");

const secureProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "a-secure-production-secret-with-32-characters-minimum",
  CORS_ORIGINS: "https://beverly.acoblighting.com",
  ALLOW_LIVE_WRITES: "false",
  LIVE_API_BEARER_TOKEN: "token"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(checkProductionConfig(secureProduction).ok, "secure production should pass");
assert(!checkProductionConfig({ ...secureProduction, JWT_SECRET: "acob-crm3-jwt-secret-2026" }).ok, "default jwt should fail");
assert(!checkProductionConfig({ ...secureProduction, CORS_ORIGINS: "http://localhost:5173" }).ok, "localhost cors should fail");
assert(!checkProductionConfig({ ...secureProduction, ALLOW_LIVE_WRITES: "true" }).ok, "unapproved writes should fail");
assert(checkProductionConfig({ ...secureProduction, ALLOW_LIVE_WRITES: "true", APPROVED_LIVE_WRITES: "true" }).ok, "approved writes should pass");

console.log(JSON.stringify({
  status: "security config passed"
}, null, 2));
