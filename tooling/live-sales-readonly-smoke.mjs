// Read-only live sale readiness. This file MUST NEVER submit to /orders or modify production.
import assert from 'node:assert/strict';
const HOME = 'https://selectshopeg.com';
const BACKEND = 'https://byluoipdunralsurwebt.supabase.co/functions/v1';
const CHECKOUT = BACKEND + '/women-checkout';
const failures = [];
async function request(label, url, options = {}) {
  try {
    const { headers: customHeaders = {}, ...rest } = options;
    const response = await fetch(url, {
      redirect: 'follow', cache: 'no-store', ...rest,
      headers: { Origin: HOME, Accept: 'application/json, text/html;q=0.9', ...customHeaders },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.text();
    assert.equal(response.status, 200, label + ' HTTP ' + response.status + ': ' + body.slice(0, 100));
    console.log('PASS', label, 'HTTP', response.status, 'bytes', body.length);
    return { response, body, data: (() => { try { return JSON.parse(body); } catch { return null; } })() };
  } catch (e) {
    failures.push(label + ': ' + String(e?.message || e));
    console.error('FAIL', label, String(e?.message || e));
    return null;
  }
}
function check(label, value, detail='') {
  if (value) console.log('PASS', label, detail);
  else { failures.push(label + (detail ? ': ' + detail : '')); console.error('FAIL', label, detail); }
}
const urls = [
  ['home', HOME + '/', 'Select Shop'],
  ['www', 'https://www.selectshopeg.com/', 'Select Shop'],
  ['legacy-product', HOME + '/p/?code=SS-1011', null],
  ['landing-striped', HOME + '/lp/striped-knit/', 'lp'],
  ['landing-generic', HOME + '/lp/?p=SS-1011', 'lp'],
  ['cart', HOME + '/cart/', null],
  ['checkout', HOME + '/checkout/', null],
  ['admin', HOME + '/admin/', 'admin']
];
for (const [label, url, keyword] of urls) {
  const r = await request(label, url);
  if (!r) continue;
  check(label+' HTML', /<!doctype html|<html/i.test(r.body));
  if (keyword) check(label+' content', r.body.toLowerCase().includes(keyword.toLowerCase()));
  if (label==='www') check('canonical www redirect', new URL(r.response.url).hostname === 'selectshopeg.com', r.response.url);
  if (label==='home') {
    // A hidden preview hint is expected in source; only ?design-preview=1 may show it.
    check('demo banner hidden by default', /id=["']demoNote["']\s+hidden/.test(r.body));
    check('home catalog gateway referenced', r.body.includes('women-store-bridge/catalog'));
  }
}
const c = await request('public catalog', BACKEND+'/women-store-bridge/catalog');
if(c) check('live products', Array.isArray(c.data?.items) && c.data.items.length > 0, 'items='+(c.data?.items?.length ?? 'null'));

// Production-wide sellability audit: every visible SKU must resolve to a real,
// buyable server variant. Neither GET /product nor POST /checkout/quote writes
// orders, inventory, customer data, or analytics.
// IMPORTANT: Fail closed on errors; a successful homepage alone is not enough.
const publicCodes = Array.isArray(c?.data?.items)
  ? [...new Set(c.data.items.map(x => x.publicCode).filter(x => /^SS-\d{4,19}$/.test(x)))]
  : [];
check('catalog SKUs well formed and unique', c?.data?.items?.length === publicCodes.length,
  'catalog_items='+(c?.data?.items?.length ?? 'null')+', valid_unique='+publicCodes.length);
let readySkus = 0;
const quoteBySku = async (code, product) => {
  const v = product?.variants?.find(x => x.purchasable === true && Array.isArray(x.selection));
  if(!v || !Number.isInteger(product.structureVersion)) return false;
  const response = await request('COD Cairo quote '+code, CHECKOUT+'/checkout/quote', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ lines: [{
      publicCode:code, structureVersion:product.structureVersion,
      quantity:1, selection:v.selection
    }], deliveryRegionKey:'cairo' })
  });
  if(!response) return false;
  const q=response.data;
  const valid=q?.purchasable === true &&
    q?.shippingTotal?.amountMinor === 9000 &&
    Number.isSafeInteger(q?.merchandiseSubtotal?.amountMinor) &&
    q?.grandTotal?.amountMinor === q?.merchandiseSubtotal?.amountMinor + 9000;
  check('authentic quote '+code,valid,
    'shipping='+String(q?.shippingTotal?.amountMinor)+', total='+String(q?.grandTotal?.amountMinor));
  return valid;
};
for(const code of publicCodes){
  const record=await request('public SKU '+code, CHECKOUT+'/product/'+code);
  if (!record) continue;
  const p=record.data?.product;
  const available=!!p && Number.isInteger(p.structureVersion) &&
    Array.isArray(p.variants) && p.variants.some(v=>v.purchasable === true);
  check('live sellable SKU '+code,available);
  if(available && await quoteBySku(code,p)) readySkus++;
}
check('ALL public SKUs support a confirmed COD quote', readySkus===publicCodes.length,
  'ready='+readySkus+'/'+publicCodes.length);

const cfg = await request('checkout config', CHECKOUT+'/checkout-config');
if(cfg) check('REAL COD ACCEPTANCE ENABLED', cfg.data?.enabled === true, 'enabled='+String(cfg.data?.enabled));
const regions = await request('shipping regions', CHECKOUT+'/regions');
if (regions) check('Cairo and Giza enabled', ['cairo','giza'].every(k=>regions.data?.regions?.some(r=>r.key===k)), 'regions='+(regions.data?.regions?.length ?? 'null'));
const product = await request('public SS-1011', CHECKOUT+'/product/SS-1011');
if (product) {
  const p = product.data?.product;
  const variant = p?.variants?.find(v=>v.purchasable === true);
  check('SS-1011 purchasable real SKU', Number.isInteger(p?.structureVersion) && !!variant);
  if (variant && regions?.data?.regions?.some(r=>r.key==='cairo')) {
    const payload = {lines:[{publicCode:'SS-1011',structureVersion:p.structureVersion,quantity:1,selection:variant.selection}],deliveryRegionKey:'cairo'};
    const quote = await request('Cairo READ-ONLY checkout quote', CHECKOUT+'/checkout/quote', {
      method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if (quote) {
      check('Cairo COD checkout purchasable', quote.data?.purchasable === true);
      check('Cairo shipping 90 EGP', quote.data?.shippingTotal?.amountMinor === 9000,
        'actual_minor='+String(quote.data?.shippingTotal?.amountMinor));
      check('total = merchandise + shipping',
        quote.data?.grandTotal?.amountMinor === quote.data?.merchandiseSubtotal?.amountMinor+quote.data?.shippingTotal?.amountMinor);
    }
    if(regions?.data?.regions?.some(r=>r.key==='giza')){
      const quoteG = await request('Giza READ-ONLY checkout quote', CHECKOUT+'/checkout/quote', {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...payload,deliveryRegionKey:'giza'})
      });
      if(quoteG) check('Giza shipping 90 EGP',quoteG.data?.purchasable === true && quoteG.data?.shippingTotal?.amountMinor === 9000);
    }
  }
}
const adminHealth = await request('admin Edge health', BACKEND+'/women-admin/health');
if (adminHealth) check('admin Edge healthy', adminHealth.data?.status === 'ok');
console.log('\nTOTAL FAILURES:', failures.length);
if (failures.length) { for(const x of failures) console.error('BLOCKER', x); process.exitCode=1; }
else console.log('READ-ONLY LIVE SALE SMOKE PASS. NO /orders CALLS OR PRODUCTION WRITES.');
