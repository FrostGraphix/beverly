"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function testStorageCleanupModule() {
  const apiJs = read("src/services/api.js");

  assert.match(apiJs, /export function runOneTimeStorageCleanup\(\)/, "api.js must export runOneTimeStorageCleanup");
  assert.match(apiJs, /beverly\.storage_purged_v2/, "api.js must use versioned purge key beverly.storage_purged_v2");
  assert.match(apiJs, /sessionStorage\.clear\(\)/, "api.js cleanup must reset sessionStorage");
  assert.match(apiJs, /runOneTimeStorageCleanup\(\);/, "api.js must auto-execute storage cleanup on import");
}

function testAppVueStorageCleanup() {
  const appVue = read("src/App.vue");

  assert.match(appVue, /runOneTimeStorageCleanup/, "App.vue must import runOneTimeStorageCleanup");
  assert.match(appVue, /runOneTimeStorageCleanup\(\);/, "App.vue created() must invoke runOneTimeStorageCleanup");
}

function main() {
  testStorageCleanupModule();
  testAppVueStorageCleanup();

  console.log({
    status: "one time storage cleanup contract passed",
    versionKey: "beverly.storage_purged_v2"
  });
}

main();
