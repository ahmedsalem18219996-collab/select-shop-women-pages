/* Store contact for customer pages (home, bag, product, campaign): the store's WhatsApp number from ONE public
   storefront read per page, and the ready message for each link. No credentials, no customer data, never blocks the page:
   every [data-wa] link already works with the fallback number and is updated when the read lands. */
export const STOREFRONT = 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-admin/public/storefront';
export const FALLBACK = '201289437444';
export const GENERAL = 'أهلًا، عندي سؤال عن طلب من SELECT SHOP.';
const NUMBER = /^201[0125][0-9]{8}$/;

/** First valid Egyptian mobile of the storefront list (1–5 entries), then the older brand number, then the fallback. */
export function pickNumber(/** @type {unknown} */ list, /** @type {unknown} */ older = '') {
  const valid = (/** @type {unknown} */ n) => typeof n === 'string' && NUMBER.test(n);
  return (Array.isArray(list) ? list.slice(0, 5) : []).find(valid) || (valid(older) ? String(older) : FALLBACK);
}
export const waLink = (/** @type {string} */ number, /** @type {string} */ text) => 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
export const productText = (/** @type {string} */ name, /** @type {string} */ code) => `أهلًا، عندي سؤال عن ${name} (كود ${code}).`;

/** @type {Promise<any>|null} */
let read = null;
/** The storefront settings, read once per page; null on any failure (8 s timeout). */
export function storefront() {
  read ||= fetch(STOREFRONT, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' },
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  return read;
}

/** Point every a[data-wa] at the store's number with the page's message (re-read on each tap, so a changed colour counts). */
export function wire(/** @type {() => string} */ text = () => GENERAL) {
  /** @type {unknown} */
  let list = null;
  const set = () => {
    const n = pickNumber(list, /** @type {any} */ (window).SELECT_CONFIG?.whatsapp);
    for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a[data-wa]'))) a.href = waLink(n, text());
  };
  set();
  document.addEventListener('click', e => { if (/** @type {Element} */ (e.target)?.closest?.('a[data-wa]')) set(); }, true);
  return storefront().then(d => { list = d?.whatsappNumbers; set(); });
}
