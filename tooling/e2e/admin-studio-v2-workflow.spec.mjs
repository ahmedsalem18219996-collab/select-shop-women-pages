import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ bypassCSP: true });

const cover = 'women-storefront/storefront/qa-v2-cover.webp';
const targetImage = 'product-media/media/005a3ee1a8504efca19a780f21981d33.webp';
const original = {
  studioStack: {
    v: 1, accent: '#2563eb', marquee: { enabled: true, position: 'above' },
    scrollHint: { style: 'pill', gradient: false },
    photos: [{ path: cover, overlays: [{ type: 'text', text: 'ستايل يناسبك بطريقتك', sh: 'soft', x: 50, y: 21 }] }],
  },
};
const initialMarquee = {
  enabled: true, speed: 24, lines: ['الدفع عند الاستلام', 'عايني قبل ما تدفعي', 'شحن لكل المحافظات'].map(text => ({ text, hidden: false })),
};
const product = {
  title: 'جاكيت جلد', public_code: 'SS-1008', status: 'public', base_price: { amount_minor: 120000 },
  options: [
    { name: 'اللون', option_id: 1, values: [{ value_id: 1, active: true }] },
    { name: 'المقاس', option_id: 2, values: [{ value_id: 2, active: true }] },
  ],
  variants: [{ active: true, amount_minor: 120000, selections: [{ option_id: 1, value_id: 1 }, { option_id: 2, value_id: 2 }] }],
};
const now = '2026-11-23T11:00:00Z';
const initialState = () => ({
  calls: [], versions: [], marquee: structuredClone(initialMarquee), templates: [],
  source: { version: 4, draft: structuredClone(original), published: structuredClone(original), published_at: now },
  target: { version: 7, draft: { title: 'مسودة قديمة' }, published: { title: 'نسخة منشورة' } },
});

async function signIn(page, state, owner = true) {
  const image = await readFile(new URL('../../assets/catalog-thumbs/005a3ee1a8504efca19a780f21981d33.jpg.w400.webp', import.meta.url));
  const email = 'studio-qa@example.test';
  await page.addInitScript(email => sessionStorage.setItem('wa.session', JSON.stringify({
    access_token: 'studio-v2-fixture', refresh_token: 'fixture', expires_at: Date.now() + 3600_000, email,
  })), email);
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes('/storage/v1/object/public/')) return route.fulfill({ contentType: 'image/webp', body: image });
    if (!path.endsWith('/women-admin/call')) return url.hostname.endsWith('.supabase.co') ? route.abort() : route.continue();
    const { op, args } = request.postDataJSON();
    state.calls.push({ op, args });
    const reply = data => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
    if (op === 'session.get') return reply({ outcome: 'ok', data: { role: owner ? 'owner' : 'staff', email, permissions: ['settings.view', 'products.view', 'products.edit'] } });
    if (op === 'products.get') return reply({ outcome: 'ok', data: { product, media: { media: [] } } });
    if (op === 'products.list') return reply({ outcome: 'ok', data: [product, { public_code: 'SS-1024', title: 'جاكيت تاني', status: 'public' }] });
    if (op === 'settings.get') return reply({ outcome: 'ok', data: { store_name: 'SELECT SHOP' } });
    if (op === 'settings.whatsapp_get') return reply({ outcome: 'ok', whatsappNumbers: ['201289437444'] });
    if (op === 'settings.studio_marquee_get' && owner) return reply({ outcome: 'ok', ...state.marquee });
    if (op === 'settings.studio_marquee_save' && owner) {
      state.marquee = args;
      return reply({ outcome: 'saved', ...state.marquee });
    }
    if (op === 'landing.get') {
      const row = args.code === 'SS-1024' ? state.target : state.source;
      return reply({ outcome: 'ok', data: { ...row, studioMarquee: state.marquee } });
    }
    if (op === 'landing.versions') return reply({ outcome: 'ok', versions: state.versions });
    if (op === 'landing.snapshot') {
      state.versions.unshift({ id: String(state.versions.length + 1), createdAt: now, design: args.design });
      return reply({ outcome: 'saved' });
    }
    if (op === 'landing.reset' || op === 'landing.restore') {
      if (args.version !== state.source.version) return reply({ outcome: 'conflict' });
      if (op === 'landing.reset') {
        state.versions.unshift({ id: String(state.versions.length + 1), createdAt: now, design: args.design });
        const photos = args.keepPhotos ? (args.design.studioStack?.photos || []).map(photo => ({ path: photo.path, overlays: [] })) : [];
        state.source.draft = { studioStack: { ...original.studioStack, photos } };
      } else {
        state.source.draft = state.versions.find(entry => entry.id === String(args.id)).design;
      }
      return reply({ outcome: 'saved', version: ++state.source.version, draft: state.source.draft });
    }
    if (op === 'landing.template') {
      state.templates.push(args);
      state.target.draft = {
        studioStack: { ...state.source.draft.studioStack, photos: [{ ...state.source.draft.studioStack.photos[0], path: targetImage }] },
      };
      state.target.version++;
      return reply({ outcome: 'saved' });
    }
    return reply({ outcome: 'unsupported' });
  });
}

