import { test, expect } from '@playwright/test';

// Public identity regression: the local QA server mocks all order/catalog APIs;
// neither this test nor the other Playwright suites publish real products or orders.
test('legacy WOMEN public identity renders as SELECT SHOP for all shoppers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#womenOwnerAnnouncement')).toHaveText('SELECT SHOP');
  await expect(page.locator('.hero h1')).toContainText('ستايل يناسبك');
  await expect(page.locator('.hero h1')).not.toContainText('اختاري');
  await expect(page.locator('.logo small')).toHaveText('shop');
  await expect.poll(() => page.title()).toBe('SELECT SHOP');
  await expect(page.locator('.foot > span')).toContainText('SELECT SHOP');
  await expect(page.locator('#feed .card').first()).toBeVisible();
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain('الرجالي والحريمي');
});

test('a custom Owner-controlled public name and announcement are preserved', async ({ page }) => {
  await page.route('**/women-store-bridge/catalog', async route => {
    const upstream = await route.fetch();
    const response = await upstream.json();
    response.brand.storeName = 'SELECT CLUB';
    response.presentation.announcement = 'عروض الأسبوع';
    response.presentation.hero_title = 'قطع تناسب الكل';
    await route.fulfill({ response: upstream, json: response });
  });
  await page.goto('/');
  await expect.poll(() => page.title()).toBe('SELECT CLUB');
  await expect(page.locator('#womenOwnerAnnouncement')).toHaveText('عروض الأسبوع');
  await expect(page.locator('.hero h1')).toContainText('قطع تناسب الكل');
});

test('admin login and order success copy do not address women only', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'أهلًا بك في لوحة SELECT SHOP' })).toBeVisible();
  await expect(page.locator('.brand small')).toHaveText('shop admin');
  await page.goto('/order-success/');
  await expect.poll(() => page.title()).toBe('تم استلام طلبك | SELECT SHOP');
  await expect(page.locator('main .note').last()).toContainText('احتفظ برقم الطلب');
});

test('generated LP and legacy cart titles are gender-neutral', async ({ page }) => {
  await page.goto('/lp/ss-1011/');
  await expect.poll(() => page.title()).toContain('SELECT SHOP');
  await expect(page.locator('footer strong')).toHaveText('SELECT SHOP');
  await page.goto('/cart/');
  await expect.poll(() => page.title()).toBe('شنطتك | SELECT SHOP');
  await expect(page.locator('.logo small')).toHaveText('shop');
});
