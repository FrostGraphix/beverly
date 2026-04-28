"use strict";

const assert = require("assert");
const path = require("path");
const { buildParityTargets } = require("../tools/visual-parity-lib.cjs");

const root = path.resolve(__dirname, "..");
const targets = buildParityTargets({
  root,
  routeManifestPath: path.join(root, "reference-route-manifest.json"),
  crawlResultsPath: path.join(root, "tmp", "reference-crawl-results.json")
});

assert.strictEqual(targets.length, 23);
assert(targets.every((target) => target.hash.startsWith("#/")));
assert(targets.every((target) => target.hasReference));

console.log(JSON.stringify({
  targets: targets.length,
  references: targets.filter((target) => target.hasReference).length,
  status: "visual parity config passed"
}, null, 2));
