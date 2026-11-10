import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// A whole model in the Admin against an IN-MEMORY backend that follows the real structure rules
// (options only before the first Variant = PS009, positions max + 1, nothing deleted). Every Admin
// call and upload is fulfilled here; any Supabase request is aborted. No live data is touched.
test.use({ bypassCSP: true });
const target = '/admin/';
const now = '2026-11-05T09:00:00Z';

// ---- small valid PNG per colour (the optimizer re-encodes it like a real phone photo)
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(rgb, w = 300, h = 400) {
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const photo = (name, rgb) => ({ name, mimeType: 'image/png', buffer: png(rgb) });
const svg = (hex) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${hex}"/></svg>`);

// ---- in-memory WOMEN backend
function backend(seed) {
  const s = { version: 1, product: null, stock: {}, media: [], costs: { product_cost_minor: null, variants: [] }, ops: [], uploads: [], costsLive: true, ...seed };
  const P = () => s.product;
  const next = (l) => l.reduce((m, x) => Math.max(m, x.position), -1) + 1;
  const bump = () => ({ outcome: 'applied', structure_version: ++s.version });
  const valuesOf = (v) => (v.selections || []).map((x) => P().options.find((o) => o.option_id === x.option_id).values.find((y) => y.value_id === x.value_id).value);
  function structure({ version, change }) {
    if (version !== s.version) return { outcome: 'conflict', code: 'PS002' };
    const p = P();
    if (change.op === 'add_option') {
      if (p.variants.length) return { outcome: 'rejected', code: 'PS009' };
      const position = next(p.options);
      p.options.push({ option_id: 'o' + position, name: change.name, position, values: change.values.map((value, i) => ({ value_id: `o${position}v${i}`, value, position: i, active: true })) });
      return bump();
    }
    if (change.op === 'add_value') {
      if (Object.keys(change).sort().join() !== 'op,option,text') return { outcome: 'invalid' };
      const o = p.options.find((x) => x.position === change.option); const position = next(o.values);
      o.values.push({ value_id: `${o.option_id}v${position}`, value: change.text, position, active: true }); return bump();
    }
    if (change.op === 'create_variants') {
      for (const sel of change.selections) {
        p.variants.push({ position: next(p.variants), active: true, availability: 'unavailable', amount_minor: p.base_price?.amount_minor ?? null, price_source: 'base',
          selections: sel.map((vp, i) => ({ option_id: p.options[i].option_id, value_id: p.options[i].values.find((v) => v.position === vp).value_id })) });
      }
      return bump();
    }
    if (change.op === 'set_variant_active') { p.variants.find((v) => v.position === change.variant).active = change.active; return bump(); }
    if (change.op === 'set_value_active') {
      const o = p.options.find((x) => x.position === change.option); const val = o.values.find((v) => v.position === change.value); val.active = change.active;
      p.variants.filter((v) => v.selections.some((x) => x.value_id === val.value_id)).forEach((v) => { v.active = change.active; }); return bump();
    }
    return { outcome: 'invalid' };
  }
  function handle(op, a, session) {
    s.ops.push({ op, args: a });
    const p = P();
    const perm = { 'products.create': 'products.edit', 'products.structure': 'products.edit', 'products.set_price': 'products.price', 'products.set_variant_price': 'products.price',
      'products.set_stock': 'inventory.manage', 'products.set_availability': 'inventory.manage', 'products.publish': 'products.publish', 'media.reorder': 'media.manage' }[op];
    if (session.role !== 'owner' && perm && !session.permissions.includes(perm)) return { outcome: 'forbidden' };
    if (op.startsWith('costs.') && session.role !== 'owner' && !session.permissions.includes('products.edit')) return { outcome: 'forbidden' };
    switch (op) {
      case 'session.get': return { outcome: 'ok', data: session };
      case 'products.list': return { outcome: 'ok', data: [] };
      case 'categories.list': return { outcome: 'ok', data: [{ name: 'فساتين', visible: true }] };
      case 'shipping.get': return { outcome: 'ok', data: { profiles: [{ key: 'women_standard', active: true, name: 'شحن عادي' }] } };
      case 'products.create':
        s.product = { public_code: 'SS-9101', title: a.title, description: a.description, status: 'draft', created_at: now, updated_at: now, base_price: null, options: [], variants: [], shipping_profile: null, publish_blockers: [] };
        return { outcome: 'created', code: 'SS-9101', structure_version: s.version };
      case 'products.set_price': p.base_price = { amount_minor: a.amount_minor }; p.variants.filter((v) => v.price_source === 'base').forEach((v) => { v.amount_minor = a.amount_minor; }); return { outcome: 'saved' };
      case 'products.update_text': p.title = a.title; p.description = a.description; p.updated_at = now; return { outcome: 'updated' };
      case 'products.set_shipping_profile': p.shipping_profile = { key: a.profile_key, name: 'شحن عادي' }; return { outcome: 'saved' };
      case 'products.structure': return structure(a);
      case 'products.set_variant_price': { const v = p.variants.find((x) => x.position === a.position); v.amount_minor = a.amount_minor ?? p.base_price.amount_minor; v.price_source = a.amount_minor === null ? 'base' : 'variant_override'; return { outcome: 'saved' }; }
      case 'products.set_stock': { s.stock[a.position] = { quantity: a.quantity }; const v = p.variants.find((x) => x.position === a.position); if (a.quantity > 0) v.availability = 'available'; return { outcome: 'saved', available: v.availability === 'available' }; }
      case 'products.set_availability': p.variants.find((x) => x.position === a.position).availability = a.available ? 'available' : 'unavailable'; return { outcome: 'saved' };
      case 'media.reorder': a.media_ids.forEach((id, i) => { s.media.find((m) => m.media_id === id).position = i; }); return { outcome: 'saved' };
      case 'products.publish': p.status = 'public'; return { outcome: 'published' };
      case 'products.archive': return session.role === 'owner' ? (p.status = 'archived', { outcome: 'archived' }) : { outcome: 'forbidden' };
      case 'dashboard.summary': return { outcome: 'ok', data: { orders: { revenue_30d_minor: 0, revenue_today_minor: 0, pending: 0, to_ship: 0, revenue_7d_minor: 0 }, products: { public: 1, draft: 0 }, views: { days_7: 0, today: 0 }, top_viewed: [], recent_orders: [], revenue_by_day: [], low_stock: [] } };
      case 'profit.summary': return s.profitLines ? { outcome: 'ok', data: { lines: s.profitLines } } : { outcome: 'unknown_operation' };
      case 'costs.get': return s.costsLive ? { outcome: 'ok', data: s.costs } : { outcome: 'unknown_operation' };
      case 'costs.set':
        if (!s.costsLive) return { outcome: 'unknown_operation' };
        if (a.position === null) s.costs.product_cost_minor = a.cost_minor;
        else s.costs.variants = [...s.costs.variants.filter((v) => v.position !== a.position), { position: a.position, cost_minor: a.cost_minor }];
        return { outcome: 'saved' };
      case 'products.get': return { outcome: 'ok', data: {
        product: { ...p, structure_version: s.version, variants: p.variants.map((v) => ({ ...v, blockers: [] })) },
        card: { category: 'فساتين', is_new: true, image: null }, stock: s.stock,
        shipping_profiles: [{ key: 'women_standard', name: 'شحن عادي', active: true }],
        media: { media: s.media.map((m) => ({ ...m, variant: m.scope === 'variant' ? { position: m.variant_position, values: valuesOf(p.variants.find((v) => v.position === m.variant_position)) } : undefined })), structure_version: s.version },
        views: { today: 0, last_7_days: 0, last_30_days: 0, total: 0 }, activity: [] } };
      default: return { outcome: 'forbidden' };
    }
  }
  function upload(buf) {
    const text = buf.toString('latin1');
    const field = (n) => (text.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
    const f = { variant_position: field('variant_position'), option_position: field('option_position'), value_position: field('value_position'), type: (text.match(/name="image"[^\r]*\r\nContent-Type: ([^\r]+)/) || [])[1] };
    s.uploads.push(f);
    if (f.variant_position !== undefined && f.option_position !== undefined) return { outcome: 'invalid', field: 'attachment' }; // the draft Edge rule
    const vp = f.variant_position === undefined ? null : Number(f.variant_position);
    const hex = ['#A9C8E8', '#6E4B3A', '#E9B7C3'][vp === null ? 0 : P().variants.find((v) => v.position === vp).selections[0]?.value_id.endsWith('v1') ? 1 : P().variants.find((v) => v.position === vp).selections[0]?.value_id.endsWith('v2') ? 2 : 0];
    s.media.push({ media_id: 'm' + s.media.length, position: s.media.length, scope: vp === null ? 'product' : 'variant', variant_position: vp, storage_path: svg(hex), alt_text: '', hidden: false });
    return { outcome: 'saved' };
  }
  return { s, handle, upload };
}

async function open(page, b, session) {
  await page.addInitScript(({ email }) => {
    sessionStorage.setItem('wa.session', JSON.stringify({ access_token: 'local-qa-only', refresh_token: 'local-qa-refresh', expires_at: Date.now() + 3600_000, email }));
  }, { email: session.email });
  await page.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    const json = (body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (url.pathname.endsWith('/women-admin/call')) { const { op, args } = JSON.parse(req.postData() || '{}'); return json(b.handle(op, args || {}, session)); }
    if (url.pathname.endsWith('/women-admin/media/upload')) return json(b.upload(req.postDataBuffer()));
    if (url.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href="#/products"]:visible').first()).toBeVisible({ timeout: 15000 });
}

const owner = { role: 'owner', email: 'qa-owner@example.test', permissions: [] };

test('owner builds a 3-colour model: own photos, sizes, prices and cost; saved, reopened, previewed and published', async ({ page }) => {
  const b = backend();
  await open(page, b, owner);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();

  // Step 1
  await page.locator('#c-title').fill('فستان سوارية مطرز');
  await page.locator('#c-price').fill('550');
  await page.locator('#c-cost').fill('350');
  await expect(page.locator('[data-c-profit]')).toContainText('ربح مبدئي');
  await expect(page.locator('[data-c-profit]')).toContainText('٣٦٫٤');
  await expect(page.locator('#c-photo')).toHaveCount(0); // photos picked with each colour only
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/#\/products\/SS-9101$/);
  await expect(page.locator('#tabbody')).toContainText('بداية بأول لون');
  expect(b.s.costs.product_cost_minor).toBe(35000);

  // Step 2: three colours, each with its own sizes, price and supply
  const drafts = page.locator('[data-draft]');
  await drafts.nth(0).locator('[data-d-name]').fill('بيبي بلو');
  for (const size of ['S', 'M', 'L']) await drafts.nth(0).locator(`[data-d-size="${size}"]`).click();
  await page.locator('[data-add-draft]').click();
  await drafts.nth(1).locator('[data-d-name]').fill('بني');
  await drafts.nth(1).locator('[data-d-size="One Size"]').click();
  await drafts.nth(1).locator('[data-d-price]').fill('600');
  await page.locator('[data-add-draft]').click();
  await drafts.nth(2).locator('[data-d-name]').fill('بينك');
  await drafts.nth(2).locator('[data-d-size="M"]').click();
  await drafts.nth(2).locator('label.switch').click();
  await expect(drafts.nth(2).locator('[data-d-avail]')).not.toBeChecked();
  // Photos are selected before saving, in the matching colour card.
  await drafts.nth(0).locator('[data-d-files]').setInputFiles([photo('blue-1.png', [169, 200, 232]), photo('blue-2.png', [150, 190, 225])]);
  await drafts.nth(1).locator('[data-d-files]').setInputFiles([photo('brown-1.png', [110, 75, 58])]);
  await expect(drafts.nth(0).locator('[data-d-photos] img')).toHaveCount(2);
  await expect(drafts.nth(1).locator('[data-d-photos] img')).toHaveCount(1);
  expect(b.s.uploads).toHaveLength(0); // no early product-wide upload
  await page.locator('[data-save-drafts]').click();
  const cards = page.locator('[data-colour]');
  await expect(cards).toHaveCount(3);
  expect(b.s.product.options.map((o) => [o.name, o.values.map((v) => v.value)])).toEqual([['اللون', ['بيبي بلو', 'بني', 'بينك']], ['المقاس', ['S', 'M', 'L', 'One Size']]]);
  expect(b.s.product.variants.map((v) => [v.position, v.amount_minor, v.availability])).toEqual([[0, 55000, 'available'], [1, 55000, 'available'], [2, 55000, 'available'], [3, 60000, 'available'], [4, 55000, 'unavailable']]);

  // Exactly one upload for each file, scoped to the saved colour.
  await expect(cards.nth(0).locator('.thumb img')).toHaveCount(2);
  await expect(cards.nth(1).locator('.thumb img')).toHaveCount(1);
  expect(b.s.uploads.map((u) => u.variant_position)).toEqual(['0', '0', '3']);
  expect(b.s.uploads.every((u) => u.option_position === undefined && /image\/(webp|jpeg|png)/.test(u.type))).toBe(true);

  // Make the second blue photo the colour cover
  await cards.nth(0).locator('[data-first]').click();
  await expect(cards.nth(0).locator('.thumb img').first()).toHaveAttribute('src', /150|A9C8E8|data:/);
  expect(b.s.ops.filter((o) => o.op === 'media.reorder')).toHaveLength(1);

  // Supplier cost per size with live profit; a below-cost price is flagged, not changed
  await cards.nth(1).locator('summary').click();
  await cards.nth(1).locator('[data-cost="3"]').fill('650');
  await expect(cards.nth(1).locator('[data-profit="3"]')).toContainText('أقل من تكلفة المورد');
  await cards.nth(1).locator('[data-cost="3"]').fill('380');
  await expect(cards.nth(1).locator('[data-profit="3"]')).toContainText('ربح مبدئي');
  await cards.nth(1).locator('[data-save-cost]').click();
  await expect(page.locator('#island')).toContainText('السعر ما اتغيرش');
  expect(b.s.costs.variants).toEqual([{ position: 3, cost_minor: 38000 }]);
  expect(b.s.product.variants[3].amount_minor).toBe(60000);

  // Reopen: everything comes back from the server
  await page.reload();
  await expect(page.locator('[data-colour]')).toHaveCount(3);
  await expect(page.locator('[data-colour]').nth(0).locator('.thumb img')).toHaveCount(2);
  await expect(page.locator('[data-colour]').nth(2)).toContainText('مش متاح');

  // Step 3: preview like the customer, verify the draft from the server, publish
  await page.locator('[data-setup-tab="preview"]').click();
  await expect(page.locator('.preview-shop')).toContainText('فستان سوارية مطرز');
  await page.locator('[data-pick="1"]').click();
  await expect(page.locator('.preview-shop')).toContainText('One Size');
  await expect(page.locator('.preview-shop')).not.toContainText('XL');
  await page.locator('[data-verify]').click();
  await expect(page.locator('[data-verified]')).toContainText('3 لون');
  await expect(page.locator('[data-verified]')).toContainText('5 مقاس');
  await expect(page.locator('[data-verified]')).toContainText('3 صورة');
  await page.waitForFunction(() => [...document.querySelectorAll('.preview-shop img')].every((i) => i.complete));
  await page.screenshot({ path: test.info().outputPath('admin-preview-' + test.info().project.name + '.png'), fullPage: true });
  await page.locator('[data-publish]').click();
  await expect.poll(() => b.s.product.status).toBe('public');
});



test('photo-only Save preserves disabled sizes inside an otherwise available colour', async ({ page }) => {
  const b = backend({ version: 6 });
  b.s.product = { public_code: 'SS-9101', title: 'بلوفر', description: '', status: 'draft',
    created_at: now, updated_at: now, base_price: { amount_minor: 70000 }, shipping_profile: null, publish_blockers: [],
    options: [
      { option_id: 'o0', name: 'اللون', position: 0, values: [{ value_id: 'o0v0', value: 'أسود', position: 0, active: true }] },
      { option_id: 'o1', name: 'المقاس', position: 1, values: [
        { value_id: 'o1v0', value: 'M', position: 0, active: true },
        { value_id: 'o1v1', value: 'L', position: 1, active: true }
      ] }
    ],
    variants: [
      { position: 0, active: true, availability: 'available', amount_minor: 70000, price_source: 'base',
        selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v0' }] },
      { position: 1, active: true, availability: 'unavailable', amount_minor: 70000, price_source: 'base',
        selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v1' }] }
    ] };
  b.s.stock = { 0: { quantity: 20 }, 1: { quantity: 0 } };
  await open(page, b, owner);
  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-9101');
  const card = page.locator('[data-colour]').first();
  await card.locator('[data-upload]').setInputFiles([photo('black.png', [33, 34, 35])]);
  await card.locator('[data-save-colour]').click();
  await expect(card.locator('.thumb img')).toHaveCount(1);
  expect(b.s.product.variants[0].availability).toBe('available');
  expect(b.s.product.variants[1].availability).toBe('unavailable');
  expect(b.s.ops.filter((x) => x.op === 'products.set_availability' || x.op === 'products.set_stock')).toHaveLength(0);
});

test('one colour Save combines new size, special price, supplier availability and queued photo', async ({ page }) => {
  const b = backend({ version: 6 });
  b.s.product = { public_code: 'SS-9101', title: 'سويت شيرت', description: '', status: 'draft',
    created_at: now, updated_at: now, base_price: { amount_minor: 70000 },
    shipping_profile: { key: 'women_standard', name: 'شحن عادي' }, publish_blockers: [],
    options: [
      { option_id: 'o0', name: 'اللون', position: 0, values: [{ value_id: 'o0v0', value: 'أسود', position: 0, active: true }] },
      { option_id: 'o1', name: 'المقاس', position: 1, values: [{ value_id: 'o1v0', value: 'M', position: 0, active: true }] }
    ],
    variants: [{ position: 0, active: true, availability: 'available', amount_minor: 70000,
      price_source: 'base', selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v0' }] }] };
  b.s.stock = { 0: { quantity: 20 } };
  await open(page, b, owner);
  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-9101');
  const card = page.locator('[data-colour]').first();
  await card.locator('[data-c-size="XL"]').click();
  await card.locator('[data-c-price]').fill('750');
  await card.locator('[data-upload]').setInputFiles([photo('black.png', [34, 35, 42])]);
  await expect(card.locator('[data-c-queued] img')).toHaveCount(1);
  expect(b.s.uploads).toHaveLength(0);
  await card.locator('[data-save-colour]').click();
  // A new Variant appears before its price and availability mutations finish.
  await expect.poll(() => b.s.product.variants.map((v) => [v.position, v.amount_minor, v.availability]))
    .toEqual([[0, 75000, 'available'], [1, 75000, 'available']]);
  // Upload starts after asynchronous Variant/price/availability saves, so wait for
  // the upload itself. Variant count reaching 2 is not evidence that upload finished.
  await expect.poll(() => b.s.uploads.length, { timeout: 12000 }).toBe(1);
  expect(b.s.uploads[0].variant_position).toBe('0');
  await expect(page.locator('[data-colour]').first().locator('.thumb img')).toHaveCount(1);
});

test('adding an available size never reactivates an older unavailable size', async ({ page }) => {
  const b = backend({ version: 5 });
  b.s.product = { public_code: 'SS-9101', title: 'سويت شيرت أسود', description: '', status: 'draft',
    created_at: now, updated_at: now, base_price: { amount_minor: 70000 },
    shipping_profile: { key: 'women_standard', name: 'شحن عادي' }, publish_blockers: [],
    options: [
      { option_id: 'o0', name: 'اللون', position: 0, values: [{ value_id: 'o0v0', value: 'أسود', position: 0, active: true }] },
      { option_id: 'o1', name: 'المقاس', position: 1, values: [
        { value_id: 'o1v0', value: 'M', position: 0, active: true },
        { value_id: 'o1v1', value: 'L', position: 1, active: true }
      ] }
    ],
    variants: [
      { position: 0, active: true, availability: 'available', amount_minor: 70000,
        price_source: 'base', selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v0' }] },
      { position: 1, active: true, availability: 'unavailable', amount_minor: 70000,
        price_source: 'base', selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v1' }] }
    ] };
  b.s.stock = { 0: { quantity: 20 }, 1: { quantity: 0 } };
  await open(page, b, owner);
  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-9101');
  const card = page.locator('[data-colour]').first();
  await card.locator('[data-c-size="XL"]').click();
  await card.locator('[data-save-colour]').click();
  await expect.poll(() => b.s.product.variants.length).toBe(3);
  expect(b.s.product.variants[0].availability).toBe('available');
  expect(b.s.product.variants[1].availability).toBe('unavailable');
  expect(b.s.stock[1].quantity).toBe(0);
  expect(b.s.product.variants[2].availability).toBe('available');
  expect(b.s.stock[2].quantity).toBe(20);
  expect(b.s.ops.filter(x => x.op === 'products.set_stock').map(x => x.args.position)).toEqual([2]);
});

test('owner archives from inside product editor only after explicit confirmation', async ({ page }) => {
  const b = backend({ version: 4 });
  b.s.product = { public_code: 'SS-9101', title: 'بلوفر أسود', description: '', status: 'draft',
    created_at: now, updated_at: now, base_price: { amount_minor: 70000 }, shipping_profile: null,
    options: [], variants: [], publish_blockers: [] };
  await open(page, b, owner);
  await page.goto(target + '#/products/SS-9101');
  const remove = page.locator('[data-archive-editor]');
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.locator('#layer')).toContainText('الأوردرات والسجلات القديمة');
  expect(b.s.product.status).toBe('draft'); // opening dialog must not mutate
  await page.locator('#layer [data-yes]').click();
  await expect.poll(() => b.s.product.status).toBe('archived');
  await expect(page).toHaveURL(/#\/products$/);
});

test('owner shortcut opens supplier costs after the colour data finishes loading', async ({ page }) => {
  const b = backend({ version: 3, costs: { product_cost_minor: 30000, variants: [] } });
  b.s.product = {
    public_code: 'SS-9101', title: 'بلوفر', description: '', status: 'draft',
    created_at: now, updated_at: now, base_price: { amount_minor: 50000 },
    shipping_profile: { key: 'women_standard', name: 'شحن عادي' }, publish_blockers: [],
    options: [{ option_id: 'o0', name: 'اللون', position: 0, values: [{ value_id: 'o0v0', value: 'أسود', position: 0, active: true }] }],
    variants: [{ position: 0, active: true, availability: 'available', amount_minor: 50000, price_source: 'base',
      selections: [{ option_id: 'o0', value_id: 'o0v0' }] }]
  };
  b.s.stock = { 0: { quantity: 20 } };
  await open(page, b, owner);
  await page.goto(target + '#/products/SS-9101');
  const shortcut = page.getByRole('button', { name: 'سعر المورد والربح' });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  const costBox = page.locator('.cost-box');
  await expect(costBox).toHaveAttribute('open', '');
  await expect(costBox.locator('[data-cost="0"]')).toHaveValue('300');
  await expect(page.locator('[data-c-price]')).toHaveCount(1);
  expect(b.s.ops.some(o => o.op === 'costs.get')).toBe(true);
  expect(b.s.ops.some(o => o.op === 'costs.set')).toBe(false);
});

test('staff with products.edit can save supplier cost without owner profit', async ({ page }) => {
  const b = backend({ version: 3 });
  b.s.product = { public_code: 'SS-9101', title: 'بلوزة', description: '', status: 'draft', created_at: now, updated_at: now, base_price: { amount_minor: 45000 }, shipping_profile: { key: 'women_standard', name: 'شحن عادي' }, publish_blockers: [],
    options: [{ option_id: 'o0', name: 'اللون', position: 0, values: [{ value_id: 'o0v0', value: 'أسود', position: 0, active: true }] }, { option_id: 'o1', name: 'المقاس', position: 1, values: [{ value_id: 'o1v0', value: 'M', position: 0, active: true }] }],
    variants: [{ position: 0, active: true, availability: 'available', amount_minor: 45000, price_source: 'base', selections: [{ option_id: 'o0', value_id: 'o0v0' }, { option_id: 'o1', value_id: 'o1v0' }] }] };
  b.s.stock = { 0: { quantity: 20 } };
  await open(page, b, { role: 'staff', email: 'qa-staff@example.test', permissions: ['products.view', 'products.edit', 'media.manage', 'inventory.manage'] });
  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-9101');
  await expect(page.locator('[data-colour]')).toHaveCount(1);
  await expect(page.locator('button[data-open-cost]')).toHaveText('تكلفة المورد');
  await expect(page.locator('.cost-box')).toHaveCount(1);
  await expect(page.locator('.cost-box [data-profit]')).toHaveCount(0);
  await page.locator('.cost-box [data-cost="0"]').fill('325');
  await page.locator('.cost-box [data-save-cost]').click();
  await expect.poll(() => b.s.costs.variants[0]?.cost_minor).toBe(32500);
  await expect(page.locator('a[href="#/finance"]')).toHaveCount(0);
  await expect(page.locator('[data-trash-editor]')).toHaveCount(0);
  await expect(page.locator('[data-archive-editor]')).toHaveCount(0);
  await expect(page.locator('[data-c-price]')).toHaveCount(0);
  expect(b.s.ops.some((o) => o.op === 'costs.get')).toBe(true);
  expect(b.s.ops.some((o) => o.op === 'costs.set')).toBe(true);
  expect(b.s.ops.some((o) => o.op === 'profit.summary')).toBe(false);
  // Adding a colour later only adds its value and its own Variants
  await page.locator('[data-add-draft]').click();
  await page.locator('[data-draft] [data-d-name]').fill('بيج');
  await page.locator('[data-draft] [data-d-size="L"]').click();
  await page.locator('[data-save-drafts]').click();
  await expect(page.locator('[data-colour]')).toHaveCount(2);
  expect(b.s.ops.filter((o) => o.op === 'products.structure').map((o) => o.args.change.op)).toEqual(['add_value', 'add_value', 'create_variants']);
});

test('an old one-SKU product (like SS-1011) stays editable with no automatic merge or colour option', async ({ page }) => {
  const b = backend({ version: 9 });
  b.s.product = { public_code: 'SS-1011', title: 'جاكيت قديم', description: '', status: 'public', created_at: now, updated_at: now, base_price: { amount_minor: 99000 }, shipping_profile: { key: 'women_standard', name: 'شحن عادي' }, publish_blockers: [],
    options: [], variants: [{ position: 0, active: true, availability: 'available', amount_minor: 99000, price_source: 'base', selections: [] }] };
  b.s.stock = { 0: { quantity: 5 } };
  b.s.media = [{ media_id: 'old', position: 0, scope: 'product', storage_path: svg('#1F1B1E'), alt_text: '', hidden: false }];
  await open(page, b, owner);
  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-1011');
  await expect(page.locator('#tabbody')).toContainText('موديل قديم من غير اختيار لون');
  await expect(page.locator('[data-new-colours]')).toHaveCount(0);
  await expect(page.locator('[data-colour]')).toHaveCount(1);
  expect(b.s.ops.filter((o) => o.op === 'products.structure')).toHaveLength(0);
  expect(b.s.media).toHaveLength(1);
});

test('cost ops not live yet: the model still saves and the owner sees a clear note', async ({ page }) => {
  const b = backend({ costsLive: false });
  await open(page, b, owner);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('طقم بيتي');
  await page.locator('#c-price').fill('400');
  await page.locator('#c-cost').fill('250');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/SS-9101$/);
  await expect(page.locator('#tabbody')).toContainText('محتاجين تفعيل من السيرفر');
});

test('dashboard routes the owner to the returns-aware finance view without counting stale quick-profit', async ({ page }) => {
  const b = backend();
  b.s.profitLines = [{ order_code: 'A', status: 'delivered', quantity: 1, line_total_minor: 55000, unit_cost_minor: 35000 }];
  await open(page, b, owner);
  const card = page.locator('[data-profit-summary]');
  await expect(card).toContainText('الأرباح والمرتجعات');
  await expect(card.locator('a[href="#/finance"]')).toBeVisible();
  expect(b.s.ops.some(o => o.op === 'profit.summary')).toBe(false);
});

test('dashboard profit card never appears for staff', async ({ page }) => {
  const b = backend(); b.s.profitLines = [];
  await open(page, b, { role: 'staff', email: 'qa-staff@example.test', permissions: ['products.view', 'dashboard.view'] });
  await expect(page.locator('.kpis')).toBeVisible();
  await expect(page.locator('[data-profit-summary]')).toHaveCount(0);
  expect(b.s.ops.some((o) => o.op === 'profit.summary')).toBe(false);
});

test('unsaved model typing asks before the sheet closes or the screen changes; a save never asks', async ({ page }) => {
  const b = backend();
  await open(page, b, owner);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('بلوزة جديدة');
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); void d.dismiss(); });
  await page.locator('#layer .sheet-head [data-close]').click();
  await page.locator('#c-title').press('Escape');
  await page.evaluate(() => { location.hash = '#/orders'; }); // the phone's back button / a link
  await expect.poll(() => asked.length).toBe(3);
  expect(asked.every((m) => m.includes('ما اتحفظتش'))).toBe(true);
  await expect(page.locator('#c-title')).toHaveValue('بلوزة جديدة'); // stayed open, nothing lost
  await expect(page).not.toHaveURL(/#\/orders/);
  // Creating the model closes the sheet and moves to its editor without a prompt.
  await page.locator('#c-price').fill('300');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/#\/products\/SS-9101$/);
  await page.locator('a[href="#/orders"]:visible').first().click();
  await expect(page).toHaveURL(/#\/orders/);
  expect(asked).toHaveLength(3);
});

test('unsaved guard: browser back and reload ask; no prompt without typing, for search, or after a save', async ({ page }) => {
  const b = backend();
  await open(page, b, owner);
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.type()); void d.accept(); }); // accept = "leave anyway"
  // No false warnings: browsing, searching, opening and closing a sheet untouched, reloading.
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('#q').fill('SS');
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#layer .sheet-head [data-close]').click();
  await expect(page.locator('#c-title')).toHaveCount(0);
  await page.locator('a[href="#/orders"]:visible').first().click();
  await page.goBack();
  await page.reload();
  await expect(page.locator('a[href="#/products"]:visible').first()).toBeVisible();
  expect(asked).toEqual([]);
  // Typing in an existing model's editor, then the phone/browser back button.
  await page.goto(target + '#/products');
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('جيبة');
  await page.locator('#c-price').fill('300');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/#\/products\/SS-9101$/);
  expect(asked).toEqual([]); // saving never asks
  await page.locator('[data-draft] [data-d-name]').first().fill('بيج');
  await page.goBack();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe('confirm');
  // Typing in the new-model sheet, then reload: the browser's own "leave site?" (beforeunload) appears.
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('رمادي');
  await page.reload();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1]).toBe('beforeunload');
});


test('staff picker searches colours and saves a two-tone garment as one option with its own photos', async ({ page }) => {
  const b = backend();
  await open(page, b, owner);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('بلوفر بألوان مزدوجة');
  await page.locator('#c-price').fill('650');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/SS-9101$/);

  const drafts = page.locator('[data-draft]');
  const first = drafts.first();
  await expect(first.locator('[data-colour-picker-slot]')).toBeVisible();
  await first.locator('[aria-label="البحث عن اللون"]').fill('بيب');
  await expect(first.locator('[aria-label="اختيار لون المنتج من القائمة"] option')).toHaveCount(2);
  await first.locator('[aria-label="اختيار لون المنتج من القائمة"]').selectOption('بيبي بلو');
  await expect(first.locator('[data-d-name]')).toHaveValue('بيبي بلو');
  await first.locator('[data-d-size="S"]').click();

  await page.locator('[data-add-draft]').click();
  const second = drafts.nth(1);
  await second.locator('[data-colour-mode]').selectOption('pair');
  await second.getByLabel('اللون الأول', { exact: true }).selectOption('بني');
  await second.getByLabel('اللون الثاني', { exact: true }).selectOption('بني');
  await expect(second.locator('[data-d-name]')).toHaveValue('بني × بني');
  await expect(second.locator('[role="alert"]')).toContainText('اختيار لونين مختلفين');
  await page.locator('[data-save-drafts]').click();
  await expect(page.locator('[data-draft-error]')).toContainText('مختلفين');
  expect(b.s.ops.filter((o) => o.op === 'products.structure')).toHaveLength(0);
  await second.getByLabel('اللون الثاني', { exact: true }).selectOption('بيج');
  await expect(second.locator('[data-d-name]')).toHaveValue('بني × بيج');
  await second.locator('[data-d-size="One Size"]').click();
  await page.locator('[data-save-drafts]').click();

  const cards = page.locator('[data-colour]');
  await expect(cards).toHaveCount(2);
  expect(b.s.product.options[0].values.map((v) => v.value)).toEqual(['بيبي بلو', 'بني × بيج']);
  expect(b.s.product.variants).toHaveLength(2);
  await cards.nth(0).locator('[data-upload]').setInputFiles([photo('blue.png', [169, 200, 232])]);
  await expect(cards.nth(0).locator('[data-c-queued] img')).toHaveCount(1);
  expect(b.s.uploads).toHaveLength(0); // existing card also uploads only on Save
  await cards.nth(0).locator('[data-save-colour]').click();
  // The queue preview also has .thumb img; wait for the server-backed gallery instead.
  await expect.poll(() => b.s.media.length).toBe(1);
  await expect(cards.nth(0).locator('.thumbs').first().locator('figure.thumb img')).toHaveCount(1);
  await expect(cards.nth(0).locator('[data-c-queued] img')).toHaveCount(0);
  await cards.nth(1).locator('[data-upload]').setInputFiles([photo('brown-beige.png', [110, 75, 58])]);
  await expect(cards.nth(1).locator('[data-c-queued] img')).toHaveCount(1);
  await cards.nth(1).locator('[data-save-colour]').click();
  await expect.poll(() => b.s.media.length).toBe(2);
  await expect(cards.nth(1).locator('.thumbs').first().locator('figure.thumb img')).toHaveCount(1);
  await expect(cards.nth(0).locator('.thumbs').first().locator('figure.thumb img')).toHaveCount(1);
  expect(b.s.uploads.map((x) => x.variant_position)).toEqual(['0', '1']);
  expect(b.s.uploads.every((x) => !x.option_position)).toBe(true);

  await page.evaluate(() => sessionStorage.setItem('wa.ptab', 'colours'));
  await page.goto(target + '#/products/SS-9101');
  await expect(page.locator('[data-colour]')).toHaveCount(2);
  await expect(page.locator('[data-colour]').nth(1)).toContainText('بني × بيج');
  await expect(page.locator('[data-colour]').nth(1).locator('.thumb img')).toHaveCount(1);
  await expect(page.locator('[data-colour]').first().locator('.thumb img')).toHaveCount(1);
});

test('free offline description enhancer: new draft, undo, existing edit, and no unapproved publish', async ({ page }) => {
  const b = backend();
  await open(page, b, owner);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('بلوفر حريمي مخطط');
  await page.locator('#c-price').fill('650');
  await page.locator('#c-desc').fill('بلوفر مخطط بيبي بلو وبني، مقاس واحد');
  const before = b.s.ops.filter(x => x.op.startsWith('products.')).length;
  await page.locator('[data-description-helper] [data-desc-improve]').click();
  await expect(page.locator('#c-desc')).toHaveValue(/بلوفر مخطط بيبي بلو وبني/);
  await expect(page.locator('#c-desc')).toHaveValue(/تفاصيل المنتج:/);
  await expect(page.locator('[data-description-helper] [data-desc-undo]')).toBeVisible();
  expect(b.s.ops.filter(x => x.op.startsWith('products.')).length).toBe(before); // no product write or read called by improve
  await page.locator('[data-description-helper] [data-desc-undo]').click();
  await expect(page.locator('#c-desc')).toHaveValue('بلوفر مخطط بيبي بلو وبني، مقاس واحد');
  await page.locator('[data-description-helper] [data-desc-improve]').click();
  const improved = await page.locator('#c-desc').inputValue();
  expect(improved).toContain('بلوفر مخطط بيبي بلو وبني');
  expect(improved).not.toContain('قطن');
  expect(improved).not.toContain('100%');
  await page.locator('[data-create]').click();
  await expect(page).toHaveURL(/#\/products\/SS-9101$/);
  expect(b.s.product.status).toBe('draft');
  expect(b.s.product.description).toBe(improved);
  expect(b.s.ops.some(x => x.op === 'products.publish')).toBe(false);
  await page.locator('[data-v="details"]').click();
  await expect(page.locator('#e-desc')).toHaveValue(improved);
  await page.locator('#e-desc').fill('لون بيبي بلو، خامة قطن');
  await page.locator('#f-text [data-desc-improve]').click();
  await expect(page.locator('#e-desc')).toHaveValue(/• خامة قطن/);
  // Editing the local textarea never persists until the staff explicitly clicks Save.
  expect(b.s.product.description).toBe(improved);
  await page.locator('#f-text [data-save-text]').click();
  await expect.poll(() => b.s.product.description).toContain('خامة قطن');
  expect(b.s.product.status).toBe('draft');
  expect(b.s.ops.some(x => x.op === 'products.publish')).toBe(false);
});

test('staff product creator can enter supplier cost without aggregate margin', async ({ page }) => {
  const b = backend();
  const session = {role:'staff',email:'qa-upload@example.test',permissions:['products.view','products.edit','products.price','shipping.manage']};
  await open(page,b,session);
  await page.locator('a[href="#/products"]:visible').first().click();
  await page.locator('button[data-new]:visible').first().click();
  await page.locator('#c-title').fill('بلوفر قطن');
  await page.locator('#c-price').fill('550');
  await page.locator('#c-cost').fill('350');
  await expect(page.locator('[data-c-profit]')).not.toContainText('ربح مبدئي');
  await page.locator('[data-create]').click();
  await expect.poll(() => b.s.costs.product_cost_minor).toBe(35000);
  expect(b.s.ops.filter(x => x.op === 'costs.set').map(x=>x.args.cost_minor)).toEqual([35000]);
  expect(b.s.ops.some(x=>x.op==='profit.summary')).toBe(false);
});

