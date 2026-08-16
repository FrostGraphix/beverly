#!/usr/bin/env node
"use strict";
/**
 * Pre-stages draft OEM records for manufacturers whose real credentials aren't
 * available yet, so the moment they arrive, onboarding is "open Settings, paste
 * in the base URL + token, fill in real paths for the starter checklist" — not
 * "start from a blank Add-OEM form."
 *
 * What this creates, per OEM:
 *   - An `oem_manufacturers` row, status='draft', with capability defaults that
 *     are reasonable guesses for a generic prepaid-meter manufacturer (adjust
 *     once the real OEM's actual feature set is confirmed).
 *   - A STARTER ENDPOINT CHECKLIST: one `oem_endpoint_configs` row per core
 *     logical key (station/customer/account/meter/tariff reads, dashboard
 *     panels, credit token generate, remote meter tasks — the set that powers
 *     the CRM's baseline pages), with a BLANK upstreamPath and enabled=false.
 *     The Settings → API endpoints table then reads as a fill-in-the-blanks
 *     form instead of "add endpoint" from zero for every single operation.
 *     Logical keys deliberately match Calinmeter's own (see
 *     seed-calinmeter-oem.cjs's deriveLogicalKey — these are contract
 *     operationIds), since table-service.js's dispatch layer and the proxy's
 *     translateEndpointPathForOem() both key off the shared logical key.
 *   - No credentials row (none exist yet) — the Settings page's connection
 *     form loads empty, ready to paste into.
 *
 * Safe to re-run: every upsert is keyed by slug / (oemId, logicalKey).
 *
 * Usage:
 *   node backend/scripts/prestage-draft-oems.cjs                 # both OEMs
 *   node backend/scripts/prestage-draft-oems.cjs --only=sparkmeter
 *   node backend/scripts/prestage-draft-oems.cjs --only=ihemeter
 */

const { loadEnvFile } = require("../../tools/env-loader.cjs");
loadEnvFile();

const storage = require("../src/services/storage-adapter");
const { invalidateOemCache } = require("../src/services/oem-registry-service");

// Conservative defaults for a generic prepaid-meter OEM — enable what's almost
// certainly needed (core reads, tariffs, wallet vending, STS credit tokens),
// leave protocol/remote-support specifics off until the real OEM's docs confirm
// them. Edit directly in the Add/Edit OEM modal once known, or here before running.
const DEFAULT_CAPABILITIES = {
  remote_meter_task: true,
  tariff_management: true,
  wallet_vending: true,
  gprs_support: false,
  dlms_protocol: false,
  dlt645_protocol: false,
  firmware_update: false,
  event_notification: false,
  load_profile: false
};

// The starter checklist: core logical keys that power the CRM's baseline pages
// (Dashboard, Management tables, Token Generate, Remote Operation Task). Method
// mirrors what Calinmeter's contract uses for the same operation (see
// reference-contract.json) — almost every read in this API family is POST, not
// GET, which is unusual but consistent across the whole contract.
const STARTER_ENDPOINT_CHECKLIST = [
  { logicalKey: "ReadStation", method: "POST", note: "Station/site list — powers the site filter used across most pages" },
  { logicalKey: "ReadCustomer", method: "POST", note: "Customer list — Management > Customer" },
  { logicalKey: "ReadAccount", method: "POST", note: "Meter-account bindings — Management > Account, Token Generate" },
  { logicalKey: "ReadMeter", method: "POST", note: "Meter registry — Administration > Meter" },
  { logicalKey: "ReadTariff", method: "POST", note: "Tariff/pricing plans — Management > Tariff" },
  { logicalKey: "ReadGateway", method: "POST", note: "Gateway/concentrator list — Management > Gateway" },
  { logicalKey: "ReadUser", method: "POST", note: "OEM-side user list — Administration > User" },
  { logicalKey: "ReadItem", method: "POST", note: "Item/product catalog — Administration > Item" },
  { logicalKey: "ReadItemList", method: "POST", note: "Item list (paged) — used by Token Generate/Tariff dropdowns" },
  { logicalKey: "ReadPanelGroup", method: "POST", note: "Dashboard summary KPI panel" },
  { logicalKey: "ReadLineChart", method: "POST", note: "Dashboard trend chart" },
  { logicalKey: "GenerateCreditToken", method: "POST", note: "Core vending operation — STS credit token generation" },
  { logicalKey: "ReadCreditTokenRecord", method: "POST", note: "Token Record > Credit Token Record" },
  { logicalKey: "GetReadingTask", method: "POST", note: "Remote Operation Task > Meter Reading Task" },
  { logicalKey: "GetControlTask", method: "POST", note: "Remote Operation Task > Meter Control Task" },
  { logicalKey: "GetTokenTask", method: "POST", note: "Remote Operation Task > Meter Token Task" },
  { logicalKey: "ReadDailyDataMeter", method: "POST", note: "Data Report > Interval Data / Consumption Statistics" }
];

const DRAFT_OEMS = [
  { slug: "sparkmeter", displayName: "Sparkmeter" },
  { slug: "ihemeter", displayName: "Ihemeter" }
];

function parseOnlyFilter() {
  const arg = process.argv.find((value) => value.startsWith("--only="));
  return arg ? arg.slice("--only=".length).toLowerCase() : null;
}

async function prestageOem({ slug, displayName }) {
  const manufacturer = await storage.upsertOemManufacturer({
    slug,
    displayName,
    status: "draft",
    isSeedDefault: false,
    capabilities: DEFAULT_CAPABILITIES,
    vendingStrategy: "sts_token"
  });
  console.log(`[prestage] ${displayName}: oem_manufacturers upserted (id=${manufacturer.id}, status=draft)`);

  let created = 0;
  for (const entry of STARTER_ENDPOINT_CHECKLIST) {
    await storage.upsertOemEndpointConfig({
      oemId: manufacturer.id,
      logicalKey: entry.logicalKey,
      upstreamPath: "",
      method: entry.method,
      casingVariant: "",
      paginationStyle: "none",
      enabled: false,
      adapterFnName: ""
    });
    created += 1;
  }
  console.log(`[prestage] ${displayName}: starter checklist seeded (${created} logical keys, blank paths, disabled until filled in)`);

  invalidateOemCache(manufacturer.id);
  invalidateOemCache(manufacturer.slug);
  return manufacturer;
}

(async () => {
  const only = parseOnlyFilter();
  const targets = only ? DRAFT_OEMS.filter((oem) => oem.slug === only) : DRAFT_OEMS;
  if (!targets.length) {
    console.error(`[prestage] --only=${only} matched no known draft OEM (expected one of: ${DRAFT_OEMS.map((o) => o.slug).join(", ")})`);
    process.exit(1);
  }
  console.log(`[prestage] pre-staging ${targets.map((t) => t.displayName).join(", ")}...`);
  for (const target of targets) {
    await prestageOem(target);
  }
  console.log("[prestage] done. Each OEM shows as a Draft card in the Hub now.");
  console.log("[prestage] when real credentials arrive: open its Settings → paste Base URL/token → Test Connection → fill in the starter checklist's blank paths with real ones → flip Enabled → Save.");
  process.exit(0);
})().catch((error) => {
  console.error("[prestage] fatal:", error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
