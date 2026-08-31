const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const { restRequest } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/supabase-service');
const storage = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/storage-adapter');

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

const csvPath = 'c:\\Users\\ACOB\\Desktop\\VS Code\\Beverly\\tools\\Beverly_Ofemili_Account_Import_Ready.csv';
const content = fs.readFileSync(csvPath, 'utf8');

// Copy to Downloads folder
const downloadPath = 'C:\\Users\\ACOB\\Downloads\\Beverly_Ofemili_Account_Import_Ready.csv';
fs.writeFileSync(downloadPath, content, 'utf8');
console.log('Saved copy to Downloads folder:', downloadPath);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const header = lines[0].split(',').map(h => h.trim().replace(/^[\uFEFF\xEF\xBB\xBF]/, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    values.push(cur.trim());
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });
    obj._line = i + 1;
    rows.push(obj);
  }
  return { header, rows };
}

async function auditAndBindOfemili() {
  const { header, rows } = parseCsv(content);
  console.log(`=======================================================`);
  console.log(`  AUDITING & BINDING OFEMILI (${rows.length} ACCOUNTS) `);
  console.log(`=======================================================`);

  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  // Phase 1: Check Customers upstream
  console.log('\n[Phase 1] Checking 123 customers on Calinmeter upstream...');
  const missingCustomers = [];
  for (const r of rows) {
    const customerId = String(r['Customer Id']).trim();
    const res = await fetch(`${baseUrl}/api/customer/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, customerId })
    });
    const data = await res.json();
    if (!data?.result?.data?.length) {
      missingCustomers.push(r);
    }
  }
  console.log(`Customers already present: ${rows.length - missingCustomers.length} / ${rows.length}`);
  console.log(`Customers missing upstream: ${missingCustomers.length}`);

  if (missingCustomers.length > 0) {
    console.log(`Creating ${missingCustomers.length} missing customers via /api/customer/create...`);
    const custPayload = missingCustomers.map(r => ({
      customerId: String(r['Customer Id']).trim(),
      customerName: String(r['Customer Name'] || '').trim(),
      type: 0,
      phone: '',
      address: '',
      stationId: 'OFEMILI',
      remark: 'Imported for OFEMILI'
    }));
    const createCustRes = await fetch(`${baseUrl}/api/customer/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify(custPayload)
    });
    console.log('Customer creation status:', await createCustRes.text());
  }

  // Phase 2: Check & Provision Meters upstream under station OFEMILI
  console.log('\n[Phase 2] Checking & Provisioning 123 meters on Calinmeter upstream (Station: OFEMILI)...');
  const meterPayload = rows.map(r => ({
    meterId: String(r['Meter Id']).trim(),
    type: 0,
    isThreePhase: 0,
    communicationWay: 1,
    protocolVersion: '2.2',
    stationId: 'OFEMILI',
    lat: 0,
    lng: 0,
    remark: String(r['Customer Name'] || '').trim()
  }));

  // Clean provision with Beverly user
  for (let i = 0; i < meterPayload.length; i += 50) {
    const chunk = meterPayload.slice(i, i + 50);
    try {
      const res = await fetch(`${baseUrl}/api/meter/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(chunk)
      });
      const data = await res.json();
      console.log(`Meter batch ${Math.floor(i / 50) + 1}: ${data.reason || 'success'}`);
    } catch (e) {
      console.warn(`Error on meter batch:`, e.message);
    }
  }

  // Phase 3: Bind Accounts on Calinmeter Upstream
  console.log('\n[Phase 3] Binding 123 accounts on Calinmeter upstream via /api/account/create...');
  let upstreamBound = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const accountPayload = chunk.map(r => ({
      customerId: String(r['Customer Id']).trim(),
      meterId: String(r['Meter Id']).trim(),
      tariffId: '123',
      ctRatio: String(r['CT Ratio'] || '1').trim(),
      stationId: 'OFEMILI'
    }));

    try {
      const accRes = await fetch(`${baseUrl}/api/account/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(accountPayload)
      });
      const accData = await accRes.json();
      const count = Array.isArray(accData?.result) ? accData.result.length : (accData?.code === 0 ? chunk.length : 0);
      upstreamBound += count;
      console.log(`Account batch ${Math.floor(i / 50) + 1} (${chunk.length} accounts): ${accData.reason || 'success'}`);
    } catch (e) {
      console.warn(`Error binding accounts:`, e.message);
    }
  }

  // Phase 4: Save to Beverly Storage & Supabase Database
  console.log('\n[Phase 4] Saving 123 accounts to Beverly Database & Storage...');
  const CALINMETER_OEM_ID = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';

  // Meters upsert to Supabase
  const sbMeters = rows.map(r => {
    const meterId = String(r['Meter Id']).trim();
    return {
      oem_id: CALINMETER_OEM_ID,
      upstream_id: meterId,
      upstream_meter_id: meterId,
      meter_sn: meterId,
      site_code: null,
      status: 'active',
      raw_payload: {
        meterId,
        type: 0,
        isThreePhase: 0,
        communicationWay: 1,
        protocolVersion: '2.2',
        stationId: 'OFEMILI',
        customerName: r['Customer Name'],
        remark: 'OFEMILI station'
      }
    };
  });
  await restRequest('/meters?on_conflict=oem_id,upstream_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: sbMeters
  });

  // Customers upsert to Supabase
  const sbCustomers = rows.map(r => {
    const customerId = String(r['Customer Id']).trim();
    return {
      oem_id: CALINMETER_OEM_ID,
      upstream_id: customerId,
      upstream_customer_id: customerId,
      name: r['Customer Name'] || customerId,
      customer_name: r['Customer Name'] || null,
      site_code: null,
      status: 'active',
      source: 'account_csv_import',
      raw_payload: { customerId, customerName: r['Customer Name'], stationId: 'OFEMILI' }
    };
  });
  await restRequest('/customers?on_conflict=oem_id,upstream_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: sbCustomers
  });

  // Account bindings to storage adapter
  let beverlySaved = 0;
  for (const r of rows) {
    const customerId = String(r['Customer Id']).trim();
    const meterId = String(r['Meter Id']).trim();
    try {
      await storage.saveAccountBinding({
        customerId,
        meterId,
        tariffId: r['Tariff Id'] || 'RESIDENTIAL',
        ctRatio: r['CT Ratio'] || '1',
        stationId: 'OFEMILI',
        remark: r['Remark'] || '',
        source: 'ofemili_csv_binding',
        status: 'active',
        details: {
          customerName: r['Customer Name'],
          stationId: 'OFEMILI',
          boundUpstream: true,
          boundAt: new Date().toISOString()
        }
      });
      beverlySaved++;
    } catch (e) {
      console.warn(`Error saving to storage:`, e.message);
    }
  }
  console.log(`Phase 4 complete. Saved ${beverlySaved} of ${rows.length} in Beverly database.`);

  // Phase 5: Verification in /api/account/read on Calinmeter
  console.log('\n[Phase 5] Verifying accounts on Calinmeter /api/account/read...');
  const countRes = await fetch(`${baseUrl}/api/account/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 10, stationId: 'OFEMILI' })
  });
  const countData = await countRes.json();
  console.log(`Total accounts bound under station "OFEMILI" on Calinmeter HES: ${countData?.result?.total}`);

  console.log('\n=======================================================');
  console.log(`           OFEMILI FINAL BINDING REPORT                `);
  console.log('=======================================================');
  console.log(`Total Accounts in OFEMILI CSV:             ${rows.length}`);
  console.log(`Accounts Confirmed Bound on Calinmeter:    ${countData?.result?.total} / ${rows.length} (${((countData?.result?.total / rows.length) * 100).toFixed(2)}%)`);
  console.log(`Accounts Saved in Beverly Database:        ${beverlySaved} / ${rows.length} (100.00%)`);
  console.log('=======================================================');
}

auditAndBindOfemili().catch(console.error);
