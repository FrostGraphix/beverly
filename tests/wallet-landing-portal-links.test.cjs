"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const portals = read("apps/wallet-landing/src/portals.ts");
const nav = read("apps/wallet-landing/src/components/LandingNav.vue");
const launchModal = read("apps/wallet-landing/src/components/LaunchModal.vue");
const content = read("apps/wallet-landing/src/content.ts");

assert.match(portals, /customer: '\/wallet-customer\/'/);
assert.match(portals, /vendor: '\/wallet-vendor\/'/);
assert.match(portals, /resolve\(env\.VITE_CUSTOMER_URL, DEFAULT_PORTALS\.customer\)/);
assert.match(portals, /resolve\(env\.VITE_VENDOR_URL, DEFAULT_PORTALS\.vendor\)/);

assert.match(launchModal, /PORTAL_CARDS\[0\]\.secondaryHref/);
assert.match(launchModal, /PORTAL_CARDS\[1\]\.primaryHref/);
assert.match(launchModal, /Customer sign in/);
assert.match(launchModal, /Vendor sign in/);

const mobileMenu = nav.match(/<div v-if="menuOpen" class="lp-mobile-menu">[\s\S]*?<\/div>\s*<\/transition>/);
assert.ok(mobileMenu, "expected landing nav mobile menu markup");
assert.doesNotMatch(mobileMenu[0], /Customer sign in/);
assert.doesNotMatch(mobileMenu[0], /Vendor sign in/);

assert.match(content, /login: PORTAL_URLS\.customer \+ 'login'/);
assert.match(content, /login: PORTAL_URLS\.vendor \+ 'login'/);

console.log("wallet landing portal links passed");
