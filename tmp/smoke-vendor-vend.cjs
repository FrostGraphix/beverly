const fs = require('fs');
const path = require('path');
function loadEnv(file){ if(!fs.existsSync(file)) return; for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) { if(!line || line.trim().startsWith('#')) continue; const m=line.match(/^([^=]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; } }
loadEnv(path.join(process.cwd(),'backend/wallet/.env'));
async function jsonFetch(url, init={}){
 const res = await fetch(url, init);
 const text = await res.text();
 let body; try{ body = JSON.parse(text); } catch { body = text; }
 return {status: res.status, ok: res.ok, body};
}
(async()=>{
 const auth = await jsonFetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method:'POST', headers:{'Content-Type':'application/json','apikey':process.env.SUPABASE_ANON_KEY},
  body: JSON.stringify({ email:'samadanmusa@yahoo.com', password:'Abdul$amad123' })
 });
 console.log('AUTH', auth.status, auth.body.error || auth.body.user?.email || auth.body.msg || 'ok');
 if(!auth.ok) process.exit(2);
 const token = auth.body.access_token;
 const headers = {'Content-Type':'application/json','Authorization':`Bearer ${token}`};
 for (const [name, url, init] of [
  ['me','http://127.0.0.1:4000/api/v1/vendor/me', {headers}],
  ['wallet','http://127.0.0.1:4000/api/v1/vendor/wallet', {headers}],
  ['preview','http://127.0.0.1:4000/api/v1/vendor/vend/preview', {method:'POST',headers,body:JSON.stringify({meterId:'47005363529',amountMinor:100000})}],
  ['vend','http://127.0.0.1:4000/api/v1/vendor/vend', {method:'POST',headers:{...headers,'Idempotency-Key':`smoke-${Date.now()}`},body:JSON.stringify({meterId:'47005363529',amountMinor:100000,mode:'wallet'})}],
 ]) {
  const out = await jsonFetch(url, init);
  const summary = name === 'vend' && out.ok ? { status: out.body.purchaseOrder?.status, token: out.body.token, units: out.body.units, receiptId: out.body.receiptId } : out.body;
  console.log('\n'+name.toUpperCase(), out.status, JSON.stringify(summary, null, 2).slice(0,3000));
 }
})();
