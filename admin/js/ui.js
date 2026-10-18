// UI toolkit: escaped templates, icons, formatters, island status, sheets, confirm, skeletons, motion helpers.
import { t, getLang, LOCALES } from './i18n.js';

// ---------- safe templating ----------
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s ?? '') });
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return esc(v);
}
// Every interpolation is HTML-escaped unless wrapped with raw() or produced by html``.
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return raw(out);
}
export const toString = (tpl) => tpl?.[RAW] ?? esc(tpl);
export const render = (el, tpl) => { el.innerHTML = tpl[RAW] ?? esc(tpl); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- icons (stroke, 24 grid) ----------
const P = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  box: 'M4 8 12 4l8 4v8l-8 4-8-4z|M4 8l8 4 8-4|M12 12v8',
  tag: 'M3 12V4h8l9 9-8 8z|M7.5 7.5h.01',
  cart: 'M5.5 8h13l-1 12h-11z|M9 8V6.5a3 3 0 0 1 6 0V8',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1|M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7|M21 20v-1a4 4 0 0 0-3-3.8|M16 4.2a3.5 3.5 0 0 1 0 6.6',
  truck: 'M3 7h11v9H3z|M14 10h4l3 3v3h-7|M7 18.5a1.5 1.5 0 1 0 0-.01|M17 18.5a1.5 1.5 0 1 0 0-.01',
  layout: 'M4 4h16v6H4z|M4 14h7v6H4z|M15 14h5v6h-5z',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z|M9 12l2 2 4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M12 7v5l3 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6 6 18', check: 'M5 12.5l4.5 4.5L19 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14|M16 16l4.5 4.5',
  menu: 'M4 7h16M4 12h16M4 17h10', more: 'M5 12h.01M12 12h.01M19 12h.01',
  chev: 'M9 6l6 6-6 6', chevBack: 'M15 6l-6 6 6 6', up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M19 12l-7 7-7-7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff: 'M3 3l18 18|M10.6 10.6a3 3 0 0 0 4.2 4.2|M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2|M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1',
  trash: 'M4 7h16|M10 11v6|M14 11v6|M5 7l1 13h12l1-13|M9 7V4h6v3',
  image: 'M4 5h16v14H4z|M4 15l4.5-4.5 4 4 2.5-2.5L20 17|M15.5 9.5h.01',
  upload: 'M12 16V4|M7 9l5-5 5 5|M4 16v4h16v-4', star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10|M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M3 12h18|M12 3a14 14 0 0 1 0 18|M12 3a14 14 0 0 0 0 18',
  logout: 'M15 4h4v16h-4|M10 17l5-5-5-5|M15 12H3', mail: 'M3 6h18v12H3z|M3 7l9 6 9-6', alert: 'M12 9v4|M12 17h.01|M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  money: 'M3 7h18v10H3z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M6 10h.01M18 14h.01', chart: 'M4 20V10|M10 20V4|M16 20v-7|M22 20H2',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1', refresh: 'M20 11a8 8 0 1 0-2.3 5.7|M20 4v7h-7',
};
export function icon(name, cls = '') {
  const d = (P[name] || P.more).split('|').map((p) => `<path d="${p}"/>`).join('');
  return raw(`<svg class="${esc(cls)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`);
}

// ---------- formatters ----------
const nf = () => new Intl.NumberFormat(LOCALES[getLang()]);
export const fmtNum = (n) => nf().format(Number(n || 0));
export function money(minor, opts = {}) {
  if (minor === null || minor === undefined) return '—';
  const v = Number(minor) / 100;
  const s = new Intl.NumberFormat(LOCALES[getLang()], { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  return opts.bare ? s : (getLang() === 'ar' ? `${s} ج.م` : `EGP ${s}`);
}
export const toMinor = (text) => {
  const s = String(text ?? '').trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [a, b = ''] = s.split('.');
  return Number(a) * 100 + Number(b.padEnd(2, '0'));
};
export function date(v, withTime = true) {
  if (!v) return '—';
  return new Intl.DateTimeFormat(LOCALES[getLang()], withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v));
}
export function ago(v) {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALES[getLang()], { numeric: 'auto' });
  if (s < 60) return rtf.format(-Math.round(s), 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return date(v, false);
}
export const initials = (email = '') => (email.split('@')[0] || '?').slice(0, 2);
export function statusBadge(status) {
  const cls = { public: 'ok', confirmed: 'ok', delivered: 'ok', draft: 'plain', pending: 'warn', preparing: 'info', shipped: 'info', hidden: '', cancelled: 'danger', archived: '', return_requested: 'warn', returned: 'danger', none: '' }[status] ?? '';
  const label = t(`status.${status}`, '') || t(`stage.${status}`, status);
  return html`<span class="badge ${cls}">${label}</span>`;
}

// ---------- island (status) ----------
let islandTimer;
export function island(kind, text, sub = '') {
  const el = document.getElementById('island');
  clearTimeout(islandTimer);
  el.className = `island show ${kind}`;
  render(el, html`<span class="ic">${kind === 'ok' ? icon('check') : kind === 'error' ? icon('alert') : ''}</span><span>${text}${sub ? html`<small>${sub}</small>` : ''}</span>`);
  if (kind !== 'busy') islandTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 5200 : 2400);
}
export const done = (text = t('app.saved')) => island('ok', text);
export const busy = (text = t('app.saving')) => island('busy', text);

