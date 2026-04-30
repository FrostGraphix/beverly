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

assert(targets.length >= 23);
assert(targets.every((target) => target.hash.startsWith("#/")));
assert(targets.filter((target) => target.hasReference).length >= 23);

console.log(JSON.stringify({
  targets: targets.length,
  references: targets.filter((target) => target.hasReference).length,
  status: "visual parity config passed"
}, null, 2));
