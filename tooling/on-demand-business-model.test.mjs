import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Business model: the merchant procures each item *after* an order is received.
// This is customer-facing copy and an admin checklist only. It MUST NOT silently
// mutate inventory, order status, shipping prices, or the live COD API.
const page = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const homepage = page('index.html');
const adminOrders = page('admin/js/views/orders.js');
const adminProducts = page('admin/js/views/products.js');
const directOrder = page('lp/runtime.js');
const cartCheckout = page('checkout/index.html');
const success = page('order-success/index.html');

test('public homepage does not claim physical stock and tells buyers about review', () => {
  assert.match(homepage, /التوافر وميعاد الشحن بيتأكدوا بعد تسجيل طلبك/);
  assert.match(homepage, /الدفع عند الاستلام/);
  assert.doesNotMatch(homepage, /تصفحي الموديلات المتاحة بصورها وأسعارها الحقيقية/);
});

test('customer order remains pending review, including single page and cart paths', () => {
  assert.match(directOrder, /طلبك قيد المراجعة، والتوافر وميعاد الشحن بيتأكدوا قبل التأكيد النهائي/);
  assert.match(cartCheckout, /التوافر وميعاد الشحن بيتأكدوا بعد تسجيل الطلب/);
  assert.match(success, /التوافر وميعاد الشحن بيتأكدوا بعد تسجيل الطلب/);
});

test('admin shows supply-first checklist and does not auto-confirm orders', () => {
  assert.match(adminOrders, /البيع حسب الطلب — بدون مخزون فعلي/);
  assert.match(adminOrders, /قبل تأكيد الأوردر/);
  assert.match(adminOrders, /مراجعة طلب جديد حسب الطلب/);
  assert.match(adminOrders, /بيانات العميل واللون والمقاس/);
  assert.match(adminOrders, /orders\.transition/);
  assert.match(adminOrders, /o\.status === 'pending'/);
});

test('admin does not pass synthetic inventory numbers off as physical stock', () => {
  assert.match(adminProducts, /كميات المخزون هنا افتراضية/);
  assert.match(adminProducts, /كمية افتراضية/);
  assert.match(adminProducts, /لازم التأكد من التوافر والسعر عند المورد/);
});

test('on-demand UI copies do not introduce any new order API or auto-purchasing flow', () => {
  assert.doesNotMatch(adminOrders, /\/functions\/v1\/women-checkout\/orders/);
  assert.doesNotMatch(adminOrders, /safka|autoPurchase|supplier\.order/i);
  assert.doesNotMatch(adminProducts, /safka|autoPurchase|supplier\.order/i);
});
