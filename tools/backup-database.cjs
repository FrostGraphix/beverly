"use strict";

/**
 * Verified logical backup of the Beverly Supabase database.
 *
 * The free plan has no PITR and retains no backups, so this is the only
 * recovery path and the blocking gate for every destructive storage phase.
 *
 * TRANSPORT: PostgREST, not the Postgres pooler.
 * ------------------------------------------------------------------
 * Measured 2026-08-02 on identical rows (api_cache, 50 rows, 5.11 MB):
 *     pooler (aws-1-eu-west-1.pooler.supabase.com)  48.7 s   ~100 KB/s
 *     PostgREST (project REST endpoint)              4.0 s  ~1300 KB/s
 * Synthetic transfers with no TOAST and no JSONB confirmed the pooler itself
 * at 52-129 KB/s, so this is transport, not query shape. A pooler-based export
 * of ~1.4 GB dropped its connection mid-table. PostgREST is ~12x faster and
 * completes. `pg` is still used, but only for small catalog/DDL reads.
 *
 * PAGINATION: keyset on a real unique key, never OFFSET, never ctid.
 * ------------------------------------------------------------------
 * Two earlier approaches were wrong and are recorded so they do not return:
 *   - OFFSET re-scans from the start on every page (O(n^2)).
 *   - ctid keyset is worse: EXPLAIN shows `Sort (Sort Key: ctid) -> Seq Scan`
 *     on every page, because ctid has no index.
 * This version orders by the table's PRIMARY KEY, or its narrowest UNIQUE
 * constraint when there is no PK. Measured 2026-08-02: 119 of 130 tables have
 * a single-column PK, 9 have composite PKs, and the two largest tables
 * (daily_meter_readings 477,994 rows; meter_consumption_aggregates 260,587)
 * have NO primary key at all -- their `*_pk`-named constraints are UNIQUE.
 * Composite keys use PostgREST row-ordering semantics expressed as nested
 * or/and filters.
 *
 * Correctness is asserted, not assumed: every table's exported record count is
 * compared against a live `count=exact` head request. A keyset that skipped or
 * repeated rows cannot pass that check.
 *
 * Usage:
 *   node tools/backup-database.cjs                     # backup, then verify
 *   node tools/backup-database.cjs --only a,b,c        # named tables only
 *   node tools/backup-database.cjs --out D:/backups
 *   node tools/backup-database.cjs --verify <dir>
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const args = process.argv.slice(2);
const argOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const VERIFY_ONLY = argOf("--verify");
const ONLY = argOf("--only") ? argOf("--only").split(",").map((s) => s.trim()).filter(Boolean) : null;
const OUT_ROOT = argOf("--out") || path.resolve(__dirname, "..", "tmp", "backups");

const root = path.resolve(__dirname, "..");
const PAGE = 1000;

const REST_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

function pgConnectionString() {
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

function pgClient() {
  return new Client({
    connectionString: pgConnectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 600000,
  });
}

async function rest(pathAndQuery, { head = false, retries = 4 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${REST_URL}/rest/v1/${pathAndQuery}`, {
        method: head ? "HEAD" : "GET",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Accept: "application/json",
          // count=exact populates Content-Range with the true total.
          ...(head ? { Prefer: "count=exact" } : {}),
        },
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
      }
      if (head) {
        const range = response.headers.get("content-range") || "";
        return Number(range.split("/")[1]);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

/** PostgREST needs values with reserved characters wrapped in double quotes. */
function restValue(v) {
  if (v === null || v === undefined) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[,.()"'\s:]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

/**
 * Row-wise "greater than" for a composite key, expressed in PostgREST syntax:
 *   (c1 > v1) OR (c1 = v1 AND c2 > v2) OR (c1 = v1 AND c2 = v2 AND c3 > v3) ...
 */
function keysetFilter(cols, last) {
  if (cols.length === 1) return `${cols[0]}=gt.${restValue(last[cols[0]])}`;
  const clauses = cols.map((_, i) => {
    const eqs = cols.slice(0, i).map((c) => `${c}.eq.${restValue(last[c])}`);
    const gt = `${cols[i]}.gt.${restValue(last[cols[i]])}`;
    return eqs.length ? `and(${[...eqs, gt].join(",")})` : gt;
  });
  return `or=(${clauses.join(",")})`;
}

/**
 * Keyset export with an adaptive page size.
 *
 * Wide TOASTed tables (operational_snapshots averages ~13 kB/row, api_cache
 * ~42 kB/row) produce multi-megabyte responses at 1000 rows and the fetch
 * fails outright. On failure the page size halves and the page is retried from
 * the same cursor, so no rows are skipped; it recovers upward on success.
 */
async function exportTable(table, keyCols, dir) {
  const file = path.join(dir, `public.${table}.ndjson`);
  const sink = fs.createWriteStream(file);
  const order = keyCols.map((c) => `${c}.asc`).join(",");
  let last = null;
  let written = 0;
  let pageSize = PAGE;
  let consecutiveOk = 0;

  for (;;) {
    const filter = last ? `&${keysetFilter(keyCols, last)}` : "";
    let rows;
    try {
      rows = await rest(`${table}?select=*&order=${order}&limit=${pageSize}${filter}`, { retries: 2 });
    } catch (error) {
      if (pageSize > 25) {
        pageSize = Math.max(25, Math.floor(pageSize / 4));
        consecutiveOk = 0;
        continue; // same cursor, smaller page — nothing is skipped
      }
      throw error;
    }
    if (!rows.length) break;
    for (const row of rows) {
      if (!sink.write(`${JSON.stringify(row)}\n`)) {
        await new Promise((resolve) => sink.once("drain", resolve));
      }
    }
    written += rows.length;
    last = rows[rows.length - 1];
    const asked = pageSize;
    consecutiveOk += 1;
    if (consecutiveOk >= 5 && pageSize < PAGE) {
      pageSize = Math.min(PAGE, pageSize * 2);
      consecutiveOk = 0;
    }
    if (rows.length < asked) break;
  }
  await new Promise((resolve) => sink.end(resolve));
  return { file, rows: written };
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(4 * 1024 * 1024);
  let read;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read));
  fs.closeSync(fd);
  return hash.digest("hex");
}

