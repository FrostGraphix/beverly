"use strict";

// Locks the fix for: "added a new station, not reflecting in the CRM."
//
// Root cause (proven, not guessed): the Station admin table's live read could
// silently fall back to a frozen static fixture (contracts/samples/api__station
// __read.json, last regenerated April 2026) whenever the live upstream call
// failed for any reason — no error, no banner, just stale data presented as
// current. This is uniquely dangerous for Station because its rows are
// actively mutated (Add/Edit/Delete) by admins who need to trust what they see.
//
// The fix has two halves that must both hold:
//   1. Backend: station/read can never again resolve to a stale fixture.
//   2. Frontend: ANY non-live source is visibly surfaced, not swallowed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ── Backend: station/read is excluded from sample fallback ─────────────────
const reference = read("api/reference.js");
const canUseSampleFallbackBody = reference.match(/function canUseSampleFallback\(pathname\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.ok(canUseSampleFallbackBody, "canUseSampleFallback must exist");
assert.ok(
  !/\/api\\\/station\\\/read/.test(canUseSampleFallbackBody),
  "canUseSampleFallback must NOT match /api/station/read — admin CRUD tables must fail loudly, not serve a frozen fixture"
);

// The physical fixture must be gone too — belt-and-suspenders. If it ever
// comes back, sampleReadResponse's own requiresLiveRead-independent catch-all
// would happily load it again regardless of the regex above.
assert.ok(
  !fs.existsSync(path.join(root, "contracts", "samples", "api__station__read.json")),
  "the frozen station fixture must not exist — its mere presence is a footgun for a mutable admin table"
);

// ── Frontend: any non-live source is visibly surfaced ───────────────────────
const tablePage = read("src/components/TablePage.vue");

assert.ok(
  /dataSource:\s*""/.test(tablePage),
  "TablePage must track the response's data source"
);
assert.ok(
  tablePage.includes("this.dataSource = table.meta?.source"),
  "load() must capture meta.source from every successful fetch — never carry over a stale value silently"
);
assert.match(
  tablePage,
  /isStaleFallback\(\)\s*\{[\s\S]*?src !== "live"/,
  "isStaleFallback must treat anything other than a confirmed live/verified source as not-live"
);
assert.ok(
  tablePage.includes('v-if="isStaleFallback"') && tablePage.includes("table-stale-banner"),
  "the template must render a visible banner whenever data is not confirmed live"
);
assert.ok(
  /table-stale-banner[\s\S]{0,500}@click="load"/.test(tablePage),
  "the stale-data banner must offer a one-click retry, not just a warning"
);
assert.ok(
  !/table-stale-banner[\s\S]{0,500}<button\b/.test(tablePage),
  "the banner's retry control must be BaseButton, not a raw <button> (design-system-hardening forbids raw controls)"
);

// The banner must never show while a fresh load is in flight, and must never
// stack with the hard-error banner — both are gated by isStaleFallback's own
// !this.loading / !this.errorMessage checks.
assert.ok(
  /isStaleFallback\(\)\s*\{[\s\S]*?!this\.loading[\s\S]*?!this\.errorMessage/.test(tablePage),
  "isStaleFallback must suppress the banner during loading and when a hard error banner is already shown"
);

console.log(JSON.stringify({ status: "station live-fallback contract passed" }, null, 2));
