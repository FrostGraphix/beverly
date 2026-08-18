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
const adminRoutes = read("backend/wallet/src/routes/admin.ts");
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

// ── Vendor: exactly one station, from the actor, never the query string ─────
assert.ok(vendorRoutes.includes("fastify.get('/consumption'"), "vendor must expose /consumption");
assert.ok(
  vendorRoutes.includes("stationsAuthority([actor.stationId])"),
  "vendor authority must come from the actor's assigned station"
);
assert.ok(
  vendorRoutes.includes("no_station_assigned"),
  "an unassigned vendor must get an explicit error, not a silent empty page"
);
assert.ok(
  authPlugin.includes("vendor_organizations") && authPlugin.includes("station_id"),
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
