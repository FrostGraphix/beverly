const fs = require("node:fs");
const path = require("node:path");
const { parseDotEnv } = require("./production-env-check.cjs");

const requiredProductionKeys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIVE_API_BASE_URL",
  "LIVE_API_BEARER_TOKEN",
  "JWT_SECRET",
  "CORS_ORIGINS"
];

function localEnv() {
  try {
    return parseDotEnv(fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8"));
  } catch {
    return {};
  }
}

function validateProvisioningEnv(env = process.env) {
  const production = String(env.NODE_ENV || "").toLowerCase() === "production";
  const missing = production
    ? requiredProductionKeys.filter((key) => !String(env[key] || "").trim())
    : [];
  const placeholders = requiredProductionKeys.filter((key) => /example|changeme|placeholder/i.test(String(env[key] || "")));
  return {
    production,
    requiredProductionKeys,
    missing,
    placeholders,
    ok: missing.length === 0 && placeholders.length === 0
  };
}

if (require.main === module) {
  const env = {
    ...localEnv(),
    ...process.env
  };
  const result = validateProvisioningEnv(env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

module.exports = {
  requiredProductionKeys,
  validateProvisioningEnv
};
