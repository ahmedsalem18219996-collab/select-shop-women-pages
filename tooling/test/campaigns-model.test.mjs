import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductCodes, moveProductCode, validateCampaignSelection, slugFromTitle } from '../../admin/js/campaigns-model.js';

const products = new Map(['SS-1001','SS-1002','SS-1003','SS-1004'].map(code => [code, { public_code: code, status: 'public' }]));

test('normalizes duplicate product codes without changing their order', () => {
  assert.deepEqual(normalizeProductCodes(['SS-1001','SS-1001','SS-1002']), ['SS-1001','SS-1002']);
});

test('accepts one product or any number of distinct public products without supplier API data', () => {
  assert.equal(validateCampaignSelection(['SS-1001'], products).ok, true);
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002'], products).ok, true);
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003','SS-1004'], products).ok, true);
  assert.equal(validateCampaignSelection(Array.from({ length: 12 }, (_, i) => 'SS-' + String(1001 + (i % 4)).padStart(4, '0')), products).ok, true);
});

test('rejects an empty selection and products that are not public', () => {
  assert.equal(validateCampaignSelection([], products).ok, false);
  const unpublished = new Map(products);
  unpublished.set('SS-1003', { public_code: 'SS-1003', status: 'hidden' });
  assert.equal(validateCampaignSelection(['SS-1001','SS-1002','SS-1003'], unpublished).ok, false);
});

test('reorders selected products without losing or duplicating entries', () => {
  assert.deepEqual(moveProductCode(['SS-1001','SS-1002','SS-1003'], 'SS-1003', 0), ['SS-1003','SS-1001','SS-1002']);
  assert.deepEqual(moveProductCode(['SS-1001','SS-1002'], 'missing', 0), ['SS-1001','SS-1002']);
});

test('uses an ASCII fallback slug for Arabic collection names', () => {
  assert.match(slugFromTitle('موديلات الشتاء', 'collection-abc'), /^collection-abc$/);
  assert.equal(slugFromTitle('New Arrivals'), 'new-arrivals');
});
