const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 const params=['47005363529','RESIDENTIAL','KYAKALE','LUKA ISAIAH','contract-sample-fallback', JSON.stringify({ seededFor:'vendor-vend-smoke', vendor:'Loleko Enterprises' })];
 let res = await client.query(`update public.account_bindings set customer_id=$1, tariff_id=$2, station_id=$3, remark=$4, source=$5, status='active', detail_json=coalesce(detail_json,'{}'::jsonb) || $6::jsonb, updated_at=now() where meter_id=$1 returning id, customer_id, meter_id, tariff_id, station_id, remark, status`, params);
 if (res.rowCount === 0) {
  res = await client.query(`insert into public.account_bindings (customer_id, meter_id, tariff_id, station_id, remark, source, status, detail_json) values ($1,$1,$2,$3,$4,$5,'active',$6::jsonb) returning id, customer_id, meter_id, tariff_id, station_id, remark, status`, params);
 }
 console.log(JSON.stringify(res.rows[0], null, 2));
 await client.end();
})();
