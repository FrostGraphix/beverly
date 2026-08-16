import assert from 'node:assert/strict';
import { formatGatewayDuration, gatewayIsDown, updateGatewayHealth } from '../src/services/gateway-health.mjs';

const start = new Date('2026-07-14T08:00:00.000Z');
const offline = { gatewayId: 'GW-1', stationId: 'MUSHA', status: 'Offline', successRate: 0 };
assert.equal(gatewayIsDown(offline), true);

const first = updateGatewayHealth([offline], {}, start);
assert.equal(first.events[0].kind, 'down');
assert.equal(first.state['MUSHA::GW-1'].changedAt, start.toISOString());

const recovered = updateGatewayHealth(
  [{ ...offline, status: 'Online', successRate: 98 }],
  first.state,
  new Date('2026-07-14T10:35:00.000Z')
);
assert.equal(recovered.events[0].kind, 'recovered');
assert.equal(formatGatewayDuration(new Date(recovered.events[0].endedAt) - new Date(recovered.events[0].startedAt)), '2h 35m');

console.log('gateway-health ok');
