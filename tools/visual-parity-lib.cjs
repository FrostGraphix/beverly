"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function routeScreenshotName(route) {
  return `crawl-${slugify(route.group)}-${slugify(route.title)}.png`;
}

function buildParityTargets({ root, routeManifestPath, crawlResultsPath }) {
  const routes = readJson(routeManifestPath);
  const crawlResults = readJson(crawlResultsPath);
  const crawlByHref = new Map(crawlResults.map((entry) => [entry.href, entry]));

  return routes.map((route) => {
    const crawl = crawlByHref.get(route.hash);
    const screenshot = crawl?.screenshot || path.join(path.resolve(root, "..", "acob-crm3", "tmp"), routeScreenshotName(route));
    return {
      group: route.group,
      title: route.title,
      hash: route.hash,
      reference: screenshot,
      href: route.hash,
      hasReference: Boolean(crawl?.screenshot || fs.existsSync(screenshot))
    };
  });
}

function summarizeResults(results) {
  const desktop = results.filter((item) => item.mode === "desktop");
  const mobile = results.filter((item) => item.mode === "mobile");
  const desktopDiffs = desktop.filter((item) => typeof item.percentDifferent === "number");
  const mobileOverflows = mobile.filter((item) => item.overflow);
  const keyTargets = new Set(["Dashboard", "Credit Token", "Credit Token Record", "Account"]);
  const keyDesktop = desktopDiffs.filter((item) => keyTargets.has(item.title));
  const under5 = keyDesktop.every((item) => item.percentDifferent <= 5);
  const under10 = desktopDiffs.every((item) => item.percentDifferent <= 10);

  return {
    desktopCount: desktop.length,
    mobileCount: mobile.length,
    desktopCompared: desktopDiffs.length,
    mobileOverflowCount: mobileOverflows.length,
    keyPagesUnder5Percent: under5,
    allDesktopUnder10Percent: under10,
    worstDesktopDiff: desktopDiffs.sort((a, b) => (b.percentDifferent || 0) - (a.percentDifferent || 0))[0] || null
  };
}

module.exports = {
  buildParityTargets,
  routeScreenshotName,
  slugify,
  summarizeResults
};
