const fs=require('fs');
for(const file of ['contracts/samples/API__PrepayReport__LowPurchaseSituation.json','contracts/samples/api__token__creditTokenRecord__readMore.json']){
 const f=JSON.parse(fs.readFileSync(file,'utf8'));
 const hits=[];
 function walk(x){ if(Array.isArray(x)) x.forEach(walk); else if(x && typeof x==='object'){ if(Object.values(x).some(v=>String(v)==='47005373957')) hits.push(x); Object.values(x).forEach(walk); } }
 walk(f);
 console.log('\n'+file, JSON.stringify(hits,null,2));
}
