"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const scriptPath = path.resolve(__dirname, "..", "backend", "scripts", "prestage-draft-oems.cjs");
const source = fs.readFileSync(scriptPath, "utf8");

assert.match(source, /certified OEM provisioning workflow/i, "the retired prestage command must direct operators to certified provisioning");
assert.doesNotMatch(source, /upsertOemManufacturer\s*\(/, "the retired prestage command must not create OEM records");
assert.doesNotMatch(source, /upsertOemEndpointConfig\s*\(/, "the retired prestage command must not create guessed endpoint records");
assert.doesNotMatch(source, /vendingStrategy\s*:\s*["']sts_token["']/, "the retired prestage command must not assign a vending strategy");

console.log(JSON.stringify({ status: "Draft OEM prestage safety contract passed" }, null, 2));
