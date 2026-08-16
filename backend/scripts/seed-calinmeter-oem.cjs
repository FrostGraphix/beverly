#!/usr/bin/env node
"use strict";
/**
 * One-time, idempotent seed for the Calinmeter OEM registry row.
 *
 * This is the "zero-regression migration" step from the OEM Hub plan: it makes
 * the multi-OEM proxy config-driven for Calinmeter WITHOUT changing what it
 * actually does — base URL / bearer token are copied from the exact env vars
 * already in use (LIVE_API_BASE_URL/LIVE_API_BEARER_TOKEN, falling back to
 * UPSTREAM_API_URL/UPSTREAM_BEARER_TOKEN, same priority api/reference.js uses).
 *
 * Safe to re-run: every upsert is keyed by a stable identifier (slug / oemId+
 * logicalKey / oemId+stationId), so re-running only refreshes values.
 *
 * Usage:
 *   node backend/scripts/seed-calinmeter-oem.cjs            # full seed
 *   node backend/scripts/seed-calinmeter-oem.cjs --skip-stations   # skip the
 *       live /api/station/read backfill call (useful with no network access)
 */

const path = require("path");
const { loadEnvFile } = require("../../tools/env-loader.cjs");

loadEnvFile();

const storage = require("../src/services/storage-adapter");
const { encryptSecret } = require("../src/services/oem-credential-crypto");
const { invalidateOemCache } = require("../src/services/oem-registry-service");
const contract = require(path.join("..", "..", "reference-contract.json"));

const CALINMETER_SLUG = "calinmeter";

// Paths that are Beverly's own internal aggregate/report endpoints, not raw
// Calinmeter passthroughs (per audit — these never reach the OEM upstream via
// proxyLive/candidatePaths at all, so seeding them as "OEM endpoints" would be
// misleading: editing them in the future Settings UI would have no effect).
const NON_OEM_PATH_PREFIXES = ["/api/local/", "/api/system/", "/api/reports/", "/api/wallet", "/api/v1/", "/api/auth/"];

// Mirrors requiresLiveRead() in api/reference.js — recorded here as metadata for
// the future endpoint-config-driven dispatch (Phase 3), not yet consumed by the
// live proxy path (which still uses its own hardcoded regex).
const REQUIRES_LIVE_READ_PATTERNS = [
  /\/api\/DailyDataMeter\/read$/i,
  /\/api\/DailyDataMeter\/export\.xlsx$/i,
  /\/api\/gateway\/read$/i,
  /\/api\/customer\/read$/i,
  /\/api\/account\/read$/i,
  /\/api\/RemoteMeterTask\/Get(?:Reading|Control)Task$/i
];

// Endpoints with real bespoke sanitize logic in api/reference.js's
// sanitizeLiveRequestData() today. adapterFnName is recorded now as the intended
// target name for Phase 3's calinmeter-adapter.js module (not created yet — the
// live proxy still calls sanitizeLiveRequestData() directly, unchanged).
const ADAPTER_FN_BY_PATH_PATTERN = [
  [/\/api\/DailyDataMeter\/(?:read|readMore|readMonthly)$/i, "sanitizeDailyMeterRead"],
  [/\/api\/customer\/read$/i, "sanitizeCustomerRead"],
  [/\/api\/account\/read$/i, "sanitizeAccountRead"],
  [/\/api\/RemoteMeterTask\/Get(?:Reading|Control|Token)Task$/i, "sanitizeRemoteTaskRead"]
];

const ALL_CAPABILITIES = {
  remote_meter_task: true,
  gprs_support: true,
  tariff_management: true,
  dlms_protocol: true,
  dlt645_protocol: true,
  firmware_update: true,
  event_notification: true,
  load_profile: true,
  wallet_vending: true
};

function isOemUpstreamPath(rawPath) {
  const normalized = String(rawPath || "");
  return !NON_OEM_PATH_PREFIXES.some((prefix) => normalized.toLowerCase().startsWith(prefix));
}

