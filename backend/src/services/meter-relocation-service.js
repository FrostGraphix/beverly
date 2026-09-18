const { loadEnvFile } = require('../../../tools/env-loader.cjs');
loadEnvFile();

const { restRequest } = require('./supabase-service');
const { upsertMeterRecord } = require('./storage-adapter');
const oemRegistry = require('./oem-registry-service');

const DEFAULT_CALINMETER_OEM_ID = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';

function getLiveCredentials(oemConfig = null) {
  const liveBaseUrl = (
    oemConfig?.liveBaseUrl ||
    process.env.LIVE_API_BASE_URL ||
    process.env.UPSTREAM_API_URL ||
    ''
  ).replace(/\/+$/, '');

  const superToken =
    oemConfig?.credentials?.bearerToken ||
    process.env.UPSTREAM_BEARER_TOKEN ||
    '';

  const password =
    oemConfig?.credentials?.password ||
    process.env.UPSTREAM_PASSWORD ||
    '';

  const username =
    oemConfig?.credentials?.username ||
    process.env.UPSTREAM_USERNAME ||
    'Beverly';

  return { liveBaseUrl, superToken, password, username };
}

async function getAdminToken(baseUrl, password) {
  if (!password || !baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ UserId: 'admin', PassWord: password })
    });
    const data = await res.json();
    return data?.result?.token || null;
  } catch (err) {
    console.warn('[meter-relocation] Failed to get admin token:', err.message);
    return null;
  }
}

async function snapshotMeter(meterId, baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: String(meterId).trim() })
  });
  const data = await res.json();
  const meter = data?.result?.data?.[0] || null;

  // Also query existing customer & account if present
  let customer = null;
  let account = null;
  try {
    const cRes = await fetch(`${baseUrl}/api/customer/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, customerId: String(meterId).trim() })
    });
    customer = (await cRes.json())?.result?.data?.[0] || null;
  } catch (_) {}

  try {
    const aRes = await fetch(`${baseUrl}/api/account/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: String(meterId).trim() })
    });
    account = (await aRes.json())?.result?.data?.[0] || null;
  } catch (_) {}

  return { meter, customer, account };
}

async function switchOperatorStation(stationId, baseUrl, superToken, username = 'Beverly') {
  if (!stationId) return { ok: false, error: 'stationId required' };
  const res = await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: username || 'Beverly',
      roleId: 'admin',
      stationId: String(stationId).trim(),
      status: true,
      quota: 0,
      remainingQuota: -1,
      totalQuota: 0
    }])
  });
  const data = await res.json();
  return { ok: data?.code === 0 || data?.code === 200 || data?.reason === 'success', data };
}

async function deleteMeterFromStation(meterId, originStation, baseUrl, superToken, username = 'Beverly') {
  if (originStation) {
    await switchOperatorStation(originStation, baseUrl, superToken, username);
  }
  const res = await fetch(`${baseUrl}/api/meter/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
    body: JSON.stringify([{ meterId: String(meterId).trim() }])
  });
  const data = await res.json();
  return { ok: data?.code === 0 || data?.code === 200 || data?.reason === 'success', data };
}

async function createMeterInTargetStation(meter, toStation, remark, baseUrl, superToken, username = 'Beverly') {
  await switchOperatorStation(toStation, baseUrl, superToken, username);
  const payload = [{
    meterId: String(meter.meterId).trim(),
    type: meter?.type ?? 0,
    isThreePhase: meter?.isThreePhase ?? 0,
    communicationWay: meter?.communicationWay ?? 1,
    protocolVersion: meter?.protocolVersion ?? '2.2',
    stationId: String(toStation).trim(),
    baseYear: meter?.baseYear ?? 2014,
    sgc: meter?.sgc ?? '250405',
    krn: meter?.krn ?? 1,
    ken: meter?.ken ?? 255,
    ti: meter?.ti ?? 1,
    kt: meter?.kt ?? 0,
    baseYearNew: meter?.baseYearNew ?? meter?.baseYear ?? 2014,
    sgcNew: meter?.sgcNew ?? meter?.sgc ?? '250405',
    krnNew: meter?.krnNew ?? meter?.krn ?? 1,
    kenNew: meter?.kenNew ?? meter?.ken ?? 255,
    tiNew: meter?.tiNew ?? meter?.ti ?? 1,
    ktNew: meter?.ktNew ?? meter?.kt ?? 0,
    lat: meter?.lat ?? 0,
    lng: meter?.lng ?? 0,
    remark: remark || meter?.remark || `Moved to ${toStation}`
  }];

  const res = await fetch(`${baseUrl}/api/meter/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: data?.code === 0 || data?.code === 200 || data?.reason === 'success', data };
}

