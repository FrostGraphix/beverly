"use strict";

const defaultJwtSecrets = new Set([
  "",
  "secret",
  "changeme",
  "acob-crm3-jwt-secret-2026"
]);

function parseDotEnv(content) {
  const values = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    values[key] = value.replace(/^["']|["']$/g, "");
  }
  return values;
}

function localEnv() {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    return parseDotEnv(fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8"));
  } catch {
    return {};
  }
}

function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function checkProductionConfig(env = process.env) {
  const failures = [];
  const warnings = [];
  const nodeEnv = String(env.NODE_ENV || "development").toLowerCase();
  const production = nodeEnv === "production";
  const jwtSecret = String(env.JWT_SECRET || "");
  const corsOrigins = splitOrigins(env.CORS_ORIGINS);
  const allowLiveWrites = String(env.ALLOW_LIVE_WRITES || "false").toLowerCase() === "true";
  const approvedLiveWrites = String(env.APPROVED_LIVE_WRITES || "false").toLowerCase() === "true";

  if (production && defaultJwtSecrets.has(jwtSecret)) {
    failures.push("JWT_SECRET must be replaced in production");
  }
  if (production && jwtSecret.length < 32) {
    failures.push("JWT_SECRET must be at least 32 characters in production");
  }
  if (production && !corsOrigins.length) {
    failures.push("CORS_ORIGINS must be set in production");
  }
  if (production && corsOrigins.some((origin) => origin === "*" || origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    failures.push("CORS_ORIGINS must use production origins only");
  }
  if (production && allowLiveWrites && !approvedLiveWrites) {
    failures.push("ALLOW_LIVE_WRITES=true requires APPROVED_LIVE_WRITES=true in production");
  }
  if (!env.LIVE_API_BEARER_TOKEN && !env.UPSTREAM_BEARER_TOKEN) {
    warnings.push("live bearer token is missing");
  }

  return {
    production,
    failures,
    warnings,
    ok: failures.length === 0
  };
}

if (require.main === module) {
  const reviewProduction = process.argv.includes("--production");
  const env = {
    ...localEnv(),
    ...process.env
  };
  if (reviewProduction) env.NODE_ENV = "production";
  const result = checkProductionConfig(env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

module.exports = {
  checkProductionConfig,
  parseDotEnv
};
