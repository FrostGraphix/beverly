const { Client } = require('pg');
const client = new Client({host:'db.qpoipyqgrjsjdvfqmxok.supabase.co',port:5432,database:'postgres',user:'postgres',password:'Abdul$amad123',ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 const meter='47005373957';
 const binding=await client.query(`select * from public.account_bindings where meter_id=$1 or customer_id=$1 limit 10`, [meter]);
 console.log('BINDING', JSON.stringify(binding.rows,null,2));
 const recent=await client.query(`select id, meter_id, customer_id, customer_name, station_id, tariff_id, status, created_at from public.purchase_orders where meter_id=$1 order by created_at desc limit 5`, [meter]);
 console.log('RECENT_ORDERS', JSON.stringify(recent.rows,null,2));
 await client.end();
})();
