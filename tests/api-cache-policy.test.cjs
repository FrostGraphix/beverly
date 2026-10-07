"use strict";

const assert = require("node:assert/strict");
const { cacheAdmission, MAX_ENTRY_BYTES, CACHE_TTL_MS } = require("../backend/src/services/api-cache-policy");
const { storagePressure, monitorDatabaseStorage } = require("../backend/src/services/data-governance");
const supabase = require("../backend/src/services/supabase-service");

const policy = { requiresLiveRead: (path) => path === "/api/DailyDataMeter/read",
  isWriteRequest: (_path, method) => method === "POST" };
const admit = (overrides = {}) => cacheAdmission({ pathname: "/api/report", method: "GET",
  status: 200, body: { ok: true }, ...policy, ...overrides });

assert.equal(admit({ pathname: "/api/DailyDataMeter/read" }), null);
assert.equal(admit({ method: "POST" }), null);
assert.equal(admit({ status: 500 }), null);
assert.equal(admit({ status: 0 }), null);
assert.equal(admit({ body: { data: "x".repeat(MAX_ENTRY_BYTES) } }), null);
const admitted = admit();
assert(admitted.bytes > 0);
assert(Math.abs(Date.parse(admitted.expiresAt) - Date.now() - CACHE_TTL_MS) < 2000);
assert.equal(storagePressure(350000000, 500, 70).warning, true);
assert.equal(storagePressure(349999999, 500, 70).warning, false);
assert.throws(() => storagePressure(undefined, 500, 70));
const originalRestRequest = supabase.restRequest;
const originalServiceConfigured = supabase.serviceConfigured;
const originalMode = process.env.SESSION_STORE_MODE;
const originalQuota = process.env.DATABASE_QUOTA_MB;
const calls = [];
supabase.serviceConfigured = () => true;
supabase.restRequest = async (path, options) => {
  calls.push({ path, options });
  if (path.includes("consumption_database_usage")) return { bytes: 400000000 };
  if (path.startsWith("/users?")) return [{ auth_user_id: "staff-1" }, { auth_user_id: "staff-1" }];
  return null;
};
process.env.SESSION_STORE_MODE = "supabase";
process.env.DATABASE_QUOTA_MB = "500";
monitorDatabaseStorage({ now: new Date("2026-10-07T00:00:00Z") }).then((result) => {
  assert.equal(result.notificationsCreated, 1);
  const notice = calls.find((call) => call.path.startsWith("/notifications?"));
  assert.equal(notice.options.body.dedupe_key, "database-storage:2026-10-07");
  assert.equal(notice.options.body.recipient_id, "staff-1");
  assert.equal(notice.options.prefer, "resolution=ignore-duplicates,return=minimal");
  console.log("API cache admission and storage pressure passed");
}).finally(() => {
  supabase.restRequest = originalRestRequest;
  supabase.serviceConfigured = originalServiceConfigured;
  if (originalMode == null) delete process.env.SESSION_STORE_MODE;
  else process.env.SESSION_STORE_MODE = originalMode;
  if (originalQuota == null) delete process.env.DATABASE_QUOTA_MB;
  else process.env.DATABASE_QUOTA_MB = originalQuota;
}).catch((error) => { console.error(error); process.exitCode = 1; });
