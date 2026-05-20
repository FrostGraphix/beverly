const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
const ORG='4789eee8-7752-427b-8e3c-45cee119882d';
const METER='47005363529';
(async()=>{
 await client.connect();
 try {
  await client.query('begin');
  const orders = await client.query(`
    select po.id, po.amount_minor::bigint as amount_minor, po.wallet_id, po.created_by
    from public.purchase_orders po
    where po.actor_type='vendor'
      and po.actor_id=$1
      and po.meter_id=$2
      and po.status='delivered'
      and exists (
        select 1 from public.wallet_ledger_entries le
        where le.reference_type='purchase_order'
          and le.reference_id=po.id::text
          and le.entry_type='purchase_debit'
      )
      and not exists (
        select 1 from public.wallet_ledger_entries rev
        where rev.reference_type='purchase_order'
          and rev.reference_id=po.id::text
          and rev.entry_type='reversal_credit'
      )
    order by po.created_at asc
  `, [ORG, METER]);
  const reversed = [];
  for (const po of orders.rows) {
    const idempotencyKey = `purchase.${po.id}.reversal_credit`;
    const entry = await client.query(`
      select * from public.fn_post_ledger_entry(
        p_wallet_id := $1::uuid,
        p_direction := $2::text,
        p_amount_minor := $3::bigint,
        p_entry_type := $4::text,
        p_reference_type := $5::text,
        p_reference_id := $6::text,
        p_idempotency_key := $7::text,
        p_memo := $8::text,
        p_created_by := $9::uuid
      )
    `, [po.wallet_id, 'credit', po.amount_minor, 'reversal_credit', 'purchase_order', po.id, idempotencyKey, `Reversal · Vending · ${METER}`, po.created_by]);
    await client.query(`
      update public.purchase_orders
      set status='reversed', delivery_state='reversed_by_codex', failure_reason='Smoke-test vend reversed immediately at user request', updated_at=now()
      where id=$1::uuid
    `, [po.id]);
    reversed.push({ purchase_order_id: po.id, amount_minor: String(po.amount_minor), reversal_entry_id: entry.rows[0].id });
  }
  await client.query('commit');
  console.log(JSON.stringify({ reversed_count: reversed.length, reversed }, null, 2));
 } catch (error) {
  await client.query('rollback');
  throw error;
 } finally {
  const bal = await client.query(`select w.id, v.ledger_balance_minor, v.available_balance_minor from public.wallets w join public.v_wallet_balances v on v.wallet_id=w.id where w.owner_id=$1`, [ORG]);
  console.log('BALANCE', JSON.stringify(bal.rows,null,2));
  const remaining = await client.query(`select id, amount_minor, status, delivery_state from public.purchase_orders where actor_id=$1 and meter_id=$2 order by created_at desc limit 10`, [ORG, METER]);
  console.log('ORDERS', JSON.stringify(remaining.rows,null,2));
  await client.end();
 }
})();
