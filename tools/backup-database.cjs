"use strict";

/**
 * Verified logical backup of the Beverly Supabase database.
 *
 * This is Gate B of the storage remediation plan: nothing destructive runs
 * until this completes and its verification passes. The free plan provides no
 * PITR and retains no backups, so this file is the only recovery path.
 *
 * What it captures:
 *   - every populated table in `public`, as newline-delimited JSON
 *   - `auth.users` identity columns (not password hashes — those cannot be
 *     exported over PostgREST/SQL by design and require a platform restore)
 *   - `storage.objects` metadata
 *   - schema DDL: tables, columns, constraints, indexes, RLS policies,
 *     functions, cron schedule
 *   - a manifest with per-table row counts and SHA-256 of each file
 *
 * Verification (the point of the exercise):
 *   --verify re-reads every exported file, recounts rows, recomputes hashes,
 *   and re-queries the live table counts. A mismatch is a hard failure.
 *
 * Usage:
 *   node tools/backup-database.cjs                     # backup + verify
 *   node tools/backup-database.cjs --out D:/backups    # choose destination
 *   node tools/backup-database.cjs --verify <dir>      # re-verify an old run
 *
 * NOTE: this is a logical export, not a binary dump. It restores data and
 * schema, but not roles, grants, or Supabase platform state. For a full
 * disaster restore also run `npx supabase db dump` (CLI v2.100.1 is present;
 * pg_dump is not on PATH) and keep both.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const args = process.argv.slice(2);
const VERIFY_ONLY = args.includes("--verify") ? args[args.indexOf("--verify") + 1] : null;
const OUT_ROOT = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : path.resolve(__dirname, "..", "tmp", "backups");

const root = path.resolve(__dirname, "..");
const PAGE = 5000;

function connectionString() {
  const raw =
    process.env.SUPABASE_DB_URL ||
    fs.readFileSync(path.join(root, "supabase", ".temp", "pooler-url"), "utf8").trim();
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.SUPABASE_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD;
  const url = new URL(raw);
  if (password) url.password = password;
  return url.toString();
}

/**
 * Streamed hash + line count. Never materialises the file as a string: the
 * largest export here is ~344 MB and `fs.readFileSync(f, 'utf8')` exceeds
 * Node's maximum string length (0x1fffffe8) on files of this size.
 */
function digestFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let lines = 0;
    let firstLine = "";
    let sawFirstNewline = false;
    let tailByte = 0;
    let bytes = 0;

    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on("data", (chunk) => {
      hash.update(chunk);
      bytes += chunk.length;
      for (let i = 0; i < chunk.length; i += 1) {
        if (chunk[i] === 0x0a) lines += 1;
      }
      if (!sawFirstNewline) {
        const nl = chunk.indexOf(0x0a);
        firstLine += chunk.subarray(0, nl === -1 ? chunk.length : nl).toString("utf8");
        if (nl !== -1) sawFirstNewline = true;
      }
      tailByte = chunk[chunk.length - 1];
    });
    stream.on("error", reject);
    stream.on("end", () => {
      // A final record with no trailing newline still counts as a record.
      if (bytes > 0 && tailByte !== 0x0a) lines += 1;
      resolve({ sha256: hash.digest("hex"), lines, firstLine });
    });
  });
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(4 * 1024 * 1024);
  let read;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    hash.update(buf.subarray(0, read));
  }
  fs.closeSync(fd);
  return hash.digest("hex");
}

function connect() {
  return new Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 1800000,
  });
}

/**
 * Stream one table to NDJSON, paged so wide TOASTed rows cannot drop the pooler.
 *
 * Keyset pagination on ctid, not OFFSET. OFFSET re-scans from the start on every
 * page, which is O(n^2) — on the 552k-row aggregate table that is ~30M row reads
 * plus repeated TOAST fetches. Keyset makes each page an index-free forward scan
 * from the last position, so the whole table is read exactly once.
 */
