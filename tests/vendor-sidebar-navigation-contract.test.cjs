"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shell = fs.readFileSync(
  path.resolve(__dirname, "../apps/vendor/src/components/AppShell.vue"),
  "utf8",
);

function indexOfOrFail(value) {
  const index = shell.indexOf(value);
  assert.notEqual(index, -1, `Vendor sidebar is missing ${value}`);
  return index;
}

// Product contract: high-frequency destinations stay visible; lower-frequency
// destinations are progressively disclosed; the account/sign-out footer stays put.
const primaryStart = indexOfOrFail('class="bw-nav-primary"');
const dashboard = indexOfOrFail('class="bw-nav-item primary-dashboard"');
const buyToken = indexOfOrFail('to="/vend"');
const wallet = indexOfOrFail('to="/wallet"');
const transactions = indexOfOrFail('to="/transactions"');
assert.ok(primaryStart < dashboard && dashboard < buyToken && buyToken < wallet && wallet < transactions,
  "Dashboard, Buy Token, Wallet, and Transactions must be the visible primary order");

for (const group of ["Operations", "Wallet tools", "Support", "Account"]) {
  indexOfOrFail(`>${group}<`);
}

for (const route of ["/meter-orders", "/remote-send", "/wallet/fund", "/wallet/funding", "/receipts", "/notifications", "/help", "/disputes", "/profile", "/kyc", "/security", "/vend-access"]) {
  indexOfOrFail(`to="${route}"`);
}

const navEnd = indexOfOrFail("</nav>");
const footer = indexOfOrFail('class="bw-sidebar-foot sidebar-account"');
const signOut = indexOfOrFail('class="bw-btn danger sidebar-signout"');
assert.ok(navEnd < footer && footer < signOut, "Sign out must remain in the sidebar account footer");

console.log("vendor sidebar navigation contract passed");