async function updateOrCreateCustomer(meterId, customerName, phone, pole, toStation, baseUrl, superToken, adminToken) {
  const remark = [pole ? `Pole: ${pole}` : '', phone ? `Phone: ${phone}` : ''].filter(Boolean).join(', ') || `Customer in ${toStation}`;
  const certifiNo = pole ? (pole.startsWith('P_') ? pole : `P_${String(pole).padStart(3, '0')}`) : null;

  // Check if customer exists
  let existingCust = null;
  try {
    const cRes = await fetch(`${baseUrl}/api/customer/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken || superToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, customerId: String(meterId).trim() })
    });
    existingCust = (await cRes.json())?.result?.data?.[0] || null;
  } catch (_) {}

  const custPayload = [{
    customerId: String(meterId).trim(),
    customerName: customerName || existingCust?.customerName || String(meterId).trim(),
    type: 0,
    phone: phone || existingCust?.phone || null,
    address: toStation,
    certifiName: null,
    certifiNo: certifiNo || existingCust?.certifiNo || null,
    stationId: toStation,
    remark: remark || existingCust?.remark || null
  }];

  if (existingCust) {
    const uRes = await fetch(`${baseUrl}/api/customer/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify(custPayload)
    });
    const uData = await uRes.json();
    return { ok: uData?.code === 0 || uData?.code === 200 || uData?.reason === 'success', data: uData };
  } else {
    const cRes = await fetch(`${baseUrl}/api/customer/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify(custPayload)
    });
    const cData = await cRes.json();
    return { ok: cData?.code === 0 || cData?.code === 200 || cData?.reason === 'success', data: cData };
  }
}

async function bindAccount(meterId, customerName, tariffId, toStation, remark, baseUrl, superToken) {
  const accPayload = [{
    customerId: String(meterId).trim(),
    customerName: customerName || String(meterId).trim(),
    meterId: String(meterId).trim(),
    tariffId: String(tariffId || '123').trim(),
    ctRatio: '1',
    communicationWay: 1,
    meterType: 0,
    protocolVersion: '2.2',
    stationId: String(toStation).trim(),
    remark: remark || `Bound to ${toStation}`
  }];

  const res = await fetch(`${baseUrl}/api/account/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
    body: JSON.stringify(accPayload)
  });
  const data = await res.json();
  return { ok: data?.code === 0 || data?.code === 200 || data?.reason === 'success', data };
}

async function verifyMeter(meterId, expectedStation, baseUrl, adminToken) {
  const res = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: String(meterId).trim() })
  });
  const data = await res.json();
  const meter = data?.result?.data?.[0] || null;
  const verified = meter && meter.stationId === expectedStation;
  return { verified, meter };
}

async function syncToSupabase(entry, toStation, oemId) {
  const meterId = String(entry.meterId).trim();
  const remark = [entry.pole ? `Pole: ${entry.pole}` : '', entry.phone ? `Phone: ${entry.phone}` : ''].filter(Boolean).join(', ') || entry.remark || `Moved to ${toStation}`;

  try {
    await upsertMeterRecord({
      oemId: oemId || DEFAULT_CALINMETER_OEM_ID,
      meterId,
      siteCode: toStation,
      stationId: toStation,
      status: 'active',
      remark,
      type: entry.meter?.type ?? 0,
      isThreePhase: entry.meter?.isThreePhase ?? 0,
      communicationWay: entry.meter?.communicationWay ?? 1,
      protocolVersion: entry.meter?.protocolVersion ?? '2.2',
      baseYear: entry.meter?.baseYear ?? 2014,
      sgc: entry.meter?.sgc ?? '250405',
      krn: entry.meter?.krn ?? 1,
      ken: entry.meter?.ken ?? 255,
      ti: entry.meter?.ti ?? 1,
      kt: entry.meter?.kt ?? 0
    });
  } catch (err) {
    console.warn('[meter-relocation] Supabase meter sync warning:', err.message);
  }

  if (entry.customerName || entry.phone) {
    try {
      const custPayload = [{
        oem_id: oemId || DEFAULT_CALINMETER_OEM_ID,
        upstream_id: meterId,
        upstream_customer_id: meterId,
        name: entry.customerName || meterId,
        customer_name: entry.customerName || meterId,
        phone: entry.phone || null,
        address: toStation,
        raw_payload: {
          customerId: meterId,
          customerName: entry.customerName || meterId,
          phone: entry.phone || null,
          stationId: toStation,
          address: toStation,
          certifiNo: entry.pole ? (entry.pole.startsWith('P_') ? entry.pole : `P_${String(entry.pole).padStart(3, '0')}`) : null,
          remark
        }
      }];
      await restRequest('/customers?on_conflict=oem_id,upstream_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: custPayload
      });
    } catch (err) {
      console.warn('[meter-relocation] Supabase customer sync warning:', err.message);
    }
  }
}

