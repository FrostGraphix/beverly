const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
const superToken = process.env.UPSTREAM_BEARER_TOKEN;

const csvPath = 'C:\\Users\\ACOB\\Downloads\\Beverly_Account_Import_Template (1) (1).csv';
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

async function migrateRemaining() {
  const { rows } = parseCsv(content);
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log('Finding remaining meters in station 0001...');
  const remainingIn0001 = [];
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const readRes = await fetch(`${baseUrl}/api/meter/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const data = await readRes.json();
    const meter = data?.result?.data?.[0];
    if (meter && meter.stationId !== 'MILE 9') {
      remainingIn0001.push(r);
    }
  }

  console.log(`Found ${remainingIn0001.length} remaining meters in station 0001 to migrate.`);

  if (remainingIn0001.length === 0) {
    console.log('All 408 meters are already in MILE 9!');
    return;
  }

  // 1. Switch Beverly user to station 0001 to delete remaining
  console.log('1. Setting Beverly station to 0001...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: 'Beverly',
      roleId: 'admin',
      stationId: '0001',
      status: true,
      email: 'beverly@org.acoblighting.com'
    }])
  });

  // Delete remaining one by one or in a clean batch
  console.log('2. Deleting remaining meters from station 0001...');
  for (const r of remainingIn0001) {
    const meterId = String(r['Meter Id']).trim();
    try {
      await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify([{ meterId }])
      });
    } catch (e) {
      console.warn(`Warning deleting ${meterId}:`, e.message);
    }
  }

  // 2. Switch Beverly user to station MILE 9
  console.log('3. Setting Beverly station to MILE 9...');
  await fetch(`${baseUrl}/api/user/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
    body: JSON.stringify([{
      userId: 'Beverly',
      roleId: 'admin',
      stationId: 'MILE 9',
      status: true,
      email: 'beverly@org.acoblighting.com'
    }])
  });

  // 3. Create remaining meters in station MILE 9
  console.log('4. Creating remaining meters in station MILE 9...');
  for (const r of remainingIn0001) {
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
          stationId: 'MILE 9',
          lat: 0,
          lng: 0,
          remark: String(r['Customer Name'] || '').trim()
        }])
      });
    } catch (e) {
      console.warn(`Warning creating ${meterId}:`, e.message);
    }
  }

  // 4. Final verification across all 408 meters!
  console.log('\n[Phase 5] Final verification across all 408 meters...');
  let verifiedMile9 = 0;
  let other = 0;
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const readRes = await fetch(`${baseUrl}/api/meter/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const data = await readRes.json();
    const meter = data?.result?.data?.[0];
    if (meter && meter.stationId === 'MILE 9') {
      verifiedMile9++;
    } else {
      other++;
      console.log(`Meter ${meterId} station: ${meter?.stationId || 'NOT FOUND'}`);
    }
  }

  console.log('\n=======================================================');
  console.log(`         COMPLETE UPSTREAM MIGRATION REPORT            `);
  console.log('=======================================================');
  console.log(`Total Meters in CSV:                       ${rows.length}`);
  console.log(`Meters confirmed in "MILE 9" (MILE 9 & 10): ${verifiedMile9} / 408 (${((verifiedMile9 / rows.length) * 100).toFixed(2)}%)`);
  console.log(`Remaining in other stations:               ${other}`);
  console.log('=======================================================');
}

migrateRemaining().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
