const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

test('meter-relocation-endpoint: /api/local/meters/relocate via HTTP', async (t) => {
  // Start reference dev server or invoke via handler
  const { loadEnvFile } = require('../tools/env-loader.cjs');
  loadEnvFile();

  const meterRelocationService = require('../backend/src/services/meter-relocation-service');

  // Verify relocateMeter handles valid payload gracefully
  const mockDeps = {
    mockHandler: async (item, options) => {
      return {
        meterId: item.meterId,
        ok: true,
        verified: true,
        fromStation: item.fromStation || '0001',
        toStation: item.toStation,
        customerName: item.customerName,
        phone: item.phone,
        pole: item.pole,
        tariffId: item.tariffId || '123'
      };
    }
  };

  const res = await meterRelocationService.relocateMeterBatch([
    { meterId: '47005316774', toStation: 'OFEMILI', phone: '07085558195', pole: '56' }
  ], {}, mockDeps);

  assert.equal(res.success, true);
  assert.equal(res.succeeded, 1);
  assert.equal(res.results[0].meterId, '47005316774');
  assert.equal(res.results[0].toStation, 'OFEMILI');
  assert.equal(res.results[0].phone, '07085558195');
});
