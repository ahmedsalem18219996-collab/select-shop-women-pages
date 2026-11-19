import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, defaultDesign, isEmptyDesign, STORAGE, CHOICES } from '../../lp/studio-design.js';
import { readAdParams } from '../../lp/runtime.js';
import { supplierStockState } from '../../admin/js/supplier-stock.js';

test('design whitelist: unknown keys (a price) are dropped, choices fall back, texts are bounded and tag-free', () => {
  const d = normalizeDesign({
    price: 1, shipping: 0, template: 'evil', order: ['product', 'hero', 'closing', 'features'], hidden: ['product', 'hero', 'hero'],
    title: '<b>عنوان</b>' + 'x'.repeat(200), description: 'سطر\nسطر تاني', features: ['', 'خامة ناعمة', 'a'.repeat(100), '1', '2', '3', '4', '5'],
    cta: { text: 'اطلبي دلوقتي', color: 'gold', position: 'both', shape: 'square', size: 'xl', animation: 'pulse' },
    orderCard: { style: 'glass', fields: 'compact', title: 'سجّلي طلبك' },
  });
  assert.equal('price' in d, false);
  assert.equal('shipping' in d, false);
  assert.equal(d.template, 'classic');
  assert.deepEqual(d.order, ['product', 'hero', 'closing', 'features']);
  assert.deepEqual(d.hidden, ['hero']); // the product section can never be hidden
  assert.equal(d.title.includes('<'), false);
  assert.equal(d.title.length, 120);
  assert.equal(d.description, 'سطر\nسطر تاني');
  assert.equal(d.features.length, 5); // max 6 entries, blanks dropped
  assert.equal(d.features[1].length, 90);
  assert.deepEqual(d.cta, { text: 'اطلبي دلوقتي', color: 'gold', position: 'both', shape: 'square', size: 'xl', animation: 'pulse' });
  assert.deepEqual(d.orderCard, { style: 'glass', fields: 'compact', title: 'سجّلي طلبك' });
});

test('every CTA option survives normalisation', () => {
  for (const key of ['color', 'position', 'shape', 'size', 'animation']) {
    for (const value of CHOICES[key]) assert.equal(normalizeDesign({ cta: { [key]: value } }).cta[key], value, key + '=' + value);
  }
});

test('a broken section order falls back to the standard three-image layout', () => {
  const fallback = normalizeDesign({ order: ['hero', 'hero', 'product', 'closing'] });
  assert.deepEqual(fallback.order, ['hero', 'features', 'closing', 'product']);
  assert.equal(fallback.divider, 'line');
  assert.deepEqual(normalizeDesign({ order: ['hero', 'product'] }).order, ['hero', 'features', 'closing', 'product']);
});

test('images: storage paths only; in the page only WOMEN public storage URLs', () => {
  const d = normalizeDesign({ images: { hero: 'storefront/hero-1.webp', features: '../etc/passwd.png', closing: 'https://evil.example/x.webp' } });
  assert.deepEqual(d.images, { hero: 'storefront/hero-1.webp', features: null, closing: null });
  const u = normalizeDesign({ images: { hero: STORAGE + 'storefront/hero-1.webp', features: 'storefront/x.webp', closing: STORAGE + 'storefront//x.webp' } }, { urls: true });
  assert.deepEqual(u.images, { hero: STORAGE + 'storefront/hero-1.webp', features: null, closing: null });
  assert.equal(normalizeDesign({ images: { hero: 'javascript:alert(1).png' } }).images.hero, null);
});

test('an empty design changes nothing', () => {
  assert.equal(isEmptyDesign(defaultDesign()), true);
  assert.equal(isEmptyDesign(normalizeDesign({ title: 'x' })), false);
});

test('ad parameters: utm + ad set kept, bounded, tag-free; no parameters = nothing stored', () => {
  assert.equal(readAdParams('?p=SS-1008&color=red', 'ss-1008'), null);
  const a = readAdParams('?utm_source=meta&utm_medium=paid_social&utm_campaign=winter&utm_content=SS-1008&adset=Set%20A&utm_ad=<x>' + 'y'.repeat(200) + '&collection=group-001', 'ss-1008');
  assert.equal(a.source, 'meta');
  assert.equal(a.medium, 'paid_social');
  assert.equal(a.campaign, 'winter');
  assert.equal(a.content, 'SS-1008');
  assert.equal(a.adset, 'Set A');
  assert.equal(a.ad.includes('<'), false);
  assert.equal(a.ad.length, 120);
  assert.equal(a.landing, 'ss-1008 · group-001');
  assert.equal(JSON.stringify(a).includes('phone'), false);
});

test('supplier confirmation window follows the Owner setting (default 24h, +5 min clock tolerance)', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const snap = (hoursAgo, extra = {}) => ({ checked_at: new Date(now - hoursAgo * 3600000).toISOString(), quantity: 4, supplier_id: 's1', ...extra });
  assert.equal(supplierStockState(snap(23), now).state, 'available');
  assert.equal(supplierStockState(snap(25), now).state, 'stale');
  assert.match(supplierStockState(snap(25), now).label, /24 ساعة/);
  assert.equal(supplierStockState(snap(25, { valid_hours: 48 }), now).state, 'available');
  assert.equal(supplierStockState(snap(7, { valid_hours: 6 }), now).state, 'stale');
  assert.match(supplierStockState(snap(7, { valid_hours: 6 }), now).label, /6 ساعة/);
  assert.equal(supplierStockState(snap(-0.05), now).state, 'available'); // 3 minutes ahead: clock skew
  assert.equal(supplierStockState(snap(-1), now).state, 'stale'); // an hour in the future is not a confirmation
  assert.equal(supplierStockState(snap(1, { quantity: 0 }), now).state, 'out_of_stock');
  assert.equal(supplierStockState(snap(1, { valid_hours: 999 }), now).state, 'available'); // out-of-range setting -> default 24h
});
