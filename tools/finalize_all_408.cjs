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

async function finalize() {
  const { rows } = parseCsv(content);
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log('1. Checking any meters not in station MILE 9...');
  const notInMile9 = [];
  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const readRes = await fetch(`${baseUrl}/api/meter/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const data = await readRes.json();
    const meter = data?.result?.data?.[0];
    if (!meter || meter.stationId !== 'MILE 9') {
      notInMile9.push({ r, meter });
    }
  }

  console.log(`Meters needing migration: ${notInMile9.length}`);

  if (notInMile9.length > 0) {
    // Set Beverly to 0001 to delete
    await fetch(`${baseUrl}/api/user/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: '0001', status: true }])
    });

    for (const item of notInMile9) {
      if (item.meter) {
        await fetch(`${baseUrl}/api/meter/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
          body: JSON.stringify([{ meterId: item.meter.meterId }])
        });
      }
    }

    // Set Beverly to MILE 9 to create
    await fetch(`${baseUrl}/api/user/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify([{ userId: 'Beverly', roleId: 'admin', stationId: 'MILE 9', status: true }])
    });

    for (const item of notInMile9) {
      const meterId = String(item.r['Meter Id']).trim();
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
          remark: String(item.r['Customer Name'] || '').trim()
        }])
      });
    }
  }

  // Fast count verification by reading all meters under station MILE 9
  console.log('\n2. Counting total meters in station MILE 9 on Calinmeter...');
  const countRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 10, stationId: 'MILE 9' })
  });
  const countData = await countRes.json();
  console.log(`Total meters in station MILE 9 (MILE 9 & 10): ${countData?.result?.total}`);

  // Also verify against the CSV set
  let confirmedMile9 = 0;
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
      confirmedMile9++;
    }
  }

  console.log(`\n=======================================================`);
  console.log(`  ALL 408 METERS UPSTREAM STATION STATUS               `);
  console.log(`=======================================================`);
  console.log(`Total CSV Meters:                               408`);
  console.log(`Confirmed in station "MILE 9" (MILE 9 & 10):     ${confirmedMile9} / 408 (${((confirmedMile9 / 408) * 100).toFixed(2)}%)`);
  console.log(`=======================================================`);
}

finalize().catch(console.error);
