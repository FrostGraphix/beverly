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

const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function processPagedResolution() {
  console.log(`Starting Paged Database Quota Resolution (Cutoff Date: ${cutoffDate})...`);

  // Step 1: Strip row_json from daily_meter_readings in pages of 2000
  console.log('\n--- Step 1: Stripping row_json from daily_meter_readings ---');
  let updatedReadings = 0;
  while (true) {
    // Select batch of 2000 IDs where row_json is not empty
    const { data, error } = await supabase
      .from('daily_meter_readings')
      .select('id')
      .neq('row_json', '{}')
      .limit(2000);

    if (error) {
      console.error('Error selecting daily_meter_readings:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log('Finished updating daily_meter_readings row_json! Total updated:', updatedReadings);
      break;
    }

    const ids = data.map((r) => r.id);
    const { error: updateError } = await supabase
      .from('daily_meter_readings')
      .update({ row_json: {} })
      .in('id', ids);

    if (updateError) {
      console.error('Error updating batch of daily_meter_readings:', updateError.message);
      break;
    }

    updatedReadings += ids.length;
    console.log(`Updated ${ids.length} rows (Total: ${updatedReadings})...`);
  }

  // Step 2: Delete old daily_meter_deltas before cutoffDate in pages of 2000
  console.log('\n--- Step 2: Deleting daily_meter_deltas older than 90 days ---');
  let deletedDeltas = 0;
  while (true) {
    const { data, error } = await supabase
      .from('daily_meter_deltas')
      .select('station_id, meter_id, reading_date')
      .lt('reading_date', cutoffDate)
      .limit(1000);

    if (error) {
      console.error('Error selecting daily_meter_deltas:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log('Finished deleting old daily_meter_deltas! Total deleted:', deletedDeltas);
      break;
    }

    // Delete station by station / batch
    const stations = [...new Set(data.map((d) => d.station_id))];
    for (const stationId of stations) {
      const { error: delError } = await supabase
        .from('daily_meter_deltas')
        .delete()
        .eq('station_id', stationId)
        .lt('reading_date', cutoffDate);

      if (delError) {
        console.error(`Error deleting deltas for station ${stationId}:`, delError.message);
      }
    }

    deletedDeltas += data.length;
    console.log(`Processed deltas batch of ${data.length} rows (Total: ~${deletedDeltas})...`);
  }

  // Step 3: Delete old meter_consumption_aggregates ('day', 'week') before cutoffDate
  console.log('\n--- Step 3: Deleting meter_consumption_aggregates (day, week) older than 90 days ---');
  let deletedAggs = 0;
  while (true) {
    const { data, error } = await supabase
      .from('meter_consumption_aggregates')
      .select('station_id, meter_id, period_type, period_start')
      .in('period_type', ['day', 'week'])
      .lt('period_start', cutoffDate)
      .limit(1000);

    if (error) {
      console.error('Error selecting meter_consumption_aggregates:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log('Finished deleting old meter_consumption_aggregates! Total deleted:', deletedAggs);
      break;
    }

    const stations = [...new Set(data.map((d) => d.station_id))];
    for (const stationId of stations) {
      const { error: delError } = await supabase
        .from('meter_consumption_aggregates')
        .delete()
        .eq('station_id', stationId)
        .in('period_type', ['day', 'week'])
        .lt('period_start', cutoffDate);

      if (delError) {
        console.error(`Error deleting aggregates for station ${stationId}:`, delError.message);
      }
    }

    deletedAggs += data.length;
    console.log(`Processed aggregates batch of ${data.length} rows (Total: ~${deletedAggs})...`);
  }

  // Step 4: Clean api_cache older than 1 day
  console.log('\n--- Step 4: Cleaning api_cache ---');
  const cacheCutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const { error: cacheErr } = await supabase
    .from('api_cache')
    .delete()
    .lt('updated_at', cacheCutoff);
  if (cacheErr) console.error('api_cache error:', cacheErr.message);
  else console.log('api_cache cleaned successfully');

  // Step 5: Clean operational_snapshots older than 14 days
  console.log('\n--- Step 5: Cleaning operational_snapshots ---');
  const snapCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: snapErr } = await supabase
    .from('operational_snapshots')
    .delete()
    .lt('captured_at', snapCutoff);
  if (snapErr) console.error('operational_snapshots error:', snapErr.message);
  else console.log('operational_snapshots cleaned successfully');

  console.log('\n================================================');
  console.log('Paged Database Quota Resolution Completed!');
  console.log('================================================');
}

processPagedResolution().catch((err) => {
  console.error('Resolution failed:', err);
  process.exit(1);
});
