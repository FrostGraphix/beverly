"use strict";

const assert = require("assert");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

const supabase = require("../backend/src/services/supabase-service");
const service = require("../backend/src/services/tariff-snapshot-service");

assert.strictEqual(service.parseTariffPrice("350"), 350);
assert.strictEqual(service.parseTariffPrice("0~0~450"), 450);
assert.strictEqual(service.parseTariffPrice("0"), null);

const observedAt = new Date("2026-07-22T12:00:00.000Z");
const account = service.normalizeAccount({
  stationId: "tunga", meterId: "M-1", customerId: "C-1",
  customerName: "Ada", tariffId: "RESIDENTIAL",
  createDate: "2025-01-01 08:00:00", updateDate: "2026-02-11 09:30:00"
}, observedAt);
assert.strictEqual(account.history.effective_from, "2026-02-11");
assert.strictEqual(account.history.station_id, "TUNGA");

const tariff = service.normalizeTariff({
  tariffId: "RESIDENTIAL", stationId: "ADMIN", price: "350", tax: 7.5,
  updateDate: "2026-01-06 10:00:00"
}, observedAt);
assert.strictEqual(tariff.effective_from, "2026-01-06");
assert.strictEqual(tariff.station_scope, "*");
assert.strictEqual(tariff.effective_price_ngn, 376.25);
assert.strictEqual(tariff.is_valid, true);

const calls = [];
const original = supabase.restRequest;
supabase.restRequest = async (pathname, options) => calls.push({ pathname, options });

(async () => {
  await service.syncAccountRows([{
    stationId: "TUNGA", meterId: "M-1", customerId: "C-1",
    tariffId: "RESIDENTIAL", updateDate: "2026-02-11"
  }], { observedAt });
  await service.syncTariffRows([{
    tariffId: "RESIDENTIAL", price: "350", updateDate: "2026-01-06"
  }], { observedAt });

  assert(calls.some((call) => call.pathname.startsWith("/account_bindings?on_conflict=")));
  assert(calls.some((call) => call.pathname.startsWith("/account_tariff_history?on_conflict=")));
  assert(calls.some((call) => call.pathname.startsWith("/tariff_rate_history?on_conflict=")));
  assert(calls.every((call) => call.options.prefer.includes("resolution=merge-duplicates")));
  console.log("tariff snapshot service tests passed");
})().finally(() => {
  supabase.restRequest = original;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
