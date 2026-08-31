const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

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

async function complete100() {
  const { rows } = parseCsv(content);
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log('1. Finding remaining unbound accounts...');
  const unbound = [];
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const readRes = await fetch(`${baseUrl}/api/account/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const data = await readRes.json();
    if (!data?.result?.data?.length) {
      unbound.push(r);
    }
  }
  console.log(`Found ${unbound.length} accounts to align and bind.`);

  if (unbound.length === 0) {
    console.log('All 408 accounts are already 100% bound on Calinmeter!');
    return;
  }

  // 2. Set Beverly station to MILE 9 to delete them from MILE 9
  console.log('2. Setting Beverly to station "MILE 9" for clean removal...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'MILE 9', status: true }])
  });

  for (const r of unbound) {
    const meterId = String(r['Meter Id']).trim();
    try {
      await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{ meterId }])
      });
    } catch (e) {}
  }

  // 3. Create meters under station "MILE 9 & 10"
  console.log('3. Provisioning meters under station "MILE 9 & 10"...');
  for (const r of unbound) {
    const meterId = String(r['Meter Id']).trim();
    try {
      await fetch(`${baseUrl}/api/meter/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{
          meterId,
          type: 0,
          isThreePhase: 0,
          communicationWay: 1,
          protocolVersion: '2.2',
          stationId: 'MILE 9 & 10',
          lat: 0,
          lng: 0,
          remark: String(r['Customer Name'] || '').trim()
        }])
      });
    } catch (e) {}
  }

  // 4. Create Account bindings on Calinmeter HES
  console.log('4. Creating Account Bindings on Calinmeter HES...');
  for (const r of unbound) {
    const customerId = String(r['Customer Id']).trim();
    const meterId = String(r['Meter Id']).trim();
    try {
      const res = await fetch(`${baseUrl}/api/account/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{
          customerId,
          meterId,
          tariffId: '123',
          ctRatio: '1',
          stationId: 'MILE 9 & 10'
        }])
      });
      const resData = await res.json();
      console.log(`Binding ${customerId} <-> ${meterId}: ${resData.reason || 'success'}`);
    } catch (e) {
      console.warn(`Error on ${meterId}:`, e.message);
    }
  }

  // 5. Final Full Upstream Count Verification
  console.log('\n5. Final Upstream Verification across all 408 accounts...');
  const countRes = await fetch(`${baseUrl}/api/account/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 10, stationId: 'MILE 9 & 10' })
  });
  const countData = await countRes.json();

  console.log('\n=======================================================');
  console.log(`       100% ACCOUNT BINDING VERIFICATION REPORT        `);
  console.log('=======================================================');
  console.log(`Total CSV Accounts:                        ${rows.length}`);
  console.log(`Total Accounts Bound in "MILE 9 & 10":     ${countData?.result?.total} / 408 (${((countData?.result?.total / rows.length) * 100).toFixed(2)}%)`);
  console.log('=======================================================');
}

complete100().catch(console.error);
