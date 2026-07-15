"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SECRET_KEY;

const {
  refreshGatewayHealth,
  resetGatewayHealthMemory,
} = require("../backend/src/services/gateway-health-service");

function gatewayResponse(status, updateDate) {
  return {
    status: 200,
    body: {
      code: 0,
      result: {
        total: 1,
        data: [{
          gatewayId: "GW-1",
          gatewayName: "Gateway One",
          stationId: "MUSHA",
          status,
          successRate: status ? 98 : 0,
          updateDate,
        }],
      },
    },
  };
}

(async () => {
  resetGatewayHealthMemory();
  const down = await refreshGatewayHealth({
    now: new Date("2026-07-14T08:00:00.000Z"),
    fetchPage: async () => gatewayResponse(false, "2026-07-14T07:59:00.000Z"),
  });
  assert.equal(down.gatewayCount, 1);
  assert.equal(down.events.length, 1);
  assert.equal(down.events[0].kind, "down");
  assert.equal(down.alerts[0].source, "live-gateway+memory");

  const unchanged = await refreshGatewayHealth({
    now: new Date("2026-07-14T08:01:00.000Z"),
    fetchPage: async () => gatewayResponse(false, "2026-07-14T08:00:30.000Z"),
  });
  assert.equal(unchanged.events.length, 0);
  assert.equal(unchanged.alerts[0].kind, "down");

  const recovered = await refreshGatewayHealth({
    now: new Date("2026-07-14T08:02:00.000Z"),
    fetchPage: async () => gatewayResponse(true, "2026-07-14T08:01:30.000Z"),
  });
  assert.equal(recovered.events.length, 1);
  assert.equal(recovered.events[0].kind, "recovered");
  assert.equal(recovered.events[0].startedAt, "2026-07-14T08:00:00.000Z");
  assert.equal(recovered.events[0].endedAt, "2026-07-14T08:02:00.000Z");

  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260714170000_gateway_health.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.gateway_health_state/);
  assert.match(migration, /create table if not exists public\.gateway_health_incidents/);
  assert.match(migration, /enable row level security/g);
  console.log("gateway-health-service ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
