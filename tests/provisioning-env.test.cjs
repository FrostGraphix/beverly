const assert = require("node:assert");
const { requiredProductionKeys, validateProvisioningEnv } = require("../tools/validate-provisioning-env.cjs");

const valid = {
  NODE_ENV: "production",
  SUPABASE_URL: "https://beverly-prod.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  LIVE_API_BASE_URL: "https://meter-api.acoblighting.com",
  LIVE_API_BEARER_TOKEN: "bearer",
  JWT_SECRET: "a-secure-production-secret-with-32-characters-minimum",
  CORS_ORIGINS: "https://beverly.acoblighting.com"
};

assert(requiredProductionKeys.includes("SUPABASE_URL"));
assert(requiredProductionKeys.includes("LIVE_API_BASE_URL"));
assert(validateProvisioningEnv(valid).ok);
assert(!validateProvisioningEnv({ ...valid, LIVE_API_BASE_URL: "" }).ok);
assert(!validateProvisioningEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "changeme" }).ok);
assert(validateProvisioningEnv({ NODE_ENV: "development" }).ok);

console.log("provisioning-env ok");
