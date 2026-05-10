"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteConfig = fs.readFileSync(path.join(root, "vite.config.mjs"), "utf8");
const devStack = fs.readFileSync(path.join(root, "tools/run-dev-stack.cjs"), "utf8");

assert.match(
  viteConfig,
  /VITE_API_PROXY_TARGET[\s\S]*process\.env\.API_PORT[\s\S]*"http:\/\/127\.0\.0\.1:9310"/,
  "Vite dev proxy should support API_PORT and default to the same local API port as the dev stack"
);

assert.match(
  devStack,
  /const apiPort = Number\(process\.env\.API_PORT \|\| 9310\);/,
  "Dev stack should keep the local API port at 9310"
);

console.log(JSON.stringify({
  status: "dev proxy config passed",
  checks: 2
}, null, 2));
