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

assert.doesNotMatch(
  crmBundle,
  /beforeinstallprompt/,
  "CRM must not suppress installation without install UI"
);
assert.match(vendorShell, /triggerInstallPrompt/, "vendor install UI keeps prompt handling");
assert.match(customerShell, /triggerInstallPrompt/, "customer install UI keeps prompt handling");

console.log(JSON.stringify({ status: "PWA install boundary passed" }, null, 2));
