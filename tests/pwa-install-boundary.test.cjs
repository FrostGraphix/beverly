"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function javascriptBundleText(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(directory, name), "utf8"))
    .join("\n");
}

const crmBundle = javascriptBundleText(path.join(root, "dist", "assets"));
const vendorShell = fs.readFileSync(path.join(root, "apps", "vendor", "src", "components", "AppShell.vue"), "utf8");
const customerShell = fs.readFileSync(path.join(root, "apps", "customer", "src", "components", "AppShell.vue"), "utf8");
const installControl = fs.readFileSync(path.join(root, "packages", "tokens", "PwaInstallControl.vue"), "utf8");
const installHelper = fs.readFileSync(path.join(root, "packages", "tokens", "pwaInstall.js"), "utf8");
const customerProfile = fs.readFileSync(path.join(root, "apps", "customer", "src", "views", "Profile.vue"), "utf8");
const vendorSettings = fs.readFileSync(path.join(root, "apps", "vendor", "src", "views", "Settings.vue"), "utf8");
const vendorRouter = fs.readFileSync(path.join(root, "apps", "vendor", "src", "router", "index.ts"), "utf8");
const adminSettings = fs.readFileSync(path.join(root, "apps", "admin", "src", "views", "Settings.vue"), "utf8");

assert.doesNotMatch(
  crmBundle,
  /beforeinstallprompt/,
  "CRM must not suppress installation without install UI"
);
assert.match(vendorShell, /triggerInstallPrompt/, "vendor install UI keeps prompt handling");
assert.match(customerShell, /triggerInstallPrompt/, "customer install UI keeps prompt handling");
assert.match(installControl, /triggerInstallPrompt/, "native install prompt remains available");
assert.match(installControl, /isIos\(\)/, "iOS receives manual install steps");
assert.match(installControl, /Open your browser menu/, "Android receives manual install steps");
assert.match(installHelper, /deferredPrompt = null;\s*listeners\.forEach\(\(cb\) => cb\(null\)\);\s*return choice/, "used prompts are cleared after either choice");
assert.match(customerProfile, /<PwaInstallControl\s*\/>/, "customer profile exposes installation");
assert.match(vendorRouter, /path: '\/settings'/, "vendor settings route exists");
assert.match(vendorSettings, /<PwaInstallControl\s*\/>/, "vendor settings expose installation");
assert.match(adminSettings, /<PwaInstallControl\s*\/>/, "admin settings expose installation");

console.log(JSON.stringify({ status: "PWA install boundary passed" }, null, 2));