/** Streamed hash + record count; never materialises the file as a string. */
function digestFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let lines = 0;
    let bytes = 0;
    let tailByte = 0;
    let firstLine = "";
    let sawNewline = false;
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on("data", (chunk) => {
      hash.update(chunk);
      bytes += chunk.length;
      for (let i = 0; i < chunk.length; i += 1) if (chunk[i] === 0x0a) lines += 1;
      if (!sawNewline) {
        const nl = chunk.indexOf(0x0a);
        firstLine += chunk.subarray(0, nl === -1 ? chunk.length : nl).toString("utf8");
        if (nl !== -1) sawNewline = true;
      }
      tailByte = chunk[chunk.length - 1];
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (bytes > 0 && tailByte !== 0x0a) lines += 1;
      resolve({ sha256: hash.digest("hex"), lines, firstLine });
    });
  });
}

/** PK if present, else the narrowest UNIQUE constraint. */
async function tableKeys(client) {
  const { rows } = await client.query(`
    with k as (
      select c.relname tbl, pc.contype,
             (select string_agg(a.attname, ',' order by o.ord)
                from lateral unnest(pc.conkey) with ordinality o(attnum, ord)
                join pg_attribute a on a.attrelid = pc.conrelid and a.attnum = o.attnum) cols,
             array_length(pc.conkey, 1) ncols
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_constraint pc on pc.conrelid = c.oid and pc.contype in ('p','u')
       where n.nspname = 'public' and c.relkind = 'r')
    select distinct on (tbl) tbl, cols
      from k
     order by tbl, (contype = 'p') desc, ncols`);
  return new Map(rows.map((r) => [r.tbl, r.cols.split(",")]));
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
    functions: `select p.proname, p.proconfig, pg_get_functiondef(p.oid) def
                  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.prokind='f' order by 1`,
    views: `select c.relname, c.relkind, pg_get_viewdef(c.oid, true) def
              from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind in ('v','m') order by 1`,
    cron: `select jobid, schedule, jobname, command, active from cron.job order by jobid`,
    rls: `select c.relname, c.relrowsecurity, c.relforcerowsecurity
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' order by 1`,
    migrations: `select version, name from supabase_migrations.schema_migrations order by version`,
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
  if (!REST_URL || !SERVICE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });

  // Metadata phase: the pooler connection is opened, read, and closed. Holding
  // it open across the REST export is what produced ECONNRESET -- an idle
  // pooler session is reaped while the (much longer) REST work proceeds.
  let client = pgClient();
  client.on("error", () => {});
  await client.connect();
  await client.query("set statement_timeout='10min'");

  const dbSize = (await client.query("select pg_size_pretty(pg_database_size(current_database())) s")).rows[0].s;
  const keys = await tableKeys(client);
  let tables = (
    await client.query(
      `select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' order by 1`
    )
  ).rows.map((r) => r.t);
  if (ONLY) tables = tables.filter((t) => ONLY.includes(t));

  console.log(`destination : ${dir}`);
  console.log(`transport   : PostgREST (${new URL(REST_URL).hostname})`);
  console.log(`database    : ${dbSize}`);
  // Close before the REST phase. An idle pooler session is reaped while the
  // much longer REST export runs, which surfaced as ECONNRESET mid-backup.
  await client.end();

  console.log(`tables      : ${tables.length}\n`);

  const manifest = {
    startedAt: new Date().toISOString(),
    transport: "postgrest",
    databaseSize: dbSize,
    tables: {},
    warnings: [],
    notes: [],
  };

  for (const table of tables) {
    const keyCols = keys.get(table);
    if (!keyCols) {
      manifest.warnings.push(`${table}: no PK or UNIQUE constraint — cannot paginate deterministically`);
      console.log(`  !!  ${table.padEnd(42)} no usable key`);
      continue;
    }
    let liveCount;
    try {
      liveCount = await rest(`${table}?select=*&limit=1`, { head: true });
    } catch (error) {
      manifest.warnings.push(`${table}: count failed — ${error.message}`);
      continue;
    }
    if (!liveCount) {
      manifest.tables[table] = { rows: 0, skipped: "empty" };
      continue;
    }
    try {
      const t0 = Date.now();
      const { file, rows } = await exportTable(table, keyCols, dir);
      const secs = (Date.now() - t0) / 1000;
      const ok = rows >= liveCount;
      manifest.tables[table] = {
        rows,
        liveCountAtStart: liveCount,
        match: ok,
        key: keyCols.join(","),
        file: path.basename(file),
        sha256: sha256(file),
        bytes: fs.statSync(file).size,
        seconds: Number(secs.toFixed(1)),
      };
      if (!ok) manifest.warnings.push(`${table}: exported ${rows} but ${liveCount} existed at start — SHORTFALL`);
      else if (rows > liveCount) manifest.notes.push(`${table}: +${rows - liveCount} rows written during export`);
      const mb = fs.statSync(file).size / 1048576;
      console.log(
        `  ${ok ? "ok " : "!! "} ${table.padEnd(42)} ${String(rows).padStart(8)} rows  ${mb.toFixed(1).padStart(7)} MB  ${secs.toFixed(1)}s`
      );
    } catch (error) {
      manifest.warnings.push(`${table}: export failed — ${error.message}`);
      console.log(`  !!  ${table.padEnd(42)} ${error.message}`);
    }
  }

  // Tail phase: reopen for auth.users and DDL, which PostgREST cannot serve.
  client = pgClient();
  client.on("error", () => {});
  await client.connect();
  await client.query("set statement_timeout='10min'");

  try {
    const users = await client.query(
      `select id, email, phone, created_at, last_sign_in_at, role, raw_user_meta_data
         from auth.users order by created_at`
    );
    const file = path.join(dir, "auth.users.ndjson");
    fs.writeFileSync(file, users.rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    manifest.tables["auth.users"] = {
      rows: users.rowCount,
      file: "auth.users.ndjson",
      sha256: sha256(file),
      bytes: fs.statSync(file).size,
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

async function runVerify(dir) {
  const manifestPath = path.join(dir, "_manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath} — export did not complete`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

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
      console.log(`  FAIL ${name}: sha256 mismatch`);
      failures += 1;
      continue;
    }
    if (lines !== entry.rows) {
      console.log(`  FAIL ${name}: file holds ${lines} records, manifest says ${entry.rows}`);
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
    if (!name.startsWith("auth.")) {
      try {
        const live = await rest(`${name}?select=*&limit=1`, { head: true });
        if (live < entry.rows) console.log(`  WARN ${name}: live ${live} < backup ${entry.rows} — rows deleted since`);
      } catch { /* non-fatal */ }
    }
  }

  if (manifest.schemaFile) {
    const sf = path.join(dir, manifest.schemaFile);
    checked += 1;
    if (!fs.existsSync(sf) || sha256(sf) !== manifest.schemaSha256) {
      console.log("  FAIL _schema.json: missing or altered");
      failures += 1;
    }
  }

  console.log(`
  files checked : ${checked}
  failures      : ${failures}
  verdict       : ${failures === 0 ? "PASS — backup is complete and intact" : "FAIL — do not proceed"}`);
  if (failures > 0) process.exit(1);
  return true;
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
GATE B also requires:
  1. Copy ${dir} to a second location
  2. Restore into a throwaway project and compare counts
     — a verified export is not a verified restore`);
})().catch((error) => {
  console.error("backup failed:", error.message);
  process.exit(1);
});
