"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function testVercelFallbackRewrites() {
  const vercelJson = JSON.parse(read("vercel.json"));
  const vercelPreview = JSON.parse(read("vercel.preview.json"));

  const vercelFallback = vercelJson.rewrites.find((entry) => entry.source === "/((?!api/).*)");
  assert(vercelFallback, "vercel.json must have a catch-all fallback rewrite");
  assert.equal(
    vercelFallback.destination,
    "/wallet/index.html",
    "vercel.json fallback rewrite must point domain mismatches to /wallet/index.html (Wallet Landing), not Beverly CRM"
  );

  const previewFallback = vercelPreview.rewrites.find((entry) => entry.source === "/((?!api/).*)");
  assert(previewFallback, "vercel.preview.json must have a catch-all fallback rewrite");
  assert.equal(
    previewFallback.destination,
    "/wallet/index.html",
    "vercel.preview.json fallback rewrite must point domain mismatches to /wallet/index.html"
  );

  // Assert host matching rules evaluate before static app path rules
  const hostIndex = vercelJson.rewrites.findIndex((r) => Array.isArray(r.has) && r.has.some((h) => h.type === "host"));
  const walletPathIndex = vercelJson.rewrites.findIndex((r) => r.source === "/wallet");
  assert(hostIndex < walletPathIndex, "Host matching rules in vercel.json must evaluate before path rules");
  assert.ok(
    !vercelJson.rewrites.some((rule) => rule.has?.some((condition) => /\.\*/.test(String(condition.value || "")))),
    "Host matching must be exact; broad admin/vendor/customer regexes can hijack preview domains"
  );
}

function testCrmAppVueFallback() {
  const appVue = read("src/App.vue");

  assert.match(
    appVue,
    /if \(!nextHash\.startsWith\("#\/login"\) && !this\.routeExists\(nextHash\)\)/,
    "App.vue syncHash must catch unrecognized routes/domain mismatches"
  );
  assert.match(
    appVue,
    /window\.location\.hostname\}:5176\//,
    "App.vue fallback must redirect to Wallet Landing dev port (5176) in development"
  );
  assert.match(
    appVue,
    /window\.location\.origin\}\/wallet\//,
    "App.vue fallback must redirect to /wallet/ (Wallet Landing) in production"
  );
}

function main() {
  testVercelFallbackRewrites();
  testCrmAppVueFallback();

  console.log({
    status: "domain mismatch fallback contract passed",
    fallbackTarget: "/wallet/index.html",
    devTargetPort: 5176
  });
}

main();
