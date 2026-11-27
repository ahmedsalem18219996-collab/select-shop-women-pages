import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// Multi-product campaign pages on the QA mock: every product is a full section with its own add-to-bag,
// all products share the one first-party bag and become ONE COD order through /cart/ → /checkout/.
const mockLog = async (request) => (await request.get('/__mock/log')).json();
const setPage = (request, slug, codes, extra = {}) => request.post('/__mock/collection', { data: { slug, codes, title: 'صفحة ' + slug, ...extra } });
const CODES = ['SS-9101', 'SS-1012', 'SS-1013', 'SS-1014', 'SS-1015', 'SS-1017', 'SS-1018', 'SS-1019', 'SS-1021', 'SS-1022', 'SS-1023', 'SS-1024'];
const AD = 'utm_source=meta&utm_medium=paid_social&utm_campaign=multi-test&utm_content=SS-1013&adset=cairo-25-34';

test.beforeEach(async ({ page }) => {
  // Product photos live on the production storage host; serve a tiny local image so tests stay offline.
  await page.route('https://byluoipdunralsurwebt.supabase.co/storage/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"/>' }));
});

for (const count of [2, 3, 5, 12]) {
  test(`page with ${count} products: one full section per product, each with its own add to bag`, async ({ page, request }) => {
    await setPage(request, 'count-' + count, CODES.slice(0, count));
    await page.goto('/collections/?slug=count-' + count);
    await expect(page.getByRole('heading', { level: 1, name: 'صفحة count-' + count })).toBeVisible();
    await expect(page.locator('.cp-product[data-code]')).toHaveCount(count);
    await expect(page.locator('.cp-product .cp-add')).toHaveCount(count);
    await expect(page.locator('.cp-jump a')).toHaveCount(count);
    // Order matches the Admin order; no section links away to another page.
    expect(await page.locator('.cp-product[data-code]').evaluateAll(s => s.map(x => x.dataset.code))).toEqual(CODES.slice(0, count));
    await expect(page.locator('.cp-product a[href*="/lp/"]')).toHaveCount(0);
  });
}

for (const width of [360, 390, 1366]) {
  test(`no horizontal overflow at ${width}px with 12 products`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await setPage(request, 'width-12', CODES);
    await page.goto('/collections/?slug=width-12');
    await expect(page.locator('.cp-product[data-code]')).toHaveCount(12);
    await page.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
    await page.locator('.cp-product[data-code="SS-1014"]').scrollIntoViewIfNeeded();   // the buy bar shows after the first screen
    await expect(page.locator('.cp-bag')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.locator('.cp-chip, .cp-add, .cp-qty button, .cp-bag-link').evaluateAll(els =>
      els.filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).length);
    expect(small).toBe(0);
  });
}

test('one product: the page is that product\'s own landing page, ad parameters kept', async ({ page, request }) => {
  await setPage(request, 'only-one', ['SS-1023']);
  await page.goto('/collections/?slug=only-one&' + AD);
  // SS-1023 belongs to a colour model, so /lp/?p= forwards once more to that model's chooser (existing behaviour).
  await expect(page).toHaveURL(url => url.pathname.startsWith('/lp/') && [url.searchParams.get('p'), url.searchParams.get('color')].includes('SS-1023')
    && url.searchParams.get('utm_content') === 'SS-1013' && url.searchParams.get('adset') === 'cairo-25-34');
});

test('colour and size per product: only real sizes of the chosen colour, price from the server', async ({ page, request }) => {
  await setPage(request, 'variants', ['SS-9101', 'SS-1013']);
  await page.goto('/collections/?slug=variants');
  const s = page.locator('.cp-product[data-code="SS-9101"]');
  await expect(s.locator('.cp-option')).toHaveCount(2);
  await expect(s.locator('.cp-add')).toBeDisabled();
  await s.locator('.cp-option').first().locator('.cp-chip').first().click();
  expect(await s.locator('.cp-option').nth(1).locator('.cp-chip:not([disabled])').count()).toBeGreaterThan(0);
  await s.locator('.cp-option').nth(1).locator('.cp-chip:not([disabled])').first().click();
  await expect(s.locator('.cp-add')).toBeEnabled();
  await expect(s.locator('.cp-price')).toContainText('جنيه');
  await s.locator('.cp-add').click();
  await expect(s.locator('.cp-status')).toContainText('اتضافت للشنطة');
});

