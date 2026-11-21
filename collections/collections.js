// Multi-product campaign page: every product in its own full section (photos, colour / size, quantity, add to bag).
// All products go into the SAME first-party bag (women.cart.v1) and ONE COD order through /cart/ → /checkout/.
// Prices, availability and totals stay server-side: /cart/add validates every line, the Quote API prices the order.
import { findVariant, openValues, lineOk, priceLabel, colourIndex, colourMedia, funnel, loadAnalytics, recordView,
  rememberAdParams, rememberPageCredit } from '../lp/runtime.js?v=20261120-campaign';
import { normalizeDesign, cleanPageTheme, inkFor, DEFAULT_HINT, campaignAccent } from '../lp/studio-design.js?v=20261120-campaign';
import { hexOf } from '../js/colour-palette.js?v=20261120-campaign';
const loadMotion = () => import('../lp/motion.js?v=20261120-campaign');

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
  if (theme.enabled) return { ...theme, accent: campaignAccent(theme) };
  return { background: design.background, font: design.font, divider: design.divider,
    ctaColor: design.cta.color, ctaShape: design.cta.shape, ctaAnimation: design.cta.animation, accent: design.accent };
}
/** True for an option that is the garment size (a product without one is One Size). */
const isSize = (option) => /مقاس|size/i.test(String(option?.name || ''));
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

// Fixed buy bar (glass): appears after the first screen and hides while the order box is on screen.
const bagBar = make('aside', 'cp-bag');
const bagCount = make('span', 'cp-bag-count');
let buyLabel = 'اطلب الآن'; // the campaign's ctaText when its unified theme sets one
const buyNow = make('button', 'cp-bag-link', buyLabel);
buyNow.type = 'button';
bagBar.setAttribute('aria-label', 'زرار الشراء الثابت');
bagBar.hidden = true;
bagBar.append(buyNow, bagCount);
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const onScreen = () => {
  const sections = [...document.querySelectorAll('.cp-product[data-code]')];
  return sections.find(x => x.getBoundingClientRect().bottom > innerHeight / 2) || sections[0];
};
buyNow.addEventListener('click', () => {
  // The order box holds the colour, size and quantity of every model: the button takes her straight there,
  // to the card of the model on screen when the bag is still empty.
  const code = onScreen()?.dataset.code;
  const card = !readBag().length && code ? document.querySelector('.cp-card[data-code="' + code + '"]') : null;
  (card || document.getElementById('cpOrder'))?.scrollIntoView({ behavior: smooth(), block: 'start' });
});
let orderOnScreen = false;
const placeBar = () => {
  bagBar.hidden = scrollY < innerHeight * 0.9 || orderOnScreen;
  const price = catalog.get(onScreen()?.dataset.code || '')?.price;
  buyNow.textContent = buyLabel + (price ? ' · ' + price : '');
};
const nf = (n) => new Intl.NumberFormat('ar-EG').format(n);
function refreshBag() {
  const n = readBag().reduce((sum, l) => sum + l.quantity, 0);
  const headerCount = document.getElementById('cpBagCount');
  if (headerCount) headerCount.textContent = n ? nf(n) : '';
  bagCount.textContent = n ? 'في الشنطة ' + nf(n) : '';
}
/** Products of this page by code: title, product, thumbnail, price text. */
const catalog = new Map();
/** Every bag change: header count, order box cards and a fresh server quote (js/commerce.js listens for "women:cart"). */
function bagChanged() {
  refreshBag();
  paintCards();
  dispatchEvent(new Event('women:cart'));
}
const writeBag = (lines) => {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(lines.slice(0, 50))); return true; } catch { return false; }
};
const optionValue = (product, sel) => product.options?.find(o => o.position === sel.optionPosition)?.values
  ?.find(v => v.position === sel.valuePosition)?.value;
