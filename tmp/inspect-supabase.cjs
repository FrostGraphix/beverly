const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
function loadEnv(file){ if(!fs.existsSync(file)) return; for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) { if(!line || line.trim().startsWith('#')) continue; const m=line.match(/^([^=]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; } }
loadEnv(path.join(process.cwd(),'backend/wallet/.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
(async()=>{
 const meter='47005363529';
 const tables=['account_bindings','vendor_organizations','vendor_users','wallets','wallet_ledger_entries','purchase_orders'];
 for(const t of tables){
   let q=supabase.from(t).select('*').limit(5);
   if(t==='account_bindings') q=supabase.from(t).select('*').or(`meter_id.eq.${meter},customer_id.eq.${meter}`).limit(10);
   if(t==='vendor_organizations') q=supabase.from(t).select('id,legal_name,trading_name,status,email,phone,created_at').ilike('trading_name','%Loleko%').limit(10);
   const {data,error}=await q;
   console.log('\nTABLE',t,error?{error:error.message}:data);
 }
 const {data: orgs}=await supabase.from('vendor_organizations').select('id,legal_name,trading_name,status,email,phone').limit(20);
 console.log('\nORGS',orgs);
})();
