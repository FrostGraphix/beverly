'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const tables = ['daily_meter_readings', 'daily_meter_deltas', 'meter_consumption_aggregates', 'wallet_audit_log', 'audit_logs'];
function command(table, vacuum = false) {
  assert(tables.includes(table), 'Unexpected maintenance target');
  return vacuum ? `VACUUM (ANALYZE, SKIP_LOCKED, TRUNCATE TRUE, PARALLEL 0) public.${table}` : `REINDEX TABLE CONCURRENTLY public.${table}`;
}
if (process.argv.includes('--self-test')) {
  assert.equal(command(tables[0]), 'REINDEX TABLE CONCURRENTLY public.daily_meter_readings');
  assert.throws(() => command('wallet_ledger_entries'));
  assert.throws(() => command('daily_meter_readings; DROP TABLE x'));
  assert.equal(command(tables[0], true), 'VACUUM (ANALYZE, SKIP_LOCKED, TRUNCATE TRUE, PARALLEL 0) public.daily_meter_readings');
  console.log('Maintenance target safety checks passed');
} else main().catch(error => { console.error(error.message); process.exitCode = 1; });
async function main() {
  const table = process.argv.find(arg => arg.startsWith('--table='))?.slice(8);
  const vacuum = process.argv.includes('--vacuum');
  const auditTable = ['wallet_audit_log', 'audit_logs'].includes(table);
  assert(!(vacuum && auditTable), 'Audit maintenance is index-only');
  const sql = command(table, vacuum);
  const local = process.argv.includes('--local');
  const root = process.env.RECOVERY_DIRECTORY;
  assert(root && path.isAbsolute(root), 'Absolute verified recovery directory required');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const recoveryFile = table === 'audit_logs' ? 'api-audit-recovery-verification.json' : table === 'wallet_audit_log' ? 'wallet-audit-recovery-verification.json' : 'recovery-verification.json';
  const recovery = JSON.parse(fs.readFileSync(path.join(root, recoveryFile), 'utf8'));
  assert.equal(recovery.status, table === 'audit_logs' ? 'api_audit_restore_verified' : table === 'wallet_audit_log' ? 'wallet_audit_restore_verified' : 'three_table_restore_verified');
  assert.equal(recovery.archiveSha256, manifest.sha256);
  const archiveHash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(root, 'database.dump'))) archiveHash.update(chunk);
  assert.equal(archiveHash.digest('hex'), manifest.sha256, 'Backup checksum mismatch');
  if (!local) {
    assert.equal(process.env.SUPABASE_DB_HOST, 'aws-1-eu-west-1.pooler.supabase.com');
    assert.equal(process.env.SUPABASE_DB_USER, 'postgres.qpoipyqgrjsjdvfqmxok');
    assert.equal(process.env.SUPABASE_DB_PORT, '5432');
    assert(process.env.SUPABASE_DB_PASSWORD, 'Database password required');
  }
  const config = local ? {
    host: '127.0.0.1', port: 55437, user: 'recovery_admin', database: 'recovery_validation',
    password: fs.readFileSync(path.join(root, 'recovery-password.private'), 'utf8'),
  } : { host: process.env.SUPABASE_DB_HOST, port: 5432, user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } };
  config.connectionTimeoutMillis = 15000;
  config.application_name = 'beverly_targeted_concurrent_reindex';
  const client = new Client(config);
  const monitor = new Client({ ...config, application_name: 'beverly_maintenance_monitor', statement_timeout: 5000 });
  const evidence = { table, local, sql, startedAt: new Date().toISOString() };
  const evidenceFile = path.join(root, `${local ? 'local' : 'production'}-${vacuum ? 'vacuum' : 'reindex'}-${table}-${Date.now()}.json`);
  let timer, busy = false, cancelled = false, pid, auditCutoff;
  const snapshot = async () => {
    await client.query('begin isolation level repeatable read read only');
    try {
      const key = auditTable ? 'id' : table === 'meter_consumption_aggregates' ? 'station_id, meter_id, period_type, period_start' : 'station_id, meter_id, reading_date';
      if (auditTable && !auditCutoff) auditCutoff = (await client.query(`select max(created_at)::text cutoff from public.${table}`)).rows[0].cutoff;
      return {
        data: (await client.query(`select count(*)::text rows, md5(string_agg(md5(to_jsonb(t)::text), '' order by ${key})) digest from public.${table} t${auditTable ? ' where created_at <= $1::timestamptz' : ''}`, auditTable ? [auditCutoff] : [])).rows[0],
        auditCutoff,
        size: (await client.query('select pg_total_relation_size($1::regclass)::text relation_bytes, pg_indexes_size($1::regclass)::text index_bytes, pg_database_size(current_database())::text database_bytes', [`public.${table}`])).rows[0],
        indexes: (await client.query('select c.relname, i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) definition from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=$1::regclass order by c.relname', [`public.${table}`])).rows,
        constraints: (await client.query('select conname, convalidated, pg_get_constraintdef(oid) definition from pg_constraint where conrelid=$1::regclass order by conname', [`public.${table}`])).rows,
        triggers: (await client.query('select tgname, tgenabled, pg_get_triggerdef(oid) definition from pg_trigger where tgrelid=$1::regclass order by tgname', [`public.${table}`])).rows,
        policies: (await client.query('select * from pg_policies where schemaname=\'public\' and tablename=$1 order by policyname', [table])).rows,
        security: (await client.query('select relrowsecurity, relforcerowsecurity, relacl::text from pg_class where oid=$1::regclass', [`public.${table}`])).rows,
      };
    } finally { await client.query('rollback'); }
  };
  try {
    await client.connect(); await monitor.connect();
    await client.query("set timezone='UTC'");
    await client.query(vacuum ? "set statement_timeout='30s'" : "set statement_timeout='120s'");
    await client.query("set lock_timeout='1s'");
    await client.query("set maintenance_work_mem='32MB'");
    await client.query('set max_parallel_maintenance_workers=0');
    if (vacuum) await client.query("set vacuum_cost_delay='2ms'");
    pid = (await client.query('select pg_backend_pid() pid')).rows[0].pid;
    evidence.before = await snapshot();
    assert(evidence.before.indexes.length > 0);
    assert(evidence.before.indexes.every(index => index.indisvalid && index.indisready), 'Invalid pre-existing index');
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), { flag: 'wx' });
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify(evidence)); return; }
    timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const blocked = (await monitor.query('select count(*)::int n from pg_stat_activity where $1=any(pg_blocking_pids(pid))', [pid])).rows[0].n;
        if (blocked > 0) {
          cancelled = true;
          await monitor.query('select pg_cancel_backend($1)', [pid]);
        }
      } catch { cancelled = true; client.end().catch(() => {}); }
      finally { busy = false; }
    }, 2000);
    await client.query(sql);
    clearInterval(timer);
    assert(!cancelled, 'Maintenance stopped after health gate');
    evidence.after = await snapshot();
    for (const key of ['data', 'indexes', 'constraints', 'triggers', 'policies', 'security']) {
      assert.deepEqual(evidence.after[key], evidence.before[key], `${key} changed; requires investigation`);
    }
    evidence.verified = true;
    console.log(JSON.stringify({ table, local, before: evidence.before.size, after: evidence.after.size, rows: evidence.after.data.rows, logicalAndSchemaChecks: 'matched' }));
  } catch (error) { evidence.error = error.message; throw error; }
  finally {
    clearInterval(timer);
    evidence.finishedAt = new Date().toISOString();
    if (fs.existsSync(evidenceFile)) fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
    await client.end().catch(() => {}); await monitor.end().catch(() => {});
  }
}
