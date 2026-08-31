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

async function bindOfemiliAll() {
  const { rows } = parseCsv(content);
  console.log(`=======================================================`);
  console.log(`     BINDING ALL 123 OFEMILI ACCOUNTS UPSTREAM         `);
  console.log(`=======================================================`);

  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  // Step 1: Switch Beverly station to 0001 to delete meters from 0001
  console.log('\n[Step 1] Setting Beverly user station to "0001" for cleanup...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: '0001', status: true }])
  });

  // Delete meters in 0001 in batches
  console.log('[Step 2] Deleting meters from station 0001...');
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const deletePayload = chunk.map(r => ({ meterId: String(r['Meter Id']).trim() }));
    try {
      await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(deletePayload)
      });
    } catch (e) {}
  }

  // Step 3: Switch Beverly station to OFEMILI
  console.log('\n[Step 3] Setting Beverly user station to "OFEMILI"...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'OFEMILI', status: true }])
  });

  // Step 4: Create all meters under station OFEMILI
  console.log('[Step 4] Provisioning meters under station "OFEMILI"...');
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const createPayload = chunk.map(r => ({
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
    try {
      const createRes = await fetch(`${baseUrl}/api/meter/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(createPayload)
      });
      const createData = await createRes.json();
      console.log(`Meter batch ${Math.floor(i / 50) + 1}: ${createData.reason || 'success'}`);
    } catch (e) {
      console.warn(`Error on meter batch:`, e.message);
    }
  }

  // Step 5: Bind all Accounts on Calinmeter HES
  console.log('\n[Step 5] Creating Account Bindings on Calinmeter HES via /api/account/create...');
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
      if (accData.code !== 0 && !accData.reason.includes('already exists')) {
        console.warn(`Warning on ${customerId} <-> ${meterId}:`, accData.reason);
      }
    } catch (e) {
      console.warn(`Error on ${meterId}:`, e.message);
    }
  }

  // Step 6: Count total bound accounts in OFEMILI on Calinmeter
  console.log('\n[Step 6] Verifying total accounts in station "OFEMILI" on Calinmeter HES...');
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

bindOfemiliAll().catch(console.error);
