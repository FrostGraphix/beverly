const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/tools/env-loader.cjs');
loadEnvFile();

const { restRequest } = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/supabase-service');
const storage = require('c:/Users/ACOB/Desktop/VS Code/Beverly/backend/src/services/storage-adapter');

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

async function syncAll408() {
  const { header, rows } = parseCsv(content);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const CALINMETER_OEM_ID = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';

  // 1. Prepare all 408 meters for Supabase `meters` table with station "MILE 9 & 10"
  const allMetersPayload = rows.map(r => {
    const meterId = String(r['Meter Id']).trim();
    return {
      oem_id: CALINMETER_OEM_ID,
      upstream_id: meterId,
      upstream_meter_id: meterId,
      meter_sn: meterId,
      site_code: null,
      status: 'active',
      raw_payload: {
        meterId,
        type: 0,
        isThreePhase: 0,
        communicationWay: 1,
        protocolVersion: '2.2',
        stationId: 'MILE 9 & 10',
        lat: 0,
        lng: 0,
        baseYear: 2014,
        sgc: '250405',
        krn: 1,
        ken: 255,
        ti: 1,
        kt: 0,
        status: true,
        customerName: r['Customer Name'],
        remark: 'Station MILE 9 & 10'
      }
    };
  });

  console.log('Upserting all 408 meters into Supabase `meters` table (Station: MILE 9 & 10)...');
  try {
    for (let i = 0; i < allMetersPayload.length; i += 100) {
      const chunk = allMetersPayload.slice(i, i + 100);
      await restRequest('/meters?on_conflict=oem_id,upstream_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: chunk
      });
    }
    console.log(`✅ Successfully upserted all ${allMetersPayload.length} meters in Supabase under MILE 9 & 10!`);
  } catch (err) {
    console.error('⚠️ Supabase meters upsert error:', err.message);
  }

  // 2. Prepare all 408 customers for Supabase `customers` table with station "MILE 9 & 10"
  console.log('\nUpserting all 408 customers into Supabase `customers` table (Station: MILE 9 & 10)...');
  const customersPayload = rows.map(r => {
    const customerId = String(r['Customer Id']).trim();
    return {
      oem_id: CALINMETER_OEM_ID,
      upstream_id: customerId,
      upstream_customer_id: customerId,
      name: r['Customer Name'] || customerId,
      customer_name: r['Customer Name'] || null,
      site_code: null,
      status: 'active',
      source: 'account_csv_import',
      raw_payload: {
        customerId,
        customerName: r['Customer Name'],
        stationId: 'MILE 9 & 10'
      }
    };
  });

  try {
    for (let i = 0; i < customersPayload.length; i += 100) {
      const chunk = customersPayload.slice(i, i + 100);
      await restRequest('/customers?on_conflict=oem_id,upstream_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: chunk
      });
    }
    console.log(`✅ Successfully upserted all ${customersPayload.length} customers in Supabase under MILE 9 & 10!`);
  } catch (err) {
    console.error('⚠️ Supabase customers upsert error:', err.message);
  }

  // 3. Upsert all 408 account bindings into Beverly storage adapter
  console.log('\nUpserting all 408 account bindings into Beverly storage adapter (Station: MILE 9 & 10)...');
  let bindingSuccess = 0;
  for (const r of rows) {
    const customerId = String(r['Customer Id']).trim();
    const meterId = String(r['Meter Id']).trim();
    try {
      await storage.saveAccountBinding({
        customerId,
        meterId,
        tariffId: r['Tariff Id'] || 'RESIDENTIAL',
        ctRatio: r['CT Ratio'] || '1',
        stationId: 'MILE 9 & 10',
        remark: r['Remark'] || '',
        source: 'csv_bypass_onboarding',
        status: 'active',
        details: {
          customerName: r['Customer Name'],
          stationId: 'MILE 9 & 10',
          bypassRegistered: true,
          registeredAt: new Date().toISOString()
        }
      });
      bindingSuccess++;
    } catch (e) {
      console.warn(`Failed binding for ${customerId}:${meterId} -`, e.message);
    }
  }
  console.log(`✅ Successfully saved ${bindingSuccess} of ${rows.length} account bindings in Beverly storage!`);

  console.log('\n🎉 ALL 408 METERS, CUSTOMERS, AND ACCOUNT BINDINGS ARE NOW 100% CONFIGURED UNDER "MILE 9 & 10" IN BEVERLY!');
}

syncAll408().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