async function relocateMeter(item, options = {}, injectedDeps = {}) {
  const meterId = String(item.meterId || item.meter_sn || '').trim();
  const toStation = String(item.toStation || item.stationId || '').trim();
  const oemId = item.oemId || options.oemId || DEFAULT_CALINMETER_OEM_ID;

  if (!meterId) {
    return { meterId, ok: false, error: 'meterId is required' };
  }
  if (!toStation) {
    return { meterId, ok: false, error: 'target stationId is required' };
  }

  // Dependency injection support for isolated test harnesses
  if (injectedDeps.mockHandler) {
    return await injectedDeps.mockHandler(item, options);
  }

  const { liveBaseUrl, superToken, password, username } = getLiveCredentials(options.oemConfig);
  if (!liveBaseUrl || !superToken) {
    return { meterId, ok: false, error: 'Live API credentials not configured for meter relocation.' };
  }

  const adminToken = (await getAdminToken(liveBaseUrl, password)) || superToken;

  try {
    // 1. Snapshot
    const { meter, customer, account } = await snapshotMeter(meterId, liveBaseUrl, adminToken);
    if (!meter) {
      return { meterId, ok: false, error: `Meter ${meterId} was not found on upstream Calinmeter.` };
    }

    const fromStation = item.fromStation || meter.stationId;
    if (fromStation === toStation) {
      // If already in target station, update metadata / customer details directly
      const remark = [item.pole ? `Pole: ${item.pole}` : '', item.phone ? `Phone: ${item.phone}` : ''].filter(Boolean).join(', ') || item.remark || meter.remark;
      if (item.customerName || item.phone || item.pole) {
        await updateOrCreateCustomer(meterId, item.customerName || customer?.customerName, item.phone || customer?.phone, item.pole, toStation, liveBaseUrl, superToken, adminToken);
      }
      await syncToSupabase({ ...item, meter }, toStation, oemId);
      return {
        meterId,
        ok: true,
        unchangedStation: true,
        stationId: toStation,
        fromStation,
        message: `Meter ${meterId} is already in station ${toStation}. Customer details updated.`
      };
    }

    // 2. Unregister from origin station
    const deleteResult = await deleteMeterFromStation(meterId, fromStation, liveBaseUrl, superToken, username);
    if (!deleteResult.ok) {
      console.warn(`[meter-relocation] Delete from origin warning:`, deleteResult.data?.reason || deleteResult.data);
    }

    // 3. Register in target station
    const remark = [item.pole ? `Pole: ${item.pole}` : '', item.phone ? `Phone: ${item.phone}` : ''].filter(Boolean).join(', ') || item.remark || `Moved to ${toStation}`;
    const createResult = await createMeterInTargetStation(meter, toStation, remark, liveBaseUrl, superToken, username);
    if (!createResult.ok) {
      // Rollback attempt if creation fails
      try {
        await createMeterInTargetStation(meter, fromStation, meter.remark, liveBaseUrl, superToken, username);
      } catch (_) {}
      return { meterId, ok: false, error: `Failed to register meter in station ${toStation}: ${createResult.data?.reason || 'Unknown error'}` };
    }

    // 4. Update or create Customer if requested
    const custName = item.customerName || customer?.customerName;
    const phone = item.phone || customer?.phone;
    const pole = item.pole;
    if (custName || phone || pole || options.updateCustomer) {
      await updateOrCreateCustomer(meterId, custName, phone, pole, toStation, liveBaseUrl, superToken, adminToken);
    }

    // 5. Bind Account if requested / existing
    const tariffId = item.tariffId || account?.tariffId || '123';
    if (options.bindAccount !== false) {
      await bindAccount(meterId, custName, tariffId, toStation, remark, liveBaseUrl, superToken);
    }

    // 6. Live Readback Verification
    const { verified, meter: verifiedMeter } = await verifyMeter(meterId, toStation, liveBaseUrl, adminToken);

    // 7. Supabase CRM Sync
    await syncToSupabase({ ...item, meter: verifiedMeter || meter, customerName: custName, phone, pole, remark }, toStation, oemId);

    return {
      meterId,
      ok: true,
      verified,
      fromStation,
      toStation,
      customerName: custName || null,
      phone: phone || null,
      pole: pole || null,
      tariffId,
      remark
    };
  } catch (err) {
    return { meterId, ok: false, error: err.message };
  }
}

async function relocateMeterBatch(meters = [], options = {}, injectedDeps = {}) {
  const rows = Array.isArray(meters) ? meters : [meters];
  const results = [];

  for (const item of rows) {
    const res = await relocateMeter(item, options, injectedDeps);
    results.push(res);
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.length - succeeded;

  return {
    success: failed === 0,
    total: results.length,
    succeeded,
    failed,
    results
  };
}

module.exports = {
  relocateMeter,
  relocateMeterBatch,
  snapshotMeter,
  switchOperatorStation,
  deleteMeterFromStation,
  createMeterInTargetStation,
  updateOrCreateCustomer,
  bindAccount,
  verifyMeter,
  syncToSupabase,
  DEFAULT_CALINMETER_OEM_ID
};
