import { test, expect } from '@playwright/test';

test.use({ bypassCSP: true });

const code = 'ORD-A2345678';
const secondCode = 'ORD-A2345679';
const lastAttemptAt = '2026-11-22T12:15:00.000Z';
const items = [{ product_title: 'جاكيت تجريبي', product_public_code: 'SS-FIXTURE', quantity: 1,
  line_total_minor: 80000, option_selections: [{ name: 'اللون', value: 'أسود' }, { name: 'المقاس', value: 'M' }] }];

async function openAs(page, { path = `orders/${code}`, permissions, oldApi = false, fulfillment = null } = {}) {
  const ops = [];
  const orders = [code, secondCode].map((public_order_code, index) => ({ public_order_code,
    buyer_name: `عميلة تجريبية ${index + 1}`, buyer_phone: '٠١٠ ٠٠٠٠ ٠٠٠٠', delivery_address: 'شارع تجريبي، القاهرة',
    delivery_region_label: 'القاهرة', created_at: `2026-11-22T09:0${index}:00.000Z`,
    status: fulfillment ? 'confirmed' : 'pending', status_version: 1, payment_method: 'cod',
    allowed_transitions: fulfillment ? [] : ['confirmed', 'cancelled'],
    merchandise_subtotal_minor: 80000, shipping_total_minor: 6575, grand_total_minor: 86575, items,
  }));
  const followups = new Map(orders.map(o => [o.public_order_code, { code: o.public_order_code,
    status: o.public_order_code === code ? 'no_answer' : 'not_called', attempts: Number(o.public_order_code === code),
    lastAttemptAt: o.public_order_code === code ? lastAttemptAt : null, note: o.public_order_code === code ? 'معاودة الاتصال' : '',
    version: Number(o.public_order_code === code), reason: null, reasonType: null,
  }]));
  await page.addInitScript(() => {
    sessionStorage.setItem('wa.session', JSON.stringify({ access_token: 'fixture', expires_at: Date.now() + 3600000, email: 'fixture@example.test' }));
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (!target.pathname.endsWith('/women-admin/call')) {
      return target.hostname === '127.0.0.1' ? route.continue() : route.abort('blockedbyclient');
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type',
    } });
    const { op, args } = request.postDataJSON();
    ops.push({ op, args });
    const order = orders.find(o => o.public_order_code === args.code);
    const ok = data => ({ outcome: 'ok', data });
    const state = followups.get(args.code);
    let reply = { outcome: 'unknown_operation' };
    if (op === 'session.get') reply = ok({ role: permissions ? 'staff' : 'owner', permissions: permissions || [] });
    if (op === 'orders.list') reply = ok(orders.filter(o => !args.status || o.status === args.status));
    if (op === 'orders.get') reply = ok({ order, fulfillment });
    if (op === 'dashboard.summary') reply = ok({ products: { public: 0, draft: 0 }, views: { today: 0, days_7: 0 }, low_stock: [] });
    if (op === 'products.list') reply = ok([]);
    if (!oldApi && op === 'orders.call_get') reply = ok(state);
    if (!oldApi && op === 'orders.calls_today') reply = ok({ rows: orders
      .filter(o => o.status === 'pending' && ['not_called', 'no_answer'].includes(followups.get(o.public_order_code).status))
      .slice(args.offset, args.offset + args.limit).map(o => ({ order: o, call: followups.get(o.public_order_code) })), hasMore: false });
    if (!oldApi && op === 'orders.call_save') {
      if (args.version !== state.version) reply = { outcome: 'conflict', data: state };
      else {
        Object.assign(state, { version: state.version + 1, status: args.status, note: args.note });
        if (args.attempt) { state.attempts++; state.lastAttemptAt = lastAttemptAt; }
        reply = { outcome: 'saved', data: state };
      }
    }
    if (op === 'orders.transition') {
      order.status = args.target;
      order.allowed_transitions = [];
      Object.assign(state, { reason: args.reason, reasonType: 'cancelled' });
      reply = { outcome: 'changed' };
    }
    if (op === 'orders.set_fulfillment') {
      fulfillment.stage = args.stage;
      Object.assign(state, { reason: args.reason, reasonType: 'returned' });
      reply = { outcome: 'saved' };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
  });
  await page.goto(`/admin/#/${path}`, { waitUntil: 'domcontentloaded' });
  return { ops, followups };
}

