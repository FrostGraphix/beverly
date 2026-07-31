"use strict";

// Locks the four-way consumption visibility contract:
//   super-admin -> all stations
//   staff       -> assigned station(s) only, any staff role
//   vendor      -> exactly one station, meter-level within it
//   customer    -> own meters (registered UNION purchased)

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const service = read("backend/wallet/src/services/consumption.ts");
// Station scoping moved into its own module so the admin route groups share
// one definition; read both so the contract follows the rule, not the file.
const adminRoutes = read("backend/wallet/src/routes/admin.ts")
  + read("backend/wallet/src/routes/admin-station-scope.ts");
const vendorRoutes = read("backend/wallet/src/routes/vendor.ts");
const customerRoutes = read("backend/wallet/src/routes/customer.ts");
const authPlugin = read("backend/wallet/src/plugins/auth.ts");
const constants = read("backend/wallet/src/routes/admin-access-constants.ts");
const accessMigration = read("supabase/migrations/20260717120000_consumption_access_model.sql");
const pruneMigration = read("supabase/migrations/20260717130000_consumption_refresh_prune_orphans.sql");

// ── Authority is mandatory, not an optional filter ───────────────────────────
// Regression: queryConsumption used to take `scope_id?: string`, and
// scope='meter' with no scope_id applied NO filter -> every meter, every
// station. Authority must stay a required positional argument.
assert.match(
  service,
  /export async function queryConsumption\(\s*opts: ConsumptionQuery,\s*authority: ConsumptionAuthority,\s*\)/,
  "queryConsumption must take a REQUIRED authority argument"
);
assert.ok(
  service.includes("function isEmptyAuthority"),
  "an authority resolving to nothing must yield nothing"
);
for (const helper of ["allStations", "stationsAuthority", "metersAuthority"]) {
  assert.ok(service.includes(`export const ${helper}`), `service must export ${helper}`);
}
assert.ok(
  service.includes("query = query.in('station_id', authority.stationIds)")
  && service.includes("query = query.in('meter_id', authority.meterIds)"),
  "authority must be applied as a real .in() predicate"
);

// The blanket error swallow hid scoping failures behind an empty result.
assert.ok(
  !/catch\s*\{\s*return \[\];\s*\}/.test(service),
  "queryConsumption must not swallow every error into an empty array"
);

// Spend must be real, not a hardcoded zero presented as money.
assert.ok(service.includes("async function attachSpend"), "spend must be computed from purchase_orders");

// ── Energy value is distinct from wallet spend ──────────────────────────────
// Every consumption page rendered "₦0.00" because the service reported only
// wallet spend, while the aggregates already carried the tariff-valued
// consumption. Both numbers must reach the client, and stay separate.
assert.ok(
  service.includes("tariff_value_ngn") && service.includes("energy_value_minor"),
  "consumption rows must carry the stored tariff valuation"
);
assert.ok(
  service.includes("function nairaToMinor"),
  "the aggregate stores naira; the API must convert to minor units"
);
for (const [view, label] of [
  ["apps/admin/src/views/Consumption.vue", "admin"],
  ["apps/vendor/src/views/Consumption.vue", "vendor"],
  ["apps/customer/src/views/Consumption.vue", "customer"],
]) {
  const source = read(view);
  assert.ok(
    source.includes("energy_value_minor"),
    `${label} consumption page must show energy value, not only wallet spend`
  );
}

// ── Theme awareness ─────────────────────────────────────────────────────────
// `var(--surface-subtle, #f9f9f9)` is not a token — --surface-subtle is defined
// nowhere, so the light literal won in every dark theme and the expanded meter
// drawer rendered as a white slab. No consumption view may carry a hex literal
// as a custom-property fallback.
for (const [view, label] of [
  ["apps/admin/src/views/Consumption.vue", "admin"],
  ["apps/vendor/src/views/Consumption.vue", "vendor"],
  ["apps/customer/src/views/Consumption.vue", "customer"],
]) {
  const source = read(view);
  const fallbackHex = source.match(/var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\s*\)/g) ?? [];
  assert.deepEqual(
    fallbackHex, [],
    `${label} consumption page must not fall back to a hard-coded colour: ${fallbackHex.join(", ")}`
  );
  const undefinedTokens = source.match(/--surface-subtle|--surface-muted/g) ?? [];
  assert.deepEqual(
    undefinedTokens, [],
    `${label} consumption page references a token that does not exist: ${undefinedTokens.join(", ")}`
  );
}

// ── Admin: super-admin all, other staff scoped ──────────────────────────────
assert.ok(
  adminRoutes.includes("assignedStations ? stationsAuthority(assignedStations) : allStations()"),
  "admin consumption must grant allStations only when unassigned (super-admin)"
);
assert.match(
  adminRoutes,
  /function staffStations[\s\S]{0,220}role === 'super-admin'\) return null/,
  "staffStations must return null (all) only for super-admin"
);

