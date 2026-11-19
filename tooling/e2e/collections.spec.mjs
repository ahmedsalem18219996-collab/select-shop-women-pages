import { test, expect } from '@playwright/test';

test('published multi-product page keeps campaign attribution on product links', async ({ page }) => {
  await page.goto('/collections/?slug=group-001&utm_source=meta&utm_medium=paid_social&utm_campaign=group-001');
  await expect(page.getByRole('heading', { name: 'مجموعة تجريبية' })).toBeVisible();
  const links = page.locator('[data-product-link]');
  await expect(links).toHaveCount(4);
  await expect(links.first()).toHaveAttribute('href', /\/lp\/\?p=SS-1008.*utm_source=meta.*utm_content=SS-1008/);
  await expect(page.getByText('اختاري الموديل المناسب')).toBeVisible();
});

test('collection with an unavailable catalog item is not rendered as a purchasable group', async ({ page }) => {
  await page.goto('/collections/?slug=sold-out');
  await expect(page.getByRole('heading', { name: 'بنحدّث توافر المجموعة' })).toBeVisible();
  await expect(page.locator('[data-product-link]')).toHaveCount(0);
});


test('single-product landing page redirects to the product page without forcing related products', async ({ page }) => {
  await page.route('https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge/collections/single-001', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      collection: { slug: 'single-001', title: 'طقم 23', description: '' },
      items: [{ publicCode: 'SS-1023', title: 'طقم 23 الرمادي', priceMinor: 159900, image: null }],
    }),
  }));
  await page.goto('/collections/?slug=single-001&utm_source=meta&utm_campaign=single-001');
  await expect(page).toHaveURL(url => url.pathname === '/lp/' && url.searchParams.get('p') === 'SS-1023' && url.searchParams.get('utm_campaign') === 'single-001');
});
