#!/usr/bin/env node
"use strict";
/**
 * CLI wrapper around backend/src/services/oem-dimension-sync-service.js — see
 * that module for the full root-cause writeup and field-mapping evidence.
 *
 * Usage:
 *   node backend/scripts/sync-oem-dimensions.cjs                # sync Calinmeter
 *   node backend/scripts/sync-oem-dimensions.cjs --oem=sparkmeter
 *   node backend/scripts/sync-oem-dimensions.cjs --dry-run       # fetch + map only, no writes
 */

const { loadEnvFile } = require("../../tools/env-loader.cjs");

loadEnvFile();

const { syncOemDimensions } = require("../src/services/oem-dimension-sync-service");

function oemSlugArg() {
  const match = process.argv.find((arg) => arg.startsWith("--oem="));
  return match ? match.split("=")[1] : undefined;
}

syncOemDimensions({
  oemSlug: oemSlugArg(),
  dryRun: process.argv.includes("--dry-run"),
  log: (message) => console.log(`[sync] ${message}`)
})
  .then((summary) => {
    console.log("[sync] summary:", JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("[sync] fatal:", error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
