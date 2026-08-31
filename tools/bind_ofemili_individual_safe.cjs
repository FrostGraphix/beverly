const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

const csvPath = 'c:\\Users\\ACOB\\Desktop\\VS Code\\Beverly\\tools\\Beverly_Ofemili_Account_Import_Ready.csv';
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

async function bindSafe() {
  const { rows } = parseCsv(content);
  console.log(`=======================================================`);
  console.log(`  SAFE INDIVIDUAL BINDING FOR OFEMILI (${rows.length} ACCOUNTS) `);
  console.log(`=======================================================`);

  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  // Step 1: Set Beverly to 0001 and delete individually from 0001
  console.log('\n[Step 1] Setting Beverly to "0001" and deleting any existing in 0001...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: '0001', status: true }])
  });

  let deletedCount = 0;
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    try {
      const delRes = await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{ meterId }])
      });
      const data = await delRes.json();
      if (data.code === 0) deletedCount++;
    } catch (e) {}
  }
  console.log(`Successfully cleared ${deletedCount} meters from station 0001.`);

  // Step 2: Set Beverly to OFEMILI
  console.log('\n[Step 2] Setting Beverly to "OFEMILI"...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'OFEMILI', status: true }])
  });

  // Step 3: Create meters individually under OFEMILI
  console.log('\n[Step 3] Provisioning meters under station "OFEMILI"...');
  let createdCount = 0;
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    try {
      const createRes = await fetch(`${baseUrl}/api/meter/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{
          meterId,
          type: 0,
          isThreePhase: 0,
          communicationWay: 1,
          protocolVersion: '2.2',
          stationId: 'OFEMILI',
          lat: 0,
          lng: 0,
          remark: String(r['Customer Name'] || '').trim()
        }])
      });
      const data = await createRes.json();
      if (data.code === 0 || data.reason?.includes('already exists')) {
        createdCount++;
      } else {
        console.warn(`Warning creating ${meterId}:`, data.reason);
      }
    } catch (e) {
      console.warn(`Error creating ${meterId}:`, e.message);
    }
  }
  console.log(`Provisioned ${createdCount} / ${rows.length} meters under station OFEMILI.`);

  // Step 4: Bind Accounts individually via /api/account/create
  console.log('\n[Step 4] Creating Account Bindings via /api/account/create...');
  let boundCount = 0;
  for (const r of rows) {
    const customerId = String(r['Customer Id']).trim();
    const meterId = String(r['Meter Id']).trim();
    try {
      const accRes = await fetch(`${baseUrl}/api/account/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{
          customerId,
          meterId,
          tariffId: '123',
          ctRatio: String(r['CT Ratio'] || '1').trim(),
          stationId: 'OFEMILI'
        }])
      });
      const accData = await accRes.json();
      if (accData.code === 0 || accData.reason?.includes('already exists')) {
        boundCount++;
      } else {
        console.warn(`Warning on ${customerId} <-> ${meterId}:`, accData.reason);
      }
    } catch (e) {
      console.warn(`Error on ${meterId}:`, e.message);
    }
  }
  console.log(`Bound ${boundCount} / ${rows.length} accounts.`);

  // Step 5: Final count verification
  console.log('\n[Step 5] Verifying total accounts bound under station "OFEMILI" on Calinmeter...');
  const countRes = await fetch(`${baseUrl}/api/account/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 10, stationId: 'OFEMILI' })
  });
  const countData = await countRes.json();

  console.log('\n=======================================================');
  console.log(`       100% OFEMILI ACCOUNT BINDING REPORT             `);
  console.log('=======================================================');
  console.log(`Total CSV Accounts:                        ${rows.length}`);
  console.log(`Total Accounts Bound in "OFEMILI":         ${countData?.result?.total} / ${rows.length} (${((countData?.result?.total / rows.length) * 100).toFixed(2)}%)`);
  console.log('=======================================================');
}

bindSafe().catch(console.error);
