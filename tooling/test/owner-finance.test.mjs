import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStageRows, summarizeConfirmedStages, filterOpenReturns, estimateNet } from '../../admin/js/finance-summary.js';
import { summarizeLines } from '../../admin/js/profit.js';
const row = (code, price) => ({ public_order_code: code, grand_total_minor: price });
test('returns are distinct from cancellations; duplicate codes do not count twice', () => {
  const result = summarizeStageRows([row('ORD-1',55000),row('ORD-1',55000),row('ORD-2',60000)]);
  assert.equal(result.complete, true);
  assert.equal(result.count, 2);
  assert.equal(result.orderValueMinor,115000);
});
test('missing, corrupt and capped order lists never show zero as success', () => {
  assert.equal(summarizeStageRows(null).complete,false);
  assert.equal(summarizeStageRows([row('O',null)]).complete,false);
  assert.equal(summarizeStageRows(Array.from({length:100},(_,i)=>row('O-'+i,100))).complete,false);
});
test('open return requests are excluded from profit instead of being treated as delivered', () => {
  const lines=[{order_code:'A', status:'delivered',quantity:1,line_total_minor:60000,unit_cost_minor:40000},
    {order_code:'B', status:'delivered',quantity:1,line_total_minor:100000,unit_cost_minor:40000}];
  const kept=filterOpenReturns(lines,new Set(['B']));
  assert.equal(summarizeLines(kept).grossMinor,20000);
  assert.equal(filterOpenReturns(lines,null),null);
});
test('estimated net requires explicit validated expenses and known costs', () => {
  const s={complete:true,orders:2,grossMinor:20000};
  assert.equal(estimateNet(s,{ship:1500,ad:2000,other:500}),12000);
  assert.equal(estimateNet(s,{ship:1500,ad:null,other:500}),null);
  assert.equal(estimateNet({...s,complete:false},{ship:0,ad:0,other:0}),null);
  assert.equal(estimateNet(s,{ship:-1,ad:0,other:0}),null);
});


test('stage filtering after server limit is unsafe; all-confirmed cap must suppress profit', () => {
  const confirmed = [row('old-return', 70000), ...Array.from({length:98}, (_,i) => row('o'+i,50000))];
  confirmed[0].stage = 'return_requested';
  for (const r of confirmed.slice(1)) r.stage = 'preparing';
  const complete = summarizeConfirmedStages(confirmed);
  assert.equal(complete.complete, true);
  assert.equal(complete.open.count, 1);
  const capped = summarizeConfirmedStages([...confirmed, row('o99',50000)]);
  assert.equal(capped.complete, false);
  assert.equal(capped.open.complete, false);
  assert.equal(capped.returned.complete, false);
});
