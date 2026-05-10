"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = process.env.SUPABASE_CONSUMPTION_STORE_ENABLED || "true";

const { dailyMeterTableReport } = require("../backend/src/services/consumption-store");

(async () => {
  const report = await dailyMeterTableReport();
  console.log(JSON.stringify(report, null, 2));
  if (!report.tableReady) process.exitCode = 1;
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