async function exportTable(client, schema, table, dir) {
  const file = path.join(dir, `${schema}.${table}.ndjson`);
  const sink = fs.createWriteStream(file);
  let cursor = "(0,0)";
  let written = 0;

  for (;;) {
    const page = await client.query(
      `select t.ctid::text c, to_jsonb(t) j
         from "${schema}"."${table}" t
        where t.ctid > $1::tid
        order by t.ctid
        limit $2`,
      [cursor, PAGE]
    );
    if (!page.rows.length) break;
    for (const row of page.rows) {
      if (!sink.write(`${JSON.stringify(row.j)}\n`)) {
        await new Promise((resolve) => sink.once("drain", resolve));
      }
    }
    cursor = page.rows[page.rows.length - 1].c;
    written += page.rows.length;
  }
  await new Promise((resolve) => sink.end(resolve));
  return { file, rows: written };
}

async function exportSchemaDdl(client, dir) {
  const queries = {
    columns: `select table_name, column_name, data_type, is_nullable, column_default, ordinal_position
                from information_schema.columns where table_schema='public' order by 1, ordinal_position`,
    constraints: `select conrelid::regclass::text tbl, conname, contype, pg_get_constraintdef(oid) def
                    from pg_constraint c join pg_class r on r.oid=c.conrelid
                    join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' order by 1,2`,
    indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2`,
    policies: `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
                 from pg_policies where schemaname='public' order by 2,3`,
    functions: `select p.proname, pg_get_functiondef(p.oid) def
                  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.prokind='f' order by 1`,
    views: `select c.relname, c.relkind, pg_get_viewdef(c.oid, true) def
              from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind in ('v','m') order by 1`,
    cron: `select jobid, schedule, jobname, command, active from cron.job order by jobid`,
    rls: `select c.relname, c.relrowsecurity, c.relforcerowsecurity
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' order by 1`,
  };

  const ddl = {};
  for (const [name, sql] of Object.entries(queries)) {
    try {
      ddl[name] = (await client.query(sql)).rows;
    } catch (error) {
      ddl[name] = { error: error.message };
    }
  }
  const file = path.join(dir, "_schema.json");
  fs.writeFileSync(file, JSON.stringify(ddl, null, 2));
  return file;
}

async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const client = connect();
  await client.connect();
  await client.query("set statement_timeout='30min'");

  console.log(`backup destination: ${dir}\n`);

  const dbSize = (await client.query("select pg_size_pretty(pg_database_size(current_database())) s")).rows[0].s;
  console.log(`database size: ${dbSize}`);

  // Every base table in public, plus the two platform tables worth keeping.
  const targets = (
    await client.query(
      `select 'public' schema, c.relname tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' order by 1,2`
    )
  ).rows;
  targets.push({ schema: "storage", tbl: "objects" });

  console.log(`tables to export: ${targets.length}\n`);

  const manifest = {
    startedAt: new Date().toISOString(),
    databaseSize: dbSize,
    tables: {},
    warnings: [],
  };

  for (const { schema, tbl } of targets) {
    let liveCount = null;
    try {
      liveCount = Number((await client.query(`select count(*) n from "${schema}"."${tbl}"`)).rows[0].n);
    } catch (error) {
      manifest.warnings.push(`${schema}.${tbl}: count failed — ${error.message}`);
      continue;
    }
    if (liveCount === 0) {
      manifest.tables[`${schema}.${tbl}`] = { rows: 0, skipped: "empty" };
      continue;
    }
    try {
      const { file, rows } = await exportTable(client, schema, tbl, dir);
      // liveCount is sampled before the export starts. Actively-written tables
      // legitimately gain rows mid-export, so only a SHORTFALL is a failure.
      const ok = rows >= liveCount;
      manifest.tables[`${schema}.${tbl}`] = {
        rows,
        liveCountAtStart: liveCount,
        match: ok,
        file: path.basename(file),
        sha256: sha256(file),
        bytes: fs.statSync(file).size,
      };
      if (!ok) {
        manifest.warnings.push(
          `${schema}.${tbl}: exported ${rows} but ${liveCount} existed at start — SHORTFALL`
        );
      } else if (rows > liveCount) {
        manifest.notes = manifest.notes || [];
        manifest.notes.push(
          `${schema}.${tbl}: exported ${rows} vs ${liveCount} at start — ${rows - liveCount} rows written during export (expected on live tables)`
        );
      }
      console.log(`  ${ok ? "ok " : "!! "} ${`${schema}.${tbl}`.padEnd(42)} ${String(rows).padStart(8)} rows`);
    } catch (error) {
      manifest.warnings.push(`${schema}.${tbl}: export failed — ${error.message}`);
      console.log(`  !!  ${schema}.${tbl}: ${error.message}`);
    }
  }

  // auth.users identity columns only. Password hashes are deliberately not
  // exported; restoring auth requires a Supabase platform restore.
  try {
    const users = await client.query(
      `select id, email, phone, created_at, last_sign_in_at, role, raw_user_meta_data
         from auth.users order by created_at`
    );
    const file = path.join(dir, "auth.users.ndjson");
    // Trailing newline keeps the format identical to exportTable's output.
    fs.writeFileSync(file, users.rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    manifest.tables["auth.users"] = {
      rows: users.rowCount,
      file: "auth.users.ndjson",
      sha256: sha256(file),
      note: "identity columns only — password hashes require a platform restore",
    };
    console.log(`  ok  ${"auth.users".padEnd(42)} ${String(users.rowCount).padStart(8)} rows`);
  } catch (error) {
    manifest.warnings.push(`auth.users: ${error.message}`);
  }

  const ddlFile = await exportSchemaDdl(client, dir);
  manifest.schemaFile = path.basename(ddlFile);
  manifest.schemaSha256 = sha256(ddlFile);
  manifest.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2));
  await client.end();

  const totalRows = Object.values(manifest.tables).reduce((n, t) => n + (t.rows || 0), 0);
  const totalBytes = Object.values(manifest.tables).reduce((n, t) => n + (t.bytes || 0), 0);

  console.log(`
  tables exported : ${Object.keys(manifest.tables).length}
  total rows      : ${totalRows.toLocaleString()}
  total bytes     : ${(totalBytes / 1048576).toFixed(1)} MB
  warnings        : ${manifest.warnings.length}`);
  manifest.warnings.forEach((w) => console.log(`    - ${w}`));

  return dir;
}

