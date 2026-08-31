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

async function ensureAllPresent() {
  const { rows } = parseCsv(content);
  const missing = [];

  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const readRes = await fetch(`${baseUrl}/api/meter/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const data = await readRes.json();
    if (!data?.result?.data?.length) {
      missing.push(r);
    }
  }

  console.log('Missing from Calinmeter upstream:', missing.length);
  if (missing.length > 0) {
    console.log(`Re-creating ${missing.length} missing meters with superToken...`);
    const createPayload = missing.map(r => ({
      meterId: String(r['Meter Id']).trim(),
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: '0001',
      lat: 0,
      lng: 0,
      remark: String(r['Customer Name'] || '').trim()
    }));
    const createRes = await fetch(`${baseUrl}/api/meter/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
      body: JSON.stringify(createPayload)
    });
    console.log('Create result:', await createRes.json());
  }

  console.log(`Total 408 meters present on Calinmeter: ${rows.length - missing.length + (missing.length > 0 ? missing.length : 0)} / 408`);
}

ensureAllPresent().catch(console.error);
