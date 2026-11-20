// Multi-product campaign page: every product in its own full section (photos, colour / size, quantity, add to bag).
// All products go into the SAME first-party bag (women.cart.v1) and ONE COD order through /cart/ → /checkout/.
// Prices, availability and totals stay server-side: /cart/add validates every line, the Quote API prices the order.
import { findVariant, openValues, lineOk, priceLabel, colourIndex, colourMedia, funnel, loadAnalytics, recordView,
  rememberAdParams, rememberPageCredit } from '../lp/runtime.js?v=20261120-multi-product';
import { normalizeDesign, cleanPageTheme } from '../lp/studio-design.js?v=20261120-multi-product';

const BRIDGE = 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge';
const CHECKOUT = 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout';
const BAG_KEY = 'women.cart.v1';
const MEDIA = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(?:jpg|png|webp)$/;
const MAX_QTY = 10;

const root = document.getElementById('collection-app');
const params = new URLSearchParams(location.search);
const slug = (params.get('slug') || '').trim();
const preview = params.get('studio_preview') === '1' && window.parent !== window;
const pageId = ('c-' + slug).slice(0, 40);
const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = String(text);
  return el;
};
const timeout = (ms) => (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);
async function getJson(url, init = {}) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, signal: timeout(12000), ...init });
  let data = {}; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw Object.assign(new Error(String(data.error || 'service_unavailable')), { status: r.status });
  return data;
}
/** The look of one product section: the page theme when it is switched on, else that product's own design. */
export function sectionLook(design, theme) {
  if (theme.enabled) return theme;
  return { background: design.background, font: design.font, divider: design.divider,
    ctaColor: design.cta.color, ctaShape: design.cta.shape, ctaAnimation: design.cta.animation };
}
/** Single-product page: the product's own landing page, keeping every ad parameter (utm_content only if absent). */
const productUrl = (code) => {
  const q = new URLSearchParams(location.search);
  q.delete('slug');
  q.set('p', code);
  if (!q.has('utm_content')) q.set('utm_content', code);
  q.set('collection', slug);
  return '/lp/?' + q.toString();
};
const readBag = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(lineOk).slice(0, 50) : [];
  } catch { return []; }
};
const bagKey = (l) => l.publicCode + '@' + l.structureVersion + ':' + l.selection.map(s => s.optionPosition + '.' + s.valuePosition).join(',');
const adProduct = () => {
  try { const c = String(JSON.parse(sessionStorage.getItem('women.ad.params.v1') || 'null')?.content || '').toUpperCase(); return /^SS-\d{4,19}$/.test(c) ? c : undefined; }
  catch { return undefined; }
};
const tell = (field, code = '') => { if (preview) window.parent.postMessage({ type: 'ssw-page-select', field, code }, location.origin); };

function showState(title, description) {
  const card = make('section', 'collection-state');
  card.append(make('h1', '', title), make('p', '', description));
  const link = make('a', '', 'العودة للمتجر');
  link.href = '/';
  card.append(link);
  root.replaceChildren(card);
}

const bagBar = make('aside', 'cp-bag');
const bagCount = make('span', 'cp-bag-count');
const bagLink = make('a', 'cp-bag-link', 'إتمام الطلب');
bagLink.href = '/cart/';
bagBar.setAttribute('aria-live', 'polite');
bagBar.append(bagCount, bagLink);
function refreshBag() {
  const n = readBag().reduce((sum, l) => sum + l.quantity, 0);
  bagCount.textContent = n ? 'الشنطة فيها ' + new Intl.NumberFormat('ar-EG').format(n) + ' قطعة' : 'الشنطة فاضية';
  bagBar.hidden = n === 0;
}

