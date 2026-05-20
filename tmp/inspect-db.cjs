const { Client } = require('pg');
const client = new Client({
  host: 'db.qpoipyqgrjsjdvfqmxok.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Abdul$amad123',
  ssl: { rejectUnauthorized: false },
});
(async()=>{
 await client.connect();
 const queries = [
  ['binding', `select * from public.account_bindings where meter_id = $1 or customer_id = $1 limit 10`, ['47005363529']],
  ['loleko_org', `select id, legal_name, trading_name, status, email, phone, created_at from public.vendor_organizations where trading_name ilike '%Loleko%' or legal_name ilike '%Loleko%' limit 10`, []],
  ['all_orgs', `select id, legal_name, trading_name, status, email, phone from public.vendor_organizations order by created_at desc limit 20`, []],
  ['wallets', `select w.id, w.owner_type, w.owner_id, w.status, w.daily_debit_cap_minor, coalesce(v.ledger_balance_minor,0) as ledger_balance_minor, coalesce(v.available_balance_minor,0) as available_balance_minor from public.wallets w left join public.v_wallet_balances v on v.wallet_id=w.id order by w.created_at desc limit 20`, []],
 ];
 for (const [name, sql, params] of queries) {
   const res = await client.query(sql, params);
   console.log('\n'+name, JSON.stringify(res.rows, null, 2));
 }
 await client.end();
})();
