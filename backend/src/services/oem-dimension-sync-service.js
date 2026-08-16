"use strict";
/**
 * OEM-agnostic customer/account/meter dimension sync.
 *
 * Replaces the 2026-04-14 one-off token_transactions-derived backfill (see
 * supabase/migrations/20260806140000_oem_scoped_dimension_sync.sql for the full
 * root-cause writeup) with a real, re-runnable importer sourced directly from an
 * OEM's own customer/account/meter registry. Idempotent by construction: every
 * upsert is keyed on the (oem_id, upstream_id) unique constraint added by that
 * migration, so running this twice in a row never creates a duplicate row —
 * that's what makes this bug class structurally unable to repeat.
 *
 * Never deletes or touches a customers/accounts row that doesn't match an
 * upstream ID (additive/corrective only) — customers.id is referenced by 20+
 * live FKs (fraud engine, KYC, wallet notifications, support tickets,
 * customer_meters), many ON DELETE CASCADE, so pruning is out of scope here by
 * design, not oversight.
 *
 * Reusable for any future OEM (Sparkmeter/Ihemeter, per docs/OEM_HUB_STATUS.md):
 * pass a different oemSlug. Auth and endpoint-path resolution go through the
 * existing oem-registry-service abstraction (resolveOemConfig/resolveAuthHeader/
 * translateEndpointPathForOem), which already supports bearer_static,
 * bearer_login, oauth2_client_credentials, and api_key_header strategies. The
 * only Calinmeter-specific thing here is the UPSTREAM_USERNAME/UPSTREAM_PASSWORD
 * fallback login below, used only because oem_credentials for the seeded
 * Calinmeter row currently stores an empty bearer token (LIVE_API_BEARER_TOKEN/
 * UPSTREAM_BEARER_TOKEN were never set) — tracked as debt in the warning it logs.
 *
 * Field mapping is evidence-based, not guessed: verified live against
 * http://8.208.16.168:9310 on 2026-08-06.
 *   - /api/customer/read: {customerId, customerName, phone, address, stationId, status}
 *   - /api/account/read: {customerId, meterId, stationId, status} — NO distinct
 *     account-number field exists upstream; a "Calinmeter account" IS the
 *     (customerId, meterId) binding, confirmed against live sample rows before
 *     writing this. accounts.upstream_id is therefore the composite
 *     "<customerId>:<meterId>", and accounts.account_no (NOT NULL upstream)
 *     falls back to meterId, the closest human-facing identifier actually present.
 *   - /api/meter/read: {meterId, stationId, status} — one row per physical serial.
 *   - stationId -> Beverly site_code: confirmed live via oem_station_mappings vs.
 *     the `sites` table. Only KYAKALE/MUSHA/OGUFA/TUNGA/UMAISHA (lowercased) and
 *     "0001" (-> site_001) have a real Beverly site; everything else
 *     (admin/BONDU/KADUNA) has none and is left NULL rather than guessed.
 */

const supabase = require("./supabase-service");
const {
  resolveOemConfig,
  resolveAuthHeader,
  translateEndpointPathForOem,
  DEFAULT_OEM_SLUG
} = require("./oem-registry-service");

const PAGE_SIZE = 200;
const MAX_PAGES = 500; // safety cap against a runaway loop, not a real expected ceiling
const UPSERT_BATCH_SIZE = 500;

const SITE_CODE_OVERRIDES = { "0001": "site_001" };
let knownSiteCodesPromise = null;

async function loadSiteCodes() {
  if (!knownSiteCodesPromise) {
    knownSiteCodesPromise = supabase.restRequest("/sites?select=code").then((rows) => new Set(rows.map((row) => row.code)));
  }
  return knownSiteCodesPromise;
}

async function resolveSiteCode(stationId) {
  const raw = String(stationId || "").trim();
  if (!raw) return null;
  const sites = await loadSiteCodes();
  const override = SITE_CODE_OVERRIDES[raw];
  if (override && sites.has(override)) return override;
  const lower = raw.toLowerCase();
  return sites.has(lower) ? lower : null;
}

