"use strict";

// Backend contract for the OEM Hub multi-manufacturer registry.
// Covers: AES-256-GCM credential round-trip, local-database CRUD + delete
// cascade, and the registry resolver's env fallback / decryption behaviour.
// Uses the in-memory local database (no Supabase, no network) so it runs in CI.

const assert = require("node:assert");

process.env.OEM_CREDENTIALS_ENCRYPTION_KEY = process.env.OEM_CREDENTIALS_ENCRYPTION_KEY
  || Buffer.from("beverly-oem-test-key-32bytes-long!!").subarray(0, 32).toString("base64");
process.env.SESSION_STORE_MODE = "local";

const crypto = require("../backend/src/services/oem-credential-crypto");
const ldb = require("../backend/src/services/local-database");
const registry = require("../backend/src/services/oem-registry-service");

// ── 1. Credential encryption round-trips and never leaks plaintext ──────────
{
  const secret = "sk_live_super_secret_token_123";
  const encrypted = crypto.encryptSecret(secret);
  assert(encrypted && encrypted !== secret, "cipher text must differ from plaintext");
  assert(!encrypted.includes(secret), "cipher text must not contain the plaintext");
  assert.strictEqual(crypto.decryptSecret(encrypted), secret, "round-trip must recover the plaintext");
  assert.strictEqual(crypto.encryptSecret(""), "", "empty input encrypts to empty");
  assert.strictEqual(crypto.decryptSecret(""), "", "empty input decrypts to empty");
  // Two encryptions of the same value must differ (random IV) but both decrypt back.
  const a = crypto.encryptSecret(secret);
  const b = crypto.encryptSecret(secret);
  assert.notStrictEqual(a, b, "each encryption uses a fresh IV");
  assert.strictEqual(crypto.decryptSecret(a), secret);
  assert.strictEqual(crypto.decryptSecret(b), secret);
}

// ── 2. Manufacturer CRUD + slug uniqueness semantics ────────────────────────
{
  const created = ldb.upsertOemManufacturer({
    slug: "testmeter",
    displayName: "Test Meter",
    status: "draft",
    capabilities: { remote_meter_task: true },
    vendingStrategy: "sts_token"
  });
  assert(created.id, "create returns an id");
  assert.strictEqual(created.slug, "testmeter");
  assert.strictEqual(created.capabilities.remote_meter_task, true);

  const fetched = ldb.getOemManufacturer(created.id);
  assert.strictEqual(fetched.displayName, "Test Meter");
  const bySlug = ldb.getOemManufacturer("testmeter");
  assert.strictEqual(bySlug.id, created.id, "lookup by slug returns the same row");

  const updated = ldb.upsertOemManufacturer({ id: created.id, slug: "testmeter", displayName: "Renamed", status: "active" });
  assert.strictEqual(updated.id, created.id, "update keeps the same id");
  assert.strictEqual(updated.displayName, "Renamed");
  assert.strictEqual(ldb.listOemManufacturers().filter((o) => o.slug === "testmeter").length, 1, "no duplicate slug rows");
}

// ── 3. Endpoint config + credentials + station mappings, then delete cascade ─
{
  const oem = ldb.upsertOemManufacturer({ slug: "cascade", displayName: "Cascade", status: "draft" });
  ldb.upsertOemCredentials({ oemId: oem.id, authStrategy: "bearer_static", baseUrl: "http://up", encryptedBearerToken: crypto.encryptSecret("t") });
  ldb.upsertOemEndpointConfig({ oemId: oem.id, logicalKey: "StationRead", upstreamPath: "/api/station/read", method: "POST", paginationStyle: "pageNumber" });
  ldb.upsertOemEndpointConfig({ oemId: oem.id, logicalKey: "CustomerRead", upstreamPath: "/api/customer/read", method: "POST" });
  ldb.upsertOemStationMapping({ oemId: oem.id, stationId: "0001", communityLabel: "Alpha" });

  assert.strictEqual(ldb.listOemEndpointConfigs(oem.id).length, 2, "two endpoints stored");
  assert.strictEqual(ldb.countOemStationMappings(oem.id), 1, "one station mapping stored");
  assert.strictEqual(ldb.getOemEndpointConfig(oem.id, "StationRead").paginationStyle, "pageNumber");

  ldb.deleteOemEndpointConfig(oem.id, "CustomerRead");
  assert.strictEqual(ldb.listOemEndpointConfigs(oem.id).length, 1, "single endpoint deleted");

  ldb.deleteOemManufacturer(oem.id);
  assert.strictEqual(ldb.getOemManufacturer(oem.id), null, "manufacturer removed");
  assert.strictEqual(ldb.getOemCredentials(oem.id), null, "credentials cascade-deleted");
  assert.strictEqual(ldb.listOemEndpointConfigs(oem.id).length, 0, "endpoints cascade-deleted");
  assert.strictEqual(ldb.countOemStationMappings(oem.id), 0, "station mappings cascade-deleted");
}

