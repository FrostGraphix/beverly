for (const file of ['contracts/samples/API__PrepayReport__LowPurchaseSituation.json','contracts/samples/api__token__creditTokenRecord__readMore.json']) {
 const f=require('../'+file);
 function find(obj, out=[]){
  if(Array.isArray(obj)){ for(const x of obj) find(x,out); }
  else if(obj && typeof obj==='object'){
   if(Object.values(obj).some(v=>String(v)==='47005363529')) out.push(obj);
   for(const v of Object.values(obj)) find(v,out);
  }
  return out;
 }
 console.log(file, JSON.stringify(find(f).slice(0,5),null,2));
}
