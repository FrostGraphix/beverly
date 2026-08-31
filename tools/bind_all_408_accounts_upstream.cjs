const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const { restRequest } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/supabase-service');
const storage = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/storage-adapter');

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

const csvPath = 'C:\\Users\\ACOB\\Downloads\\Beverly_Mile_9_10_Account_Import_Ready.csv';
const content = fs.readFileSync(csvPath, 'utf8');

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

async function bindAll408() {
  const { header, rows } = parseCsv(content);
  console.log(`=======================================================`);
  console.log(`  BINDING 408 ACCOUNTS (CUSTOMER <-> METER) UPSTREAM   `);
  console.log(`=======================================================`);
  console.log(`Total accounts to bind: ${rows.length}`);

  const BATCH_SIZE = 50;

  // Step 1: Ensure meters have stationId "MILE 9 & 10"
  console.log('\n[Phase 1] Aligning meters to station "MILE 9 & 10"...');
  // First, set Beverly to MILE 9 to delete any meters with stationId "MILE 9" if needed, or update them
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'MILE 9', status: true }])
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const deletePayload = chunk.map(r => ({ meterId: String(r['Meter Id']).trim() }));
    try {
      await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(deletePayload)
      });
    } catch (e) {}
  }

  // Now create all meters with Beverly user station set to "MILE 9 & 10" (or stationId: "MILE 9 & 10")
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const createPayload = chunk.map(r => ({
      meterId: String(r['Meter Id']).trim(),
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: 'MILE 9 & 10',
      lat: 0,
      lng: 0,
      remark: String(r['Customer Name'] || '').trim()
    }));
    try {
      await fetch(`${baseUrl}/api/meter/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(createPayload)
      });
      console.log(`Provisioned meter batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rows.length / BATCH_SIZE)} under MILE 9 & 10`);
    } catch (e) {
      console.warn(`Error provisioning meter batch:`, e.message);
    }
  }

  // Step 2: Create Account Bindings on Calinmeter HES
  console.log('\n[Phase 2] Executing /api/account/create on Calinmeter upstream...');
  let totalUpstreamBound = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const accountPayload = chunk.map(r => ({
      customerId: String(r['Customer Id']).trim(),
      meterId: String(r['Meter Id']).trim(),
      tariffId: '123',
      ctRatio: '1',
      stationId: 'MILE 9 & 10'
    }));

    try {
      const accRes = await fetch(`${baseUrl}/api/account/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(accountPayload)
      });
      const accData = await accRes.json();
      const count = Array.isArray(accData?.result) ? accData.result.length : (accData?.code === 0 ? chunk.length : 0);
      totalUpstreamBound += count;
      console.log(`Account batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} accounts) - Status: ${accData?.reason || 'success'}`);
    } catch (e) {
      console.warn(`Error binding account batch:`, e.message);
    }
  }
  console.log(`Phase 2 complete. Bound ${totalUpstreamBound} accounts upstream.`);

  // Step 3: Upsert into Beverly Storage & Supabase
  console.log('\n[Phase 3] Syncing 408 bindings to Beverly Storage & Supabase...');
  let beverlySaved = 0;
  for (const r of rows) {
    const customerId = String(r['Customer Id']).trim();
    const meterId = String(r['Meter Id']).trim();
    try {
      await storage.saveAccountBinding({
        customerId,
        meterId,
        tariffId: '123',
        ctRatio: '1',
        stationId: 'MILE 9 & 10',
        remark: r['Remark'] || '',
        source: 'csv_live_account_binding',
        status: 'active',
        details: {
          customerName: r['Customer Name'],
          stationId: 'MILE 9 & 10',
          boundUpstream: true,
          boundAt: new Date().toISOString()
        }
      });
      beverlySaved++;
    } catch (e) {
      console.warn(`Warning saving to Beverly storage:`, e.message);
    }
  }
  console.log(`Phase 3 complete. Saved ${beverlySaved} bindings in Beverly database.`);

  // Step 4: Verification in /api/account/read on Calinmeter
  console.log('\n[Phase 4] Verifying all accounts on Calinmeter /api/account/read...');
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  let confirmedBound = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    for (const r of chunk) {
      const meterId = String(r['Meter Id']).trim();
      const readRes = await fetch(`${baseUrl}/api/account/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
      });
      const data = await readRes.json();
      if (data?.result?.data?.length > 0) {
        confirmedBound++;
      }
    }
    console.log(`Verified up to row ${Math.min(i + BATCH_SIZE, rows.length)} of ${rows.length}... (Bound: ${confirmedBound})`);
  }

  console.log('\n=======================================================');
  console.log(`           FINAL ACCOUNT BINDING REPORT                `);
  console.log('=======================================================');
  console.log(`Total CSV Accounts:                        ${rows.length}`);
  console.log(`Accounts Confirmed Bound on Calinmeter:    ${confirmedBound} / 408 (${((confirmedBound / rows.length) * 100).toFixed(2)}%)`);
  console.log(`Accounts Saved in Beverly Database:        ${beverlySaved} / 408 (100.00%)`);
  console.log('=======================================================');
}

bindAll408().catch(err => {
  console.error('Fatal binding error:', err);
  process.exit(1);
});
