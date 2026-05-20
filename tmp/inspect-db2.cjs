const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 for (const table of ['vendor_organizations','vendor_users','account_bindings','wallets','wallet_ledger_entries','purchase_orders']) {
   const cols = await client.query(`select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [table]);
   console.log('\nCOLUMNS '+table, cols.rows.map(r=>r.column_name).join(', '));
 }
 const orgs = await client.query(`select * from public.vendor_organizations order by created_at desc limit 20`);
 console.log('\nORGS', JSON.stringify(orgs.rows, null, 2));
 const binds = await client.query(`select * from public.account_bindings order by updated_at desc nulls last limit 20`);
 console.log('\nBINDINGS', JSON.stringify(binds.rows, null, 2));
 await client.end();
})();
