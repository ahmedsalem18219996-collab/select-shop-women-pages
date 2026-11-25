import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Admin Landing Studio against an in-memory Admin API. Never reaches live Supabase: every Admin call is answered
// here, storage images are served locally and any other supabase.co request is aborted.
test.use({ bypassCSP: true });

const STORAGE = 'https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/';
const IMG = new URL('../../assets/catalog-thumbs/005a3ee1a8504efca19a780f21981d33.jpg.w400.webp', import.meta.url);
const GENERATIVE = /gemini|generativelanguage|aistudio|makersuite|openai|stability\.ai|replicate\.com|midjourney|huggingface|imagen/i;
const OWNER = { role: 'owner', email: 'qa-owner@example.test', permissions: [] };
const STAFF = { role: 'staff', email: 'qa-staff@example.test', permissions: ['products.view', 'products.edit'] };
const VIEWER = { role: 'staff', email: 'qa-viewer@example.test', permissions: ['products.view', 'orders.view'] };
const now = '2026-11-19T10:00:00Z';
const product = {
  public_code: 'SS-1008', title: 'جاكيت جلد', description: 'جاكيت جلد صناعي', status: 'public', created_at: now, updated_at: now, structure_version: 2,
  base_price: { amount_minor: 120000 }, variants: [], options: [], publish_blockers: [],
};

/** In-memory Admin API with a shared landing store, so a reload restores what was saved. */
async function signIn(page, user, store) {
  const img = await readFile(IMG);
  page.hosts = [];
  page.on('request', r => page.hosts.push(new URL(r.url()).host));
  await page.addInitScript(({ email }) => sessionStorage.setItem('wa.session', JSON.stringify({
    access_token: 'local-qa-only', refresh_token: 'local-qa-refresh', expires_at: Date.now() + 3600_000, email })), { email: user.email });
  let uploads = 0;
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const reply = (json) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(json) });
    // Product photos are a solid garment colour (CORS open like public storage) so the colour suggestion is predictable.
    if (req.url().startsWith(STORAGE + 'product-media/')) return route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#c8102e"/></svg>' });
    if (req.url().startsWith(STORAGE)) return route.fulfill({ contentType: 'image/webp', body: img });
    if (url.pathname.endsWith('/women-admin/landing/upload')) {
      store.ops.push({ op: 'upload', code: url.searchParams.get('code') });
      const path = `women-storefront/storefront/studio-${++uploads}.webp`;
      return reply({ outcome: 'saved', path, url: STORAGE + path });
    }
    if (url.pathname.endsWith('/women-admin/call')) {
      const { op, args } = JSON.parse(req.postData() || '{}');
      store.ops.push({ op, args });
      const L = store.landing;
      let r = { outcome: 'forbidden' };
      if (op === 'session.get') r = { outcome: 'ok', data: user };
      else if (op === 'products.list') r = { outcome: 'ok', data: [{ public_code: 'SS-1008', title: product.title, status: 'public' }] };
      else if (op === 'products.get') r = { outcome: 'ok', data: { product, media: { media: store.media || [] } } };
      else if (op === 'landing.get') r = { outcome: 'ok', data: { version: L.version, draft: L.draft, published: L.published, published_at: L.published_at } };
      else if (op === 'landing.save') {
        if (!user.permissions.includes('products.edit') && user.role !== 'owner') r = { outcome: 'forbidden' };
        else if (args.version !== L.version) r = { outcome: 'conflict' };
        else { L.version++; L.draft = args.design; r = { outcome: 'saved', version: L.version, draft: L.draft }; }
      } else if (op === 'landing.publish') {
        if (user.role !== 'owner') r = { outcome: 'forbidden' };
        else { L.published = L.draft; L.published_at = now; r = { outcome: 'published', published_at: now }; }
      } else if (op === 'orders.get') r = { outcome: 'ok', data: { order: {
        public_order_code: 'ORD-AB23CD45', status: 'pending', created_at: now, groups: [], items: [], history: [],
        merchandise_subtotal_minor: 120000, shipping_total_minor: 7000, grand_total_minor: 127000,
        buyer_name: 'عميلة اختبار', buyer_phone: '01000000000', delivery_region_label: 'القاهرة', delivery_address: 'عنوان اختبار', payment_method: 'cod' } } };
      else if (op === 'orders.attribution') r = { outcome: 'ok', data: { source: 'meta', campaign: 'winter-jackets', adset: 'women-25-34', landing: 'ss-1008' } };
      return reply(r);
    }
    if (url.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
}
const newStore = () => ({ ops: [], landing: { version: 0, draft: null, published: null, published_at: null } });
const openStudio = async (page) => {
  await page.goto('/admin/#/studio/SS-1008', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-studio-status]')).toBeVisible({ timeout: 15000 });
  const legacy = page.locator('[data-legacy-studio]');
  if ((await legacy.getAttribute('aria-expanded')) === 'false') await legacy.click();
};