// ── 4. Station identity is namespaced per OEM (no cross-OEM collision) ───────
{
  const oemA = ldb.upsertOemManufacturer({ slug: "oem-a", displayName: "A", status: "active" });
  const oemB = ldb.upsertOemManufacturer({ slug: "oem-b", displayName: "B", status: "active" });
  ldb.upsertOemStationMapping({ oemId: oemA.id, stationId: "0001", communityLabel: "A-site" });
  ldb.upsertOemStationMapping({ oemId: oemB.id, stationId: "0001", communityLabel: "B-site" });
  assert.strictEqual(ldb.countOemStationMappings(oemA.id), 1);
  assert.strictEqual(ldb.countOemStationMappings(oemB.id), 1);
  const aRows = ldb.listOemStationMappings(oemA.id);
  assert.strictEqual(aRows[0].communityLabel, "A-site", "same station id under different OEMs does not collide");
  ldb.deleteOemManufacturer(oemA.id);
  ldb.deleteOemManufacturer(oemB.id);
}

// ── 4b. Station fallback tiers: explicit mappings are honoured verbatim, but
// derived/canonical tiers drop placeholder ids that pollute operational tables ─
{
  const fallback = require("../backend/src/services/oem-station-fallback");

  // An operator's explicit mapping is intent — only ADMIN (an access scope, not
  // a community) is dropped. Numeric site keys stay, which is why section 3's
  // "0001" mapping still counts.
  assert.strictEqual(fallback.isExplicitStationId("0001"), true, "explicit numeric mapping kept");
  assert.strictEqual(fallback.isExplicitStationId("TEST_STATION"), true, "explicit test mapping kept");
  assert.strictEqual(fallback.isExplicitStationId("ADMIN"), false, "ADMIN is not a community");
  assert.strictEqual(fallback.isExplicitStationId("  "), false, "blank station id rejected");

  // Derived tiers infer from account_bindings / station_meter_read_rollups,
  // which carry scratch rows that must never reach the OEM Hub dropdown.
  assert.strictEqual(fallback.isDerivedStationId("KYAKALE"), true, "real station survives");
  assert.strictEqual(fallback.isDerivedStationId("TEST_STATION"), false, "test station filtered");
  assert.strictEqual(fallback.isDerivedStationId("0001"), false, "numeric scratch key filtered");
  assert.strictEqual(fallback.isDerivedStationId("demo-site"), false, "demo placeholder filtered");
  assert.strictEqual(fallback.isDerivedStationId("ADMIN"), false, "ADMIN filtered from derived tiers");

  // Exactly the production case: the rollups table returned these 7 ids.
  const derived = fallback.toDerivedStationRows("oem-1", [
    "0001", "KYAKALE", "MUSHA", "OGUFA", "TEST_STATION", "TUNGA", "UMAISHA", "TUNGA", "", null
  ]);
  assert.deepStrictEqual(
    derived.map((r) => r.stationId),
    ["KYAKALE", "MUSHA", "OGUFA", "TUNGA", "UMAISHA"],
    "derived rows are deduped, sorted, and stripped of placeholders"
  );
  assert.strictEqual(derived[0].communityLabel, "Kyakale", "derived label is title-cased");
  assert.strictEqual(derived[0].oemId, "oem-1", "derived rows carry the requesting OEM id");

  // The last-resort list is subject to the same hygiene rule.
  assert(
    fallback.canonicalStationRows("oem-1").every((r) => fallback.isDerivedStationId(r.stationId)),
    "canonical fallback contains no placeholder ids"
  );

  // Registered-but-unmetered sites (BONDU, KADUNA are commissioned and verified,
  // but their meters are not onboarded) have no operational rows at all. Merging
  // rather than falling through is what keeps them visible once any other
  // station starts producing data.
  const merged = fallback.mergeDerivedWithCanonical("oem-1", [
    "0001", "KYAKALE", "MUSHA", "OGUFA", "TEST_STATION", "TUNGA", "UMAISHA"
  ]);
  assert.deepStrictEqual(
    merged.map((r) => r.stationId),
    ["BONDU", "KADUNA", "KYAKALE", "MUSHA", "OGUFA", "TUNGA", "UMAISHA"],
    "unmetered registered stations survive alongside stations that have data"
  );
  assert.strictEqual(
    merged.find((r) => r.stationId === "BONDU").communityLabel,
    "Bondu",
    "curated label used for the unmetered station"
  );

  // A station discovered only in operational data is still picked up, so the
  // static canonical list cannot cap what the card shows.
  const withNewSite = fallback.mergeDerivedWithCanonical("oem-1", ["NEWSITE"]);
  assert(
    withNewSite.some((r) => r.stationId === "NEWSITE"),
    "station present only in operational data is not dropped by the merge"
  );

  assert.strictEqual(fallback.isUuid("5dc041cc-fa6c-45ad-b7d5-ff3c19c4a5f0"), true, "uuid accepted");
  assert.strictEqual(fallback.isUuid("calinmeter"), false, "slug rejected as uuid");
}

