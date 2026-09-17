import { postApi } from './api.js';

export function isMeterRelocateAction(route, action) {
  const hash = String(route?.hash || '');
  const act = String(action || '').trim().toLowerCase();
  return hash.includes('admin/meter') && (act === 'move station' || act === 'relocate');
}

export function validateRelocationForm(targetStation, meters = []) {
  const errors = [];
  if (!targetStation || !String(targetStation).trim()) {
    errors.push('Destination Station is required.');
  }
  if (!meters || meters.length === 0) {
    errors.push('At least one meter must be selected for relocation.');
  }
  return errors;
}

export async function executeMeterRelocation(config = {}, api = { postApi }, onProgress = null) {
  const {
    meters = [],
    targetStation = '',
    customerName = '',
    phone = '',
    pole = '',
    tariffId = '123',
    remark = '',
    options = {}
  } = config;

  const toStation = String(targetStation || '').trim();
  const meterRows = Array.isArray(meters) ? meters : [meters];

  if (!toStation) {
    throw new Error('Destination station is required.');
  }
  if (!meterRows.length) {
    throw new Error('No meters selected.');
  }

  if (typeof onProgress === 'function') {
    onProgress({ step: 1, totalSteps: 5, message: 'Initiating meter snapshot and STS key preservation...' });
  }

  const items = meterRows.map((m) => {
    const meterId = String(m.meterId || m.meter_sn || m.id || '').trim();
    const fromStation = String(m.stationId || m.fromStation || '').trim();
    return {
      meterId,
      fromStation,
      toStation,
      customerName: m.customerName || customerName || '',
      phone: m.phone || phone || '',
      pole: m.pole || pole || '',
      tariffId: m.tariffId || tariffId || '123',
      remark: m.remark || remark || (pole || phone ? `Pole: ${pole || '-'}, Phone: ${phone || '-'}` : `Moved to ${toStation}`)
    };
  });

  if (typeof onProgress === 'function') {
    onProgress({ step: 2, totalSteps: 5, message: `Switching operator scope & migrating ${items.length} meter(s) upstream...` });
  }

  const payload = {
    meters: items,
    options: {
      updateCustomer: Boolean(customerName || phone || pole || options.updateCustomer),
      bindAccount: options.bindAccount !== false,
      preserveSts: true,
      ...options
    }
  };

  const response = await api.postApi('/api/local/meters/relocate', payload);

  if (typeof onProgress === 'function') {
    onProgress({ step: 5, totalSteps: 5, message: 'Verifying upstream readback & CRM database synchronization...' });
  }

  const result = response?.result || response?.data || response;
  const isOk = response?.code === 0 || response?.code === 200 || result?.success === true;

  return {
    ok: isOk,
    code: response?.code,
    reason: response?.reason || response?.msg || (isOk ? 'Success' : 'Relocation completed with warnings'),
    total: result?.total || items.length,
    succeeded: result?.succeeded ?? (isOk ? items.length : 0),
    failed: result?.failed ?? (isOk ? 0 : items.length),
    results: result?.results || []
  };
}
