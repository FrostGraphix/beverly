"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildParityTargets } = require("../tools/visual-parity-lib.cjs");

const root = path.resolve(__dirname, "..");
const routeManifestPath = path.join(root, "reference-route-manifest.json");
const routes = JSON.parse(fs.readFileSync(routeManifestPath, "utf8"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beverly-visual-parity-"));
const crawlResultsPath = path.join(tempDir, "reference-crawl-results.json");

try {
  fs.writeFileSync(crawlResultsPath, JSON.stringify(
    routes.map((route) => ({ href: route.hash, screenshot: path.join(tempDir, `${route.title}.png`) }))
  ));

  const targets = buildParityTargets({ root, routeManifestPath, crawlResultsPath });

  assert(targets.length >= 23);
  assert(targets.every((target) => target.hash.startsWith("#/")));
  assert(targets.filter((target) => target.hasReference).length >= 23);

  console.log(JSON.stringify({
    targets: targets.length,
    references: targets.filter((target) => target.hasReference).length,
    status: "visual parity config passed"
  }, null, 2));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
