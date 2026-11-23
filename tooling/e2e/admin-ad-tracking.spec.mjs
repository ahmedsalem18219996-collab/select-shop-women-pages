import { test, expect } from '@playwright/test';

test.use({ bypassCSP: true });

const firstDate = '2026-11-16';
const today = '2026-11-22';
const campaign = 'nov-winter';
const emptyStats = {
  orders: 0, confirmed: 0, shipped: 0, delivered: 0, returnedOrders: 0,
  cancelledOrders: 0, rejectedOrCancelled: 0, spendMinor: null, recordedSpendDays: 0,
  confirmationRate: null, deliveryRate: null, rejectionRate: null,
  costPerOrderMinor: null, costPerDeliveredMinor: null,
};
const stats = {
  ...emptyStats, orders: 8, confirmed: 6, shipped: 5, delivered: 4, returnedOrders: 1,
  cancelledOrders: 1, rejectedOrCancelled: 2, confirmationRate: 75, deliveryRate: 50, rejectionRate: 25,
};

async function openAs(page, { role = 'owner', hash = '#/traffic?tab=ads', unavailable = false, missingSpend = false } = {}) {
  const calls = [];
  const spend = new Map([['2026-11-21', new Map([['', 0]])]]);
  if (!missingSpend) spend.set(today, new Map([[campaign, 50000]]));
  // It's still Nov 21 in UTC but already Nov 22 in Cairo.
  await page.clock.setFixedTime(new Date('2026-11-21T22:30:00Z'));
  await page.addInitScript(() => {
    sessionStorage.setItem('wa.session', JSON.stringify({
      access_token: 'fixture-only', refresh_token: 'fixture-only',
      expires_at: Date.now() + 3_600_000, email: 'qa@example.test',
    }));
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (!target.pathname.endsWith('/women-admin/call')) {
      return target.origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort('blockedbyclient');
    }
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, apikey, content-type',
      } });
    }
    const { op, args } = request.postDataJSON();
    calls.push({ op, args });
    let reply = { outcome: 'forbidden' };
    if (op === 'session.get') reply = { outcome: 'ok', data: { role, email: 'qa@example.test', permissions: ['dashboard.view'] } };
    if (role === 'owner' && op === 'ads.stats') {
      const fixtureDates = ['2026-11-20', '2026-11-21', today];
      const days = fixtureDates.filter(date => date >= args.from && date <= args.to).map(date => {
        const buckets = spend.get(date);
        const daySpend = args.campaign ? buckets?.get(args.campaign) ?? null
          : buckets?.size ? [...buckets.values()].reduce((sum, amount) => sum + amount, 0) : null;
        const row = date === today && (!args.campaign || args.campaign === campaign) ? stats : emptyStats;
        return {
          ...row, date, spendMinor: daySpend, recordedSpendDays: Number(daySpend !== null),
          costPerOrderMinor: daySpend !== null && row.orders ? daySpend / row.orders : null,
          costPerDeliveredMinor: daySpend !== null && row.delivered ? daySpend / row.delivered : null,
        };
      });
      const row = days.some(day => day.orders) ? stats : emptyStats;
      const recorded = days.filter(day => day.spendMinor !== null);
      const totalSpend = recorded.length ? recorded.reduce((sum, day) => sum + day.spendMinor, 0) : null;
      const complete = days.every(day => !day.orders || day.spendMinor !== null);
      reply = unavailable ? { outcome: 'unknown_operation' } : { outcome: 'ok', data: {
        total: { ...row, spendMinor: totalSpend, recordedSpendDays: recorded.length,
          costPerOrderMinor: complete && row.orders ? totalSpend / row.orders : null,
          costPerDeliveredMinor: complete && row.delivered ? totalSpend / row.delivered : null },
        days,
        campaigns: [campaign, 'dec-preview'],
        reasons: row.orders ? [{ reason: 'changed_mind', count: 1 }, { reason: missingSpend ? 'unrecorded' : 'no_answer', count: 1 }] : [],
      } };
    }
    if (role === 'owner' && op === 'ads.spend_save') {
      if (!spend.has(args.date)) spend.set(args.date, new Map());
      spend.get(args.date).set(args.campaign, args.amountMinor);
      reply = { outcome: 'saved', data: args };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
  });
  await page.goto(`/admin/${hash}`, { waitUntil: 'domcontentloaded' });
  return calls;
}

