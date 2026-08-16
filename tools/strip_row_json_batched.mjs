#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const requireFromBackend = createRequire(path.join(root, 'backend', 'wallet', 'package.json'));
const { createClient } = requireFromBackend('@supabase/supabase-js');

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stations = ['TUNGA', 'UMAISHA', 'OGUFA', 'KYAKALE', 'MUSHA'];

async function stripRowJson() {
  console.log('Starting station-by-station row_json stripping...');

  for (const stationId of stations) {
    console.log(`Processing station ${stationId}...`);
    // Page through records in batches of 1000 by date or offset
    let offset = 0;
    let updatedCount = 0;
    while (true) {
      const { data, error } = await supabase
        .from('daily_meter_readings')
        .select('id')
        .eq('station_id', stationId)
        .range(offset, offset + 999);

      if (error) {
        console.error(`Error fetching readings for ${stationId}:`, error.message);
        break;
      }

      if (!data || data.length === 0) {
        console.log(`Station ${stationId} complete! Total rows processed: ${updatedCount}`);
        break;
      }

      const ids = data.map((r) => r.id);
      const { error: updateErr } = await supabase
        .from('daily_meter_readings')
        .update({ row_json: {} })
        .in('id', ids);

      if (updateErr) {
        console.error(`Error updating batch for ${stationId}:`, updateErr.message);
        break;
      }

      updatedCount += ids.length;
      offset += 1000;
      console.log(`  ${stationId}: Updated ${ids.length} rows (${updatedCount} cumulative)...`);
    }
  }

  console.log('Row JSON stripping completed!');
}

stripRowJson().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
