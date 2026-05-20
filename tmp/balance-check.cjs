const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{ await client.connect(); const r=await client.query(`select w.id, v.ledger_balance_minor, v.available_balance_minor from public.wallets w join public.v_wallet_balances v on v.wallet_id=w.id where w.owner_id=$1`, ['4789eee8-7752-427b-8e3c-45cee119882d']); console.log(JSON.stringify(r.rows,null,2)); await client.end(); })();