test('multi-product COD order: three products from one page become ONE order with three lines', async ({ page, request, baseURL }) => {
  await page.context().addCookies([{ name: '_fbc', value: 'fb.1.1763600000000.IwAR0cookie', url: baseURL }]);
  // Meta events are recorded locally instead of loading GA4/Pixel (/js/analytics.js keeps only the browser-id helper).
  await page.route('**/js/analytics.js*', async route => {
    const real = await (await route.fetch()).text();
    await route.fulfill({ contentType: 'text/javascript', body: real + ';window.womenMetaEvent=function(){const s=JSON.parse(localStorage.getItem("__cap")||"[]");s.push([...arguments]);localStorage.setItem("__cap",JSON.stringify(s))};' });
  });
  await setPage(request, 'order-3', ['SS-9101', 'SS-1012', 'SS-1013']);
  const sourceUrls = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/orders$/.test(new URL(r.url()).pathname)) sourceUrls.push(r.headers()['x-women-event-source-url']); });
  const before = await mockLog(request);
  await page.goto('/collections/?slug=order-3&' + AD);
  const a = page.locator('.cp-product[data-code="SS-9101"]');
  await a.locator('.cp-option').first().locator('.cp-chip').first().click();
  await a.locator('.cp-option').nth(1).locator('.cp-chip:not([disabled])').first().click();
  await a.locator('.cp-qty button[aria-label="زيادة الكمية"]').click();
  await a.locator('.cp-add').click();
  await expect(a.locator('.cp-status')).toContainText('اتضافت للشنطة');
  for (const code of ['SS-1012', 'SS-1013']) {
    await page.locator(`.cp-product[data-code="${code}"] .cp-add`).click();
    await expect(page.locator(`.cp-product[data-code="${code}"] .cp-status`)).toContainText('اتضافت للشنطة');
  }
  await expect(page.locator('.cp-bag-count')).toContainText('٤');
  const credit = await page.evaluate(() => JSON.parse(sessionStorage.getItem('women.lp.attribution.v1')));
  expect(credit).toMatchObject({ id: 'c-order-3', variant: 'c-order-3:a', adProduct: 'SS-1013' });
  expect(credit.codes).toEqual(['SS-9101', 'SS-1012', 'SS-1013']);

  await page.locator('#cpBagLink').click();                                        // the bag in the header still opens /cart/
  await expect(page).toHaveURL(/\/cart\/$/);
  await expect(page.locator('#cartItems .commerce-row')).toHaveCount(3);
  await page.locator('#toCheckout').click();
  await page.locator('#region').selectOption('cairo');
  await page.locator('[name="name"]').fill('اختبار آلي');
  await page.locator('[name="phone"]').fill('01012345678');
  await page.locator('[name="area"]').fill('مدينة نصر');
  await page.locator('[name="address"]').fill('عنوان اختبار فقط، شارع 1');
  await expect(page.locator('#placeOrder')).toBeEnabled();
  await page.locator('#placeOrder').click();
  await expect(page).toHaveURL(/order-success/);
  await expect(page.locator('#orderCode')).toHaveText(/^ORD-/);

  const log = await mockLog(request);
  expect(log.orders.length - before.orders.length).toBe(1);
  const order = log.orders.at(-1);
  expect(order.lines.map(l => l.publicCode).sort()).toEqual(['SS-1012', 'SS-1013', 'SS-9101']);
  expect(order.lines.find(l => l.publicCode === 'SS-9101').quantity).toBe(2);
  // Attribution keeps the ORIGINAL ad (product SS-1013, ad set), separate from what was bought; no buyer data.
  const attr = log.attributions.at(-1).params;
  expect(attr.fbc).toBe('fb.1.1763600000000.IwAR0cookie'); // the Pixel's own _fbc wins
  expect(sourceUrls).toEqual([new URL('/checkout/', baseURL).href]);
  // Cart checkout (js/commerce.js): one Lead, id "lead-" + SHA-256(order key), no browser Purchase.
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('__cap') || '[]'));
  expect(meta.filter(e => e[0] === 'Purchase')).toEqual([]);
  expect(meta.filter(e => e[0] === 'Lead').map(e => e[2])).toEqual(['lead-' + createHash('sha256').update(order.key).digest('hex')]);
  expect(attr).toMatchObject({ campaign: 'multi-test', content: 'SS-1013', adset: 'cairo-25-34', landing: 'c-order-3' });
  expect(JSON.stringify(attr)).not.toContain('01012345678');
});

test('ad attribution is first-touch: moving to a product page of the same ad keeps the original landing and ad product', async ({ page, request }) => {
  await setPage(request, 'first-touch', ['SS-1012', 'SS-1013']);
  await page.goto('/collections/?slug=first-touch&' + AD);
  await expect(page.locator('.cp-product[data-code]')).toHaveCount(2);
  await page.goto('/lp/?p=SS-1012&utm_source=meta&utm_medium=paid_social&utm_campaign=multi-test&utm_content=SS-1012&adset=cairo-25-34');
  await expect(page.locator('#lpOrder')).toHaveText('تأكيد الطلب');
  let ad = await page.evaluate(() => JSON.parse(sessionStorage.getItem('women.ad.params.v1')));
  expect(ad).toMatchObject({ content: 'SS-1013', landing: 'c-first-touch' });
  // A different ad click replaces it.
  await page.goto('/lp/?p=SS-1012&utm_source=meta&utm_medium=paid_social&utm_campaign=other-ad&utm_content=SS-1012');
  ad = await page.evaluate(() => JSON.parse(sessionStorage.getItem('women.ad.params.v1')));
  expect(ad).toMatchObject({ campaign: 'other-ad', content: 'SS-1012' });
});

test('page theme switched on overrides each product look; off keeps each product design', async ({ page, request }) => {
  await setPage(request, 'themed', ['SS-1012', 'SS-1013'], { theme: { enabled: true, background: 'light', ctaShape: 'square', ctaColor: 'cyan', spacing: 'airy', titleSize: 'lg', html: '<b>x</b>' } });
  await page.goto('/collections/?slug=themed');
  await expect(page.locator('.cp-product[data-code]')).toHaveCount(2);
  await expect(page.locator('.cp-product[data-code="SS-1012"]')).toHaveAttribute('data-bg', 'light');
  await expect(page.locator('.cp-product[data-code="SS-1013"] .cp-add')).toHaveAttribute('data-shape', 'square');
  await expect(page.locator('html')).toHaveAttribute('data-spacing', 'airy');
  await setPage(request, 'themed', ['SS-1012', 'SS-1013'], { theme: { enabled: false, background: 'light' } });
  await page.goto('/collections/?slug=themed');
  await expect(page.locator('.cp-product[data-code="SS-1012"]')).toHaveAttribute('data-bg', 'midnight');
});

test('collection with an unavailable product is not rendered as a purchasable page', async ({ page }) => {
  await page.goto('/collections/?slug=sold-out');
  await expect(page.getByRole('heading', { name: 'بنحدّث توافر الموديلات' })).toBeVisible();
  await expect(page.locator('.cp-add')).toHaveCount(0);
});
