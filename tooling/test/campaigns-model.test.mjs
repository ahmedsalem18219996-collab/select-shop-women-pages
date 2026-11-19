import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductCodes, validateCampaignSelection, slugFromTitle } from '../../admin/js/campaigns-model.js';

const products = new Map(['SS-1001','SS-1002','SS-1003','SS-1004'].map(code => [code, { public_code: code, status: 'public' }]));

test('normalizes duplicate product codes without changing their order', () => {
  assert.deepEqual(normalizeProductCodes(['SS-1001','SS-1001','SS-1002']), ['SS-1001','SS-1002']);
});

test('accepts 3–5 distinct public products without supplier API data', () => {
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003'], products).ok, true);
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003','SS-1004'], products).ok, true);
});

test('rejects fewer than 3 products and products that are not public', () => {
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002'], products).ok, false);
  const unpublished = new Map(products);
  unpublished.set('SS-1003', { public_code: 'SS-1003', status: 'hidden' });
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003'], unpublished).ok, false);
});

test('uses an ASCII fallback slug for Arabic collection names', () => {
  assert.match(slugFromTitle('موديلات الشتاء', 'collection-abc'), /^collection-abc$/);
  assert.equal(slugFromTitle('New Arrivals'), 'new-arrivals');
});
