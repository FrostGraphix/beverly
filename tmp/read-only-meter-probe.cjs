const fs = require('fs');
const path = require('path');
function loadEnv(file){ if(!fs.existsSync(file)) return; for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) { if(!line || line.trim().startsWith('#')) continue; const m=line.match(/^([^=]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; } }
loadEnv(path.join(process.cwd(),'backend/wallet/.env'));
const base = process.env.ENERGY_BACKEND_URL;
const token = process.env.ENERGY_BEARER_TOKEN;
const meter = '47005373957';
async function call(pathname, body){
 const res = await fetch(base + pathname, { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body: JSON.stringify(body)});
 const text = await res.text(); let json; try{json=JSON.parse(text)}catch{}
 return { endpoint: pathname, status: res.status, body: json ?? text.slice(0,500) };
}
(async()=>{
 const requests = [
  ['/api/account/read', { meterId: meter, pageNumber: 1, pageSize: 50 }],
  ['/api/account/read', { customerId: meter, pageNumber: 1, pageSize: 50 }],
  ['/api/account/read', { searchTerm: meter, pageNumber: 1, pageSize: 50 }],
  ['/api/account/read', { pageNumber: 1, pageSize: 50, stationId: 'KYAKALE' }],
  ['/api/meter/read', { meterId: meter, pageNumber: 1, pageSize: 50 }],
  ['/api/meter/read', { searchTerm: meter, pageNumber: 1, pageSize: 50 }],
  ['/api/customer/read', { customerId: meter, pageNumber: 1, pageSize: 50 }],
  ['/API/PrepayReport/LowPurchaseSituation', { meterId: meter, pageNumber: 1, pageSize: 50 }],
  ['/API/PrepayReport/LowPurchaseSituation', { SITE_ID: 'KYAKALE', pageNumber: 1, pageSize: 50 }],
 ];
 for (const [p,b] of requests) {
  const out = await call(p,b);
  console.log('\nREQUEST', p, JSON.stringify(b));
  console.log(JSON.stringify(out.body).slice(0,2000));
 }
})();
