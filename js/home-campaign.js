/* Home campaign hero: one line in js/config.js (campaignSlug) names the campaign shown on the home.
   Reads the public /collections/<slug> (titles, server prices, photos, saved accent); no slug, a bad slug or any error keeps the brand hero.
   Look only: links go to the same product landing pages and campaign page as everywhere else; no order, price or tracking logic here.
   The Admin's home campaign (storefront homeCampaignSlug, the same one read WhatsApp uses) replaces the config line when set. */
import { storefront } from './store-contact.js?v=20261122';
const BRIDGE = 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge';
export const DEFAULT_ACCENT = '#C8102E';
const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/;
const PHOTO = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(png|jpg|webp)$/;

const lum = (/** @type {number[]} */ rgb) => {
  const lin = (/** @type {number} */ c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contrast of white text on this colour (WCAG). */
export const whiteContrast = (/** @type {string} */ hex) => 1.05 / (lum([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))) + 0.05);

/** The campaign colour with white text at 4.5:1 or better: darkened step by step when it is too light; invalid → store default. */
export function readableAccent(/** @type {unknown} */ value) {
  let hex = typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : DEFAULT_ACCENT;
  let rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  while (1.05 / (lum(rgb) + 0.05) < 4.5) {
    rgb = rgb.map(c => Math.floor(c * 0.92));
    hex = '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return hex;
}

/** Bridge response → what the home shows. Prices come only from the server's priceMinor. */
export function campaignView(/** @type {any} */ data, /** @type {string} */ slug) {
  if (!data?.collection || !Array.isArray(data.items) || !data.items.length) return null;
  const items = data.items.filter((/** @type {any} */ i) => /^SS-\d{4,19}$/.test(String(i?.publicCode || ''))).slice(0, 4).map((/** @type {any} */ i) => ({
    code: i.publicCode,
    title: String(i.title || i.publicCode).slice(0, 100),
    price: Number.isFinite(i.priceMinor) && i.priceMinor > 0 ? i.priceMinor / 100 : null,
    image: PHOTO.test(i.image || '') ? i.image : '',
    url: '/lp/?p=' + encodeURIComponent(i.publicCode),
  }));
  if (!items.length) return null;
  const theme = data.theme && typeof data.theme === 'object' ? data.theme : {};
  return {
    title: String(data.collection.title || '').slice(0, 100),
    line: String(data.collection.description || '').slice(0, 300),
    accent: readableAccent(theme.enabled ? theme.accent : ''),
    url: '/collections/?slug=' + encodeURIComponent(slug),
    items,
  };
}

const make = (/** @type {string} */ tag, cls = '', text = '') => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };

function paint(/** @type {NonNullable<ReturnType<typeof campaignView>>} */ view) {
  const cur = window.SELECT_CONFIG?.currencyShort || 'ج';
  const money = (/** @type {number} */ n) => n.toLocaleString('en-US') + ' ' + cur;
  const hero = document.getElementById('hero');
  if (!hero) return;
  const first = view.items[0];
  document.documentElement.style.setProperty('--nx-accent', view.accent);
  hero.dataset.campaign = '1'; // app.js leaves the owner's brand copy alone from here on
  const h1 = hero.querySelector('h1'), hl = h1?.querySelector('.hl');
  if (h1 && hl && view.title) { if (h1.firstChild?.nodeType === Node.TEXT_NODE) h1.firstChild.textContent = ''; hl.textContent = view.title; }
  const lead = hero.querySelector('.hero-lead');
  if (lead) lead.textContent = view.line;
  const cta = /** @type {HTMLAnchorElement | null} */ (hero.querySelector('#heroCta'));
  if (cta) {
    cta.href = first.url;
    cta.textContent = /طقم/.test(first.title) ? 'اطلبي الطقم' : 'اطلبي دلوقتي';
    if (first.price) cta.append(make('b', '', '· ' + money(first.price)));
  }
  const more = /** @type {HTMLAnchorElement | null} */ (hero.querySelector('#heroCampaign'));
  if (more) { more.href = view.url; more.hidden = false; }
  const live = hero.querySelector('.nx-live');
  if (live) live.hidden = false;
  const photos = view.items.map(i => i.image).filter(Boolean).slice(0, 3);
  const visual = hero.querySelector('.hero-visual');
  if (visual && photos.length) {
    visual.replaceChildren(...photos.map((src, k) => {
      const img = make('img'); img.src = src; img.alt = ''; img.decoding = 'async';
      if (k) img.loading = 'lazy'; else img.fetchPriority = 'high';
      return img;
    }));
    hero.classList.add('is-campaign');
  }
  const rail = document.getElementById('campaign');
  const track = rail?.querySelector('.nx-rail-track');
  if (!rail || !track) return;
  const all = /** @type {HTMLAnchorElement | null} */ (rail.querySelector('.nx-rail-all'));
  if (all) all.href = view.url;
  track.replaceChildren(...view.items.map(i => {
    const a = /** @type {HTMLAnchorElement} */ (make('a', 'nx-rail-card')); a.href = i.url;
    const shot = make('span', 'nx-rail-shot');
    if (i.image) { const img = make('img'); img.src = i.image; img.alt = i.title; img.loading = 'lazy'; img.decoding = 'async'; shot.append(img); }
    if (i.price) shot.append(make('span', 'nx-tag', money(i.price)));
    a.append(shot, make('p', '', i.title));
    return a;
  }));
  rail.hidden = false;
}

/** The campaign the owner put on the home in the Admin (storefront homeCampaignSlug) wins; empty, missing or a failed read → js/config.js. */
export function homeSlug(/** @type {any} */ storefrontData, /** @type {unknown} */ configSlug) {
  const own = typeof storefrontData?.homeCampaignSlug === 'string' ? storefrontData.homeCampaignSlug.trim() : '';
  return SLUG.test(own) ? own : String(configSlug || '').trim();
}

async function boot() {
  const slug = homeSlug(await storefront(), window.SELECT_CONFIG?.campaignSlug);
  if (!SLUG.test(slug)) return;
  try {
    const r = await fetch(BRIDGE + '/collections/' + encodeURIComponent(slug), { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' },
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(12000) : undefined });
    if (!r.ok) return;
    const view = campaignView(await r.json(), slug);
    if (view) paint(view);
  } catch { /* the brand hero stays */ }
}
if (typeof document !== 'undefined') void boot();