test('a long ribbon fits, moves and resizes in the editor, then renders from the saved design', async ({ page, request }) => {
  const mobile = test.info().project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const store = newStore();
  store.landing.draft = { studioStack: { v: 1, photos: [
    { path: 'women-storefront/storefront/qa-ribbon.webp', overlays: [] },
  ] } };
  await signIn(page, OWNER, store);
  await page.goto('/admin/#/studio/SS-1008');
  const editor = page.locator('.studio-visual'), stage = editor.locator('[data-visual-stage]');
  await expect(editor).toBeVisible();
  const elementsTab = editor.locator('[data-tab="elements"]');
  if (await elementsTab.isVisible()) await elementsTab.click();
  await editor.locator('[data-element="strip"]').click();
  const ribbon = stage.locator('.ssm-o-ribbon'), copy = editor.locator('[data-field="text"]');
  const ratio = await ribbon.evaluate(el => [el.offsetWidth / el.offsetParent.clientWidth, el.offsetHeight / el.offsetParent.clientHeight]);
  expect(ratio[0]).toBeCloseTo(.76,1);
  expect(ratio[1]).toBeCloseTo(.09,2);
  await editor.locator('[data-section="geometry"] summary').click();
  for (const key of ['size','x','y','rot']) await expect(editor.locator('[data-field="' + key + '"]')).toBeVisible();
  const caption = 'اختاري اللون والمقاس اللي يناسبك وعايني القطعة بنفسك قبل ما تدفعي';
  await copy.fill(caption);
  const label = ribbon.locator('.ssm-ribbon-label');
  await expect(label).toHaveText(caption);
  const labelFits = locator => locator.evaluate(el => {
    const line = parseFloat(getComputedStyle(el).lineHeight);
    return el.scrollWidth <= el.clientWidth && el.scrollHeight <= Math.min(el.parentElement.clientHeight,line * 2) + 1;
  });
  await expect.poll(() => labelFits(label)).toBe(true);
  async function drag(target, dx, dy) {
    await target.scrollIntoViewIfNeeded();
    const rect = await target.boundingBox();
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    if (mobile) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] });
      await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:x + dx,y:y + dy}] });
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      await cdp.detach();
    } else {
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x + dx,y + dy,{ steps:4 });
      await page.mouse.up();
    }
  }
  await drag(label,10,-18);
  await expect(editor.locator('[data-field="x"]')).not.toHaveValue('50');
  await expect(editor.locator('[data-field="y"]')).not.toHaveValue('82');
  await drag(stage.locator('[data-resize]'),-35,-12);
  await expect(editor.locator('[data-field="size"]')).not.toHaveValue('1');
  await editor.locator('[data-field="rot"]').fill('8');
  await page.locator('[data-studio-save]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status','draft');
  const saved = store.landing.draft;
  const layer = saved.studioStack.photos[0].overlays[0];
  expect(layer).toMatchObject({ type:'badge',fx:'ribbon',rot:8,text:caption });
  expect(layer.size).not.toBe(1);
  expect(layer.x).not.toBe(50);
  expect(layer.y).not.toBe(82);
  await page.reload();
  await expect(stage.locator('.ssm-ribbon-label')).toHaveText(caption);
  try {
    const publishedFixture = await request.post('/__mock/landing', { data:{ code:'SS-1008', design:saved } });
    expect(publishedFixture.status()).toBe(204);
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.goto('/lp/ss-1008/');
    await expect(page.locator('.lp-studio-stack')).toHaveCount(0);
    await page.locator('#lpForm').scrollIntoViewIfNeeded();
    const publicRibbon = page.locator('.lp-studio-stack .ssm-o-ribbon');
    const publicLabel = publicRibbon.locator('.ssm-ribbon-label');
    await expect(publicLabel).toHaveText(caption);
    await expect.poll(() => labelFits(publicLabel)).toBe(true);
    for (const [property,value] of [['--ribbon-x',layer.x + '%'], ['--ribbon-y',layer.y + '%'], ['--s',String(layer.size)], ['--rot','8deg']]) {
      await expect(publicRibbon).toHaveCSS(property,value);
    }
  } finally {
    await request.post('/__mock/landing', { data:{ code:'SS-1008', design:null } });
  }
});

