"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/components/StationConsumptionPage.vue"), "utf8");
const store = fs.readFileSync(path.join(root, "backend/src/services/consumption-store.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260722130000_consumption_tariff_snapshots.sql"), "utf8");
const refreshTargets = require("../backend/src/services/refresh-targets");

assert(page.includes("Avg / Customer"));
assert(page.includes("Avg / Station"));
assert(page.includes("Tariff valuation coverage"));
assert(page.includes("this.data?.valuation"));
assert(!page.includes("fetchTariffMap"));
assert(!page.includes("calculateConsumptionValue"));

assert(store.includes("basis: \"historical-snapshot\""));
assert(store.includes("consumptionValuation(0, 0, consumedKwh, consumedKwh)"));
assert(migration.includes("account_tariff_history"));
assert(migration.includes("tariff_rate_history"));
assert(migration.includes("unpriced_kwh <= 0.0005"));
assert(!migration.includes("from public.account_bindings ab"));

const accountTarget = refreshTargets.refreshTargets("hourly", new Date("2026-07-22T10:00:00Z"))
  .find((target) => target.name === "accounts");
const tariffTarget = refreshTargets.refreshTargets("hot", new Date("2026-07-22T10:00:00Z"))
  .find((target) => target.name === "tariffs");
assert.strictEqual(accountTarget.paginate, true);
assert.strictEqual(accountTarget.payload.pageSize, 500);
assert.strictEqual(tariffTarget.paginate, true);
assert.strictEqual(tariffTarget.payload.pageSize, 500);

console.log("station consumption valuation contract tests passed");