test('owner can open the ad tab, filter the report and save spend in EGP', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const calls = await openAs(page, { hash: '#/traffic' });
  const traffic = page.getByRole('tab', { name: 'المحافظات والزيارات' });
  const ads = page.getByRole('tab', { name: 'متابعة الإعلانات' });
  await expect(traffic).toHaveAttribute('aria-selected', 'true');
  expect(calls.map(call => call.op)).toEqual(['session.get']);
  await traffic.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(ads).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/#\/traffic\?tab=ads$/);
  await expect(ads).toHaveAttribute('aria-selected', 'true');
  const totals = page.getByRole('region', { name: 'إجمالي الفترة' });
  await expect(totals).toContainText('500 ج.م');
  await expect(totals).toContainText('62.5 ج.م');
  await expect(totals).toContainText('125 ج.م');
  await expect(page.getByText('غيّر رأيه')).toBeVisible();
  expect(calls.at(-1)).toEqual({ op: 'ads.stats', args: { from: firstDate, to: today, campaign: '' } });

  const daily = page.getByRole('region', { name: 'التفاصيل اليومية' });
  await expect(daily.locator(`summary:has(time[datetime="2026-11-21"])`)).toContainText('0 ج.م');
  await expect(daily.locator(`summary:has(time[datetime="2026-11-20"])`)).toContainText('مش مسجّل');
  await daily.locator(`summary:has(time[datetime="${today}"])`).click();
  await expect(daily.locator('details[open]')).toContainText('المرتجعة');
  await expect(daily.locator('details[open]')).toContainText('75٪');
  if (mobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath('ad-monitoring-390.png'),
      fullPage: true,
      animations: 'disabled',
      scale: 'css',
      // Keep the navigation clear of the report in the full-page capture.
      style: '.shell { position: relative; } .tabbar { position: absolute; }',
    });
  }

  await page.getByLabel('من يوم').fill('2026-11-20');
  await page.getByLabel('الحملة', { exact: true }).selectOption(campaign);
  await page.getByRole('button', { name: 'عرض التقرير' }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ op: 'ads.stats', args: { from: '2026-11-20', to: today, campaign } });
  await page.getByRole('button', { name: 'سجّل الصرف' }).click();
  const entry = page.getByRole('dialog', { name: 'تسجيل صرف الإعلانات' });
  await expect(entry.getByLabel('اليوم')).toHaveValue(today);
  await expect(entry.getByLabel('اسم الحملة')).toHaveValue(campaign);
  await entry.getByLabel('المبلغ بالجنيه').fill('-1');
  await entry.getByRole('button', { name: 'احفظ الصرف' }).click();
  await expect(entry.getByRole('alert')).toContainText('مبلغ صحيح');
  expect(calls.some(call => call.op === 'ads.spend_save')).toBe(false);
  await entry.getByLabel('المبلغ بالجنيه').fill('٧٥٠٫٥');
  await entry.getByRole('button', { name: 'احفظ الصرف' }).click();
  await expect(entry).toHaveCount(0);
  await expect(totals).toContainText('750.5 ج.م');
  expect(calls.filter(call => call.op === 'ads.spend_save')).toEqual([
    { op: 'ads.spend_save', args: { date: today, campaign, amountMinor: 75050 } },
  ]);
  expect(calls.at(-1)).toEqual({ op: 'ads.stats', args: { from: '2026-11-20', to: today, campaign } });
});

test('date validation and unallocated zero spend preserve missing campaign costs', async ({ page }) => {
  const calls = await openAs(page, { missingSpend: true });
  const totals = page.getByRole('region', { name: 'إجمالي الفترة' });
  const costs = totals.locator('dd').filter({ hasText: '—' });
  await expect(costs).toHaveCount(2);
  await expect(page.getByText('السبب مش مسجّل')).toBeVisible();

  const run = page.getByRole('button', { name: 'عرض التقرير' });
  await page.getByLabel('من يوم').fill('2025-11-21');
  await run.click();
  await expect(page.getByRole('alert')).toContainText('366 يوم');
  await page.getByLabel('من يوم').fill('2025-11-22');
  await page.getByLabel('إلى يوم').fill('2026-11-23');
  await run.click();
  expect(calls.filter(call => call.op === 'ads.stats')).toHaveLength(1);
  await page.getByLabel('إلى يوم').fill(today);
  await run.click();
  await expect.poll(() => calls.at(-1)).toEqual({ op: 'ads.stats', args: { from: '2025-11-22', to: today, campaign: '' } });

  await page.getByRole('button', { name: 'سجّل الصرف' }).click();
  const dialog = page.getByRole('dialog', { name: 'تسجيل صرف الإعلانات' });
  await expect(dialog.getByLabel('اسم الحملة')).toHaveValue('');
  await dialog.getByLabel('المبلغ بالجنيه').fill('0');
  await dialog.getByRole('button', { name: 'احفظ الصرف' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(totals.locator('dd').filter({ hasText: '0 ج.م' })).toHaveCount(3);
  expect(calls.filter(call => call.op === 'ads.spend_save')).toEqual([
    { op: 'ads.spend_save', args: { date: today, campaign: '', amountMinor: 0 } },
  ]);

  await page.getByLabel('الحملة', { exact: true }).selectOption(campaign);
  await run.click();
  await expect(totals).toContainText('مش مسجّل');
  await expect(costs).toHaveCount(2);
});

test('staff with dashboard access gets the GA4 view and makes no ad calls', async ({ page }) => {
  const calls = await openAs(page, { role: 'staff' });
  await expect(page.getByRole('link', { name: 'افتح Google Analytics 4' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'متابعة الإعلانات' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'سجّل الصرف' })).toHaveCount(0);
  expect(calls.map(call => call.op)).toEqual(['session.get']);
});

test('a server without the ad operations shows an unavailable report', async ({ page }) => {
  const calls = await openAs(page, { unavailable: true });
  await expect(page.getByRole('alert')).toContainText('تقرير الإعلانات لسه مش متاح');
  await expect(page.getByRole('region', { name: 'إجمالي الفترة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'سجّل الصرف' })).toBeDisabled();
  expect(calls.map(call => call.op)).toEqual(['session.get', 'ads.stats']);
});
