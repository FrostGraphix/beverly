const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 const q = await client.query(`
  select po.id, po.amount_minor, po.status, po.token, po.receipt_id, po.created_at, po.created_by,
         po.wallet_id, le.id as debit_entry_id, le.amount_minor as debit_amount, le.created_at as debit_created_at,
         rev.id as reversal_entry_id
  from public.purchase_orders po
  left join public.wallet_ledger_entries le on le.reference_type='purchase_order' and le.reference_id=po.id::text and le.entry_type='purchase_debit'
  left join public.wallet_ledger_entries rev on rev.reference_type='purchase_order' and rev.reference_id=po.id::text and rev.entry_type='reversal_credit'
  where po.actor_type='vendor'
    and po.actor_id=$1
    and po.meter_id=$2
    and po.status='delivered'
  order by po.created_at desc
  limit 30`, ['4789eee8-7752-427b-8e3c-45cee119882d','47005363529']);
 console.log(JSON.stringify(q.rows,null,2));
 const bal = await client.query(`select w.id, v.ledger_balance_minor, v.available_balance_minor from public.wallets w join public.v_wallet_balances v on v.wallet_id=w.id where w.owner_id=$1`, ['4789eee8-7752-427b-8e3c-45cee119882d']);
 console.log('BALANCE', JSON.stringify(bal.rows,null,2));
 await client.end();
})();