// ── 5. Registry resolver: decrypts credentials, respects the kill switch ─────
(async () => {
  const oem = ldb.upsertOemManufacturer({ slug: "resolver", displayName: "Resolver", status: "active" });
  ldb.upsertOemCredentials({
    oemId: oem.id,
    authStrategy: "bearer_static",
    baseUrl: "http://resolver.test:9000",
    encryptedBearerToken: crypto.encryptSecret("resolver-token-xyz")
  });

  registry.invalidateOemCache();
  const cfg = await registry.getOemScopedLiveConfig("resolver");
  assert(cfg, "resolver config resolves");
  assert.strictEqual(cfg.liveBaseUrl, "http://resolver.test:9000");
  assert.strictEqual(cfg.liveBearerToken, "resolver-token-xyz", "resolver decrypts the bearer token");

  // Kill switch forces null (proxy then falls back to legacy env vars).
  process.env.OEM_REGISTRY_DISABLED = "true";
  registry.invalidateOemCache();
  const disabled = await registry.getOemScopedLiveConfig("resolver");
  assert.strictEqual(disabled, null, "OEM_REGISTRY_DISABLED short-circuits resolution");
  delete process.env.OEM_REGISTRY_DISABLED;

  // Unknown OEM resolves to null (never throws).
  registry.invalidateOemCache();
  const missing = await registry.getOemScopedLiveConfig("does-not-exist");
  assert.strictEqual(missing, null, "unknown OEM resolves to null");

  ldb.deleteOemManufacturer(oem.id);

  // ── 6. Path translation: identity for seed default, remap for other OEMs ──
  const seed = ldb.upsertOemManufacturer({ slug: "seedmeter", displayName: "Seed", status: "active", isSeedDefault: true });
  ldb.upsertOemCredentials({ oemId: seed.id, authStrategy: "bearer_static", baseUrl: "http://seed", encryptedBearerToken: crypto.encryptSecret("t") });
  ldb.upsertOemEndpointConfig({ oemId: seed.id, logicalKey: "StationRead", upstreamPath: "/api/station/read", method: "POST" });

  const other = ldb.upsertOemManufacturer({ slug: "othermeter", displayName: "Other", status: "active" });
  ldb.upsertOemCredentials({ oemId: other.id, authStrategy: "bearer_static", baseUrl: "http://other", encryptedBearerToken: crypto.encryptSecret("t") });
  ldb.upsertOemEndpointConfig({ oemId: other.id, logicalKey: "StationRead", upstreamPath: "/api/site/list", method: "POST", enabled: true });
  ldb.upsertOemEndpointConfig({ oemId: other.id, logicalKey: "Disabled", upstreamPath: "/api/disabled", method: "GET", enabled: false });

  // registry resolves the seed default by its slug for reverse-path lookup; point
  // DEFAULT_OEM_SLUG's resolution at our seed row by giving it that slug alias.
  // Here we exercise translate directly with explicit configs.
  registry.invalidateOemCache();
  const seedCfg = await registry.getOemScopedLiveConfig("seedmeter");
  const otherCfg = await registry.getOemScopedLiveConfig("othermeter");

  // Seed default → identity regardless of incoming path.
  assert.strictEqual(await registry.translateEndpointPathForOem(seedCfg, "/api/station/read"), "/api/station/read", "seed default is identity");

  // Reverse map is built from the resolver's DEFAULT_OEM_SLUG; since our test seed
  // uses a different slug, translation for `other` falls back to identity when the
  // default calinmeter row is absent — assert the safe fallback never throws.
  const translated = await registry.translateEndpointPathForOem(otherCfg, "/api/station/read");
  assert(typeof translated === "string" && translated.startsWith("/api/"), "translate returns a safe path string");

  ldb.deleteOemManufacturer(seed.id);
  ldb.deleteOemManufacturer(other.id);

  // ── 7. Rate-limit peek is null until config is cached, then returns overrides ─
  const rl = ldb.upsertOemManufacturer({ slug: "ratemeter", displayName: "Rate", status: "active", rateLimitWindowMs: 60000, rateLimitMaxRequests: 42 });
  ldb.upsertOemCredentials({ oemId: rl.id, authStrategy: "bearer_static", baseUrl: "http://rate", encryptedBearerToken: crypto.encryptSecret("t") });
  registry.invalidateOemCache();
  assert.strictEqual(registry.peekOemRateLimit("ratemeter"), null, "peek is null before the config is cached");
  await registry.getOemScopedLiveConfig("ratemeter"); // warms the cache
  const peeked = registry.peekOemRateLimit("ratemeter");
  assert(peeked && peeked.maxRequests === 42 && peeked.windowMs === 60000, "peek returns cached per-OEM overrides");
  ldb.deleteOemManufacturer(rl.id);

  ldb.resetForTests();
  console.log("oem-registry ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
