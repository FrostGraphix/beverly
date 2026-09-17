const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const meterRelocationService = require('../backend/src/services/meter-relocation-service');

test('meter-relocation-service: snapshot, relocate, verify, and rollback', async (t) => {
  let mockServer;
  let port;
  const requests = [];
  const state = {
    userStation: 'admin',
    meters: {
      '47005316774': {
        meterId: '47005316774',
        stationId: '0001',
        type: 0,
        isThreePhase: 0,
        communicationWay: 1,
        protocolVersion: '2.2',
        baseYear: 2014,
        sgc: '250405',
        krn: 1,
        ken: 255,
        ti: 1,
        kt: 0,
        status: true,
        remark: ''
      }
    },
    customers: {
      '47005316774': {
        customerId: '47005316774',
        customerName: 'Elias Nebeani',
        stationId: '0001',
        phone: null,
        address: '0001',
        certifiNo: 'P_056'
      }
    },
    accounts: {}
  };

  await new Promise((resolve) => {
    mockServer = http.createServer(async (req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        requests.push({ method: req.method, url: req.url, body: parsed, headers: req.headers });

        if (req.url === '/api/user/login') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: { token: 'mock-admin-token' } }));
        }

        if (req.url === '/api/user/update') {
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          if (row?.stationId) state.userStation = row.stationId;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: [{ userId: 'Beverly', stationId: state.userStation }] }));
        }

        if (req.url === '/api/meter/read') {
          const meterId = parsed?.meterId;
          const found = meterId ? state.meters[meterId] : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            code: 0,
            reason: 'success',
            result: {
              total: found ? 1 : 0,
              data: found ? [found] : []
            }
          }));
        }

        if (req.url === '/api/meter/delete') {
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          const meterId = row?.meterId;
          if (meterId && state.meters[meterId]) {
            delete state.meters[meterId];
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: [{ meterId }] }));
        }

        if (req.url === '/api/meter/create') {
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          const meterId = row?.meterId;
          state.meters[meterId] = {
            ...row,
            status: true
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: [state.meters[meterId]] }));
        }

        if (req.url === '/api/customer/read') {
          const custId = parsed?.customerId;
          const found = custId ? state.customers[custId] : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            code: 0,
            reason: 'success',
            result: {
              total: found ? 1 : 0,
              data: found ? [found] : []
            }
          }));
        }

        if (req.url === '/api/customer/update' || req.url === '/api/customer/create') {
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          const custId = row?.customerId;
          state.customers[custId] = { ...(state.customers[custId] || {}), ...row };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: [state.customers[custId]] }));
        }

        if (req.url === '/api/account/read') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: { total: 0, data: [] } }));
        }

        if (req.url === '/api/account/create') {
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          state.accounts[row.meterId] = row;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, reason: 'success', result: [row] }));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 404, reason: 'not found' }));
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      port = mockServer.address().port;
      resolve();
    });
  });

  t.after(() => {
    if (mockServer) mockServer.close();
  });

  await t.test('relocates meter from 0001 to OFEMILI with phone and pole updates', async () => {
    const oemConfig = {
      liveBaseUrl: `http://127.0.0.1:${port}`,
      credentials: {
        bearerToken: 'mock-super-token',
        password: 'mock-password'
      }
    };

    const res = await meterRelocationService.relocateMeter({
      meterId: '47005316774',
      toStation: 'OFEMILI',
      customerName: 'Elias Nebeani',
      phone: '07085558195',
      pole: '56',
      tariffId: '123'
    }, { oemConfig });

    assert.equal(res.ok, true, 'relocation should succeed');
    assert.equal(res.verified, true, 'readback verification should succeed');
    assert.equal(res.toStation, 'OFEMILI');
    assert.equal(res.fromStation, '0001');
    assert.equal(res.phone, '07085558195');
    assert.equal(res.pole, '56');

    // Verify upstream state
    assert.equal(state.meters['47005316774'].stationId, 'OFEMILI');
    assert.equal(state.meters['47005316774'].protocolVersion, '2.2');
    assert.equal(state.meters['47005316774'].sgc, '250405');
    assert.equal(state.meters['47005316774'].krn, 1);
    assert.equal(state.meters['47005316774'].ken, 255);
    assert.equal(state.meters['47005316774'].baseYear, 2014);
    assert.equal(state.customers['47005316774'].phone, '07085558195');
    assert.equal(state.customers['47005316774'].stationId, 'OFEMILI');
    assert.equal(state.customers['47005316774'].certifiNo, 'P_056');
    assert.equal(state.accounts['47005316774'].stationId, 'OFEMILI');
  });

  await t.test('same station update gracefully updates customer metadata without recreating meter', async () => {
    const oemConfig = {
      liveBaseUrl: `http://127.0.0.1:${port}`,
      credentials: {
        bearerToken: 'mock-super-token',
        password: 'mock-password'
      }
    };

    const res = await meterRelocationService.relocateMeter({
      meterId: '47005316774',
      toStation: 'OFEMILI', // Already in OFEMILI from previous test
      customerName: 'Elias Nebeani Updated',
      phone: '07085558199',
      pole: '58'
    }, { oemConfig });

    assert.equal(res.ok, true);
    assert.equal(res.unchangedStation, true);
    assert.equal(res.stationId, 'OFEMILI');
    assert.equal(state.customers['47005316774'].phone, '07085558199');
  });

  await t.test('relocateMeterBatch processes multiple meters with summary stats and custom operator user', async () => {
    state.meters['47005316709'] = {
      meterId: '47005316709',
      stationId: '0001',
      type: 0,
      protocolVersion: '2.2',
      sgc: '250405',
      krn: 1,
      baseYear: 2014
    };

    const oemConfig = {
      liveBaseUrl: `http://127.0.0.1:${port}`,
      credentials: {
        username: 'CustomOperator',
        bearerToken: 'mock-super-token',
        password: 'mock-password'
      }
    };

    const batchRes = await meterRelocationService.relocateMeterBatch([
      { meterId: '47005316774', toStation: 'OFEMILI', phone: '07085558195' },
      { meterId: '47005316709', toStation: 'OFEMILI', phone: '07032275772', customerName: 'Timothy Igwebuike' }
    ], { oemConfig });

    assert.equal(batchRes.success, true);
    assert.equal(batchRes.total, 2);
    assert.equal(batchRes.succeeded, 2);
    assert.equal(batchRes.failed, 0);
    assert.equal(state.meters['47005316709'].stationId, 'OFEMILI');
    assert.equal(state.meters['47005316709'].sgc, '250405');
  });
});
