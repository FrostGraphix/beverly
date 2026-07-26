"use strict";

const { loadEnvFile } = require("./env-loader.cjs");
loadEnvFile();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal"
};

const stations = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];
const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function executeResolution() {
  console.log(`Starting Station-Batched Quota Resolution (Cutoff Date: ${cutoffDate})...`);

  // 1. Truncate row_json in daily_meter_readings per station
  for (const station of stations) {
    console.log(`1. Stripping row_json for station ${station}...`);
    try {
      const res = await fetch(`${url}/rest/v1/daily_meter_readings?station_id=eq.${station}&row_json=neq.{}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ row_json: {} })
      });
      console.log(`   ${station} PATCH status: ${res.status}`);
    } catch (e) {
      console.error(`   ${station} PATCH error: ${e.message}`);
    }
  }

  // 2. Prune daily_meter_deltas older than 90 days per station
  for (const station of stations) {
    console.log(`2. Pruning daily_meter_deltas for station ${station} before ${cutoffDate}...`);
    try {
      const res = await fetch(`${url}/rest/v1/daily_meter_deltas?station_id=eq.${station}&reading_date=lt.${cutoffDate}`, {
        method: "DELETE",
        headers
      });
      console.log(`   ${station} DELETE status: ${res.status}`);
    } catch (e) {
      console.error(`   ${station} DELETE error: ${e.message}`);
    }
  }

  // 3. Prune meter_consumption_aggregates ('day', 'week') older than 90 days per station
  for (const station of stations) {
    console.log(`3. Pruning meter_consumption_aggregates for station ${station} ('day', 'week') before ${cutoffDate}...`);
    try {
      const res = await fetch(`${url}/rest/v1/meter_consumption_aggregates?station_id=eq.${station}&period_type=in.(day,week)&period_start=lt.${cutoffDate}`, {
        method: "DELETE",
        headers
      });
      console.log(`   ${station} DELETE status: ${res.status}`);
    } catch (e) {
      console.error(`   ${station} DELETE error: ${e.message}`);
    }
  }

  // 4. Prune api_cache older than 1 day
  const cacheCutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`4. Pruning api_cache older than ${cacheCutoff}...`);
  try {
    const res = await fetch(`${url}/rest/v1/api_cache?updated_at=lt.${cacheCutoff}`, {
      method: "DELETE",
      headers
    });
    console.log(`   api_cache DELETE status: ${res.status}`);
  } catch (e) {
    console.error(`   api_cache DELETE error: ${e.message}`);
  }

  // 5. Prune operational_snapshots older than 14 days
  const snapCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`5. Pruning operational_snapshots older than ${snapCutoff}...`);
  try {
    const res = await fetch(`${url}/rest/v1/operational_snapshots?captured_at=lt.${snapCutoff}`, {
      method: "DELETE",
      headers
    });
    console.log(`   operational_snapshots DELETE status: ${res.status}`);
  } catch (e) {
    console.error(`   operational_snapshots DELETE error: ${e.message}`);
  }

  console.log("All station-batched resolution steps completed!");
}

executeResolution().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
