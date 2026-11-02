import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountModelSkuQuickEdit } from '../../admin/js/model-sku-quick-edit.js';

function setup({positions=[7],price=55000,stock=2,pricePermission=true,stockPermission=true}={}) {
  const {document}=parseHTML('<html><body><div id="root"></div></body></html>');
  globalThis.document=document;
  const host=document.querySelector('#root');
  const state={price,stock,calls:[]};
  const api=async(op,args)=>{
    state.calls.push({op,args});
    if(op==='products.get') return {outcome:'ok',data:{
      product:{structure_version:6,variants:positions.map(position=>({position,amount_minor:state.price}))},
      stock:Object.fromEntries(positions.map(position=>[String(position),{quantity:state.stock}]))
    }};
    if(op==='products.set_variant_price') {state.price=args.amount_minor;return {outcome:'saved'};}
    if(op==='products.set_stock') {state.stock=args.quantity;return {outcome:'saved'};}
    throw Error('Unexpected operation '+op);
  };
  mountModelSkuQuickEdit(host,'SS-1009',api,{price:pricePermission,stock:stockPermission});
  const open=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('تعديل سريع'));
  const panel=host.querySelector('.model-sku-quick-edit');
  const button=text=>[...panel.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  return {host,state,open,panel,button};
}

test('price quick edit targets one real variant, not an aggregated model price',async()=>{
  const x=setup();
  await x.open.onclick();
  const input=x.panel.querySelector('input');
  assert.equal(input.value,'550.00');
  input.value='650.50';
  await x.button('حفظ سعر اللون').onclick();
  assert.equal(x.state.price,65050);
  assert.deepEqual(x.state.calls.find(c=>c.op==='products.set_variant_price')?.args,{
    code:'SS-1009',version:6,position:7,amount_minor:65050
  });
});

test('quantity quick edit writes exactly the single variant stock, including zero',async()=>{
  const x=setup({pricePermission:false});
  await x.open.onclick();
  const input=x.panel.querySelector('input');
  input.value='0';
  await x.button('حفظ مخزون اللون').onclick();
  assert.equal(x.state.stock,0);
  assert.deepEqual(x.state.calls.find(c=>c.op==='products.set_stock')?.args,{
    code:'SS-1009',version:6,position:7,quantity:0
  });
});

test('multi-size SKU refuses quick writes and sends owner to full variants editor',async()=>{
  const x=setup({positions:[0,1]});
  await x.open.onclick();
  assert.match(x.panel.textContent,/أكتر من مقاس/);
  assert.equal(x.state.calls.filter(c=>c.op!=='products.get').length,0);
  assert.equal(x.panel.querySelectorAll('input').length,0);
});

test('invalid prices and quantities never call write operations',async()=>{
  const x=setup();
  await x.open.onclick();
  const inputs=x.panel.querySelectorAll('input');
  inputs[0].value='-5';
  await x.button('حفظ سعر اللون').onclick();
  inputs[1].value='1.5';
  await x.button('حفظ مخزون اللون').onclick();
  assert.equal(x.state.calls.filter(c=>c.op!=='products.get').length,0);
});

test('without a permission neither editor nor API read appears',()=>{
  const x=setup({pricePermission:false,stockPermission:false});
  assert.equal(x.open,undefined);
  assert.equal(x.host.querySelectorAll('input').length,0);
});
