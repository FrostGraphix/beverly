"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const committedEnvironment = config.env || {};
const protectedNames = [
  "APP_ENCRYPTION_KEY",
  "ENERGY_AUTHORIZATION_PASSWORD",
  "UPSTREAM_PASSWORD",
];

for (const name of protectedNames) {
  assert.equal(
    Object.hasOwn(committedEnvironment, name),
    false,
    `${name} must remain dashboard-managed`,
  );
}

for (const [name, value] of Object.entries(committedEnvironment)) {
  assert.doesNotMatch(name, /(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|ENCRYPTION_KEY)$/i);
  assert.equal(typeof value, "string", `${name} must use a string value`);
}

console.log(JSON.stringify({ status: "Vercel secret boundary passed" }, null, 2));
