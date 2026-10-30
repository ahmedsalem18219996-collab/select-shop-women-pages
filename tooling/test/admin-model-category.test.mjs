import test from 'node:test';
import assert from 'node:assert/strict';
import { saveFamilyCategory } from '../../admin/js/model-category.js';
const color = (n,is_new,category='أطقم') => ({ product: {public_code:'SS-'+String(n).padStart(4,'0'), is_new,category} });
test('changing family category preserves each real SKU New flag', async () => {
 const sent=[];
 const r=await saveFamilyCategory([color(1037,true),color(1038,false)],'بلوفر',async(op,args)=>{sent.push({op,args});return {outcome:'saved'}});
 assert.deepEqual(sent.map(x=>x.args),[
 {code:'SS-1037',category:'بلوفر',is_new:true},
 {code:'SS-1038',category:'بلوفر',is_new:false}
 ]);
 assert.deepEqual(r,{updated:['SS-1037','SS-1038'],failed:[]});
});
test('partial failure is visible and never claimed successful',async()=>{
 let i=0;
 const out=await saveFamilyCategory([color(1037,true),color(1038,false)],'جاكيت',async()=>++i===1?{outcome:'saved'}:{outcome:'forbidden'});
 assert.equal(out.updated.length,1);
 assert.deepEqual(out.failed,[{code:'SS-1038',outcome:'forbidden'}]);
});
test('skip unchanged category without a write',async()=>{
 let calls=0;
 const out=await saveFamilyCategory([color(1037,true,'أطقم')],'أطقم',async()=>{calls++;},()=>{});
 assert.equal(calls,0);assert.equal(out.failed.length,0);assert.equal(out.updated.length,1);
});