// ── Every staff role may view consumption; station scope bounds them ────────
for (const role of ["finance-checker", "account"]) {
  const block = constants.slice(constants.indexOf(`'${role}'`) >= 0 ? constants.indexOf(`'${role}'`) : constants.indexOf(`${role}:`));
  assert.ok(
    block.slice(0, 400).includes("wallet.consumption.view"),
    `${role} must hold wallet.consumption.view (any assigned staff role sees consumption)`
  );
}

// ── Station picker reads the real registry, not a derived sample ────────────
// The admin picker preferred a list derived from the first 5000 reading rows
// unioned with vendor_organizations, so it showed onboarding fixtures
// ("SMOKE-STATION", "KADUNA") and ids-as-names. The OEM registry is the
// authority; the derivation is the fallback.
assert.match(
  adminRoutes,
  /source = await listStations\(\{ force \}\)/,
  "admin /stations must read the OEM station registry first"
);
assert.match(
  adminRoutes,
  /if \(!source\.length\) \{[\s\S]{0,600}listStoredStations\(\)/,
  "the derived station list must be a fallback, not the primary source"
);

// ── Vendor: exactly one station, from the actor, never the query string ─────
assert.ok(vendorRoutes.includes("fastify.get('/consumption'"), "vendor must expose /consumption");
// A route with no auth preHandler never populates req.actor, so its own
// vendorActorOrReply guard rejected every caller with 403 "Vendor user
// required." — the vendor consumption page could never load for anyone.
assert.match(
  vendorRoutes,
  /fastify\.get\('\/consumption', \{ preHandler: fastify\.requireVendor\(\) \}/,
  "vendor /consumption must authenticate, or req.actor is never set and every request 403s"
);
assert.ok(
  vendorRoutes.includes("fastify.get('/consumption', { preHandler: fastify.requireVendor() }"),
  "vendor consumption must authenticate before reading actor scope"
);
assert.ok(
  vendorRoutes.includes("stationsAuthority([actor.stationId])"),
  "vendor authority must come from the actor's assigned station"
);
assert.ok(
  vendorRoutes.includes("no_station_assigned"),
  "an unassigned vendor must get an explicit error, not a silent empty page"
);
assert.ok(
  authPlugin.includes("vendor_organizations(status, station_id)"),
  "auth must load the vendor's station onto the actor"
);

// ── Customer: registered UNION purchased ────────────────────────────────────
assert.ok(customerRoutes.includes("fastify.get('/consumption'"), "customer must expose /consumption");
assert.ok(
  customerRoutes.includes("metersAuthority(meterIds)"),
  "customer authority must be their own meter list"
);
assert.ok(
  customerRoutes.includes("from('customer_meters')") && customerRoutes.includes("from('purchase_orders')"),
  "customer meters must be registered UNION purchased"
);

// ── Vendor single-station schema + admin reassignment ───────────────────────
assert.match(accessMigration, /alter table public\.vendor_organizations\s+add column if not exists station_id text/);
assert.ok(accessMigration.includes("sync_vendor_station_columns"), "derived station columns must stay mirrored");
// vendor_organizations carries three station columns; a reassignment must not
// update one and leave the admin VendorDetail count reading a stale other.
for (const derived of ["station_ids_json", "operating_stations"]) {
  assert.ok(
    accessMigration.includes(`new.${derived}`),
    `${derived} must be derived from station_id by the sync trigger`
  );
}
assert.ok(adminRoutes.includes("fastify.patch('/vendors/:id/station'"), "admin must be able to reassign a vendor's station");
assert.ok(adminRoutes.includes("'PATCH /vendors/:id/station': 'wallet.vendors.manage'"), "station reassignment must require vendors.manage");
assert.ok(adminRoutes.includes("vendor.station_reassigned"), "station reassignment must be audited");
assert.ok(adminRoutes.includes("unknown_station"), "reassignment must reject stations that do not exist");

// ── RLS defence-in-depth on every consumption table ─────────────────────────
for (const table of ["meter_consumption_aggregates", "daily_meter_deltas"]) {
  assert.match(accessMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(accessMigration, new RegExp(`alter table public\\.${table} force row level security`));
  for (const audience of ["staff scope", "vendor scope", "customer scope", "service role"]) {
    assert.ok(
      accessMigration.includes(`on public.${table}`) && accessMigration.includes(audience),
      `${table} needs a ${audience} policy`
    );
  }
}
assert.ok(accessMigration.includes("current_vendor_station_id"), "vendor RLS helper required");
assert.ok(accessMigration.includes("current_customer_meter_ids"), "customer RLS helper required");

// ── Refresh must reconcile, not only append ────────────────────────────────
assert.ok(
  pruneMigration.includes("delete from public.daily_meter_deltas")
  && pruneMigration.includes("delete from public.meter_consumption_aggregates"),
  "refresh must prune orphaned rows or totals can only drift upward"
);
assert.ok(pruneMigration.includes("pruned_deltas"), "refresh must report what it pruned");

console.log(JSON.stringify({ status: "consumption access contract passed" }, null, 2));
