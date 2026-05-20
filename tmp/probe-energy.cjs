const fs = require('fs');
const path = require('path');
function loadEnv(file){
  if(!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
    if(!line || line.trim().startsWith('#')) continue;
    const m=line.match(/^([^=]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2];
  }
}
loadEnv(path.join(process.cwd(),'backend/wallet/.env'));
const base=process.env.ENERGY_BACKEND_URL;
const token=process.env.ENERGY_BEARER_TOKEN;
async function call(body){
  const res=await fetch(base+'/api/account/read',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await res.text();
  let json; try{ json=JSON.parse(text); }catch{}
  return {status:res.status, body: json ?? text.slice(0,500)};
}
(async()=>{
 const payloads=[
  {meterId:'47005363529',pageNumber:1,pageSize:1},
  {meterNo:'47005363529',pageNumber:1,pageSize:1},
  {meter_id:'47005363529',pageNumber:1,pageSize:1},
  {search:'47005363529',pageNumber:1,pageSize:10},
  {keyword:'47005363529',pageNumber:1,pageSize:10},
  {pageNumber:1,pageSize:5},
 ];
 for(const p of payloads){
  const out=await call(p);
  console.log('PAYLOAD',JSON.stringify(p),'STATUS',out.status,'BODY',JSON.stringify(out.body).slice(0,1000));
 }
})();
