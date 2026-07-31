"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const poolerUrlPath = path.join(root, "supabase", ".temp", "pooler-url");
const rawDatabaseUrl = process.env.SUPABASE_DB_URL || fs.readFileSync(poolerUrlPath, "utf8").trim();
const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD;

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
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log("Connected successfully!");

  console.log("\n[1/3] Pruning audit_logs > 14 days and operational_snapshots > 7 days...");
  const auditRes = await client.query(`DELETE FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '14 days';`).catch(() => ({ rowCount: 0 }));
  console.log(`  - Deleted ${auditRes.rowCount || 0} old audit logs.`);

  const snapRes = await client.query(`DELETE FROM public.operational_snapshots WHERE captured_at < NOW() - INTERVAL '7 days';`).catch(() => ({ rowCount: 0 }));
  console.log(`  - Deleted ${snapRes.rowCount || 0} old operational snapshots.`);

  console.log("\n[2/3] Rebuilding disk files with VACUUM FULL...");
  await client.query("VACUUM FULL public.audit_logs;");
  await client.query("VACUUM FULL public.operational_snapshots;");

  console.log("\n[3/3] Final Disk Size Report:");
  const dbSizeRes = await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS total_size;`);
  console.log("  🎉 FINAL POSTGRESQL DISK SIZE:", dbSizeRes.rows[0].total_size);

  const tableSizesRes = await client.query(`
    SELECT
      relname AS table_name,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_size_pretty(pg_relation_size(relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(relid)) AS index_size
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 10;
  `);

  console.table(tableSizesRes.rows);
  await client.end();
})().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
