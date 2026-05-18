"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260516130000_daily_meter_raw_duplicates.sql");
const poolerUrlPath = path.join(root, "supabase", ".temp", "pooler-url");
const rawDatabaseUrl = process.env.SUPABASE_DB_URL || fs.readFileSync(poolerUrlPath, "utf8").trim();
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password && !rawDatabaseUrl.includes(":")) {
  console.error("SUPABASE_DB_PASSWORD is required.");
  process.exit(1);
}

function withPassword(value) {
  if (!password) return value;
  const url = new URL(value);
  url.password = password;
  return url.toString();
}

(async () => {
  const client = new Client({
    connectionString: withPassword(rawDatabaseUrl),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(fs.readFileSync(migrationPath, "utf8"));
  await client.end();
  console.log(JSON.stringify({ status: "raw duplicate migration applied" }));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
