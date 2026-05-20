"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "apps/admin/src/components/AppShell.vue"), "utf8");
const router = fs.readFileSync(path.join(root, "apps/admin/src/router/index.ts"), "utf8");
const tokens = fs.readFileSync(path.join(root, "packages/tokens/wallet.css"), "utf8");

for (const label of ["Profile", "Settings", "Back to CRM", "Sign Out"]) {
  assert.match(shell, new RegExp(`>${label}<`), `admin account menu should include ${label}`);
}

assert.match(shell, /class="bw-user-dropdown"/, "admin shell should render the account dropdown");
assert.match(shell, /auth\.logout\(\)/, "admin account menu should sign out through the staff auth store");
assert.match(router, /path: '\/profile'[\s\S]*path: '\/settings'/, "profile and settings routes should exist");
assert.match(tokens, /\.bw-user-dropdown/, "wallet tokens should style the dropdown");

console.log(JSON.stringify({
  status: "admin account menu contract passed",
  checks: 8
}, null, 2));