test('library shapes start inside the frame and share the selected element controls', async ({ page }) => {
  const store = newStore();
  store.landing.draft = { studioStack: { v: 1, photos: [
    { path:'women-storefront/storefront/qa-shapes.webp', overlays:[] },
  ] } };
  await signIn(page, OWNER, store);
  await page.goto('/admin/#/studio/SS-1008');
  const editor = page.locator('.studio-visual'), stage = editor.locator('[data-visual-stage]');
  await expect(editor).toBeVisible();
  const elementsTab = editor.locator('[data-tab="elements"]');
  if (await elementsTab.isVisible()) await elementsTab.click();
  for (const type of ['badge','arrow','dot','circle','callout','icon']) {
    await editor.locator('[data-element="' + type + '"]').click();
    const shape = stage.locator('.ssm-o-' + type);
    await expect(shape).toBeVisible();
    const valid = await shape.evaluate(el => {
      const frame = el.closest('.ssm-wrap').getBoundingClientRect();
      const bounds = [el.getBoundingClientRect(), ...[...el.closest('.ssm-layer').querySelectorAll('line')].map(l => l.getBoundingClientRect())];
      const left = Math.min(...bounds.map(b => b.left)), right = Math.max(...bounds.map(b => b.right));
      const top = Math.min(...bounds.map(b => b.top)), bottom = Math.max(...bounds.map(b => b.bottom));
      return left >= frame.left && right <= frame.right && top >= frame.top && bottom <= frame.bottom
        && (right - left) * (bottom - top) < .3 * frame.width * frame.height;
    });
    expect(valid,type).toBe(true);
    const geometry = editor.locator('[data-section="geometry"]');
    if ((await geometry.getAttribute('open')) === null) await geometry.locator('summary').click();
    for (const key of ['size','x','y','rot']) await expect(editor.locator('[data-field="' + key + '"]')).toBeVisible();
    await expect(stage.locator('[data-resize]')).toBeVisible();
    await editor.locator('[data-action="remove-layer"]').click();
  }
});

