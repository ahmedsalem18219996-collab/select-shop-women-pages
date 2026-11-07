import { test, expect } from '@playwright/test';

// These tests run against a local static server. Every authenticated Admin API
// call is intercepted and fulfilled in memory. They NEVER reach live Supabase.
// No real product, stock, shipping or customer record is modified.
test.use({ bypassCSP: true });

const target = 'http://127.0.0.1:4173/admin/';
const mockUser = { role: 'owner', email: 'qa-owner@example.test', permissions: [] };
const fakeTime = '2026-11-03T00:00:00Z';

async function signInAsTestOwner(page, ops) {
  let structure = 1;
  // Use an in-memory QA session: no real login or real Auth credentials.
  await page.addInitScript(({ email }) => {
    sessionStorage.setItem('wa.session', JSON.stringify({
      access_token: 'local-qa-only', refresh_token: 'local-qa-refresh',
      expires_at: Date.now() + 3600_000, email
    }));
  }, { email: mockUser.email });
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      return route.fulfill({
        status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'local-qa-only', refresh_token: 'local-qa-refresh', expires_in: 3600,
          user: { email: mockUser.email }
        })
      });
    }
    if (url.pathname.endsWith('/women-admin/call')) {
      const body = JSON.parse(req.postData() || '{}');
      const { op, args } = body;
      ops.push({ op, args });
      let response = { outcome: 'forbidden' };
      if (op === 'session.get') response = { outcome: 'ok', data: mockUser };
      else if (op === 'products.list') response = { outcome: 'ok', data: [] };
      else if (op === 'categories.list') response = { outcome: 'ok', data: [{ name: 'بلوفرات', visible: true }] };
      else if (op === 'products.create') response = { outcome: 'created', code: 'SS-9876', structure_version: structure++ };
      else if (op === 'products.set_price') response = { outcome: 'saved' };
      else if (op === 'products.structure') response = { outcome: 'applied', structure_version: structure++ };
      else if (op === 'shipping.get') response = { outcome: 'ok', data: { profiles: [{ key: 'women_standard', active: true, name: 'شحن عادي' }] } };
      else if (op === 'products.set_shipping_profile') response = { outcome: 'saved' };
      else if (op === 'products.get') response = {
        outcome: 'ok',
        data: {
          product: {
            public_code: 'SS-9876', title: 'بلوفر شتوي', description: '', status: 'draft',
            created_at: fakeTime, updated_at: fakeTime, structure_version: structure,
            base_price: { amount_minor: 65000 }, variants: [{
              position: 0, active: true, availability: 'available', amount_minor: 65000,
              selections: [], price_source: 'base'
            }],
            options: [], shipping_profile: { key: 'women_standard', name: 'شحن عادي' },
            publish_blockers: []
          },
          card: { category: 'بلوفرات', is_new: true },
          stock: { '0': { quantity: 20 } },
          shipping_profiles: [{ key: 'women_standard', name: 'شحن عادي', active: true }],
          media: { media: [], structure_version: structure },
          views: { today: 0, last_7_days: 0, last_30_days: 0, total: 0 },
          activity: []
        }
      };
      return route.fulfill({
        status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(response)
      });
    }
    // An unrelated real Supabase request may never escape the test.
    if (url.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href="#/products"]:visible').first()).toBeVisible({ timeout: 15000 });
  await page.locator('a[href="#/products"]:visible').first().click();
  await expect(page.locator('button[data-new]:visible').first()).toBeVisible();
  await page.locator('button[data-new]:visible').first().click();
  await expect(page.locator('#c-title')).toBeVisible();
}

test('Staff gets actionable errors before create, then arrives at the colours step', async ({ page }) => {
  const ops = [];
  await signInAsTestOwner(page, ops);
  await expect(page.locator('#c-cat')).toHaveValue('بلوفرات');
  await page.locator('#c-title').fill('بلوفر شتوي');
  await page.locator('[data-create]').click();
  await expect(page.locator('#c-error')).toContainText('سعر البيع');
  expect(ops.filter(x => x.op === 'products.create')).toHaveLength(0);

  await page.locator('#c-price').fill('650');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/#\/products\/SS-9876$/);
  await expect(page.locator('#tabbody')).toContainText('الألوان والمقاسات والصور');
  await expect(page.getByText('استكمال الموديل في ٣ خطوات')).toBeVisible();
  const creates = ops.filter(x => x.op === 'products.create');
  expect(creates).toHaveLength(1);
  expect(creates[0].args.title).toBe('بلوفر شتوي');
  expect(ops.filter(x => x.op === 'products.set_price')[0].args.amount_minor).toBe(65000);
  expect(ops.filter(x => x.op === 'products.structure')).toHaveLength(0);
  expect(ops.filter(x => x.op === 'products.set_shipping_profile')).toHaveLength(1);

  await page.locator('[data-pub]').click();
  await expect(page.locator('#island')).toContainText('مالوش صور');
  expect(ops.filter(x => x.op === 'products.publish')).toHaveLength(0);
});

test('Empty title cannot create a product and message stays readable', async ({ page }) => {
  const ops = [];
  await signInAsTestOwner(page, ops);
  await page.locator('[data-create]').click();
  await expect(page.locator('#c-error')).toContainText('اسم موديل واضح');
  await expect(page.locator('#c-title')).toHaveAttribute('aria-invalid', 'true');
  expect(ops.filter(x => x.op === 'products.create')).toHaveLength(0);
});
