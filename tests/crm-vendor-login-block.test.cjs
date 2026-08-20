"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function main() {
  const referenceJs = read("api/reference.js");
  const supabaseService = read("backend/src/services/supabase-service.js");
  const pkg = JSON.parse(read("package.json"));

  // 1. Verify signInWithPassword in supabase-service.js rejects vendor & customer accounts with 403
  assert.match(
    supabaseService,
    /\['vendor',\s*'vendor_user',\s*'vendor-user',\s*'customer'\]\.includes\(normalizedRole\)/,
    "signInWithPassword must check and reject vendor/customer roleId"
  );
  assert.match(
    supabaseService,
    /Access Denied: Vendor and Customer accounts cannot sign in to Beverly CRM/,
    "signInWithPassword must return explicit 403 rejection message for vendor/customer"
  );

  // 2. Verify /api/auth/session rejects vendor & customer accounts
  assert.match(
    referenceJs,
    /\['vendor',\s*'vendor_user',\s*'vendor-user',\s*'customer'\]\.includes\(actorRole\)/,
    "/api/auth/session must verify actorRole and reject non-staff accounts"
  );

  // 3. Verify /api/user/login response handling refuses session cookies for vendor & customer accounts
  assert.match(
    referenceJs,
    /\['vendor',\s*'vendor_user',\s*'vendor-user',\s*'customer'\]\.includes\(roleId\)/,
    "/api/user/login must refuse session creation for vendor/customer roleId"
  );

  // 4. Verify test script registration in package.json
  assert.match(
    pkg.scripts["test:auth"],
    /tests\/crm-vendor-login-block\.test\.cjs/,
    "package.json test:auth script must register tests/crm-vendor-login-block.test.cjs"
  );

  console.log({
    status: "crm vendor login block contract passed",
    endpoints: ["/api/user/login", "/api/auth/session"],
    blockedRoles: ["vendor", "vendor_user", "vendor-user", "customer"],
  });
}

main();