function productSection(item, product, design, look, index) {
  const code = item.publicCode;
  const section = make('section', 'cp-product');
  section.id = 'p-' + code;
  section.dataset.code = code;
  section.dataset.bg = look.background; section.dataset.font = look.font; section.dataset.divider = look.divider;
  const media = make('div', 'cp-media');
  const main = make('img', 'cp-main');
  main.alt = design.title || product.title || item.title;
  main.loading = index < 2 ? 'eager' : 'lazy';
  main.decoding = 'async';
  main.dataset.edit = 'image';
  const thumbs = make('div', 'cp-thumbs');
  const productShots = (product.media || []).filter(m => MEDIA.test(m?.url || '')).sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true) || a.position - b.position);
  const hidden = new Set(design.hidden);
  const marketing = (slot) => (!hidden.has(slot) && design.images[slot] ? [{ url: design.images[slot], altText: main.alt }] : []);
  const setShots = (list) => {
    const shots = list.length ? list : [{ url: item.image, altText: main.alt }].filter(s => s.url);
    thumbs.replaceChildren();
    shots.forEach((s, i) => {
      const b = make('button', 'cp-thumb');
      b.type = 'button';
      b.setAttribute('aria-label', 'صورة ' + (i + 1) + ' من ' + shots.length);
      const img = make('img'); img.src = s.url; img.alt = ''; img.loading = 'lazy';
      b.append(img);
      b.addEventListener('click', () => { main.src = s.url; thumbs.querySelectorAll('.cp-thumb').forEach(t => t.removeAttribute('aria-current')); b.setAttribute('aria-current', 'true'); });
      thumbs.append(b);
    });
    if (shots[0]) { main.src = shots[0].url; thumbs.firstElementChild?.setAttribute('aria-current', 'true'); }
    thumbs.hidden = shots.length < 2;
  };
  setShots([...marketing('hero'), ...productShots, ...marketing('features'), ...marketing('closing')]);
  media.append(main, thumbs);

  const info = make('div', 'cp-info');
  const title = make('h2', 'cp-title', design.title || product.title || item.title);
  title.dataset.edit = 'title';
  const price = make('div', 'cp-price');
  info.append(title, price);
  const description = design.description || product.description || '';
  if (description) { const p = make('p', 'cp-desc', description); p.dataset.edit = 'description'; info.append(p); }
  if (design.features.length && !hidden.has('features')) {
    const ul = make('ul', 'cp-features');
    ul.dataset.edit = 'features';
    design.features.forEach(f => ul.append(make('li', '', f)));
    info.append(ul);
  }

  const options = product.options || [];
  const chosen = options.map(o => (o.values?.length === 1 ? o.values[0].position : -1));
  const rows = options.map((option, i) => {
    const row = make('fieldset', 'cp-option');
    row.append(make('legend', '', option.name));
    const chips = (option.values || []).map(v => {
      const b = make('button', 'cp-chip', v.value);
      b.type = 'button';
      b.dataset.value = String(v.position);
      b.addEventListener('click', () => {
        chosen[i] = chosen[i] === v.position && option.values.length > 1 ? -1 : v.position;
        // A choice that no longer fits the others (a size this colour does not have) is cleared.
        chosen.forEach((c, k) => { if (k !== i && c >= 0 && !openValues(product, chosen, k).has(c)) chosen[k] = -1; });
        if (i === colourIndex(product) && chosen[i] >= 0) {
          const own = colourMedia(productShots, option.position, v.position);
          if (own.length) setShots(own);
        }
        paint();
      });
      row.append(b);
      return b;
    });
    info.append(row);
    return chips;
  });

  const qty = make('div', 'cp-qty');
  const minus = make('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'تقليل الكمية');
  const plus = make('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'زيادة الكمية');
  const qtyValue = make('output', '', '1');
  let quantity = 1;
  minus.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); paint(); });
  plus.addEventListener('click', () => { quantity = Math.min(MAX_QTY, quantity + 1); paint(); });
  qty.append(make('span', 'cp-qty-label', 'الكمية'), minus, qtyValue, plus);

  const add = make('button', 'cp-add', 'إضافة للشنطة');
  add.type = 'button';
  add.dataset.color = look.ctaColor; add.dataset.shape = look.ctaShape; add.dataset.anim = look.ctaAnimation;
  add.dataset.edit = 'cta';
  const status = make('p', 'cp-status');
  status.setAttribute('role', 'status');
  info.append(qty, add, status);

  const variant = () => (chosen.every(c => c >= 0) ? findVariant(product, chosen) : null);
  let busy = false;
  function paint() {
    rows.forEach((chips, i) => {
      const open = openValues(product, chosen, i);
      chips.forEach(b => {
        const v = Number(b.dataset.value);
        b.disabled = !open.has(v);
        b.setAttribute('aria-pressed', String(chosen[i] === v));
      });
    });
    const v = variant();
    const label = priceLabel(product, v);
    price.textContent = label === '—' ? 'السعر بيظهر بعد اختيار المقاس' : label + ' جنيه';
    qtyValue.textContent = String(quantity);
    minus.disabled = quantity <= 1; plus.disabled = quantity >= MAX_QTY;
    add.disabled = busy || product.purchasable !== true || !(v && v.purchasable === true);
    if (product.purchasable !== true) add.textContent = 'غير متاح حاليًا';
  }
  paint();

  add.addEventListener('click', async () => {
    const v = variant();
    if (busy || !v) { status.textContent = 'اختيار اللون والمقاس أولًا.'; return; }
    if (preview) { status.textContent = 'معاينة فقط: الإضافة للشنطة غير متاحة داخل لوحة التحكم.'; return; }
    const line = { publicCode: code, structureVersion: product.structureVersion, quantity, selection: v.selection };
    if (!lineOk(line)) { status.textContent = 'اختيار اللون والمقاس أولًا.'; return; }
    busy = true; paint(); add.textContent = 'بنضيف…'; status.textContent = '';
    try {
      await getJson(CHECKOUT + '/cart/add', { method: 'POST', body: JSON.stringify(line) });
      const lines = readBag();
      const at = lines.findIndex(x => bagKey(x) === bagKey(line));
      if (at < 0 && lines.length >= 50) throw new Error('cart_full');
      if (at >= 0) {
        if (lines[at].quantity + line.quantity > 99) throw new Error('cart_full');
        lines[at].quantity += line.quantity;
      } else lines.push(line);
      localStorage.setItem(BAG_KEY, JSON.stringify(lines));
      rememberPageCredit(pageId, pageId + ':a', code);
      refreshBag();
      const unit = v.unitPrice?.currency === 'EGP' && Number.isSafeInteger(v.unitPrice.amountMinor) ? v.unitPrice.amountMinor : null;
      funnel('add_to_cart', { currency: 'EGP', ...(unit ? { value: unit * quantity / 100 } : {}), page_id: pageId,
        ...(adProduct() ? { ad_product: adProduct() } : {}),
        items: [{ item_id: code, quantity, item_list_id: pageId, index }] });
      status.textContent = 'اتضافت للشنطة ✓ ممكن إضافة موديل تاني أو إتمام الطلب.';
    } catch (e) {
      status.textContent = e?.message === 'cart_full' ? 'الشنطة وصلت للحد الأقصى. ممكن فتح الشنطة لتعديلها.'
        : e?.status === 409 ? 'الاختيار ده مش متاح دلوقتي. ممكن اختيار لون أو مقاس تاني.'
          : 'مش قادرين نضيف للشنطة دلوقتي. ممكن المحاولة مرة تانية.';
    } finally {
      busy = false; add.textContent = 'إضافة للشنطة'; paint();
    }
  });

  section.append(media, info);
  return section;
}