test('the visual Studio applies cards, selects text on the phone, replays motion, and saves the same payload', async ({ page }) => {
  const store = newStore();
  await signIn(page, OWNER, store);
  await page.goto('/admin/#/studio/SS-1008');
  const editor = page.locator('.studio-visual');
  const stage = editor.locator('[data-visual-stage]');
  await expect(page.locator('[data-legacy-studio]')).toHaveAttribute('aria-expanded','false');
  await editor.locator('[data-stack-files]').setInputFiles([fileURLToPath(IMG), fileURLToPath(IMG)]);
  await expect(editor.locator('.studio-visual-thumb')).toHaveCount(2);
  await editor.locator('[data-template="0"][data-own="false"]').click();
  await stage.locator('button[data-overlay="1"]').click();
  const copy = editor.locator('[data-field="text"]');
  await expect(copy).toHaveValue(/النهارده/);
  await copy.fill('ستايل يعبّر عنك');
  await editor.locator('[data-choice="fx"][data-value="aurora"]').click();
  await expect(stage.locator('.ssm-fx-aurora')).toHaveText('ستايل يعبّر عنك');
  const inspector = editor.locator('.studio-visual-inspector');
  await inspector.locator('[data-section="shadow"] summary').click();
  const automaticShadow = inspector.getByRole('button', { name:'تلقائي', exact:true });
  await expect(automaticShadow).toHaveAttribute('aria-pressed','true');
  await expect(stage.locator('.ssm-fx-aurora')).toHaveClass(/ssm-sh-soft/);
  await inspector.getByRole('button', { name:'من غير', exact:true }).click();
  await expect(stage.locator('.ssm-fx-aurora')).toHaveClass(/ssm-sh-none/);
  await editor.locator('[data-action="play"]').click();
  await expect(stage).not.toHaveClass(/ssm-edit/);
  await editor.locator('[data-action="play"]').click();
  await expect(stage).toHaveClass(/ssm-edit/);
  await editor.locator('[data-action="full"]').click();
  await expect(editor.locator('dialog')).toBeVisible();
  await expect(editor.frameLocator('iframe').locator('.ssm-card')).toHaveCount(2);
  await expect(editor.frameLocator('iframe').locator('.ssm-fx-aurora')).toHaveClass(/ssm-sh-none/);
  await editor.locator('[data-device="desktop"]').click();
  await expect(editor.locator('[data-device="desktop"]')).toHaveAttribute('aria-pressed','true');
  await editor.locator('[data-action="close"]').click();
  await page.locator('[data-studio-save]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status','draft');
  const saved = store.landing.draft.studioStack;
  expect(saved.v).toBe(1);
  expect(saved.photos).toHaveLength(2);
  expect(saved.photos[0].overlays[1]).toMatchObject({ type:'text', text:'ستايل يعبّر عنك', fx:'aurora', sh:'' });
  expect(store.landing.published).toBeNull();
  await page.locator('[data-studio-publish]').click();
  await page.locator('[data-yes]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status','published');
  expect(store.landing.published.studioStack).toEqual(saved);
  await page.reload();
  await expect(stage.locator('.ssm-fx-aurora')).toHaveClass(/ssm-sh-none/);
});

test('the selected element and side library remember collapsible sections and edit approved Arabic presets', async ({ page }) => {
  const mobile = test.info().project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width:390, height:844 });
  const store = newStore();
  store.landing.draft = { studioStack: { v:1, photos:[{
    path:'women-storefront/storefront/qa-studio-copy.webp', overlays:[{ type:'text', x:50, y:48, text:'إطلالتك الجاية تبدأ من هنا' }],
  }] } };
  await signIn(page, OWNER, store);
  await page.goto('/admin/#/studio/SS-1008');
  const editor = page.locator('.studio-visual');
  const toolbox = editor.locator('.studio-visual-tools');
  const templates = toolbox.locator('[data-section="templates"]');
  await templates.locator('summary').press('Enter');
  await expect(templates).not.toHaveAttribute('open', '');
  await expect(templates.locator('[data-template]').first()).toBeHidden();
  await page.reload();
  await expect(templates).not.toHaveAttribute('open', '');
  await toolbox.getByRole('button', { name:'فتح الكل' }).click();
  await expect(templates).toHaveAttribute('open', '');
  const selectText = () => editor.locator('.ssm-wrap button[data-overlay="0"]').press('Enter');
  await selectText();
  const inspector = editor.locator('.studio-visual-inspector');
  const text = inspector.locator('[data-field="text"]');
  await expect(text).toBeFocused();
  await expect(inspector.locator('[data-section="copy"]')).toHaveAttribute('open', '');
  await expect(inspector.locator('[data-section="effect"]')).toHaveAttribute('open', '');
  await expect(inspector.locator('[data-section="font"]')).not.toHaveAttribute('open', '');
  expect(await inspector.locator('summary').first().evaluate(summary => summary.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const take = async (file, locator) => {
    if (!mobile) return;
    await locator.evaluate(element => element.scrollIntoView({ block:'center' }));
    await page.screenshot({ path:test.info().outputPath(file), animations:'disabled', scale:'css' });
  };
  await take('studio-inspector-expanded.png', inspector.locator('[data-section="effect"]'));
  await inspector.getByRole('button', { name:'فتح الكل' }).press('Enter');
  await expect(inspector.locator('[data-section="font"]')).toHaveAttribute('open', '');
  await inspector.getByRole('button', { name:'قفل الكل' }).press('Enter');
  await expect(inspector.locator('details[open]')).toHaveCount(0);
  await expect(text).toBeHidden();
  await take('studio-inspector-collapsed.png', inspector);
  const library = inspector.locator('[data-section="library"]');
  await library.locator('summary').press('Space');
  const titleTab = library.getByRole('tab', { name:'عناوين' });
  await expect(titleTab).toHaveAttribute('aria-selected', 'true');
  await take('studio-copy-library.png', library);
  await titleTab.press('ArrowLeft');
  const subtitleTab = library.getByRole('tab', { name:'سطر تحت العنوان' });
  await expect(subtitleTab).toBeFocused();
  await expect(subtitleTab).toHaveAttribute('aria-selected', 'true');
  await library.getByRole('button', { name:'شوفي القطعة، جرّبيها، وبعدها ادفعي' }).click();
  await expect(editor.locator('.ssm-o-text')).toHaveText('شوفي القطعة، جرّبيها، وبعدها ادفعي');
  await inspector.locator('[data-section="copy"] summary').click();
  await expect(text).toHaveValue('شوفي القطعة، جرّبيها، وبعدها ادفعي');
  await text.fill('خصم ٤٥٠ جنيه خلال ٣ أيام');
  await expect(inspector.getByRole('status')).toContainText('غير مسموح');
  await expect(inspector.getByRole('status')).toContainText('شيلي رقم السعر');
  await expect(text).toBeFocused();
  await text.fill('تتلبس في الشغل وفي الخروجة');
  await expect(inspector.getByRole('status')).toBeHidden();
  await page.locator('[data-studio-save]').click();
  await expect.poll(() => store.landing.draft.studioStack.photos[0].overlays[0]).toMatchObject({
    text:'تتلبس في الشغل وفي الخروجة', in:'blur', anim:'none', fx:'',
  });
  await page.reload();
  await selectText();
  await expect(library).toHaveAttribute('open', '');
  await expect(inspector.locator('[data-section="effect"]')).not.toHaveAttribute('open', '');
});