async function screenshot(locator, name, testInfo) {
  if (testInfo.project.name !== 'mobile') return;
  await locator.scrollIntoViewIfNeeded();
  await locator.page().screenshot({ path: testInfo.outputPath(name + '-390.png'), scale: 'css', animations: 'disabled' });
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
});

test('reset keeps the live version, snapshots the draft and can restore it', async ({ page }, testInfo) => {
  const state = initialState();
  await signIn(page, state);
  await page.goto('/admin/#/studio/SS-1008');
  await expect(page.getByRole('region', { name: 'جاهزة للنشر؟' }).getByText('✓ الصورة الأولى موجودة وبأولوية تحميل عالية')).toBeVisible();
  await screenshot(page.getByRole('region', { name: 'جاهزة للنشر؟' }), 'readiness', testInfo);
  const reset = page.getByRole('button', { name: 'ابدأ من جديد', exact: true });
  await reset.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: 'بنفس الصور' })).toBeChecked();
  await screenshot(dialog, 'reset-draft', testInfo);
  await dialog.getByRole('button', { name: 'ابدأ المسودة الجديدة' }).click();
  await expect.poll(() => state.source.version).toBe(5);
  expect(state.source.published).toEqual(original);
  expect(state.source.draft.studioStack.photos).toEqual([{ path: cover, overlays: [] }]);
  await reset.click();
  await dialog.getByRole('radio', { name: 'من غير صور' }).check();
  await dialog.getByRole('button', { name: 'ابدأ المسودة الجديدة' }).click();
  await expect(page.locator('[data-studio-publish]')).toBeDisabled();
  await expect(page.getByRole('region', { name: 'جاهزة للنشر؟' })).toContainText('لازم يتصلّح قبل النشر');
  expect(state.source.published).toEqual(original);
  await page.getByRole('button', { name: 'رجوع لنسخة سابقة' }).click();
  await expect(dialog.locator('[data-studio-restore]')).toHaveCount(2);
  await screenshot(dialog, 'draft-history', testInfo);
  await dialog.locator('[data-studio-restore="1"]').click();
  await expect(page.locator('[data-studio-publish]')).toBeEnabled();
  expect(state.source.draft.studioStack).toEqual(original.studioStack);
  expect(state.calls.some(call => call.op === 'landing.publish')).toBe(false);
});

test('copies a design as a versioned draft and filters template targets', async ({ page }, testInfo) => {
  const state = initialState();
  await signIn(page, state);
  await page.goto('/admin/#/studio/SS-1008');
  await page.getByRole('button', { name: 'استخدم كقالب لمنتجات تانية' }).click();
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox');
  await search.fill('مش موجود');
  await expect(dialog.getByText('مفيش منتجات مطابقة.')).toBeVisible();
  await search.fill('SS-1024');
  await dialog.getByRole('checkbox', { name: /SS-1024/ }).check();
  await screenshot(dialog, 'apply-template', testInfo);
  await dialog.getByRole('button', { name: 'احفظ المسودات' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.templates[0]).toEqual({ code: 'SS-1008', version: 4, targets: [{ code: 'SS-1024', version: 7 }] });
  expect(state.target.draft.studioStack.photos[0].path).toBe(targetImage);
  expect(state.target.published.title).toBe('نسخة منشورة');
  await page.getByRole('button', { name: 'نسخ التصميم', exact: true }).click();
  await expect.poll(() => state.versions.length).toBe(1);
  expect(state.versions[0].design.studioStack).toEqual(original.studioStack);
  expect(state.source.version).toBe(4);
  expect(state.source.published).toEqual(original);
});

test('restricted copy blocks publishing while disabled shadow is advisory', async ({ page }) => {
  const state = initialState();
  state.source.draft.studioStack.photos[0].overlays[0] = { type: 'text', text: 'آخر قطع', sh: '' };
  await signIn(page, state);
  await page.goto('/admin/#/studio/SS-1008');
  const readiness = page.getByRole('region', { name: 'جاهزة للنشر؟' });
  await expect(readiness.locator('.studio-check-blocked')).toHaveText(/مفيش كلمات ممنوعة/);
  await expect(readiness.getByText('✗ ظل النص شغّال')).toBeVisible();
  await expect(page.locator('[data-studio-publish]')).toBeDisabled();
  await expect(page.locator('[data-studio-save]')).toBeEnabled();
});

test('only the owner sees store marquee controls and hidden lines persist', async ({ page }, testInfo) => {
  const state = initialState();
  await signIn(page, state);
  await page.goto('/admin/#/settings');
  const form = page.locator('#studio-marquee');
  await expect(form.locator('[data-marquee-copy]')).toHaveCount(3);
  await form.locator('[data-marquee-hidden]').first().check();
  await form.locator('[data-marquee-speed]').press('End');
  await form.getByRole('button', { name: 'احفظ الشريط' }).click();
  await expect.poll(() => state.marquee.lines[0].hidden).toBe(true);
  expect(state.marquee.speed).toBe(60);
  await screenshot(form, 'store-marquee', testInfo);
});

test('staff settings make no owner marquee calls', async ({ page }) => {
  const state = initialState();
  await signIn(page, state, false);
  await page.goto('/admin/#/settings');
  await expect(page.locator('#contact')).toBeVisible();
  await expect(page.locator('#studio-marquee')).toHaveCount(0);
  expect(state.calls.some(call => call.op.startsWith('settings.studio_marquee'))).toBe(false);
});
