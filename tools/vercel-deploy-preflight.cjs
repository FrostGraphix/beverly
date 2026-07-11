"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const beverlyTeamId = "team_QaH3UbO8a73beiWz5LmJc5k4";

function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function fail(message) {
  throw new Error(message);
}

function checkVercelDeployPreflight(options = {}) {
  const env = options.env || process.env;
  const packageJson = readJson("package.json", {});
  const vercelJson = readJson("vercel.json", {});
  const vercelProject = readJson(".vercel/project.json", null);
  const vercelRepo = readJson(".vercel/repo.json", null);
  const failures = [];
  const warnings = [];

  const nodeEngine = packageJson.engines?.node;
  if (nodeEngine !== "22.x") failures.push("package.json engines.node must stay pinned to 22.x");
  if (packageJson.packageManager !== "pnpm@10.28.0") {
    failures.push("package.json packageManager must pin pnpm@10.28.0 for Vercel deploy parity");
  }

  const projectNode = vercelProject?.settings?.nodeVersion;
  if (projectNode && projectNode !== nodeEngine) {
    warnings.push(`.vercel/project.json nodeVersion ${projectNode} is overridden by package engine ${nodeEngine}`);
  }

  if (vercelJson.buildCommand !== "npm run build") failures.push("vercel.json buildCommand must be npm run build");
  if (vercelJson.outputDirectory !== "dist") failures.push("vercel.json outputDirectory must be dist");

  const cronCount = Array.isArray(vercelJson.crons) ? vercelJson.crons.length : 0;
  if (cronCount > 0 && !vercelJson.crons.every((entry) => {
    const schedule = String(entry.schedule || "");
    return /^0\s+\d+\s+\*\s+\*\s+\*$/.test(schedule);
  })) {
    failures.push("Hobby-safe Vercel crons must run once daily");
  }

  const linkedOrgId = vercelProject?.orgId || vercelRepo?.projects?.[0]?.orgId || "";
  const requestedScope = env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || env.VERCEL_SCOPE || "";
  if (linkedOrgId === beverlyTeamId && requestedScope !== beverlyTeamId) {
    failures.push(
      `Vercel deploy scope must be ${beverlyTeamId}. July 2 failed because a non-member actor deployed from a personal scope; set VERCEL_TEAM_ID or VERCEL_ORG_ID to ${beverlyTeamId} before running vercel deploy.`
    );
  } else if (linkedOrgId && !requestedScope) {
    warnings.push("local Vercel link is scoped; set VERCEL_SCOPE or re-authenticate before CLI deploys");
  }

  if (failures.length) {
    return { ok: false, failures, warnings };
  }
  return { ok: true, failures, warnings };
}

if (require.main === module) {
  const result = checkVercelDeployPreflight();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

module.exports = {
  checkVercelDeployPreflight
};
