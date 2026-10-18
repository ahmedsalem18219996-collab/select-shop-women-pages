import { t } from '../i18n.js';
import { html, render, $, icon, money, fmtNum, ago, date, statusBadge, skRows, fail, debounce } from '../ui.js';
import { call } from '../api.js';

async function renderList({ el }) {
  render(el, html`<div class="page">
    <div class="page-head"><div><h2>${t('customers.title')}</h2><p>${t('customers.subtitle')}</p></div></div>
    <label class="searchbox" style="max-width:420px"><span class="sr">${t('app.search')}</span>${icon('search')}<input class="input" id="q" type="search" placeholder="${t('customers.searchPh')}" autocomplete="off"></label>
    <div id="results">${skRows(6)}</div></div>`);
  const results = $('#results', el);
  const load = async (q = '') => {
    const r = await call('customers.list', { q: q || null });
    if (r.outcome !== 'ok') { fail(r); return; }
    if (!r.data.length) { render(results, html`<div class="empty">${icon('users')}<b>${t('customers.empty')}</b></div>`); return; }
    render(results, html`<div class="list">${r.data.map((c, k) => html`<a class="row-card" style="--k:${k}" href="#/customers/${c.customer_reference}">
      <span class="avatar">${(c.latest_name || '?').slice(0, 1)}</span>
      <span class="row-main"><b>${c.latest_name}</b><span class="row-meta"><span class="ltr">${c.phone}</span><span>${c.latest_region_label}</span><span>${t('customers.last')} ${ago(c.last_order_at)}</span></span></span>
      <span class="row-end"><b class="num">${fmtNum(c.order_count)} ${t('customers.orders')}</b><span class="muted" style="font-size:12px">${fmtNum(c.active_count)} ${t('customers.active')}</span></span></a>`)}</div>`);
  };
  $('#q', el).addEventListener('input', debounce((e) => load(e.target.value.trim()), 350));
  await load();
}

async function renderDetail({ el, can, setTitle }, code) {
  render(el, html`<div class="page">${skRows(2, 160)}</div>`);
  const r = await call('customers.get', { code });
  if (r.outcome !== 'ok') { r.outcome === 'not_found' ? render(el, html`<div class="empty">${icon('users')}<b>${t('err.notFound')}</b></div>`) : fail(r); return; }
  const c = r.data.customer, orders = r.data.orders;
  setTitle(c.latest_name);
  render(el, html`<div class="page">
    <div class="page-head"><div><a class="btn btn-ghost btn-sm" href="#/customers">${icon(document.dir === 'rtl' ? 'chev' : 'chevBack')}${t('nav.customers')}</a><h2 style="margin-top:8px">${c.latest_name}</h2><p class="ltr" style="text-align:start">${c.phone}</p></div></div>
    <div class="kpis">
      <div class="card kpi"><span class="label">${t('customers.orders')}</span><span class="value">${fmtNum(c.order_count)}</span></div>
      <div class="card kpi"><span class="label">${t('status.confirmed')}</span><span class="value">${fmtNum(c.confirmed_count)}</span></div>
      <div class="card kpi"><span class="label">${t('customers.first')}</span><span class="value" style="font-size:18px">${date(c.first_order_at, false)}</span></div>
      <div class="card kpi"><span class="label">${t('customers.last')}</span><span class="value" style="font-size:18px">${date(c.last_order_at, false)}</span></div></div>
    <div class="bento">
      <section class="card"><div class="card-head"><h3>${t('orders.address')}</h3></div><dl class="kv"><dt>${t('orders.region')}</dt><dd>${c.latest_region_label}</dd>
        <dt>${t('orders.address')}</dt><dd style="white-space:pre-line">${c.latest_address || '—'}</dd>${c.other_names?.length ? html`<dt>${t('customers.title')}</dt><dd>${c.other_names.join('، ')}</dd>` : ''}</dl></section>
      ${orders ? html`<section class="card"><div class="card-head"><h3>${t('customers.recentOrders')}</h3></div><div class="list">
        ${orders.map((o, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:1fr auto" href="#/orders/${o.public_order_code}">
          <span class="row-main"><b class="code">${o.public_order_code}</b><span class="row-meta">${date(o.created_at)}</span></span>
          <span class="row-end"><b class="num">${money(o.grand_total_minor)}</b>${statusBadge(o.status)}</span></a>`)}</div></section>` : ''}
    </div></div>`);
}

export default {
  title: () => t('nav.customers'),
  render(ctx) { return ctx.params[0] ? renderDetail(ctx, ctx.params[0]) : renderList(ctx); },
};
