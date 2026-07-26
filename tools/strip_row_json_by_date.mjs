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

async function stripByDate() {
  console.log('Starting date-by-date row_json stripping...');

  for (const stationId of stations) {
    console.log(`\n=== Processing station ${stationId} ===`);
    // Get distinct reading dates for this station
    const { data: datesData, error: datesErr } = await supabase
      .from('daily_meter_readings')
      .select('reading_date')
      .eq('station_id', stationId)
      .order('reading_date', { ascending: true })
      .limit(1000);

    if (datesErr) {
      console.error(`Error fetching dates for ${stationId}:`, datesErr.message);
      continue;
    }

    const uniqueDates = [...new Set(datesData.map((d) => d.reading_date))];
    console.log(`Found ${uniqueDates.length} distinct reading dates for ${stationId}.`);

    let stationUpdated = 0;
    for (const date of uniqueDates) {
      const { error: updateErr, count } = await supabase
        .from('daily_meter_readings')
        .update({ row_json: {} }, { count: 'exact' })
        .eq('station_id', stationId)
        .eq('reading_date', date);

      if (updateErr) {
        console.error(`  Error updating ${stationId} on ${date}:`, updateErr.message);
      } else {
        stationUpdated += count || 0;
      }
    }
    console.log(`Completed ${stationId}! Total rows updated: ${stationUpdated}`);
  }

  console.log('\nAll station reading_date batches completed successfully!');
}

stripByDate().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
