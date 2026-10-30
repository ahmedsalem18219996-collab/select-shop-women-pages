import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountModelControls } from '../../admin/js/model-controls.js';

const model={id:'model-1',persisted:true,version:1,name:'بالون',category:'أطقم',colors:[]};
function editor(api,saved=()=>{}) {
 const {document}=parseHTML('<html><body><main></main></body></html>');
 globalThis.document=document;
 const host=document.querySelector('main');
 mountModelControls(host,model,api,saved);
 const input=caption=>[...host.querySelectorAll('label')].find(l=>l.textContent===caption)?.querySelector('input');
 return {host,input,add:[...host.querySelectorAll('button')].find(b=>b.textContent==='إضافة اللون')};
}
test('lost create response reuses the same key and recovers the existing Draft',async()=>{
 const drafts=new Map();const keys=[];let savedCode;
 const e=editor(async(op,args)=>{
  if(op==='products.create') {
   keys.push(args.idempotency_key);
   if(!drafts.has(args.idempotency_key)) {drafts.set(args.idempotency_key,'SS-1050');throw Error('lost response');}
   return {outcome:'existing',code:drafts.get(args.idempotency_key)};
  }
  assert.equal(op,'models.attach');assert.equal(args.code,'SS-1050');return {outcome:'saved'};
 },(_,code)=>{savedCode=code;});
 e.input('اسم اللون الجديد').value='بيج';
 await e.add.onclick();await e.add.onclick();
 assert.equal(drafts.size,1,'retry must not create a second product');
 assert.equal(keys[0],keys[1]);
 assert.equal(savedCode,'SS-1050');
});
test('failed attachment keeps the created SKU visible and retries without creating again',async()=>{
 let creates=0;let attaches=0;
 const e=editor(async(op,args)=>{
  if(op==='products.create'){creates++;return {outcome:'created',code:'SS-1051'};}
  assert.equal(args.code,'SS-1051');attaches++;return {outcome:attaches===1?'stale':'saved'};
 });
 e.input('اسم اللون الجديد').value='زيتي';
 await e.add.onclick();
 assert.equal(e.input('كود منتج موجود (اختياري)').value,'SS-1051');
 await e.add.onclick();assert.equal(creates,1);assert.equal(attaches,2);
});
test('existing product attachment failure does not claim its status is Draft',async()=>{
 const e=editor(async()=>({outcome:'rejected'}));
 e.input('اسم اللون الجديد').value='أحمر';e.input('كود منتج موجود (اختياري)').value='SS-1049';
 await e.add.onclick();
 const message=e.host.querySelector('[role=status]').textContent;
 assert.ok(message.includes('SS-1049'));assert.ok(!message.includes('Draft'));
});
