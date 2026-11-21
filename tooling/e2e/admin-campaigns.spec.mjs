import { test, expect } from '@playwright/test';

// Owner campaign pages editor against an in-memory Admin API. The live preview iframe is the real /collections/
// page served by the QA mock (product data from the mock women-checkout); nothing reaches live Supabase.
test.use({ bypassCSP: true });

const OWNER = { role: 'owner', email: 'qa-owner@example.test', permissions: [] };
const STAFF = { role: 'staff', email: 'qa-staff@example.test', permissions: ['products.view', 'products.edit'] };
const now = '2026-11-20T10:00:00Z';
const PRODUCTS = [
  { public_code: 'SS-1012', title: 'فستان تجريبي', status: 'public', price_min_minor: 90000, image: null },
  { public_code: 'SS-1013', title: 'جاكيت أحمر', status: 'public', price_min_minor: 100000, image: null },
  { public_code: 'SS-9101', title: 'طقم ألوان', status: 'public', price_min_minor: 50000, image: null },
  { public_code: 'SS-1099', title: 'مسودة', status: 'draft', price_min_minor: null, image: null },
];
const newStore = () => ({ ops: [], theme: null, collection: { id: '11111111-1111-4111-8111-111111111111', slug: 'group-x', title: 'صفحة الخروج',
  description: 'وصف', status: 'draft', version: 1, product_codes: ['SS-1012', 'SS-1013'], updated_at: now } });

