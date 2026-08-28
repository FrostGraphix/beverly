"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const componentDir = path.join(root, "apps/wallet-landing/src/components");
const componentFiles = fs.readdirSync(componentDir).filter((file) => file.endsWith(".vue"));
const sources = [
  ...componentFiles.map((file) => fs.readFileSync(path.join(componentDir, file), "utf8")),
  fs.readFileSync(path.join(root, "apps/wallet-landing/src/content.ts"), "utf8"),
].join("\n");
const catalogs = [
  fs.readFileSync(path.join(root, "packages/tokens/i18n.js"), "utf8"),
  fs.readFileSync(path.join(root, "packages/tokens/landing-messages.js"), "utf8"),
].join("\n");

const referenced = new Set((sources.match(/landing\.[a-zA-Z0-9_.]+/g) ?? []).filter((key) => !key.endsWith('.')));
for (let index = 1; index <= 6; index += 1) {
  referenced.add(`landing.feature.${index}.title`);
  referenced.add(`landing.feature.${index}.body`);
}
for (const audience of ["customer", "vendor"]) {
  for (let index = 1; index <= 3; index += 1) {
    referenced.add(`landing.how.${audience}.${index}.title`);
    referenced.add(`landing.how.${audience}.${index}.body`);
  }
}
for (let index = 1; index <= 10; index += 1) {
  referenced.add(`landing.faq.${index}.q`);
  referenced.add(`landing.faq.${index}.a`);
}
for (let index = 1; index <= 4; index += 1) {
  referenced.add(`landing.trust.${index}.title`);
  referenced.add(`landing.trust.${index}.body`);
}

for (const key of referenced) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = catalogs.match(new RegExp(`['\"]${escaped}['\"]`, "g")) ?? [];
  assert.equal(matches.length, 4, `${key} must exist in all four locale catalogs`);
}

assert.doesNotMatch(sources, /five supported sites|five Nasarawa sites|Beverly-supported Nasarawa/i);
console.log("wallet landing translation coverage passed");