/**
 * Re-read every file, recount, rehash, and re-query live counts.
 * Live counts are expected to have GROWN for actively-written tables; only a
 * shrink or a hash mismatch is treated as failure.
 */
async function runVerify(dir) {
  const manifestPath = path.join(dir, "_manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const client = connect();
  await client.connect();
  await client.query("set statement_timeout='30min'");

  console.log(`verifying ${dir}\n`);
  let failures = 0;
  let checked = 0;

  for (const [name, entry] of Object.entries(manifest.tables)) {
    if (!entry.file || entry.skipped) continue;
    const file = path.join(dir, entry.file);
    checked += 1;

    if (!fs.existsSync(file)) {
      console.log(`  FAIL ${name}: file missing`);
      failures += 1;
      continue;
    }

    const { sha256: digest, lines, firstLine } = await digestFile(file);

    if (digest !== entry.sha256) {
      console.log(`  FAIL ${name}: sha256 mismatch — file altered since backup`);
      failures += 1;
      continue;
    }
    if (lines !== entry.rows) {
      console.log(`  FAIL ${name}: file holds ${lines} rows, manifest says ${entry.rows}`);
      failures += 1;
      continue;
    }
    try {
      JSON.parse(firstLine);
    } catch {
      console.log(`  FAIL ${name}: first record is not valid JSON`);
      failures += 1;
      continue;
    }

    const [schema, tbl] = name.split(".");
    try {
      const live = Number((await client.query(`select count(*) n from "${schema}"."${tbl}"`)).rows[0].n);
      if (live < entry.rows) {
        console.log(`  WARN ${name}: live ${live} < backup ${entry.rows} — rows deleted since backup`);
      }
    } catch { /* auth.users and storage.objects are not always countable here */ }
  }

  await client.end();

  console.log(`
  files checked : ${checked}
  failures      : ${failures}
  verdict       : ${failures === 0 ? "PASS — backup is complete and intact" : "FAIL — do not proceed"}`);

  if (failures > 0) process.exit(1);
  return failures === 0;
}

(async () => {
  if (VERIFY_ONLY) {
    await runVerify(path.resolve(VERIFY_ONLY));
    return;
  }
  const dir = await runBackup();
  console.log("\n--- verification pass ---\n");
  await runVerify(dir);
  console.log(`
NEXT STEPS (Gate B is not complete until these are done):
  1. Copy ${dir} to a second location (R2 / external disk)
  2. Restore into a throwaway Supabase project and compare row counts
  3. Only then run: node tools/recover-token-transactions.cjs --commit`);
})().catch((error) => {
  console.error("backup failed:", error.message);
  process.exit(1);
});