test('order details use the server order snapshot and save attempts independently', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const { ops, followups } = await openAs(page);
  const panel = page.getByRole('region', { name: 'تأكيد المكالمة' });
  await expect(panel.getByRole('link', { name: 'اتصال' })).toHaveAttribute('href', 'tel:+201000000000');
  const wa = new URL(await panel.getByRole('link', { name: 'واتساب' }).getAttribute('href'));
  expect(wa.origin + wa.pathname).toBe('https://wa.me/201000000000');
  expect(wa.searchParams.get('text')).toContain('جاكيت تجريبي لون أسود مقاس M. الإجمالي 865.75 جنيه');
  await panel.getByText('نص المكالمة', { exact: true }).click();
  await panel.getByLabel('الاسم في المكالمة').fill('اسم تجريبي');
  await expect(panel.getByText(/معاكي اسم تجريبي من SELECT SHOP/)).toContainText('العنوان شارع تجريبي، القاهرة، مظبوط؟');
  await expect(panel.locator('time')).toHaveAttribute('datetime', lastAttemptAt);
  const note = panel.getByLabel('ملاحظة المكالمة');
  await expect(note).toHaveValue('معاودة الاتصال');
  if (mobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await panel.getByText('نص المكالمة', { exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('order-details-390.png'), animations: 'disabled', scale: 'css' });
  }
  await panel.getByLabel('حالة المكالمة').selectOption('confirmed');
  await note.fill('😀'.repeat(501));
  await panel.getByRole('button', { name: 'سجّل محاولة' }).click();
  expect(ops.some(op => op.op === 'orders.call_save')).toBe(false);
  await note.fill('تم التأكيد');
  followups.get(code).version++;
  await panel.getByRole('button', { name: 'سجّل محاولة' }).click();
  await expect(panel.getByLabel('حالة المكالمة')).toHaveValue('no_answer');
  await expect(note).toHaveValue('تم التأكيد');
  await panel.getByLabel('حالة المكالمة').selectOption('confirmed');
  await panel.getByRole('button', { name: 'سجّل محاولة' }).click();
  await expect(panel.getByRole('status')).toContainText('اتأكد');
  expect(ops.filter(({ op }) => op === 'orders.call_save').map(({ args }) => args)).toEqual([
    { code, version: 1, note: 'تم التأكيد', status: 'confirmed', attempt: true },
    { code, version: 2, note: 'تم التأكيد', status: 'confirmed', attempt: true },
  ]);
  await expect(page.locator('.page-head .badge')).toHaveClass(/warn/);
  expect(ops.some(({ op }) => op === 'orders.transition')).toBe(false);
});

test('oldest calls appear on Dashboard and Orders and can be resolved with one tap', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const { ops } = await openAs(page, { path: 'dashboard' });
  const queue = page.getByRole('region', { name: 'اتصالات النهارده' });
  await expect(queue.getByRole('listitem').first()).toContainText(code);
  await expect(queue.getByRole('listitem').last()).toContainText(secondCode);
  await expect(queue.getByRole('link', { name: 'اتصال' })).toHaveCount(2);
  await expect(queue.getByRole('link', { name: 'واتساب' })).toHaveCount(2);
  await page.goto('/admin/#/orders');
  await expect(page.locator('.page-head h2')).toHaveText('الطلبات');
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  expect(ops.filter(({ op }) => op === 'orders.calls_today')).toHaveLength(2);
  if (mobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await queue.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().top - 66, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath('calls-today-390.png'), animations: 'disabled', scale: 'css' });
  }
  await queue.getByRole('listitem').first().getByRole('button', { name: 'اتأكد' }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await expect(queue.getByRole('listitem')).toContainText(secondCode);
  await queue.getByRole('listitem').getByRole('button', { name: 'مفيش رد' }).click();
  await expect(queue.getByRole('listitem').getByRole('status')).toContainText('المحاولات 1');
  expect(ops.filter(({ op }) => op === 'orders.call_save')).toEqual([
    { op: 'orders.call_save', args: { code, version: 1, note: 'معاودة الاتصال', status: 'confirmed', attempt: true } },
    { op: 'orders.call_save', args: { code: secondCode, version: 0, note: '', status: 'no_answer', attempt: true } },
  ]);
});

test('write permission gates the follow-up form', async ({ page }) => {
  await openAs(page, { permissions: ['orders.view'] });
  const panel = page.getByRole('region', { name: 'تأكيد المكالمة' });
  await expect(panel.getByRole('status')).toContainText('مفيش رد');
  await expect(panel.getByText('معاودة الاتصال')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'سجّل محاولة' })).toHaveCount(0);
});

test('cancellation requires and saves a selected reason on the supported API', async ({ page }) => {
  const { ops } = await openAs(page);
  await page.locator('[data-to="cancelled"]').click();
  const dialog = page.getByRole('dialog');
  const reason = dialog.getByLabel('السبب');
  const save = dialog.locator('[type="submit"]');
  await save.click();
  expect(ops.some(({ op }) => op === 'orders.transition')).toBe(false);
  await reason.selectOption('price');
  await save.click();
  await expect(page.getByText('سبب الإلغاء', { exact: false })).toContainText('السعر');
  expect(ops.find(({ op }) => op === 'orders.transition').args).toEqual({ code, version: 1, target: 'cancelled', reason: 'price' });
});

test('marking an order returned records the refusal reason without changing the call result', async ({ page }) => {
  const { ops } = await openAs(page, { fulfillment: { stage: 'shipped', version: 2 } });
  const form = page.locator('#ff');
  await form.locator('select').selectOption('returned');
  await form.getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('السبب').selectOption('size_colour');
  await dialog.locator('[type="submit"]').click();
  await expect(page.getByText('سبب رفض الاستلام أو الإرجاع', { exact: false })).toContainText('المقاس أو اللون');
  expect(ops.find(({ op }) => op === 'orders.set_fulfillment').args).toMatchObject({ code, stage: 'returned', version: 2, reason: 'size_colour' });
});

test('cancellation still uses the original payload on an older server', async ({ page }) => {
  const { ops } = await openAs(page, { oldApi: true });
  await expect(page.getByRole('link', { name: 'اتصال' })).toBeVisible();
  await page.locator('[data-to="cancelled"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('السبب')).toHaveCount(0);
  await dialog.locator('[data-yes]').click();
  await expect(page.locator('[data-to="cancelled"]')).toHaveCount(0);
  expect(ops.find(({ op }) => op === 'orders.transition').args).toEqual({ code, version: 1, target: 'cancelled' });
  await expect(page.getByText('بنحمّل حالة المكالمة…')).toBeHidden();
  await page.goto('/admin/#/orders');
  await expect.poll(() => ops.some(({ op }) => op === 'orders.calls_today')).toBe(true);
  await expect(page.locator('[data-today-calls]')).toBeHidden();
});
