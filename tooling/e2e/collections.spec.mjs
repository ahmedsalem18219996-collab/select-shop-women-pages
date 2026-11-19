import { test, expect } from '@playwright/test';

test('published collection shows 3–5 models and keeps campaign attribution on product links', async ({ page }) => {
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
