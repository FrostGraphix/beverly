"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function testViteDevPortalRedirect() {
  const viteConfig = read("vite.config.mjs");

  assert.match(viteConfig, /function devPortalRedirect\(\)/, "vite.config.mjs must define devPortalRedirect");
  assert.match(viteConfig, /devPortalRedirect\(\)/, "vite.config.mjs plugins must include devPortalRedirect");
  assert.match(viteConfig, /pathname\.startsWith\("\/wallet-customer"\) \|\| pathname\.startsWith\("\/customer"\)/, "Must redirect customer paths");
  assert.match(viteConfig, /pathname\.startsWith\("\/wallet-vendor"\) \|\| pathname\.startsWith\("\/vendor"\)/, "Must redirect vendor paths");
  assert.match(viteConfig, /pathname\.startsWith\("\/wallet-admin"\) \|\| pathname\.startsWith\("\/admin"\)/, "Must redirect admin paths");
  assert.match(viteConfig, /response\.statusCode = 302/, "Dev portal redirect must issue HTTP 302");
  assert.match(viteConfig, /response\.setHeader\("Location", targetUrl\)/, "Dev portal redirect must set Location header");
}

function testAppVueSyncHash() {
  const appVue = read("src/App.vue");

  assert.match(appVue, /normalized\.startsWith\("#\/wallet\/customer"\) \|\| normalized\.startsWith\("#\/wallet-customer"\)/, "App.vue syncHash must catch customer hashes");
  assert.match(appVue, /normalized\.startsWith\("#\/wallet\/vendor"\) \|\| normalized\.startsWith\("#\/wallet-vendor"\)/, "App.vue syncHash must catch vendor hashes");
  assert.match(appVue, /normalized\.startsWith\("#\/wallet\/admin"\) \|\| normalized\.startsWith\("#\/wallet-admin"\)/, "App.vue syncHash must catch admin hashes");
  assert.match(appVue, /normalized === "#\/wallet" \|\| normalized === "#\/wallet\/landing"/, "App.vue syncHash must catch landing hashes");
}

function main() {
  testViteDevPortalRedirect();
  testAppVueSyncHash();

  console.log({
    status: "dev portal redirect contract passed",
    targets: ["customer", "vendor", "admin", "landing"],
    ports: {
      customer: 5173,
      vendor: 5174,
      admin: 5175,
      landing: 5176
    }
  });
}

main();
