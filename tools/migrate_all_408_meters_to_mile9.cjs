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

async function migrateAll408() {
  const { header, rows } = parseCsv(content);
  console.log(`=======================================================`);
  console.log(`  MIGRATING 408 METERS TO STATION "MILE 9 & 10"        `);
  console.log(`=======================================================`);
  console.log(`Total rows in CSV: ${rows.length}`);

  const BATCH_SIZE = 50;

  // Step 1: Set Beverly user station to "0001" to delete any remaining meters in 0001
  console.log('\n[Phase 1] Setting Beverly user station to "0001" for deletion...');
  const userRes1 = await fetch(`${baseUrl}/api/user/update`, {
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
  console.log('User update status (0001):', userRes1.status);

  // Step 2: Delete meters in batches from station 0001
  console.log('\n[Phase 2] Deleting meters from station 0001 in batches...');
  let totalDeleted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const deletePayload = chunk.map(r => ({ meterId: String(r['Meter Id']).trim() }));
    try {
      const delRes = await fetch(`${baseUrl}/api/meter/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superToken}` },
        body: JSON.stringify(deletePayload)
      });
      const delData = await delRes.json();
      const count = Array.isArray(delData?.result) ? delData.result.length : (delData?.code === 0 ? chunk.length : 0);
      totalDeleted += count;
      console.log(`Deleted batch ${i / BATCH_SIZE + 1} (${chunk.length} meters) - Status: ${delData?.reason || 'success'}`);
    } catch (e) {
      console.warn(`Warning on delete batch ${i / BATCH_SIZE + 1}:`, e.message);
    }
  }
  console.log(`Phase 2 complete. Processed deletion for ${rows.length} meters.`);

  // Step 3: Switch Beverly user station to "MILE 9"
  console.log('\n[Phase 3] Setting Beverly user station to "MILE 9" (MILE 9 & 10)...');
  const userRes2 = await fetch(`${baseUrl}/api/user/update`, {
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
  console.log('User update status (MILE 9):', userRes2.status);

  // Step 4: Create all meters in station "MILE 9"
  console.log('\n[Phase 4] Creating meters under station "MILE 9" in batches...');
  let totalCreated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const createPayload = chunk.map(r => ({
      meterId: String(r['Meter Id']).trim(),
      type: 0,
      isThreePhase: 0,
      communicationWay: 1,
      protocolVersion: '2.2',
      stationId: 'MILE 9',
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
      const count = Array.isArray(createData?.result) ? createData.result.length : (createData?.code === 0 ? chunk.length : 0);
      totalCreated += count;
      console.log(`Created batch ${i / BATCH_SIZE + 1} (${chunk.length} meters) - Status: ${createData?.reason || 'success'}`);
    } catch (e) {
      console.warn(`Warning on create batch ${i / BATCH_SIZE + 1}:`, e.message);
    }
  }
  console.log(`Phase 4 complete. Created ${totalCreated} meters under station MILE 9.`);

  // Step 5: Verification in /api/meter/read
  console.log('\n[Phase 5] Verifying all 408 meters on Calinmeter via /api/meter/read...');
  const loginAdmin = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserId: 'admin', PassWord: process.env.UPSTREAM_PASSWORD })
  });
  const adminToken = (await loginAdmin.json())?.result?.token;

  let verifiedMile9 = 0;
  let otherStation = 0;
  let notFound = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    for (const r of chunk) {
      const meterId = String(r['Meter Id']).trim();
      const readRes = await fetch(`${baseUrl}/api/meter/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ pageNumber: 1, pageSize: 1, meterId })
      });
      const data = await readRes.json();
      const meter = data?.result?.data?.[0];
      if (!meter) {
        notFound++;
      } else if (meter.stationId === 'MILE 9') {
        verifiedMile9++;
      } else {
        otherStation++;
        console.log(`Meter ${meterId} still in ${meter.stationId}`);
      }
    }
    console.log(`Verified up to row ${Math.min(i + BATCH_SIZE, rows.length)} of ${rows.length}... (Mile 9: ${verifiedMile9})`);
  }

  console.log('\n=======================================================');
  console.log(`                 FINAL VERIFICATION SUMMARY            `);
  console.log('=======================================================');
  console.log(`Total CSV Meters:                          ${rows.length}`);
  console.log(`Meters verified in station "MILE 9" (MILE 9 & 10): ${verifiedMile9} (${((verifiedMile9 / rows.length) * 100).toFixed(2)}%)`);
  console.log(`Meters in other stations:                  ${otherStation}`);
  console.log(`Meters not found:                          ${notFound}`);
  console.log('=======================================================');
}

migrateAll408().catch(err => {
  console.error('Migration fatal error:', err);
  process.exit(1);
});
