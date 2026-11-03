import test from 'node:test';
import assert from 'node:assert/strict';
import { variantChoices } from '../admin/js/quick-variants.js';

test('legacy published colour SKU: one variant is NOT a fabricated size', () => {
  const p={ public_code:'SS-1042',base_price:{amount_minor:65000},
    options:[], variants:[{position:0,active:true,availability:'available',
      selections:[],amount_minor:65000,price_source:'base'}] };
  const rows=variantChoices(p,{'0':{quantity:20}});
  assert.equal(rows.length,1);
  assert.equal(rows[0].hasExplicitSize,false);
  assert.match(rows[0].label,/مش مسجل/);
  assert.equal(rows[0].amount_minor,65000);
  assert.equal(rows[0].quantity,20);
});
test('real colour and size choices retain their exact server-defined variant positions', () => {
  const p={base_price:{amount_minor:55000},options:[
    {option_id:'co',name:'اللون',values:[{value_id:'pink',value:'بينك'}]},
    {option_id:'sz',name:'المقاس',values:[{value_id:'large',value:'L'}]}
  ],variants:[{position:7,active:true,availability:'available',
    selections:[{option_id:'co',value_id:'pink'},{option_id:'sz',value_id:'large'}],
    amount_minor:58000,price_source:'variant_override'}]};
  const rows=variantChoices(p,{'7':{quantity:3}});
  assert.deepEqual(rows.map(x=>x.position),[7]);
  assert.match(rows[0].label,/بينك/);
  assert.match(rows[0].label,/L/);
  assert.equal(rows[0].override,true);
  assert.equal(rows[0].colour,'بينك');
  assert.equal(rows[0].size,'L');
  assert.equal(rows[0].hasExplicitSize,true);
  assert.equal(rows[0].quantity,3);
});
test('unknown options and unpriced old variants do not invent stock, sizes or prices', () => {
  const rows=variantChoices({options:[],variants:[
    {position:9,active:false,availability:'unavailable',selections:[]}]},{});
  assert.equal(rows[0].amount_minor,null);
  assert.equal(rows[0].quantity,null);
  assert.equal(rows[0].availability,false);
  assert.equal(rows[0].active,false);
  assert.deepEqual(variantChoices({variants:[]},{}),[]);
});

test('colour-only option is not mistaken for a size',()=>{
 const p={options:[{option_id:'c',name:'اللون',values:[{value_id:'brown',value:'بني'}]}],
  variants:[{position:2,active:true,availability:'available',selections:[{option_id:'c',value_id:'brown'}]}]};
 const v=variantChoices(p,{})[0];
 assert.equal(v.colour,'بني'); assert.equal(v.size,null);
 assert.equal(v.hasExplicitSize,false);
});
