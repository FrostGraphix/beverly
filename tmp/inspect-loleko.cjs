const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 const orgIds = ['4789eee8-7752-427b-8e3c-45cee119882d','aded8600-9221-46b4-b0cd-ec9434347edb'];
 for (const orgId of orgIds) {
  console.log('\nORG', orgId);
  console.log('USERS', JSON.stringify((await client.query(`select * from public.vendor_users where vendor_organization_id=$1`, [orgId])).rows, null, 2));
  console.log('WALLETS', JSON.stringify((await client.query(`select w.*, coalesce(v.ledger_balance_minor,0) ledger_balance_minor, coalesce(v.available_balance_minor,0) available_balance_minor from public.wallets w left join public.v_wallet_balances v on v.wallet_id=w.id where owner_type='vendor' and owner_id=$1`, [orgId])).rows, null, 2));
 }
 console.log('\nRECENT LEDGER', JSON.stringify((await client.query(`select * from public.wallet_ledger_entries order by created_at desc limit 10`)).rows, null, 2));
 await client.end();
})();
