import test from 'node:test';
import assert from 'node:assert/strict';
import { countStatuses, statusAction, prepublishHints } from '../admin/js/product-lifecycle.js';
import { parseGa4Traffic, csvRows } from '../admin/js/ga4-report.js';

test('status counters report the exact four real states, not presumed numbers',()=>{
 const c=countStatuses([{status:'public'},{status:'public'},{status:'hidden'},{status:'draft'},{status:'archived'},{status:'unknown'}]);
 assert.deepEqual(c,{public:2,draft:1,hidden:1,archived:1});
});
test('publication actions never permit archived product and hide is temporary',()=>{
 assert.equal(statusAction('public').op,'products.hide');
 assert.equal(statusAction('draft').op,'products.publish');
 assert.equal(statusAction('hidden').op,'products.publish');
 assert.equal(statusAction('archived'),null);
});
test('readiness preflight shows missing photo, shipping and purchasable variant',()=>{
 const d={product:{status:'draft',shipping_profile:null,variants:[{active:true,availability:'unavailable'}]},media:{media:[]}};
 assert.deepEqual(prepublishHints(d),['رفع صورة ظاهرة واحدة على الأقل','اختيار طريقة الشحن','تفعيل اختيار متاح للتوريد']);
 const good={product:{status:'hidden',shipping_profile:{key:'women_standard'},variants:[{active:true,availability:'available'}]},
 media:{media:[{storage_path:'media/test.png',hidden:false,delete_pending:false}]}};
 assert.deepEqual(prepublishHints(good),[]);
});
test('GA4 governorate CSV parses quotes, comments, real sessions, and filters out non-Egypt',()=>{
 const csv='# Analytics export\n# dates\n"Country","Region","Sessions","Active users"\n"Egypt","Cairo","1,000","800"\n"Egypt","Giza","250","200"\n"Saudi Arabia","Riyadh","50","40"\n"Egypt","(not set)","11","10"\n';
 const d=parseGa4Traffic(csv,'region');
 assert.equal(d.metricLabel,'الجلسات (Sessions)');
 assert.equal(d.total,1261);
 assert.equal(d.droppedCountry,1);
 assert.deepEqual(d.items.map(x=>x.name),['Cairo','Giza','غير معروف']);
 assert.deepEqual(d.items.map(x=>x.value),[1000,250,11]);
 assert.equal(d.hasCountryFilter,true);
});
test('GA4 source/medium reporting shows actual sessions rather than pageviews or orders',()=>{
 const csv='Session source / medium,Sessions\n"facebook / paid","200"\n"instagram / social","80"\n"(direct) / (none)","25"\n';
 const d=parseGa4Traffic(csv,'source');
 assert.equal(d.total,305);
 assert.equal(d.items[0].name,'facebook / paid');
});
test('no location without valid GA4 Region+metric export',()=>{
 assert.throws(()=>parseGa4Traffic('City,Sessions\nCairo,3','region'),/Region/);
 assert.throws(()=>parseGa4Traffic('Region,Revenue\nCairo,999','region'),/Region/);
 assert.throws(()=>parseGa4Traffic('"Region,Users\nCairo,10','region'),/تنصيص/);
 assert.deepEqual(csvRows('"Region","Active users"\n"Cairo","5"\n').length,2);
});
