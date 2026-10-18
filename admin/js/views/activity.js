import { t } from '../i18n.js';
import { html, render, $, $$, icon, date, skRows, fail } from '../ui.js';
import { call } from '../api.js';
import { activityLine } from './dashboard.js';

const TYPES = ['product', 'order', 'category', 'user', 'settings', 'storefront', 'banner', 'story', 'look', 'shipping_rate'];
const link = (a) => a.entity_type === 'product' ? `#/products/${a.entity_ref}` : a.entity_type === 'order' ? `#/orders/${a.entity_ref}` : null;
function detail(s = {}) {
  const parts = [];
  if ('price_before_minor' in s || 'price_minor' in s) parts.push(`${(s.price_before_minor ?? 0) / 100} → ${(s.price_minor ?? 0) / 100}`);
  if ('quantity' in s) parts.push(`${s.quantity_before ?? '—'} → ${s.quantity}`);
  if (s.status) parts.push(`${s.status_before ? t('status.' + s.status_before, s.status_before) + ' → ' : ''}${t('status.' + s.status, s.status)}`);
  if (s.stage) parts.push(`${s.stage_before ? t('stage.' + s.stage_before) + ' → ' : ''}${t('stage.' + s.stage)}`);
  if (s.category) parts.push(`${s.category_before ? s.category_before + ' → ' : ''}${s.category}`);
  if (s.title && s.title_before) parts.push(`${s.title_before} → ${s.title}`);
  if (s.email && s.permissions) parts.push(`${s.email} · ${s.permissions.length} ${t('team.count')}${s.active === false ? ' · ' + t('team.suspended') : ''}`);
  return parts.join(' · ');
}

export default {
  title: () => t('nav.activity'),
  async render({ el }) {
    const state = { type: '', rows: [], done: false };
    render(el, html`<div class="page">
      <div class="page-head"><div><h2>${t('activity.title')}</h2><p>${t('activity.subtitle')}</p></div></div>
      <div class="chips" role="group">${['', ...TYPES].map((x) => html`<button class="chip" data-type="${x}" aria-pressed="${x === ''}">${x ? t('activity.type.' + x) : t('activity.allTypes')}</button>`)}</div>
      <section class="card" id="log">${skRows(6, 40)}</section><div class="pager" id="pager"></div></div>`);
    const log = $('#log', el), pager = $('#pager', el);
    const paint = () => {
      render(log, state.rows.length ? html`<ul class="timeline">${state.rows.map((a) => { const href = link(a); return html`<li>${activityLine(a)}
        ${detail(a.summary) ? html`<small>${detail(a.summary)}</small>` : ''}<small>${date(a.at)} ${href ? html`· <a href="${href}">${t('app.open')}</a>` : ''}</small></li>`; })}</ul>`
        : html`<div class="empty" style="border:0">${icon('clock')}<b>${t('activity.empty')}</b></div>`);
      render(pager, state.done || !state.rows.length ? html`` : html`<button class="btn btn-ghost" data-more>${t('app.loadMore')}</button>`);
      $('[data-more]', pager)?.addEventListener('click', () => load(true));
    };
    const load = async (more = false) => {
      const before = more ? state.rows.at(-1)?.at : null;
      const r = await call('audit.list', { limit: 50, entity_type: state.type || null, before_at: before });
      if (r.outcome !== 'ok') { fail(r); return; }
      state.rows = more ? state.rows.concat(r.data) : r.data; state.done = r.data.length < 50; paint();
    };
    $$('[data-type]', el).forEach((b) => b.addEventListener('click', () => {
      state.type = b.dataset.type; $$('[data-type]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
    }));
    await load();
  },
};