async function fallbackLogin(baseUrl) {
  const username = process.env.UPSTREAM_USERNAME;
  const password = process.env.UPSTREAM_PASSWORD;
  if (!username || !password) {
    throw new Error("No credential resolved from oem_credentials, and no UPSTREAM_USERNAME/UPSTREAM_PASSWORD fallback configured");
  }
  const response = await fetch(`${baseUrl}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ UserId: username, PassWord: password })
  });
  const body = await response.json().catch(() => ({}));
  const token = body?.result?.token || body?.data?.token;
  if (!response.ok || !token) {
    throw new Error(`Fallback login failed: HTTP ${response.status} ${body?.reason || body?.msg || ""}`);
  }
  return token;
}

async function resolveAuth(oemConfig, log) {
  const header = await resolveAuthHeader(oemConfig).catch(() => null);
  if (header) return header;
  if (!oemConfig.liveBaseUrl) throw new Error(`OEM ${oemConfig.slug} has no base URL configured`);
  log(`no usable credential in oem_credentials for "${oemConfig.slug}" (authStrategy=${oemConfig.authStrategy}); falling back to UPSTREAM_USERNAME/UPSTREAM_PASSWORD login. This debt should be closed by seeding a real login-strategy credential for this OEM.`);
  const token = await fallbackLogin(oemConfig.liveBaseUrl);
  return { name: "Authorization", value: `Bearer ${token}` };
}

async function fetchPage(oemConfig, authHeader, logicalPath, pageNumber) {
  const path = await translateEndpointPathForOem(oemConfig, logicalPath);
  const response = await fetch(`${oemConfig.liveBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", [authHeader.name]: authHeader.value },
    body: JSON.stringify({ pageNumber, pageSize: PAGE_SIZE })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.code !== 0) {
    throw new Error(`${logicalPath} page ${pageNumber} failed: HTTP ${response.status} ${body?.reason || body?.msg || ""}`);
  }
  const rows = body?.result?.data || body?.data?.data || [];
  const total = Number(body?.result?.total ?? body?.data?.total ?? rows.length);
  return { rows, total };
}

async function fetchAll(oemConfig, authHeader, logicalPath, label, log) {
  let all = [];
  let pageNumber = 1;
  while (pageNumber <= MAX_PAGES) {
    const { rows, total } = await fetchPage(oemConfig, authHeader, logicalPath, pageNumber);
    all = all.concat(rows);
    log(`${label} page ${pageNumber}: +${rows.length} (running ${all.length}/${total})`);
    if (rows.length === 0 || all.length >= total) break;
    pageNumber += 1;
  }
  return all;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function upsertBatch(table, onConflict, rows, dryRun) {
  if (!rows.length) return [];
  if (dryRun) return rows.map((row, index) => ({ ...row, id: `dry-run-${index}` }));
  let out = [];
  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const result = await supabase.restRequest(`/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: batch
    });
    out = out.concat(result);
  }
  return out;
}

async function syncCustomers(oemConfig, authHeader, dryRun, log) {
  const rows = await fetchAll(oemConfig, authHeader, "/api/customer/read", "customer/read", log);
  const payload = [];
  for (const row of rows) {
    const customerId = String(row.customerId || "").trim();
    if (!customerId) continue;
    payload.push({
      oem_id: oemConfig.oemId,
      upstream_id: customerId,
      upstream_customer_id: customerId,
      name: row.customerName || customerId,
      customer_name: row.customerName || null,
      phone: row.phone || null,
      address: row.address || null,
      site_code: await resolveSiteCode(row.stationId),
      status: row.status === false ? "inactive" : "active",
      source: "upstream",
      raw_payload: row
    });
  }
  const upserted = await upsertBatch("customers", "oem_id,upstream_id", payload, dryRun);
  const map = new Map();
  for (const row of upserted) map.set(String(row.upstream_id), row.id);
  log(`customers: ${upserted.length} upserted (of ${rows.length} fetched)`);
  return { map, fetched: rows.length, upserted: upserted.length };
}

async function syncAccounts(oemConfig, authHeader, customerMap, dryRun, log) {
  const rows = await fetchAll(oemConfig, authHeader, "/api/account/read", "account/read", log);
  const payload = [];
  const rowsByBindingKey = new Map();
  for (const row of rows) {
    const customerId = String(row.customerId || "").trim();
    const meterId = String(row.meterId || "").trim();
    if (!customerId || !meterId) continue;
    const upstreamId = `${customerId}:${meterId}`;
    rowsByBindingKey.set(upstreamId, row);
    payload.push({
      oem_id: oemConfig.oemId,
      upstream_id: upstreamId,
      upstream_account_id: upstreamId,
      customer_id: customerMap.get(customerId) || null,
      account_no: meterId,
      site_code: await resolveSiteCode(row.stationId),
      status: row.status === false ? "inactive" : "active",
      raw_payload: row
    });
  }
  const upserted = await upsertBatch("accounts", "oem_id,upstream_id", payload, dryRun);
  const idByBindingKey = new Map();
  for (const row of upserted) idByBindingKey.set(String(row.upstream_id), row.id);
  log(`accounts: ${upserted.length} upserted (of ${rows.length} fetched)`);
  return { idByBindingKey, rowsByBindingKey, fetched: rows.length, upserted: upserted.length };
}

async function syncMeters(oemConfig, authHeader, customerMap, accountsResult, dryRun, log) {
  const rows = await fetchAll(oemConfig, authHeader, "/api/meter/read", "meter/read", log);
  const bindingByMeterId = new Map();
  for (const row of accountsResult.rowsByBindingKey.values()) {
    bindingByMeterId.set(String(row.meterId), row);
  }
  const payload = [];
  for (const row of rows) {
    const meterId = String(row.meterId || "").trim();
    if (!meterId) continue;
    const binding = bindingByMeterId.get(meterId);
    const bindingKey = binding ? `${binding.customerId}:${binding.meterId}` : null;
    payload.push({
      oem_id: oemConfig.oemId,
      upstream_id: meterId,
      upstream_meter_id: meterId,
      meter_sn: meterId,
      account_id: bindingKey ? accountsResult.idByBindingKey.get(bindingKey) || null : null,
      customer_id: binding ? customerMap.get(String(binding.customerId)) || null : null,
      site_code: await resolveSiteCode(row.stationId),
      status: row.status === false ? "inactive" : "active",
      raw_payload: row
    });
  }
  const upserted = await upsertBatch("meters", "oem_id,upstream_id", payload, dryRun);
  log(`meters: ${upserted.length} upserted (of ${rows.length} fetched)`);
  return { fetched: rows.length, upserted: upserted.length };
}

/**
 * Syncs customers -> accounts -> meters (in that dependency order) for one OEM.
 * Returns a summary object; never throws for a normal "OEM has no data" case,
 * but does throw on auth/network failure so callers (cron route, CLI) can
 * surface the error rather than silently no-op.
 */
async function syncOemDimensions({ oemSlug = DEFAULT_OEM_SLUG, dryRun = false, log = () => {} } = {}) {
  const oemConfig = await resolveOemConfig(oemSlug);
  if (!oemConfig) throw new Error(`OEM not found in oem_manufacturers: ${oemSlug}`);
  if (!oemConfig.liveBaseUrl) {
    // Legacy env fallback -- kept only for the seeded Calinmeter row so this
    // matches the exact base-URL precedence api/reference.js already uses.
    oemConfig.liveBaseUrl = String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").trim().replace(/\/+$/, "");
  }
  if (!oemConfig.liveBaseUrl) throw new Error(`No base URL configured for OEM ${oemSlug} (checked oem_credentials, LIVE_API_BASE_URL, UPSTREAM_API_URL)`);

  const authHeader = await resolveAuth(oemConfig, log);

  log(`starting dimension sync — oem=${oemConfig.slug} (${oemConfig.oemId}) base=${oemConfig.liveBaseUrl}${dryRun ? " [DRY RUN]" : ""}`);

  const customers = await syncCustomers(oemConfig, authHeader, dryRun, log);
  const accounts = await syncAccounts(oemConfig, authHeader, customers.map, dryRun, log);
  const meters = await syncMeters(oemConfig, authHeader, customers.map, accounts, dryRun, log);

  log("done.");
  return {
    oemSlug: oemConfig.slug,
    oemId: oemConfig.oemId,
    dryRun,
    customers: { fetched: customers.fetched, upserted: customers.upserted },
    accounts: { fetched: accounts.fetched, upserted: accounts.upserted },
    meters: { fetched: meters.fetched, upserted: meters.upserted }
  };
}

module.exports = { syncOemDimensions };
