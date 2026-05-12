"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const designSystem = read("docs/DESIGN_SYSTEM.md");
const tokens = read("src/styles/tokens.css");
const primitives = read("src/styles/primitives.css");
const baseBadge = read("src/components/base/BaseBadge.vue");

for (const required of [
  "src/styles/tokens.css",
  "src/styles/themes.css",
  "src/styles/primitives.css",
  "src/styles/layouts.css",
  "Do not add tokens to `reference.css`",
  "Source Badges",
  "legacy CSS",
  "9.5/10 design-system maturity"
]) {
  assert(designSystem.includes(required), `DESIGN_SYSTEM.md missing ${required}`);
}

for (const token of [
  "--color-source-live",
  "--color-source-live-soft",
  "--color-source-cached",
  "--color-source-cached-soft",
  "--color-source-demo",
  "--color-source-demo-soft"
]) {
  assert(tokens.includes(token), `tokens.css missing ${token}`);
}

for (const primitive of [
  ".base-badge--live",
  ".base-badge--cached",
  ".base-badge--demo",
  ".base-badge--info",
  ".base-badge--neutral"
]) {
  assert(primitives.includes(primitive), `primitives.css missing ${primitive}`);
}

for (const variant of ["neutral", "info", "live", "cached", "demo"]) {
  assert(baseBadge.includes(`"${variant}"`), `BaseBadge missing ${variant}`);
}

console.log(JSON.stringify({
  status: "design system scalability passed"
}, null, 2));
