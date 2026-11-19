import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductCodes, validateCampaignSelection, slugFromTitle } from '../admin/js/campaigns-model.js';

const now = Date.parse('2026-11-19T12:00:00Z');
const products = new Map(['SS-1001','SS-1002','SS-1003','SS-1004'].map(code => [code, { public_code: code, status: 'public' }]));
const stocks = new Map([...products.keys()].map(code => [code, {
  supplier_id: 'supplier-1', quantity: 8, checked_at: new Date(now - 10_000).toISOString(),
  is_fresh: true, matches_assigned_supplier: true, supplier_active: true,
}]));

test('normalizes duplicate product codes without changing their order', () => {
  assert.deepEqual(normalizeProductCodes(['SS-1001','SS-1001','SS-1002']), ['SS-1001','SS-1002']);
});

test('accepts 3–5 distinct public products with fresh supplier stock', () => {
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003'], products, stocks, now).ok, true);
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003','SS-1004'], products, stocks, now).ok, true);
});

test('rejects fewer than 3 products and products with stale stock', () => {
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002'], products, stocks, now).ok, false);
  const stale = new Map(stocks);
  stale.set('SS-1003', { ...stocks.get('SS-1003'), checked_at: new Date(now - 30 * 60 * 60 * 1000).toISOString() });
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003'], products, stale, now).ok, false);
});

test('uses an ASCII fallback slug for Arabic collection names', () => {
  assert.match(slugFromTitle('موديلات الشتاء', 'collection-abc'), /^collection-abc$/);
  assert.equal(slugFromTitle('New Arrivals'), 'new-arrivals');
});
