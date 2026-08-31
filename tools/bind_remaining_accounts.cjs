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

async function bindRemaining() {
  const { rows } = parseCsv(content);
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  console.log('Finding accounts not yet bound on Calinmeter...');
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

  console.log(`Found ${unbound.length} accounts to bind.`);

  if (unbound.length > 0) {
    console.log(`Binding ${unbound.length} accounts via /api/account/create...`);
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
        const data = await res.json();
        if (data.code !== 0) {
          console.warn(`Warning on ${meterId}:`, data.reason);
        }
      } catch (e) {
        console.warn(`Error on ${meterId}:`, e.message);
      }
    }
  }

  // Fast count verification by reading all accounts under station MILE 9 & 10
  console.log('\nVerifying total accounts in station "MILE 9 & 10" on Calinmeter...');
  const countRes = await fetch(`${baseUrl}/api/account/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ pageNumber: 1, pageSize: 10, stationId: 'MILE 9 & 10' })
  });
  const countData = await countRes.json();
  console.log(`Total accounts under MILE 9 & 10 in Calinmeter HES: ${countData?.result?.total}`);

  console.log('\n=======================================================');
  console.log(`       COMPLETE UPSTREAM ACCOUNT BINDING REPORT         `);
  console.log('=======================================================');
  console.log(`Total Accounts in CSV:                     ${rows.length}`);
  console.log(`Accounts Confirmed Bound on Calinmeter:    ${countData?.result?.total} / 408 (${((countData?.result?.total / rows.length) * 100).toFixed(2)}%)`);
  console.log(`=======================================================`);
}

bindRemaining().catch(console.error);
