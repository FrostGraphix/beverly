"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const portals = read("apps/wallet-landing/src/portals.ts");
const nav = read("apps/wallet-landing/src/components/LandingNav.vue");
const content = read("apps/wallet-landing/src/content.ts");

assert.match(portals, /https:\/\/customer-acob-beverly\.vercel\.app\//);
assert.match(portals, /https:\/\/vendor-acob-beverly\.vercel\.app\//);
assert.match(portals, /resolve\(env\.VITE_CUSTOMER_URL, HOSTED_PORTALS\.customer\)/);
assert.match(portals, /resolve\(env\.VITE_VENDOR_URL, HOSTED_PORTALS\.vendor\)/);

assert.match(nav, /PORTALS\.customer\.login/);
assert.match(nav, /PORTALS\.vendor\.login/);
assert.match(nav, /Customer sign in/);
assert.match(nav, /Vendor sign in/);

const mobileMenu = nav.match(/<div v-if="menuOpen" class="lp-mobile-menu">[\s\S]*?<\/div>\s*<\/transition>/);
assert.ok(mobileMenu, "expected landing nav mobile menu markup");
assert.doesNotMatch(mobileMenu[0], /Customer sign in/);
assert.doesNotMatch(mobileMenu[0], /Vendor sign in/);

assert.match(content, /login: PORTAL_URLS\.customer \+ 'login'/);
assert.match(content, /login: PORTAL_URLS\.vendor \+ 'login'/);

console.log("wallet landing portal links passed");