async function signIn(page, user, store) {
  await page.addInitScript(({ email }) => sessionStorage.setItem('wa.session', JSON.stringify({
    access_token: 'local-qa-only', refresh_token: 'local-qa-refresh', expires_at: Date.now() + 3600_000, email })), { email: user.email });
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const reply = (json) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(json) });
    if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"/>' });
    if (url.pathname.endsWith('/women-admin/call')) {
      const { op, args } = JSON.parse(req.postData() || '{}');
      store.ops.push({ op, args });
      const c = store.collection;
      let r = { outcome: 'forbidden' };
      if (op === 'session.get') r = { outcome: 'ok', data: user };
      else if (op === 'products.list') r = { outcome: 'ok', data: PRODUCTS };
      else if (op === 'campaigns.list') r = { outcome: 'ok', data: [c] };
      else if (op === 'campaigns.theme.get') r = { outcome: 'ok', data: store.theme };
      else if (op === 'campaigns.save') { Object.assign(c, { title: args.title, slug: args.slug, description: args.description, product_codes: args.product_codes, version: c.version + 1 }); r = { outcome: 'saved', id: c.id, version: c.version }; }
      else if (op === 'campaigns.theme.save') { store.theme = { version: (store.theme?.version || 0) + 1, draft: args.theme, published: store.theme?.published || null }; r = { outcome: 'saved', version: store.theme.version, draft: args.theme }; }
      else if (op === 'campaigns.publish') { c.status = 'published'; r = { outcome: 'published' }; }
      else if (op === 'campaigns.theme.publish') { store.theme.published = store.theme.draft; r = { outcome: 'published', version: store.theme.version }; }
      return reply(r);
    }
    if (url.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
}
const openCampaigns = async (page) => {
  await page.goto('/admin/#/campaigns', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.campaign-card')).toHaveCount(1, { timeout: 15000 });
};

test('Owner: the list loads, live preview shows every product as its own section, theme, reorder, click-to-edit, save and publish', async ({ page }) => {
  const store = newStore();
  await signIn(page, OWNER, store);
  await openCampaigns(page);
  await expect(page.locator('.campaign-card')).toContainText('صفحة الخروج');
  await page.locator('.campaign-card').getByRole('button', { name: 'تعديل' }).click();
  const frame = page.frameLocator('[data-page-preview]');
  await expect(frame.locator('.cp-product[data-code]')).toHaveCount(2, { timeout: 15000 });
  await expect(frame.locator('.cp-add').first()).toBeVisible();

  // Add a third product, then move it to the top: the preview follows the Admin order.
  await page.locator('.campaign-product-option input[data-code="SS-9101"]').check();
  await expect(frame.locator('.cp-product[data-code]')).toHaveCount(3);
  await page.locator('.campaign-preview-item[data-code="SS-9101"]').getByRole('button', { name: '↑' }).click();
  await page.locator('.campaign-preview-item[data-code="SS-9101"]').getByRole('button', { name: '↑' }).click();
  await expect.poll(() => frame.locator('.cp-product[data-code]').evaluateAll(s => s.map(x => x.dataset.code))).toEqual(['SS-9101', 'SS-1012', 'SS-1013']);
  await expect(page.locator('.campaign-preview-item[data-code="SS-1012"] [data-studio-link]')).toHaveAttribute('href', '#/studio/SS-1012');

  // Optional unified theme.
  await page.locator('label.switch:has([data-theme-enabled])').click();
  await page.locator('select[data-theme="background"]').selectOption('light');
  await page.locator('select[data-theme="ctaShape"]').selectOption('square');
  await expect(frame.locator('.cp-product[data-code="SS-1012"]')).toHaveAttribute('data-bg', 'light');
  await expect(frame.locator('.cp-product[data-code="SS-1013"] .cp-add')).toHaveAttribute('data-shape', 'square');
  // One campaign colour (PR #65 theme.accent): replaces the button colour on every buy button of the page.
  await page.locator('[data-theme-accent-on]').check();
  await page.locator('[data-theme-accent]').fill('#c62828');
  await expect.poll(() => frame.locator('.cp-product[data-code="SS-1013"] .cp-add').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(198, 40, 40)');
  // Title font (PR #73): one of six self-hosted fonts; its stylesheet loads only on a page that picks one.
  await expect(page.locator('select[data-theme="font"] option')).toHaveText(['الخط الافتراضي', 'Cairo', 'Changa', 'El Messiri', 'Aref Ruqaa', 'Marhey', 'Lalezar']);
  await expect(frame.locator('#cp-fonts')).toHaveCount(0);
  await page.locator('select[data-theme="font"]').selectOption('el-messiri');
  await expect.poll(() => frame.locator('.cp-product[data-code="SS-1013"] .cp-title').evaluate(e => getComputedStyle(e).fontFamily)).toContain('El Messiri');
  await expect(frame.locator('#cp-fonts')).toHaveAttribute('href', /fonts-studio.css/);
  await expect.poll(() => frame.locator('.collection-hero h1').evaluate(e => getComputedStyle(e).fontFamily)).toContain('El Messiri');
  // Swipe hint and buy-button texts (PR #68/#73): plain text, up to 60 code points like the server (an emoji is one).
  await expect(page.locator('[data-theme-text="ctaText"]')).not.toHaveAttribute('maxlength', /.*/);
  await page.locator('[data-theme-text="hintText"]').fill('👋'.repeat(61));
  await expect.poll(() => page.locator('[data-theme-text="hintText"]').inputValue()).toBe('👋'.repeat(60));
  await page.locator('[data-theme-text="hintText"]').fill('اسحبي للمزيد');
  await page.locator('[data-theme-text="ctaText"]').fill('اشتري دلوقتي');
  await page.locator('[data-theme-text="ctaText"]').blur();
  await expect(frame.locator('.cp-product[data-code="SS-1013"] .cp-add')).toHaveText('اشتري دلوقتي');

  // Click-to-edit: the page title focuses the Admin field; a product field points to that product's Studio.
  await frame.locator('.collection-hero h1').click();
  await expect(page.getByLabel('اسم المجموعة')).toBeFocused();
  await frame.locator('.cp-product[data-code="SS-1013"] .cp-title').click();
  await expect(page.locator('[data-page-selection] a[data-studio-link="SS-1013"]')).toBeVisible();
  // Adding to the bag is switched off inside the preview.
  await frame.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
  await expect(frame.locator('.cp-product[data-code="SS-1012"] .cp-status')).toContainText('معاينة فقط');
  expect(await frame.locator('body').evaluate(() => localStorage.getItem('women.cart.v1'))).toBeNull();

  // Mobile / desktop preview widths.
  await page.locator('[data-preview-size="1366"]').click();
  await expect(page.locator('[data-page-preview]')).toHaveAttribute('width', '1366');

  await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(page.locator('.campaign-card')).toHaveCount(1);
  const saved = store.ops.find(o => o.op === 'campaigns.save');
  expect(saved.args.product_codes).toEqual(['SS-9101', 'SS-1012', 'SS-1013']);
  const theme = store.ops.find(o => o.op === 'campaigns.theme.save');
  expect(theme.args).toMatchObject({ id: store.collection.id, version: 0, theme: { enabled: true, background: 'light', ctaShape: 'square', accent: '#c62828', font: 'el-messiri', hintText: 'اسحبي للمزيد', ctaText: 'اشتري دلوقتي' } });

  await page.locator('.campaign-card').getByRole('button', { name: 'نشر الصفحة' }).click();
  await expect.poll(() => store.ops.map(o => o.op)).toContain('campaigns.theme.publish');
  expect(store.theme.published).toMatchObject({ enabled: true, background: 'light' });
  // The ad link counts the orders for this campaign (campaigns.stats matches utm_campaign to the slug).
  await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await page.locator('.campaign-card').getByRole('button', { name: 'انسخ لينك الإعلان' }).click();
  const link = new URL(await page.evaluate(() => window.__copied));
  expect(link.pathname).toBe('/collections/');
  expect([...link.searchParams]).toEqual([['slug', store.collection.slug], ['utm_source', 'facebook'], ['utm_campaign', store.collection.slug]]);
});

test('Owner: an older saved theme font (rakkas) still renders; the next save sends the default font', async ({ page }) => {
  const store = newStore();
  store.theme = { version: 3, draft: { enabled: true, font: 'rakkas', background: 'navy' }, published: null };
  await signIn(page, OWNER, store);
  await openCampaigns(page);
  await page.locator('.campaign-card').getByRole('button', { name: 'تعديل' }).click();
  const frame = page.frameLocator('[data-page-preview]');
  await expect(frame.locator('.cp-product[data-code="SS-1012"]')).toHaveAttribute('data-font', 'rakkas');
  await expect(page.locator('select[data-theme="font"]')).toHaveValue('');
  await page.locator('select[data-theme="spacing"]').selectOption('airy');
  await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect.poll(() => store.ops.find(o => o.op === 'campaigns.theme.save')?.args.theme.font).toBe('');
});

test('Owner: structured page import fills title, products and theme; unknown or unpublished products are dropped', async ({ page }) => {
  const store = newStore();
  await signIn(page, OWNER, store);
  await openCampaigns(page);
  await page.getByRole('button', { name: '＋ إنشاء مجموعة' }).first().click();
  await page.locator('.campaign-import summary').click();
  await page.locator('[data-page-import]').fill(JSON.stringify({ format: 'ssw.page.v1', page: {
    title: 'صفحة <b>مستوردة</b>', description: 'وصف', products: ['SS-1013', 'SS-1099', 'SS-0000', 'SS-1012'],
    theme: { enabled: true, spacing: 'airy', html: '<script>alert(1)</script>' } } }));
  await page.getByRole('button', { name: 'تطبيق الاستيراد' }).click();
  await expect(page.getByLabel('اسم المجموعة')).toHaveValue('صفحة bمستوردة/b');
  await expect(page.locator('.campaign-preview-item')).toHaveCount(2);
  await expect(page.locator('select[data-theme="spacing"]')).toHaveValue('airy');
  const frame = page.frameLocator('[data-page-preview]');
  await expect(frame.locator('.cp-product[data-code]')).toHaveCount(2, { timeout: 15000 });
  await expect(frame.locator('html')).toHaveAttribute('data-spacing', 'airy');
  await expect(frame.locator('script:not([src])')).toHaveCount(0);
});

test('Staff never sees the campaign pages editor', async ({ page }) => {
  const store = newStore();
  await signIn(page, STAFF, store);
  await page.goto('/admin/#/campaigns', { waitUntil: 'domcontentloaded' });
  // The router sends Staff away from the owner-only route (or the view shows the owner-only note).
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('h1')).not.toHaveText('مجموعات الإعلانات');
  await expect(page.locator('.campaign-editor, .campaign-card, [data-page-preview]')).toHaveCount(0);
  await expect(page.locator('a[href="#/campaigns"]')).toHaveCount(0);
  expect(store.ops.some(o => o.op.startsWith('campaigns.'))).toBe(false);
});
