import { test, expect } from '@playwright/test';

// White & Blue Glass admin theme (visual layer only). Every Admin API call is answered in memory; nothing reaches Supabase.
test.use({ bypassCSP: true });
const url = 'http://127.0.0.1:4173/admin/';
async function openDashboard(page, saved) {
  await page.addInitScript((theme) => {
    sessionStorage.setItem('wa.session', JSON.stringify({ access_token: 'local-qa-only', refresh_token: 'x', expires_at: Date.now() + 3600_000, email: 'qa@example.test' }));
    if (theme) localStorage.setItem('wa.theme', theme);
  }, saved);
  await page.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/women-admin/call')) {
      const { op } = JSON.parse(route.request().postData() || '{}');
      let data = [];
      if (op === 'session.get') data = { email: 'qa@example.test', role: 'owner', permissions: [] };
      if (op === 'dashboard.summary') data = { orders: { revenue_30d_minor: 1650000, revenue_today_minor: 110000, revenue_7d_minor: 495000, pending: 3, to_ship: 2 },
        products: { public: 3, draft: 1 }, views: { days_7: 412, today: 37 }, top_viewed: [], recent_orders: [], revenue_by_day: [], low_stock: [] };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ outcome: 'ok', data }) });
    }
    if (target.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.kpi.accent').first()).toBeVisible();
}

test('day mode is the default, the glass sheet loads last, and the page does not overflow', async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].at(-1)?.getAttribute('href'))).toMatch(/^css\/admin-theme\.css\?v=/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 248, 255)');
  await expect(page.locator('.kpi.accent').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('a saved dark choice still wins, and the switch goes back to day', async ({ page }) => {
  await openDashboard(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 18, 32)');
  await page.locator('[data-theme-toggle]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('wa.theme'))).toBe('light');
});

test('reduced motion stops the revenue beam', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await expect(page.locator('.kpi.accent').first()).toHaveCSS('animation-name', 'none');
});
