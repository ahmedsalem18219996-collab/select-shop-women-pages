import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierStockState, productCampaignEligibility, supplierStockSummary } from '../../admin/js/supplier-stock.js';

const now = Date.parse('2026-11-19T12:00:00Z');
const fresh = { supplier_id: 'supplier-1', quantity: 12, checked_at: new Date(now - 60_000).toISOString(), is_fresh: true, matches_assigned_supplier: true, supplier_active: true };

test('fresh positive supplier stock is available', () => {
  assert.equal(supplierStockState(fresh, now).state, 'available');
  assert.equal(productCampaignEligibility({ status: 'public' }, fresh, now).ok, true);
});

test('zero quantity, stale confirmation, and changed supplier are blocked', () => {
  assert.equal(supplierStockState({ ...fresh, quantity: 0 }, now).state, 'out_of_stock');
  assert.equal(supplierStockState({ ...fresh, checked_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() }, now).state, 'stale');
  assert.equal(supplierStockState({ ...fresh, matches_assigned_supplier: false }, now).state, 'supplier_changed');
  assert.equal(supplierStockState({ ...fresh, supplier_active: false }, now).state, 'supplier_inactive');
});

test('future timestamps and missing snapshots are not treated as fresh', () => {
  assert.equal(supplierStockState({ ...fresh, checked_at: new Date(now + 10 * 60_000).toISOString() }, now).state, 'stale');
  assert.equal(supplierStockState(null, now).state, 'missing');
});

test('draft products cannot enter an ad collection', () => {
  assert.equal(productCampaignEligibility({ status: 'draft' }, fresh, now).ok, false);
  assert.match(supplierStockSummary(null), /لم يتم تأكيد/);
});