const lineText = (l) => {
  const p = catalog.get(l.publicCode);
  const values = l.selection.map(x => p && optionValue(p.product, x)).filter(Boolean).map(String);
  if (p && !(p.product.options || []).some(isSize)) values.push('One Size');
  return { title: p?.title || l.publicCode, values: values.join(' · ') };
};
const qtyControl = (label, value, onStep, max = MAX_QTY, key = '') => {
  const qty = make('div', 'cp-qty');
  const minus = make('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'تقليل ' + label);
  const plus = make('button', 'cp-plus', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'زيادة ' + label);
  minus.dataset.k = key + '-'; plus.dataset.k = key + '+';
  minus.disabled = value <= 0; plus.disabled = value >= max;
  minus.addEventListener('click', () => onStep(-1));
  plus.addEventListener('click', () => onStep(1));
  qty.append(minus, make('output', '', nf(value)), plus);
  return qty;
};
/** A bag line that is not one of this page's models (added on another page): kept in the order, editable here. */
function otherLine(l) {
  const row = make('div', 'cp-line');
  const { title, values } = lineText(l);
  const text = make('div', 'cp-line-text');
  text.append(make('b', '', title), make('span', '', values));
  const key = bagKey(l);
  row.append(text, qtyControl(title, l.quantity, (d) => {
    const all = readBag(), i = all.findIndex(x => bagKey(x) === key);
    if (i < 0) return;
    all[i].quantity = Math.min(99, all[i].quantity + d);
    if (all[i].quantity < 1) all.splice(i, 1);
    writeBag(all); bagChanged();
  }, 99, key));
  return row;
}

/** Order box card of one model: colour, size and quantity, or "أكثر من لون؟" = a quantity for each colour.
 *  The card IS that model's part of the shared bag: every change rewrites only this model's bag lines. */
const cards = new Map();
function modelCard(code) {
  const { title, product, thumb, price } = catalog.get(code);
  const options = product.options || [];
  const ci = colourIndex(product);
  const many = (i) => (options[i]?.values || []).length > 1;
  const canMix = ci >= 0 && many(ci);
  const posOf = (l, i) => l.selection.find(x => x.optionPosition === options[i].position)?.valuePosition ?? -1;
  const st = { mix: false, chosen: options.map(o => (o.values?.length === 1 ? o.values[0].position : -1)), qty: 0,
    per: new Map(), seen: '[]', list: false };
  const el = make('div', 'cp-card');
  el.dataset.code = code;
  // Bag lines changed outside this card (a section's add button, another tab): read them back into the card.
  const fromBag = (mine) => {
    st.list = false;
    if (!mine.length) { st.qty = 0; st.per.clear(); return; }
    const others = (l) => options.map((_, i) => (i === ci ? -1 : posOf(l, i))).join(',');
    if (mine.length === 1 && !st.mix) { st.chosen = options.map((_, i) => posOf(mine[0], i)); st.qty = mine[0].quantity; return; }
    const colours = new Set(mine.map(l => posOf(l, ci)));
    if (canMix && mine.every(l => others(l) === others(mine[0])) && colours.size === mine.length) {
      st.mix = true;
      st.chosen = options.map((_, i) => (i === ci ? -1 : posOf(mine[0], i)));
      st.per = new Map(mine.map(l => [posOf(l, ci), l.quantity]));
      return;
    }
    st.list = true; // pieces this card cannot show as one choice (e.g. two sizes): listed one by one
  };
  const linesNow = () => {
    const variantFor = (chosen) => (chosen.every(c => c >= 0) ? findVariant(product, chosen) : null);
    const line = (v, quantity) => ({ publicCode: code, structureVersion: product.structureVersion, quantity, selection: v.selection });
    if (!st.mix) {
      const v = variantFor(st.chosen);
      return st.qty > 0 && v?.purchasable === true ? [line(v, st.qty)] : [];
    }
    return [...st.per].filter(([, q]) => q > 0).map(([colour, q]) => {
      const v = variantFor(st.chosen.map((c, i) => (i === ci ? colour : c)));
      return v?.purchasable === true ? line(v, q) : null;
    }).filter(Boolean);
  };
  const save = () => {
    const mine = linesNow();
    const all = readBag();
    const at = all.findIndex(l => l.publicCode === code);
    const rest = all.filter(l => l.publicCode !== code);
    rest.splice(at < 0 ? rest.length : at, 0, ...mine);
    if (!writeBag(rest)) return;
    st.seen = JSON.stringify(mine);
    if (mine.length) rememberPageCredit(pageId, pageId + ':a', code);
    bagChanged();
  };
  const chips = (i) => {
    const option = options[i];
    const group = make('div', 'cp-card-opt');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', option.name);
    group.append(make('span', 'cp-card-opt-name', option.name));
    const open = openValues(product, st.chosen, i);
    option.values.forEach(v => {
      const b = make('button', 'cp-chip', v.value);
      b.type = 'button';
      b.dataset.k = i + ':' + v.position;
      b.disabled = !(st.mix && i !== ci ? true : open.has(v.position));
      b.setAttribute('aria-pressed', String(st.chosen[i] === v.position));
      b.addEventListener('click', () => {
        st.chosen[i] = v.position;
        st.chosen.forEach((c, k) => { if (k !== i && c >= 0 && !(st.mix && k === ci) && !openValues(product, st.chosen, k).has(c)) st.chosen[k] = -1; });
        if (!st.mix && st.qty === 0) st.qty = 1;
        save();
      });
      group.append(b);
    });
    return group;
  };
  const paint = () => {
    const mine = readBag().filter(l => l.publicCode === code);
    const now = JSON.stringify(mine);
    if (now !== st.seen) { fromBag(mine); st.seen = now; }
    const focus = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement.dataset.k : '';
    const head = make('div', 'cp-card-head');
    if (thumb) { const img = make('img'); img.src = thumb; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; head.append(img); }
    const name = make('div', 'cp-card-name');
    name.append(make('b', '', title), make('span', '', price));
    head.append(name);
    if (!options.some((o, i) => isSize(o) && many(i))) head.append(make('span', 'cp-pill', 'One Size'));
    el.replaceChildren(head);
    if (st.list) {
      mine.forEach(l => el.append(otherLine(l)));
      return;
    }
    if (canMix) {
      const toggle = make('button', 'cp-mix', st.mix ? 'لون واحد بس' : 'أكثر من لون؟ تحديد كمية كل لون');
      toggle.type = 'button';
      toggle.dataset.k = 'mix';
      toggle.setAttribute('aria-expanded', String(st.mix));
      toggle.addEventListener('click', () => {
        if (st.mix) { // back to one colour: keep the colour with the most pieces
          const [colour, q] = [...st.per].sort((a, b) => b[1] - a[1])[0] || [-1, 0];
          st.mix = false; st.chosen[ci] = colour; st.qty = q;
        } else {
          st.mix = true;
          st.per = new Map(st.chosen[ci] >= 0 && st.qty > 0 ? [[st.chosen[ci], st.qty]] : []);
          st.chosen[ci] = -1;
        }
        save();
      });
      el.append(toggle);
    }
    options.forEach((_, i) => { if (many(i) && !(st.mix && i === ci)) el.append(chips(i)); });
    if (st.mix) {
      const ready = st.chosen.every((c, i) => i === ci || c >= 0);
      const rows = make('div', 'cp-colours');
      options[ci].values.forEach(v => {
        const chosen = st.chosen.map((c, i) => (i === ci ? v.position : c));
        const ok = ready && findVariant(product, chosen)?.purchasable === true;
        const row = make('div', 'cp-colour');
        const label = make('span', 'cp-colour-name');
        const dot = make('i', 'cp-dot');
        const hex = hexOf(v.value);
        if (hex) dot.style.background = hex;
        label.append(dot, String(v.value));
        const q = st.per.get(v.position) || 0;
        const ctl = qtyControl(String(v.value), q, (d) => { st.per.set(v.position, Math.max(0, Math.min(MAX_QTY, q + d))); save(); }, ok ? MAX_QTY : q, 'c' + v.position);
        row.append(label, ctl);
        rows.append(row);
      });
      el.append(rows, make('p', 'cp-status', ready ? 'كل لون بيتسجل في نفس الطلب بالعدد المختار.' : 'اختيار المقاس الأول، وبعدها عدد كل لون.'));
    } else {
      const row = make('div', 'cp-card-qty');
      row.append(make('span', 'cp-card-opt-name', 'الكمية'),
        qtyControl(title, st.qty, (d) => { st.qty = Math.max(0, Math.min(MAX_QTY, st.qty + d)); save(); }, MAX_QTY, 'q'));
      el.append(row);
      if (st.qty > 0 && !linesNow().length) el.append(make('p', 'cp-status', 'اختيار ' + options.filter((o, i) => many(i) && st.chosen[i] < 0).map(o => o.name).join(' و') + ' علشان القطعة تدخل الطلب.'));
    }
    if (focus) el.querySelector('[data-k="' + focus + '"]:not(:disabled)')?.focus();
  };
  cards.set(code, paint);
  return el;
}
function paintCards() {
  cards.forEach(paint => paint());
  const holder = document.getElementById('cpLines');
  if (!holder) return;
  const extra = readBag().filter(l => !catalog.has(l.publicCode));
  holder.replaceChildren(...extra.map(otherLine));
}
/** The order box: the same fields and order as /checkout/, run by the same code (js/commerce.js showCheckout). */
function orderBox() {
  const box = make('section', 'cp-order');
  box.id = 'cpOrder';
  box.setAttribute('aria-labelledby', 'cpOrderTitle');
  const field = (label, el, attrs) => {
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    const l = make('label', '', label); l.append(el); return l;
  };
  const input = (attrs) => field(attrs.label, make('input'), { maxlength: '100', enterkeyhint: 'next', required: '', ...attrs.a });
  const region = make('select'); region.append(Object.assign(make('option', '', 'اختيار المحافظة'), { value: '' }));
  const notes = make('details');
  notes.append(make('summary', '', 'إضافة ملاحظة للمندوب (اختياري)'), field('ملاحظات', make('textarea'), { name: 'notes', maxlength: '500' }));
  const items = make('div'); items.id = 'checkoutItems'; items.hidden = true;
  const sum = (label, id, cls = '') => { const row = make('div', 'cp-sum ' + cls); const b = make('b', '', '—'); b.id = id; row.append(make('span', '', label), b); return row; };
  const out = make('p', 'cp-status'); out.id = 'status'; out.setAttribute('role', 'status');
  const submit = make('button', 'cp-add', 'تأكيد الطلب · الدفع عند الاستلام'); submit.id = 'placeOrder'; submit.type = 'submit'; submit.disabled = true;
  const form = make('form'); form.id = 'orderForm'; form.noValidate = true;
  // Same fields, names and order as /checkout/ (js/commerce.js reads them by these ids and names).
  form.append(field('المحافظة', region, { name: 'region', id: 'region', required: '', autocomplete: 'address-level1' }),
    input({ label: 'الاسم بالكامل', a: { name: 'name', autocomplete: 'name' } }),
    input({ label: 'رقم الموبايل', a: { name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '18', placeholder: '01xxxxxxxxx', dir: 'ltr' } }),
    input({ label: 'المنطقة', a: { name: 'area', autocomplete: 'address-level2' } }),
    input({ label: 'العنوان بالتفصيل', a: { name: 'address', maxlength: '350', autocomplete: 'street-address', enterkeyhint: 'done' } }),
    notes, items, sum('المنتجات', 'subtotal'), sum('الشحن', 'shipping'), sum('الإجمالي', 'grandTotal', 'cp-grand'), out, submit,
    make('p', 'collection-note', 'الدفع كاش عند الاستلام. الشحن والإجمالي بيتحسبوا من السيرفر قبل التأكيد.'));
  const title = make('h2', '', 'إتمام الطلب'); title.id = 'cpOrderTitle';
  const intro = make('p', 'cp-order-intro', 'اختيار اللون والمقاس والكمية لكل موديل، وكله في طلب واحد. الدفع عند الاستلام.');
  const modelCards = make('div', 'cp-cards');
  [...catalog.keys()].forEach(code => { if (catalog.get(code).product.purchasable === true) modelCards.append(modelCard(code)); });
  const lines = make('div', 'cp-lines'); lines.id = 'cpLines'; lines.setAttribute('aria-live', 'polite');
  box.append(title, intro, modelCards, lines, form);
  return box;
}
/** "موديلات تانية": every model of the campaign, linking to its section on this page. */
function otherModels(entries) {
  const box = make('section', 'cp-others');
  box.append(make('h2', '', 'موديلات تانية'));
  const grid = make('div', 'cp-others-grid');
  entries.forEach(({ code, title, image, price }) => {
    const a = make('a', 'cp-other');
    a.href = '#p-' + code;
    if (image) { const img = make('img'); img.src = image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; a.append(img); }
    a.append(make('b', '', title));
    if (price) a.append(make('span', '', price));
    grid.append(a);
  });
  box.append(grid);
  return box;
}

function productSection(item, product, design, look, index, motion, total) {
  const code = item.publicCode;
  const section = make('section', 'cp-product');
  section.id = 'p-' + code;
  section.dataset.code = code;
  section.dataset.bg = look.background; section.dataset.font = look.font; section.dataset.divider = look.divider;
  if (look.accent) {
    section.dataset.accent = '1';
    section.style.setProperty('--accent', look.accent); section.style.setProperty('--accent-ink', inkFor(look.accent));
  }
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
  let stack = null; // the animated photo stack when this product's design has a motion mode
  const setShots = (list) => {
    const shots = list.length ? list : [{ url: item.image, altText: main.alt }].filter(s => s.url);
    stack?.setImages(shots.map(s => ({ src: s.url, alt: main.alt })));
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
  media.append(main, thumbs);
  const name = design.title || product.title || item.title;
  const from = priceLabel(product, null);
  const priceText = from === '—' ? '' : from + ' جنيه';
  // Without a campaign photo (its own text and price), the page writes the name and price over the first photo.
  const caption = marketing('hero').length ? null : { title: name, price: priceText, badge: 'موديل ' + nf(index + 1) + ' من ' + nf(total) };
  const band = name + (priceText ? ' · ' + priceText : '') + ' · الدفع عند الاستلام';
  if (motion && design.motion.mode !== 'none') {
    media.dataset.motion = design.motion.mode;
    stack = motion.mountStack(main, [], { mode: design.motion.mode, dirs: design.motion.dirs, accent: look.accent,
      ink: look.accent ? inkFor(look.accent) : '#fff', caption, marquee: band });
  } else {
    const shade = make('div', 'cp-shade');
    if (caption) {
      const cap = make('div', 'cp-cap');
      const b = make('b'); b.append(make('span', 'cp-mark', caption.title));
      cap.append(b);
      if (caption.price) cap.append(make('span', 'cp-cap-price', caption.price));
      shade.append(make('span', 'cp-badge', caption.badge), cap);
    }
    // The slanted running band under the photos, like the motion stack's.
    const marq = make('div', 'cp-marq');
    marq.setAttribute('aria-hidden', 'true');
    const track = make('div', 'cp-track');
    for (let k = 0; k < 8; k++) track.append(make('span', '', band + ' ✦'));
    marq.append(track);
    const photo = make('div', 'cp-photo');
    main.replaceWith(photo);
    photo.append(main, shade);
    media.append(marq);
  }
  setShots([...marketing('hero'), ...productShots, ...marketing('features'), ...marketing('closing')]);

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
    if ((option.values || []).length === 1) {
      // Nothing to choose (e.g. One Size): show the value; the choice is already made.
      const fixed = make('div', 'cp-option cp-fixed');
      const value = String(option.values[0].value);
      fixed.append(make('span', 'cp-fixed-label', option.name),
        make('span', 'cp-onesize', isSize(option) && /one\s*size/i.test(value) ? 'One Size · مقاس واحد' : value));
      info.append(fixed);
      return [];
    }
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

  if (!options.some(isSize)) {
    const fixed = make('div', 'cp-option cp-fixed');
    fixed.append(make('span', 'cp-fixed-label', 'المقاس'), make('span', 'cp-onesize', 'One Size · مقاس واحد'));
    info.append(fixed);
  }

  const qty = make('div', 'cp-qty');
  const minus = make('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'تقليل الكمية');
  const plus = make('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'زيادة الكمية');
  const qtyValue = make('output', '', '1');
  let quantity = 1;
  minus.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); paint(); });
  plus.addEventListener('click', () => { quantity = Math.min(MAX_QTY, quantity + 1); paint(); });
  qty.append(make('span', 'cp-qty-label', 'الكمية'), minus, qtyValue, plus);

  const addLabel = look.ctaText || 'إضافة للشنطة';
  const add = make('button', 'cp-add', addLabel);
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
      bagChanged();
      void loadMotion().then(m => m.flyToBag(add, main.currentSrc || main.src, document.getElementById('cpBagLink'),
        document.getElementById('cpBagCount'))).catch(() => {});
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
      busy = false; add.textContent = addLabel; paint();
    }
  });

  section.append(media, info);
  return section;
}

