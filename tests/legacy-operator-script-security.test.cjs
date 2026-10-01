"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const adminSync = fs.readFileSync(path.join(root, "backend/scripts/switch-to-upgraded-admin.cjs"), "utf8");
const reconciliation = fs.readFileSync(path.join(root, ".codex-audits/reports-runtime-2026-09-02/reconcile.cjs"), "utf8");
const walletEnv = fs.readFileSync(path.join(root, "backend/wallet/src/config/env.ts"), "utf8");
const beverlySync = fs.readFileSync(path.join(root, "backend/scripts/switch-to-beverly-user.cjs"), "utf8");
const authCrawl = fs.readFileSync(path.join(root, "source-crawl/authenticated/auth-crawl-report.json"), "utf8");
const credentialCleanup = fs.readFileSync(path.join(root, "backend/wallet/scripts/cleanup-station-oem-creds.cjs"), "utf8");

assert.doesNotMatch(adminSync, /ACOB_ADMIN/, "operator script embeds a password");
assert.match(adminSync, /--apply/, "mutating operator script lacks explicit opt-in");
assert.match(adminSync, /required\('UPSTREAM_USERNAME'\)/, "operator username must be explicit");
assert.match(adminSync, /required\('UPSTREAM_PASSWORD'\)/, "operator password must be explicit");
assert.match(adminSync, /process\.exitCode = 1/, "operator failures must exit nonzero");
assert.doesNotMatch(reconciliation, /rejectUnauthorized:\s*false/, "audit script disables TLS verification");
assert.match(reconciliation, /rejectUnauthorized:\s*true/, "audit script must verify TLS");
assert.doesNotMatch(walletEnv, /ACOB_ADMIN|123456|eyJhbGciOiJIUzI1Ni/, "wallet environment embeds credentials");
assert.doesNotMatch(walletEnv, /SUPABASE_SERVICE_KEY\s*\|\|\s*process\.env\.SUPABASE_ANON_KEY/, "service role falls back to anon");
assert.doesNotMatch(beverlySync, /ACOB_ADMIN/, "Beverly operator script embeds a password");
assert.match(beverlySync, /--apply/, "Beverly operator mutation lacks explicit opt-in");
assert.doesNotMatch(authCrawl, /ACOB_ADMIN/, "authenticated crawl stores a password");
assert.doesNotMatch(credentialCleanup, /select\(['"]\*['"]\)/, "credential cleanup selects secret columns");
assert.doesNotMatch(credentialCleanup, /encrypted_|base_url|token_endpoint_path|updated_by/, "credential cleanup selects sensitive columns");

console.log("legacy operator script security passed");
