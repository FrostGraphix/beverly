"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const content = fs.readFileSync(path.join(root, "apps/wallet-landing/src/content.ts"), "utf8");

assert.match(content, /KYAKALE'[\s\S]*region: 'Nasarawa State'/);
assert.match(content, /TUNGA'[\s\S]*region: 'Nasarawa State'/);
assert.match(content, /OGUFA'[\s\S]*region: 'Nasarawa State'/);
assert.doesNotMatch(content, /Niger State/);

console.log("wallet landing coverage sites passed");