test('per-design marquee and scroll hints update the previews and round-trip through draft save', async ({ page }) => {
  const mobile = test.info().project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width:390, height:844 });
  const store = newStore();
  store.landing.draft = { studioStack: { v:1, photos:[
    { path:'women-storefront/storefront/qa-v2-first.webp', overlays:[] },
    { path:'women-storefront/storefront/qa-v2-next.webp', overlays:[] },
  ] } };
  await signIn(page, OWNER, store);
  await page.goto('/admin/#/studio/SS-1008');
  const editor = page.locator('.studio-visual'), stage = editor.locator('[data-visual-stage]');
  const pageTab = editor.locator('[data-tab="page"]');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.ssm-v2-marquee')).toHaveCount(0);
  if (await pageTab.isVisible()) await pageTab.click();
  const marquee = editor.locator('[data-section="marquee"]');
  await marquee.locator('summary').click();
  const switcher = marquee.getByRole('switch', { name:'إظهار الشريط' });
  await expect(switcher).toBeChecked();
  await marquee.getByRole('button', { name:'تحت الصور' }).click();
  await expect(stage).toHaveAttribute('data-marquee-position', 'below');
  await expect(stage.locator('.ssm-v2-marquee')).toBeVisible();
  await switcher.uncheck();
  await expect(stage.locator('.ssm-v2-marquee')).toHaveCount(0);
  await switcher.check();
  await marquee.getByRole('button', { name:'فوق الصور' }).click();
  await expect(stage).toHaveAttribute('data-marquee-position', 'above');
  if (mobile) {
    await stage.evaluate(element => element.scrollIntoView({ block:'center' }));
    await page.screenshot({ path:test.info().outputPath('studio-marquee-preview.png'), animations:'disabled', scale:'css' });
  }
  const hints = editor.locator('[data-section="hint"]');
  await hints.locator('summary').click();
  const cards = hints.locator('[data-choice="scroll-hint"]');
  await expect(cards).toHaveCount(7);
  await expect(hints.locator('.ssm-v2-hint')).toHaveCount(6);
  for (const style of ['pill','arrow','finger','shine','dots','progress','none']) {
    await cards.filter({ has:page.locator('[data-sample-value="' + style + '"]') }).click();
    await expect(stage.locator('.ssm-v2-hint[data-style="' + style + '"]')).toHaveCount(style === 'none' ? 0 : 1);
    if (mobile) {
      await stage.evaluate(element => element.scrollIntoView({ block:'center' }));
      await page.screenshot({ path:test.info().outputPath('hint-' + style + '-390.png'), animations:'disabled', scale:'css' });
    }
  }
  await hints.getByRole('button', { name:'خط تقدّم' }).click();
  await hints.getByRole('switch', { name:'تدرّج بلون الحملة' }).check();
  await expect(stage.locator('.ssm-v2-hint')).toHaveAttribute('data-gradient', 'true');
  if (mobile) {
    await stage.evaluate(element => element.scrollIntoView({ block:'center' }));
    await page.screenshot({ path:test.info().outputPath('hint-progress-gradient-390.png'), animations:'disabled', scale:'css' });
    await hints.evaluate(element => element.scrollIntoView({ block:'center' }));
    await page.screenshot({ path:test.info().outputPath('studio-scroll-hint-cards.png'), animations:'disabled', scale:'css' });
  }
  await editor.locator('[data-action="full"]').click();
  const preview = editor.frameLocator('iframe');
  await expect(preview.locator('.ssm-v2-marquee')).toBeVisible();
  await expect(preview.locator('.ssm-v2-hint')).toHaveAttribute('data-gradient', 'true');
  await editor.locator('[data-action="close"]').click();
  await page.locator('[data-studio-save]').click();
  await expect.poll(() => store.landing.draft.studioStack).toMatchObject({
    marquee:{ enabled:true, position:'above' }, scrollHint:{ style:'progress', gradient:true },
  });
  await page.reload();
  await expect(stage.locator('.ssm-v2-hint')).toHaveAttribute('data-gradient', 'true');
  await expect(stage).toHaveAttribute('data-marquee-position', 'above');
});