async function render(collection, items, rawTheme) {
  const theme = cleanPageTheme(rawTheme);
  document.title = collection.title + ' · SELECT SHOP';
  document.documentElement.dataset.titleSize = theme.enabled ? theme.titleSize : 'md';
  document.documentElement.dataset.spacing = theme.enabled ? theme.spacing : 'normal';
  document.documentElement.dataset.pageBg = theme.enabled ? theme.background : '';
  const hero = make('section', 'collection-hero');
  const h1 = make('h1', '', collection.title); h1.dataset.edit = 'page-title';
  hero.append(make('span', 'collection-kicker', 'SELECT SHOP · ' + new Intl.NumberFormat('ar-EG').format(items.length) + ' موديلات'), h1);
  if (collection.description) { const p = make('p', '', collection.description); p.dataset.edit = 'page-description'; hero.append(p); }
  const jump = make('nav', 'cp-jump');
  jump.setAttribute('aria-label', 'موديلات الصفحة');
  items.forEach(item => { const a = make('a', '', item.title); a.href = '#p-' + item.publicCode; jump.append(a); });
  const list = make('div', 'cp-list');
  root.replaceChildren(hero, jump, list);
  // Every product loads in parallel; a product that fails shows its own message and never blocks the others.
  const loaded = await Promise.all(items.map(item => Promise.all([
    getJson(CHECKOUT + '/product/' + encodeURIComponent(item.publicCode)).then(d => d.product).catch(() => null),
    getJson(BRIDGE + '/landing/' + encodeURIComponent(item.publicCode)).then(d => d.design).catch(() => null),
  ])));
  loaded.forEach(([product, raw], i) => {
    const item = items[i];
    if (!product || product.publicCode !== item.publicCode) {
      const off = make('section', 'cp-product cp-off');
      off.id = 'p-' + item.publicCode;
      off.append(make('h2', 'cp-title', item.title), make('p', 'cp-status', 'الموديل ده مش متاح دلوقتي.'));
      list.append(off);
      return;
    }
    const design = normalizeDesign(raw, { urls: true });
    if (jump.children[i]) jump.children[i].textContent = design.title || product.title || item.title;
    list.append(productSection(item, product, design, sectionLook(design, theme), i));
  });
  list.append(make('p', 'collection-note', 'كل الموديلات اللي تتضاف للشنطة بتتجمع في طلب واحد. الدفع عند الاستلام، والسعر النهائي والشحن بيتحسبوا قبل التأكيد.'));
  document.body.append(bagBar);
  refreshBag();
  if (preview) return;
  // One view_item and one anonymous view per product section actually seen (no customer data).
  const seen = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => {
    const code = entry.target.dataset.code;
    if (!entry.isIntersecting || !code || seen.has(code)) return;
    seen.add(code); io.unobserve(entry.target);
    const index = items.findIndex(x => x.publicCode === code);
    funnel('view_item', { currency: 'EGP', page_id: pageId, ...(adProduct() ? { ad_product: adProduct() } : {}),
      items: [{ item_id: code, item_name: String(items[index]?.title || '').slice(0, 100), item_list_id: pageId, index }] });
    void recordView(code);
  }), { threshold: 0.35 }) : null;
  list.querySelectorAll('.cp-product[data-code]').forEach(s => io?.observe(s));
}

