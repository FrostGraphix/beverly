const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');
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

async function loginUser(userId) {
  const res = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: userId, PassWord: process.env.UPSTREAM_PASSWORD || 'ACOB_ADMIN' })
  });
  const data = await res.json();
  return data?.result?.token;
}

async function run() {
  console.log('Logging in as Beverly user (with Management.Meter & Setting permissions)...');
  let token = await loginUser('Beverly');
  if (!token) {
    console.log('Falling back to admin login...');
    token = await loginUser('admin');
  }

  const { rows } = parseCsv(content);
  console.log(`Found ${rows.length} rows in CSV to update.`);

  // Let's test updating one meter first:
  console.log('\nTesting single meter update with stationId: "MILE 9"...');
  const testMeter = rows[0];
  const singlePayload = [{
    meterId: String(testMeter['Meter Id']).trim(),
    type: 0,
    isThreePhase: 0,
    communicationWay: 1,
    protocolVersion: '2.2',
    stationId: 'MILE 9',
    lat: 0,
    lng: 0,
    remark: testMeter['Customer Name'] || ''
  }];

  const singleRes = await fetch(`${baseUrl}/api/meter/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(singlePayload)
  });
  console.log('Single update status:', singleRes.status, await singleRes.text());

  // Check readback
  const adminToken = await loginUser('admin');
  const readRes = await fetch(`${baseUrl}/api/meter/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId: String(testMeter['Meter Id']).trim() })
  });
  const readData = await readRes.json();
  console.log('Readback meter data:', JSON.stringify(readData?.result?.data?.[0], null, 2));

  // If stationId was not updated or if delete + create is needed, let's check!
}

run().catch(console.error);
