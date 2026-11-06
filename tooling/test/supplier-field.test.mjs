import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../admin/js/supplier-field.js', import.meta.url), 'utf8');
const { supplierChoice } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const a = { id:'11111111-1111-4111-8111-111111111111', name:'مورد القاهرة', active:true };
const b = { id:'22222222-2222-4222-8222-222222222222', name:'مورد غير نشط',active:false };
test('existing supplier is selected only from a permitted active list', () => {
  assert.deepEqual(supplierChoice({selected:a.id,suppliers:[a,b],owner:false}),{ok:true,id:a.id,create:''});
  assert.equal(supplierChoice({selected:b.id,suppliers:[a,b]}).ok,false);
  assert.equal(supplierChoice({selected:'11111111-1111-4111-8111-999999999999',suppliers:[a,b]}).ok,false);
});
test('owner can enter new supplier from the same create form; duplicate uses existing', () => {
  assert.deepEqual(supplierChoice({newName:'مورد الهرم',suppliers:[a],owner:true}),{ok:true,id:null,create:'مورد الهرم'});
  assert.deepEqual(supplierChoice({newName:'  مورد    القاهرة  ',suppliers:[a],owner:true}),{ok:true,id:a.id,create:''});
  assert.equal(supplierChoice({newName:'مورد جديد',suppliers:[a],owner:false}).ok,false);
  assert.equal(supplierChoice({newName:'x',suppliers:[a],owner:true}).ok,false);
});
test('supplier remains optional for drafts and cannot reach external or public APIs', () => {
  assert.deepEqual(supplierChoice({selected:'',newName:'',suppliers:[]}),{ok:true,id:null,create:''});
  assert.doesNotMatch(source,/fetch\s*\(|navigator\.sendBeacon|\.publish\s*\(|service_role/);
});
