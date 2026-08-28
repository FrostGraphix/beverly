"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("apps/wallet-landing/src/App.vue");
const coverage = read("apps/wallet-landing/src/components/CoverageSection.vue");
const journey = read("apps/wallet-landing/src/components/TestimonialsSection.vue");
const publicRoutes = read("backend/wallet/src/routes/public.ts");
const geography = read("backend/wallet/src/config/station-geography.ts");
const i18n = read("packages/tokens/i18n.js");

assert.doesNotMatch(app, /PartnersStrip/, "the removed partner marquee must stay removed");
assert.doesNotMatch(coverage, /\bDISCOS\b/, "coverage cannot use a static station list");
assert.match(coverage, /\/api\/v1\/public\/stations/, "coverage must load public live stations");
assert.match(coverage, /NigeriaCoverageMap/, "coverage must render the Nigeria states map");
assert.match(publicRoutes, /fastify\.get\('\/stations'/, "public live station route is required");
assert.match(publicRoutes, /listStationDirectory/, "public stations must use the live directory");

for (const station of ["MUSHA", "OGUFA", "KYAKALE", "UMAISHA", "TUNGA"]) {
  assert.match(geography, new RegExp(`${station}:[\\s\\S]*Nasarawa`));
}
for (const station of ["MILE 9 & 10", "BONDU"]) {
  assert.match(geography, new RegExp(`${station.replace(/[&]/g, "\\&")}['\"]?:[\\s\\S]*Ondo`));
}

for (const locale of ["en", "yo", "ha", "ig"]) {
  assert.match(i18n, new RegExp(`${locale}:[\\s\\S]*'landing\\.coverage\\.title'`));
  assert.match(i18n, new RegExp(`${locale}:[\\s\\S]*'landing\\.journey\\.title'`));
}

assert.match(journey, /landing\.journey\.step1Title/);
assert.match(journey, /lp-journey-grid/);
assert.ok(fs.statSync(path.join(root, "apps/wallet-landing/public/nigeria-states.geojson")).size > 1000);

console.log("wallet landing coverage sites passed");