function deriveLogicalKey(endpoint) {
  if (endpoint.operationId) return endpoint.operationId;
  return String(endpoint.path || "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function casingVariantFor(rawPath) {
  return String(rawPath || "").startsWith("/API/") ? "pascal-api" : "lowercase-api";
}

function adapterFnNameFor(rawPath) {
  const match = ADAPTER_FN_BY_PATH_PATTERN.find(([pattern]) => pattern.test(rawPath));
  return match ? match[1] : "";
}

function requiresLiveReadFor(rawPath) {
  return REQUIRES_LIVE_READ_PATTERNS.some((pattern) => pattern.test(rawPath));
}

async function seedManufacturer() {
  const manufacturer = await storage.upsertOemManufacturer({
    slug: CALINMETER_SLUG,
    displayName: "Calinmeter",
    status: "active",
    isSeedDefault: true,
    capabilities: ALL_CAPABILITIES,
    vendingStrategy: "sts_token"
  });
  console.log(`[seed] oem_manufacturers upserted: id=${manufacturer.id} slug=${manufacturer.slug}`);
  return manufacturer;
}

async function seedCredentials(oemId) {
  const baseUrl = String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").trim().replace(/\/+$/, "");
  const bearerToken = String(process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "").trim();
  if (!baseUrl) {
    console.warn("[seed] no LIVE_API_BASE_URL/UPSTREAM_API_URL configured — oem_credentials.base_url will be empty. " +
      "The proxy will keep falling back to legacy env vars until this is set (zero regression either way).");
  }
  const credentials = await storage.upsertOemCredentials({
    oemId,
    authStrategy: "bearer_static",
    baseUrl,
    encryptedBearerToken: bearerToken ? encryptSecret(bearerToken) : "",
    encryptionKeyVersion: 1,
    updatedBy: "seed-calinmeter-oem"
  });
  console.log(`[seed] oem_credentials upserted for oem_id=${oemId} (baseUrl=${baseUrl ? "set" : "empty"}, token=${bearerToken ? "set" : "empty"})`);
  return credentials;
}

async function seedEndpointConfigs(oemId) {
  const endpoints = (contract.endpoints || []).filter((endpoint) => isOemUpstreamPath(endpoint.path));
  let count = 0;
  for (const endpoint of endpoints) {
    const logicalKey = deriveLogicalKey(endpoint);
    if (!logicalKey) continue;
    await storage.upsertOemEndpointConfig({
      oemId,
      logicalKey,
      upstreamPath: endpoint.path,
      method: endpoint.method === "GET" ? "GET" : "POST",
      casingVariant: casingVariantFor(endpoint.path),
      requiresLiveRead: requiresLiveReadFor(endpoint.path),
      adapterFnName: adapterFnNameFor(endpoint.path),
      paginationStyle: "none",
      enabled: true
    });
    count += 1;
  }
  console.log(`[seed] oem_endpoint_configs upserted: ${count} of ${contract.endpoints.length} contract entries (excluded ${contract.endpoints.length - count} Beverly-internal paths)`);
  return count;
}

async function seedStationMappings(oemId, credentials) {
  if (process.argv.includes("--skip-stations")) {
    console.log("[seed] --skip-stations passed, leaving oem_station_mappings untouched");
    return;
  }
  if (!credentials.baseUrl) {
    console.warn("[seed] no base URL configured — skipping live station backfill");
    return;
  }
  try {
    const response = await fetch(`${credentials.baseUrl}/api/station/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: credentials.encryptedBearerToken ? `Bearer ${require("../src/services/oem-credential-crypto").decryptSecret(credentials.encryptedBearerToken)}` : ""
      },
      body: JSON.stringify({ pageNumber: 1, pageSize: 500 })
    });
    if (!response.ok) {
      console.warn(`[seed] live /api/station/read returned ${response.status} — skipping station backfill (non-fatal)`);
      return;
    }
    const payload = await response.json();
    const resultData = payload?.result?.data;
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(resultData) ? resultData : Array.isArray(payload?.result) ? payload.result : [];
    let count = 0;
    for (const row of rows) {
      const stationId = String(row?.id || row?.stationId || row?.name || "").trim();
      if (!stationId) continue;
      await storage.upsertOemStationMapping({ oemId, stationId, communityLabel: String(row?.name || row?.remark || "") });
      count += 1;
    }
    console.log(`[seed] oem_station_mappings upserted: ${count} stations from live /api/station/read`);
  } catch (error) {
    console.warn("[seed] live station backfill failed (non-fatal):", error instanceof Error ? error.message : String(error));
    console.warn("[seed] this is expected when this machine can't reach the upstream network — the OEM Hub card will show 0 communities until it's re-run somewhere that can.");
  }
}

(async () => {
  console.log("[seed] seeding Calinmeter OEM registry (idempotent)...");
  const manufacturer = await seedManufacturer();
  const credentials = await seedCredentials(manufacturer.id);
  await seedEndpointConfigs(manufacturer.id);
  await seedStationMappings(manufacturer.id, credentials);
  invalidateOemCache(manufacturer.id);
  invalidateOemCache(manufacturer.slug);
  console.log("[seed] done.");
  process.exit(0);
})().catch((error) => {
  console.error("[seed] fatal:", error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