async function render(collection, items, rawTheme) {
  const theme = cleanPageTheme(rawTheme);
  const accent = theme.enabled ? campaignAccent(theme) : '';
  buyLabel = (theme.enabled && theme.ctaText) || 'اطلب الآن';
  placeBar();
  if (accent) {
    document.documentElement.dataset.accent = '1';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-ink', inkFor(accent));
  } else delete document.documentElement.dataset.accent;
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
  const designs = loaded.map(([, raw]) => normalizeDesign(raw, { urls: true }));
  const moving = designs.find(d => d.motion.mode !== 'none');
  const motion = moving ? await loadMotion().catch(() => null) : null;
  if (motion && moving) {
    const hintAccent = theme.enabled ? accent : moving.accent;
    motion.mountHint((theme.enabled && theme.hintText) || moving.motion.hint || DEFAULT_HINT, hintAccent, hintAccent ? inkFor(hintAccent) : '#fff');
  }
  loaded.forEach(([product], i) => {
    const item = items[i];
    if (!product || product.publicCode !== item.publicCode) {
      const off = make('section', 'cp-product cp-off');
      off.id = 'p-' + item.publicCode;
      off.append(make('h2', 'cp-title', item.title), make('p', 'cp-status', 'الموديل ده مش متاح دلوقتي.'));
      list.append(off);
      return;
    }
    const design = designs[i];
    const title = design.title || product.title || item.title;
    if (jump.children[i]) jump.children[i].textContent = title;
    const shots = (product.media || []).filter(m => MEDIA.test(m?.url || ''));
    const from = priceLabel(product, null);
    catalog.set(item.publicCode, { title, product, thumb: (shots.find(m => m.isPrimary) || shots[0])?.url || item.image || '',
      price: from === '—' ? '' : from + ' جنيه' });
    list.append(productSection(item, product, design, sectionLook(design, theme), i, motion, items.length));
  });
  list.append(make('p', 'collection-note', 'كل الموديلات اللي تتضاف للشنطة بتتجمع في طلب واحد. الدفع عند الاستلام، والسعر النهائي والشحن بيتحسبوا قبل التأكيد.'));
  const others = catalog.size > 1 ? otherModels([...catalog].map(([code, c]) => ({ code, title: c.title, image: c.thumb, price: c.price }))) : null;
  document.body.append(bagBar);
  refreshBag();
  if (preview) { if (others) root.append(others); return; }
  const box = orderBox();
  root.append(box);
  if (others) root.append(others);
  paintCards();
  void import('../js/commerce.js?v=lead-20261120').then(m => m.showCheckout(true)).catch(() => {
    const out = document.getElementById('status');
    if (out) out.textContent = 'مش قادرين نجهز الطلب دلوقتي. ممكن تحديث الصفحة.';
  });
  addEventListener('scroll', placeBar, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { orderOnScreen = e.isIntersecting; placeBar(); }).observe(box);
  placeBar();
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
    addEventListener('storage', e => { if (e.key === BAG_KEY) bagChanged(); });
    await render(data.collection, data.items, data.theme);
    if (document.readyState === 'complete') void loadAnalytics(); else addEventListener('load', () => void loadAnalytics(), { once: true });
  } catch (e) {
    if (e?.status === 409) showState('بنحدّث توافر الموديلات', 'بعض الموديلات محتاجة تأكيد جديد. ممكن الرجوع بعد شوية أو تصفح باقي المتجر.');
    else if (e?.status) showState('الصفحة غير متاحة حاليًا', 'الصفحة ممكن تكون اتوقفت. ممكن تكملة تصفح باقي المتجر.');
    else showState('تعذّر تحميل الصفحة', 'ممكن التأكد من الاتصال بالإنترنت والمحاولة مرة تانية.');
  }
}
boot();
