const test = require('node:test');
const assert = require('node:assert/strict');

test('meter-relocation-ui-contract: route manifest, action helpers, and flow logic', async () => {
  const { routeManifest } = await import('../src/data/route-manifest.js');
  const { isMeterRelocateAction, validateRelocationForm, executeMeterRelocation } = await import('../src/services/meter-relocation-flow.mjs');
  const { rowActionButtons, isBatchCheckableRoute } = await import('../src/services/table-helpers.mjs');
  const { actionEndpoint } = await import('../src/services/action-service.mjs');

  // 1. Route manifest contract
  const meterRoute = routeManifest.find(r => r.hash === '#/admin/meter');
  assert.ok(meterRoute, 'Meter route #/admin/meter must exist in routeManifest');
  assert.ok(meterRoute.actions.includes('Move Station'), 'Meter route must include "Move Station" action');

  // 2. Action matcher helper
  assert.equal(isMeterRelocateAction(meterRoute, 'Move Station'), true);
  assert.equal(isMeterRelocateAction(meterRoute, 'Relocate'), true);
  assert.equal(isMeterRelocateAction(meterRoute, 'Edit'), false);
  assert.equal(isMeterRelocateAction({ hash: '#/admin/user' }, 'Move Station'), false);

  // 3. Row action buttons helper
  const meterRowButtons = rowActionButtons(meterRoute);
  assert.ok(meterRowButtons.includes('Move Station'), 'rowActionButtons must include "Move Station" for meter route');

  // 4. Batch checkable helper
  assert.equal(isBatchCheckableRoute(meterRoute), true, 'admin/meter route must be batch checkable');

  // 5. Action endpoint mapping
  const endpoint = actionEndpoint(meterRoute, 'Move Station');
  assert.equal(endpoint, '/api/local/meters/relocate', 'Move Station must map to /api/local/meters/relocate');

  // 6. Validation logic
  const errs1 = validateRelocationForm('', [{ meterId: '123' }]);
  assert.ok(errs1.length > 0, 'Should error on empty target station');
  assert.match(errs1[0], /Destination Station is required/i);

  const errs2 = validateRelocationForm('OFEMILI', []);
  assert.ok(errs2.length > 0, 'Should error on empty meters array');

  const errs3 = validateRelocationForm('OFEMILI', [{ meterId: '123' }]);
  assert.equal(errs3.length, 0, 'Valid inputs should have 0 validation errors');

  // 7. executeMeterRelocation progress & call contract
  const calls = [];
  const progressLogs = [];
  const mockApi = {
    async postApi(path, payload) {
      calls.push({ path, payload });
      return {
        code: 0,
        result: {
          success: true,
          total: payload.meters.length,
          succeeded: payload.meters.length,
          failed: 0,
          results: payload.meters.map(m => ({ meterId: m.meterId, ok: true, toStation: m.toStation }))
        }
      };
    }
  };

  const result = await executeMeterRelocation({
    meters: [{ meterId: '47005316774', stationId: '0001' }],
    targetStation: 'OFEMILI',
    customerName: 'Elias Nebeani',
    phone: '07085558195',
    pole: '56',
    tariffId: '123'
  }, mockApi, (prog) => {
    progressLogs.push(prog);
  });

  assert.equal(result.ok, true);
  assert.equal(result.succeeded, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/local/meters/relocate');
  assert.equal(calls[0].payload.meters[0].meterId, '47005316774');
  assert.equal(calls[0].payload.meters[0].toStation, 'OFEMILI');
  assert.equal(calls[0].payload.meters[0].phone, '07085558195');
  assert.ok(progressLogs.length >= 2, 'Progress callback should be invoked during flow');
});
