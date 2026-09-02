const fs = require('node:fs');
const { Client } = require('pg');

const env = Object.fromEntries(
  fs.readFileSync('backend/wallet/.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

async function main() {
  const client = new Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: env.SUPABASE_DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const params = ['2026-06-05T00:00:00.000Z', '2026-09-02T23:59:59.999Z'];
  const query = (sql) => client.query(sql, params);
  const totals = await query(`
    select count(*)::int total_count,
      count(*) filter(where status='delivered')::int delivered_count,
      count(*) filter(where status='failed')::int failed_count,
      coalesce(sum(amount_minor) filter(where status='delivered'),0)::bigint revenue_minor,
      coalesce(sum(units_kwh) filter(where status='delivered'),0)::numeric units_kwh,
      count(distinct id)::int distinct_ids,
      count(*) filter(where status is null)::int null_status,
      count(*) filter(where amount_minor is null)::int null_amount,
      count(*) filter(where station_id is null or station_id='')::int missing_station,
      count(*) filter(where actor_id is null)::int missing_actor
    from purchase_orders where created_at between $1 and $2`);
  const statuses = await query(`
    select status,count(*)::int count from purchase_orders
    where created_at between $1 and $2 group by status order by count(*) desc`);
  const daily = await query(`
    select coalesce(sum(n),0)::int daily_total from (
      select date(created_at at time zone 'UTC'),count(*) n from purchase_orders
      where created_at between $1 and $2 group by 1
    ) grouped`);
  const vendorRaw = await query(`
    select count(*)::int purchase_count,
      count(*) filter(where status='delivered')::int delivered_count,
      count(*) filter(where status='failed')::int failed_count,
      coalesce(sum(amount_minor) filter(where status='delivered'),0)::bigint revenue_minor
    from purchase_orders where created_at between $1 and $2 and actor_type='vendor'`);
  const breakdown = await query(`
    select coalesce(sum(purchase_count),0)::int purchase_count,
      coalesce(sum(delivered_count),0)::int delivered_count,
      coalesce(sum(failed_count),0)::int failed_count,
      coalesce(sum(revenue_minor),0)::bigint revenue_minor
    from wallet_report_purchase_breakdown($1,$2,'vendor','all',null,null,'all',null)`);
  const successful = await query(`
    select coalesce(sum(purchase_count),0)::int purchase_count,
      coalesce(sum(delivered_count),0)::int delivered_count,
      coalesce(sum(failed_count),0)::int failed_count
    from wallet_report_purchase_breakdown($1,$2,'vendor','all',null,null,'successful',null)`);
  const failed = await query(`
    select coalesce(sum(purchase_count),0)::int purchase_count,
      coalesce(sum(delivered_count),0)::int delivered_count,
      coalesce(sum(failed_count),0)::int failed_count
    from wallet_report_purchase_breakdown($1,$2,'vendor','all',null,null,'failed',null)`);
  const orphan = await query(`
    select count(*)::int orphan_vendor_rows from purchase_orders po
    left join vendor_organizations vo on vo.id=po.actor_id
    where po.created_at between $1 and $2 and po.actor_type='vendor' and vo.id is null`);
  const schema = await client.query(`
    select count(*)::int required_columns from information_schema.columns
    where table_schema='public' and (
      (table_name='admin_announcements' and column_name=any(array['request_key','email_recipient_count','email_sent_count','email_failed_count','delivery_status']))
      or (table_name='admin_announcement_deliveries' and column_name=any(array['email','email_message_id','email_status','email_delivered_at','email_failed_at']))
    )`);
  const migrations = await client.query(`
    select version from supabase_migrations.schema_migrations
    where version >= '20260901120000' order by version`);
  const result = {
    totals: totals.rows[0],
    statuses: statuses.rows,
    daily: daily.rows[0],
    vendorRaw: vendorRaw.rows[0],
    breakdown: breakdown.rows[0],
    successful: successful.rows[0],
    failed: failed.rows[0],
    orphan: orphan.rows[0],
    schema: schema.rows[0],
    migrations: migrations.rows,
  };
  fs.writeFileSync('.codex-audits/reports-runtime-2026-09-02/reconciliation.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