async function boot() {
  if (preview) {
    // Admin preview (same-origin iframe): the unpublished draft comes from the parent; nothing is counted or ordered.
    addEventListener('message', e => {
      const d = e.data;
      if (e.origin !== location.origin || e.source !== window.parent || d?.type !== 'ssw-page-preview' || !Array.isArray(d.codes)) return;
      const items = d.codes.filter(c => /^SS-\d{4,19}$/.test(c)).slice(0, 100).map(c => ({ publicCode: c, title: c, image: null }));
      void render({ title: String(d.title || 'صفحة جديدة').slice(0, 120), description: String(d.description || '').slice(0, 500) }, items, d.theme);
    });
    // Click-to-edit: a click on a marked element tells the Admin which field to open.
    document.addEventListener('click', e => {
      const el = e.target.closest?.('[data-edit]');
      if (!el) return;
      e.preventDefault();
      tell(el.dataset.edit, el.closest('[data-code]')?.dataset.code || '');
    }, true);
    window.parent.postMessage({ type: 'ssw-page-ready' }, location.origin);
    return;
  }
  if (!/^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    showState('الرابط غير صحيح', 'ممكن الرجوع للمتجر واختيار الموديلات المتاحة.');
    return;
  }
  rememberAdParams(pageId);
  try {
    const data = await getJson(BRIDGE + '/collections/' + encodeURIComponent(slug));
    if (!data.collection || !Array.isArray(data.items) || data.items.length < 1) {
      showState('الصفحة غير مكتملة', 'بنراجع المنتجات المتاحة حاليًا. ممكن الرجوع للمتجر لاكتشاف باقي المنتجات.');
      return;
    }
    if (data.items.length === 1) { location.replace(productUrl(data.items[0].publicCode)); return; }
    addEventListener('storage', e => { if (e.key === BAG_KEY) refreshBag(); });
    await render(data.collection, data.items, data.theme);
    if (document.readyState === 'complete') void loadAnalytics(); else addEventListener('load', () => void loadAnalytics(), { once: true });
  } catch (e) {
    if (e?.status === 409) showState('بنحدّث توافر الموديلات', 'بعض الموديلات محتاجة تأكيد جديد. ممكن الرجوع بعد شوية أو تصفح باقي المتجر.');
    else if (e?.status) showState('الصفحة غير متاحة حاليًا', 'الصفحة ممكن تكون اتوقفت. ممكن تكملة تصفح باقي المتجر.');
    else showState('تعذّر تحميل الصفحة', 'ممكن التأكد من الاتصال بالإنترنت والمحاولة مرة تانية.');
  }
}
boot();