// Readable message for an API outcome.
export function outcomeMessage(r) {
  const o = r?.outcome;
  if (o === 'forbidden') return t('err.forbidden');
  if (o === 'invalid' || o === 'invalid_permissions') return `${t('err.invalid')}${r.field ? ` (${r.field})` : ''}`;
  if (o === 'not_found' || o === 'unknown_operation') return t('err.notFound');
  if (o === 'conflict' || o === 'idempotency_conflict') return t('err.conflict');
  if (o === 'already_shipped') return t('orders.alreadyShipped');
  if (o === 'procurement_active') return t('orders.procurementActive');
  if (o === 'order_not_confirmed') return t('orders.notConfirmed');
  if (o === 'in_use') return t('categories.inUse');
  if (o === 'duplicate') return t('categories.dup');
  if (o === 'network') return t('err.network');
  if (o === 'rejected') return `${t('err.rejected')}${r.message ? `: ${r.message}` : ''}`;
  if (o === 'owner_protected') return t('team.ownerLocked');
  if (o === 'invite_failed') return r.reason === 'already_registered' ? t('team.alreadyRegistered') : t('err.server');
  return t('err.server');
}
export const fail = (r) => island('error', outcomeMessage(r));

// ---------- overlays ----------
let lastFocus = null;
export function closeLayer() {
  const layer = document.getElementById('layer');
  render(layer, html``);
  document.documentElement.style.overflow = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function trap(container) {
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
}
// A bottom sheet on phones, a centred dialog from 760px.
export function sheet({ title, body, foot = '', wide = false, onMount }) {
  lastFocus = document.activeElement;
  const layer = document.getElementById('layer');
  render(layer, html`<div class="scrim" data-close></div>
    <section class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-head"><h3 id="sheet-title">${title}</h3><button class="icon-btn" data-close aria-label="${t('app.close')}">${icon('x')}</button></header>
      <div class="sheet-body">${body}</div>
      ${foot ? html`<footer class="sheet-foot">${foot}</footer>` : ''}
    </section>`);
  document.documentElement.style.overflow = 'hidden';
  const box = $('.sheet', layer);
  $$('[data-close]', layer).forEach((b) => b.addEventListener('click', closeLayer));
  trap(box);
  onMount?.(box);
  setTimeout(() => ($('input, select, textarea, button.btn-primary', $('.sheet-body', box)) || $('[data-close].icon-btn', box))?.focus(), 30);
  return box;
}
export function confirmDialog({ title, text, okText = t('app.confirm'), danger = false }) {
  return new Promise((resolve) => {
    const box = sheet({
      title, body: html`<p style="margin:0">${text}</p>`,
      foot: html`<button class="btn btn-ghost" data-no>${t('app.cancel')}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${okText}</button>`,
    });
    $('[data-no]', box).onclick = () => { closeLayer(); resolve(false); };
    $('[data-yes]', box).onclick = () => { closeLayer(); resolve(true); };
    $$('[data-close]', document.getElementById('layer')).forEach((b) => b.addEventListener('click', () => resolve(false)));
    setTimeout(() => $('[data-yes]', box).focus(), 40);
  });
}

// ---------- buttons with busy state ----------
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + esc(t('app.saving'));
  try { return await fn(); } finally { if (document.contains(btn)) { btn.disabled = false; btn.innerHTML = label; } }
}

// ---------- skeletons ----------
export const skRows = (n = 6, h = 64) => html`<div class="list">${Array.from({ length: n }, () => html`<div class="sk" style="height:${h}px;border-radius:14px"></div>`)}</div>`;
export const skCards = (n = 4) => html`<div class="kpis">${Array.from({ length: n }, () => html`<div class="sk" style="height:112px;border-radius:20px"></div>`)}</div>`;

// ---------- motion helpers ----------
export function spotlight(root) {
  $$('.spotlight', root).forEach((el) => el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
}
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function countUp(root) {
  $$('[data-count]', root).forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    const fmt = el.dataset.money ? (v) => money(v, { bare: true }) : (v) => fmtNum(v);
    if (reduce() || end === 0) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(end * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
export function segmented(el, onChange) {
  const pill = document.createElement('span'); pill.className = 'pill'; el.prepend(pill);
  const move = () => {
    const sel = $('[aria-selected="true"]', el); if (!sel) return;
    pill.style.width = `${sel.offsetWidth}px`;
    const rtl = document.documentElement.dir === 'rtl';
    pill.style.insetInlineStart = `${rtl ? el.clientWidth - sel.offsetLeft - sel.offsetWidth : sel.offsetLeft}px`;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    $$('button[data-v]', el).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    move(); onChange(b.dataset.v);
  });
  requestAnimationFrame(move);
  addEventListener('resize', move);
}
export const debounce = (fn, ms = 300) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };

// Drag to reorder (pointer events, works with touch) + keyboard arrows. onOrder(ids) after a drop.
export function sortable(list, onOrder) {
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip'); if (!grip) return;
    drag = grip.closest('.drag-item'); drag.classList.add('dragging'); grip.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drag-item');
    if (!over || over === drag || over.parentElement !== list) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(drag, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
  });
  const end = () => { if (!drag) return; drag.classList.remove('dragging'); drag = null; onOrder($$('.drag-item', list).map((x) => x.dataset.id)); };
  list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-move]'); if (!b) return;
    const item = b.closest('.drag-item');
    if (b.dataset.move === 'up' && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
    else if (b.dataset.move === 'down' && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
    else return;
    $('[data-move="' + b.dataset.move + '"]', item).focus();
    onOrder($$('.drag-item', list).map((x) => x.dataset.id));
  });
}

export function idempotencyKey() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return 'adm-' + [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
