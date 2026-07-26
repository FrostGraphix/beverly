"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260725100000_database_quota_resolution.sql");
const poolerUrlPath = path.join(root, "supabase", ".temp", "pooler-url");
const rawDatabaseUrl = process.env.SUPABASE_DB_URL || fs.readFileSync(poolerUrlPath, "utf8").trim();
const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_PASSWORD || process.env.POSTGRES_PASSWORD;

function getConnectionString() {
  if (rawDatabaseUrl.includes(":") && rawDatabaseUrl.split("@")[0].split(":")[2]) {
    return rawDatabaseUrl;
  }
  if (password) {
    const url = new URL(rawDatabaseUrl);
    url.password = password;
    return url.toString();
  }
  return rawDatabaseUrl;
}

(async () => {
  const connStr = getConnectionString();
  console.log("Connecting to Supabase PostgreSQL database...");
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000 // 5 minutes
  });
  await client.connect();
  console.log("Connected successfully. Applying quota resolution migration...");
  
  const sql = fs.readFileSync(migrationPath, "utf8");
  // Execute migration
  await client.query(sql);
  
  console.log("Migration applied successfully!");
  await client.end();
  console.log(JSON.stringify({ status: "quota resolution migration complete" }, null, 2));
})().catch((error) => {
  console.error("Migration execution failed:", error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