// The mobile tab bar is fixed over the bottom of the viewport: centre the element first so the click never lands on the bar.
const clickPreview = async (locator) => { await locator.evaluate(element => element.scrollIntoView({ block:'center' })); await locator.click(); };
test('Owner: uploads the 3 marketing images by hand, edits every control, saves a draft, reopens it, publishes', async ({ page }) => {
  const store = newStore();
  await signIn(page, OWNER, store);
  await openStudio(page);
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'new');
  for (const slot of ['hero', 'features', 'closing']) {
    await page.locator(`[data-slot-input=${slot}]`).setInputFiles(fileURLToPath(IMG));
    await expect(page.locator(`[data-slot=${slot}] img`)).toHaveAttribute('src', /women-storefront\/storefront\/studio-\d\.webp$/);
  }
  expect(store.ops.filter(o => o.op === 'upload')).toEqual([
    { op: 'upload', code: 'SS-1008' }, { op: 'upload', code: 'SS-1008' }, { op: 'upload', code: 'SS-1008' },
  ]);
  await page.locator('[name=title]').fill('جاكيت جلد للشتا');
  await page.locator('[name=feature0]').fill('بطانة دافية');
  for (const [name, value] of [['template', 'editorial'], ['background', 'navy'], ['font', 'rakkas'], ['divider', 'wave'], ['ctaColor', 'cyan'],
    ['ctaPosition', 'overlay'], ['ctaShape', 'rounded'], ['ctaSize', 'lg'], ['ctaAnimation', 'shine'], ['cardStyle', 'outlined'], ['cardFields', 'compact']]) {
    await page.locator(`select[name=${name}]`).selectOption(value);
  }
  await page.locator('[name=ctaText]').fill('احجزي قطعتك');
  await page.locator('[data-section-up=closing]').click(); // verify manual reorder while keeping the product/order block last
  await page.locator('label.switch', { has: page.locator('[data-section-visible=closing]') }).click();
  await expect(page.locator('[data-section-visible=closing]')).not.toBeChecked();
  // The live preview is the real page fed the unsaved draft; ordering is off inside it.
  const mobile = page.frameLocator('[data-preview-frame=mobile]');
  await expect(mobile.locator('.studio-hero h2')).toHaveText('جاكيت جلد للشتا');
  await clickPreview(mobile.locator('.studio-hero h2'));
  await expect(page.locator('[name=title]')).toBeFocused();
  await clickPreview(mobile.locator('.studio-hero [data-studio-image=hero]'));
  await expect(page.locator('[data-slot-upload=hero]')).toBeFocused();
  await clickPreview(mobile.locator('.studio-hero [data-studio-cta]').first());
  await expect(page.locator('[name=ctaText]')).toBeFocused();
  await clickPreview(mobile.locator('#lpForm h2'));
  await expect(page.locator('[name=cardTitle]')).toBeFocused();
  await expect(mobile.locator('.studio-closing')).toHaveCount(0);
  await expect(mobile.locator('.studio-media [data-studio-cta]').first()).toHaveText('احجزي قطعتك');
  await mobile.locator('#lpForm').evaluate(f => f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(mobile.locator('#lpStatus')).toContainText('معاينة فقط');
  await page.locator('[data-preview=desktop]').click();
  await expect(page.frameLocator('[data-preview-frame=desktop]').locator('.studio-features li')).toHaveText(['بطانة دافية']);
  await expect(page.locator('[data-studio-publish]')).toBeDisabled(); // unsaved changes cannot be published

  await page.locator('[data-studio-save]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'draft');
  const saved = store.ops.find(o => o.op === 'landing.save').args;
  expect(saved.version).toBe(0);
  expect(saved.design.images).toEqual({ hero: 'women-storefront/storefront/studio-1.webp', features: 'women-storefront/storefront/studio-2.webp', closing: 'women-storefront/storefront/studio-3.webp' });
  expect(saved.design.order).toEqual(['hero', 'closing', 'features', 'product']);
  expect(saved.design.hidden).toEqual(['closing']);
  expect(saved.design.cta).toEqual({ text: 'احجزي قطعتك', color: 'cyan', position: 'overlay', shape: 'rounded', size: 'lg', animation: 'shine' });
  expect(JSON.stringify(saved.design)).not.toMatch(/price|amount|shipping|stock|supplier/);

  await page.reload();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'draft');
  await expect(page.locator('[name=title]')).toHaveValue('جاكيت جلد للشتا');
  await expect(page.locator('select[name=ctaColor]')).toHaveValue('cyan');
  await expect(page.locator('select[name=cardFields]')).toHaveValue('compact');
  await expect(page.locator('[data-slot=closing] img')).toHaveAttribute('src', STORAGE + 'women-storefront/storefront/studio-3.webp');
  await expect(page.locator('[data-section-visible=closing]')).not.toBeChecked();

  await page.locator('[data-studio-publish]').click();
  await page.locator('[data-yes]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'published');
  expect(store.ops.filter(o => o.op === 'landing.publish')).toEqual([{ op: 'landing.publish', args: { code: 'SS-1008', version: 1 } }]);
  expect(page.hosts.filter(h => GENERATIVE.test(h))).toEqual([]);
});

test('Staff with edit rights saves drafts but has no publish control', async ({ page }) => {
  const store = newStore();
  await signIn(page, STAFF, store);
  await openStudio(page);
  await expect(page.locator('[data-studio-publish], [data-studio-unpublish]')).toHaveCount(0);
  await page.locator('[data-slot-input=hero]').setInputFiles(fileURLToPath(IMG));
  await expect(page.locator('[data-slot=hero] img')).toHaveAttribute('src', /women-storefront\/storefront\/studio-1\.webp$/);
  expect(store.ops.filter(o => o.op === 'upload')).toEqual([{ op: 'upload', code: 'SS-1008' }]);
  await page.locator('[name=title]').fill('عنوان من الموظفة');
  await page.locator('[data-studio-save]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'draft');
  expect(store.ops.filter(o => o.op === 'landing.publish')).toHaveLength(0);
});

test('Staff without edit rights does not get the Studio; the order shows its ad source', async ({ page }) => {
  const store = newStore();
  await signIn(page, VIEWER, store);
  await page.goto('/admin/#/orders/ORD-AB23CD45', { waitUntil: 'domcontentloaded' });
  const box = page.locator('#order-attribution');
  await expect(box).toBeVisible({ timeout: 15000 });
  await expect(box.locator('[data-attr=adset]')).toHaveText('women-25-34');
  await expect(box.locator('[data-attr=campaign]')).toHaveText('winter-jackets');
  await expect(page.locator('a[href="#/studio"]')).toHaveCount(0);
  expect(store.ops.some(o => o.op.startsWith('landing.'))).toBe(false);
});

test('Owner: motion mode, per-photo entry direction, hint text and a main colour suggested from the photos', async ({ page }) => {
  const store = newStore();
  store.media = [1, 2, 3, 4].map(i => ({ media_id: 'm' + i, storage_path: 'media/photo' + i + '.webp', position: i, hidden: false }));
  await signIn(page, OWNER, store);
  await openStudio(page);
  // A new design gets a main colour from the product photos; the Owner can change or clear it.
  await expect(page.locator('input[name=accent]')).toHaveValue('#c8102e');
  await expect(page.locator('.studio-dir-thumb')).toHaveCount(3);
  await page.locator('select[name=motionMode]').selectOption('cinematic');
  await page.locator('select[name=motionDir1]').selectOption('top');
  await page.locator('[name=motionHint]').fill('اسحبي لتحت');
  const mobile = page.frameLocator('[data-preview-frame=mobile]');
  await expect(mobile.locator('html')).toHaveAttribute('data-motion', 'cinematic');
  await expect(mobile.locator('.mo-hint .mo-txt')).toHaveText('اسحبي لتحت');
  await expect(mobile.locator('#lpAddCart')).toHaveCSS('background-color', 'rgb(200, 16, 46)');
  await page.locator('[data-studio-save]').click();
  await expect(page.locator('[data-studio-status]')).toHaveAttribute('data-studio-status', 'draft');
  const saved = store.ops.find(o => o.op === 'landing.save').args.design;
  expect(saved.motion).toEqual({ mode: 'cinematic', hint: 'اسحبي لتحت', dirs: ['side', 'top', 'side'] });
  expect(saved.accent).toBe('#c8102e');
  if (test.info().project.name === 'mobile') {
    await page.locator('select[name=motionMode]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('studio-motion.png') });
  }

  await page.locator('[data-accent-clear]').click();
  await expect(mobile.locator('html')).not.toHaveAttribute('data-studio-accent', /.*/);
  await page.locator('select[name=motionMode]').selectOption('none');
  await expect(mobile.locator('html')).not.toHaveAttribute('data-motion', /.*/);
  await expect(mobile.locator('.mo-stack')).toHaveCount(0);
  await expect(mobile.locator('#lpStage')).toBeVisible();
  await page.locator('[data-studio-save]').click();
  await expect.poll(() => store.ops.filter(o => o.op === 'landing.save').length).toBe(2);
  const second = store.ops.filter(o => o.op === 'landing.save')[1].args.design;
  expect(second.accent).toBe('');
  expect(second.motion.mode).toBe('none');
});

// The live admin CSP (default-src 'none') blocked the same-origin preview iframe ("This content is blocked"): run with
// the CSP actually shipped in admin/index.html (no bypass) and require the preview page to render without a violation.
test.describe('shipped admin CSP', () => {
  test.use({ bypassCSP: false });
  test('Studio preview iframe loads under the real admin CSP, no CSP violation', async ({ page, baseURL }) => {
    const violations = [];
    page.on('console', m => { if (/violates the following Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
    await signIn(page, OWNER, newStore());
    // The mock server points the admin API at its own origin, which this CSP rightly refuses: put the live origin back
    // (answered by the routes above, never reached) so the CSP under test is byte-for-byte the shipped one.
    await page.route('**/admin/js/config.js*', async r => { const res = await r.fetch();
      await r.fulfill({ response: res, body: (await res.text()).replaceAll(baseURL + '/__mock/functions/v1', 'https://byluoipdunralsurwebt.supabase.co/functions/v1') }); });
    await openStudio(page);
    const shipped = (await readFile(new URL('../../admin/index.html', import.meta.url), 'utf8')).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    expect(await page.locator('meta[http-equiv=Content-Security-Policy]').getAttribute('content')).toBe(shipped);
    expect(shipped).toMatch(/(^|; )frame-src 'self'(;|$)/);
    await expect(page.frameLocator('[data-preview-frame=mobile]').locator('#lpForm')).toBeAttached({ timeout: 15000 });
    expect(violations).toEqual([]);
  });
});
