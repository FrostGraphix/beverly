const fs = require('fs');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const baseUrl = (process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL).replace(/\/+$/, '');

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

async function diagnose() {
  const { rows } = parseCsv(content);
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log(`Diagnosing 123 accounts on Calinmeter...`);
  const meterStations = {};
  const custStations = {};
  const notBound = [];
  const alreadyBound = [];

  for (const r of rows) {
    const meterId = String(r['Meter Id']).trim();
    const customerId = String(r['Customer Id']).trim();

    // Check Meter
    const mRes = await fetch(`${baseUrl}/api/meter/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const mData = await mRes.json();
    const meter = mData?.result?.data?.[0];
    const mSt = meter?.stationId || 'MISSING_METER';
    meterStations[mSt] = (meterStations[mSt] || 0) + 1;

    // Check Customer
    const cRes = await fetch(`${baseUrl}/api/customer/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, customerId })
    });
    const cData = await cRes.json();
    const cust = cData?.result?.data?.[0];
    const cSt = cust?.stationId || 'MISSING_CUST';
    custStations[cSt] = (custStations[cSt] || 0) + 1;

    // Check Account
    const aRes = await fetch(`${baseUrl}/api/account/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
    });
    const aData = await aRes.json();
    const acc = aData?.result?.data?.[0];
    if (acc) {
      alreadyBound.push({ r, acc, meter, cust });
    } else {
      notBound.push({ r, meter, cust });
    }
  }

  console.log('\n--- DIAGNOSTIC RESULTS ---');
  console.log('Customer Station Distribution:', custStations);
  console.log('Meter Station Distribution:', meterStations);
  console.log(`Already Bound on Calinmeter: ${alreadyBound.length}`);
  console.log(`Not Bound on Calinmeter: ${notBound.length}`);

  if (notBound.length > 0) {
    console.log('\nSample unbound items:');
    notBound.slice(0, 5).forEach(x => {
      console.log(`Customer ${x.r['Customer Id']} (St: ${x.cust?.stationId}) <-> Meter ${x.r['Meter Id']} (St: ${x.meter?.stationId})`);
    });
  }
}

diagnose().catch(console.error);
