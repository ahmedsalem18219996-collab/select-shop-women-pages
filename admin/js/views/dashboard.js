import { t, getLang } from '../i18n.js';
import { html, render, $, icon, money, fmtNum, ago, statusBadge, skCards, skRows, spotlight, countUp, fail, esc } from '../ui.js';
import { call } from '../api.js';

export function activityLine(a) {
  const who = a.actor_email ? a.actor_email.split('@')[0] : t(`role.${a.actor_role || 'staff'}`);
  const what = t(`op.${a.operation}`, a.operation);
  return html`<b class="ltr">${who}</b> ${what} ${a.entity_ref && a.entity_type !== 'user' && !/^[0-9a-f-]{36}$/.test(a.entity_ref) ? html`<span class="code">${a.entity_ref}</span>` : ''}`;
}

export default {
  title: () => t('nav.dashboard'),
  async render({ el, session, can, go }) {
    render(el, html`<div class="page">${skCards(4)}${skRows(3, 160)}</div>`);
    const r = await call('dashboard.summary');
    if (r.outcome !== 'ok') { fail(r); render(el, html`<div class="empty">${icon('alert')}<b>${t('err.server')}</b></div>`); return; }
    const d = r.data, o = d.orders;
    // Recently cancelled trials belong in Order history, not the active dashboard feed.
    const recentActiveOrders = (d.recent_orders || []).filter(item => item.status !== 'cancelled');
    const hour = new Date().getHours();
    const name = (session.email || '').split('@')[0];
    const maxDay = Math.max(1, ...(d.revenue_by_day || []).map((x) => x.minor));
    render(el, html`<div class="page">
      <div class="page-head"><div><h2>${hour < 15 ? t('dash.hello') : t('dash.helloEvening')}${name ? html`، <span class="ltr">${name}</span>` : ''}</h2><p>${t('dash.summary')}</p></div>
        ${can('products.edit') ? html`<div class="actions"><a class="btn btn-primary" href="#/products?new=1">${icon('plus')}${t('nav.newProduct')}</a></div>` : ''}</div>
      <section class="kpis" aria-label="KPIs">
        ${o ? html`
          <a class="card kpi accent spotlight lift" href="#/orders" style="text-decoration:none"><span class="label">${icon('money')}${t('dash.revenue30')}</span>
            <span class="value"><span data-count="${o.revenue_30d_minor}" data-money="1">0</span><small>${getLang() === 'ar' ? 'ج.م' : 'EGP'}</small></span>
            <span class="foot">${t('dash.revenueToday')}: ${money(o.revenue_today_minor)}</span></a>
          <a class="card kpi spotlight lift" href="#/orders?status=pending" style="text-decoration:none"><span class="label">${icon('cart')}${t('dash.pending')}</span>
            <span class="value" data-count="${o.pending}">0</span><span class="foot">${t('dash.toShip')}: ${fmtNum(o.to_ship)}</span></a>` : ''}
        <a class="card kpi spotlight lift" href="#/products?status=public" style="text-decoration:none"><span class="label">${icon('box')}${t('dash.public')}</span>
          <span class="value" data-count="${d.products.public}">0</span><span class="foot">${t('dash.drafts')}: ${fmtNum(d.products.draft)}</span></a>
        <div class="card kpi spotlight lift"><span class="label">${icon('eye')}${t('dash.views7')}</span>
          <span class="value" data-count="${d.views.days_7}">0</span><span class="foot">${t('dash.viewsToday')}: ${fmtNum(d.views.today)}</span></div>
      </section>
      <div class="bento">
        ${o ? html`<section class="card spotlight"><div class="card-head"><h3>${t('dash.chart')}</h3><span class="muted">${money(o.revenue_7d_minor)} · 7d</span></div>
          <div class="bars" role="img" aria-label="${t('dash.chart')}">
            ${(d.revenue_by_day || []).map((x, k, all) => html`<div class="bar ${k === all.length - 1 ? 'today' : ''}" style="--h:${Math.round((x.minor / maxDay) * 100)}%;--k:${k}" tabindex="0"><i></i><span>${money(x.minor)} · ${fmtNum(x.orders)} ${t('dash.orders')}</span></div>`)}
          </div><div class="bars-axis"><span>${(d.revenue_by_day || [])[0]?.day || ''}</span><span>${(d.revenue_by_day || []).at(-1)?.day || ''}</span></div></section>` : ''}
        <section class="card"><div class="card-head"><h3>${t('dash.lowStock')}</h3>${icon('alert')}</div>
          ${d.low_stock.length ? html`<div class="list">${d.low_stock.map((x, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:1fr auto" href="#/products/${x.code}">
            <span class="row-main"><b>${x.title}</b><span class="row-meta"><span class="code">${x.code}</span>${x.label ? html`<span>${t('dash.size')} ${x.label}</span>` : ''}</span></span>
            <span class="badge ${x.quantity === 0 ? 'danger' : 'warn'}">${fmtNum(x.quantity)} ${t('dash.piece')}</span></a>`)}</div>`
          : html`<p class="muted" style="margin:0">${t('dash.noLow')}</p>`}</section>
        ${o ? html`<section class="card"><div class="card-head"><h3>${t('dash.recentOrders')}</h3><a class="btn btn-ghost btn-sm" href="#/orders">${t('app.more')}</a></div>
          ${recentActiveOrders.length ? html`<div class="list">${recentActiveOrders.map((x, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:1fr auto" href="#/orders/${x.code}">
            <span class="row-main"><b>${x.buyer_name}</b><span class="row-meta"><span class="code">${x.code}</span><span>${ago(x.created_at)}</span></span></span>
            <span class="row-end"><b class="num">${money(x.total_minor)}</b>${statusBadge(x.status)}</span></a>`)}</div>`
          : html`<p class="muted" style="margin:0">${t('dash.noOrders')}</p>`}</section>` : ''}
        <section class="card"><div class="card-head"><h3>${t('dash.topViewed')}</h3>${icon('chart')}</div>
          ${d.top_viewed.length ? html`<div class="list">${d.top_viewed.map((x, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:auto 1fr auto" href="#/products/${x.code}">
            <span class="avatar" style="background:var(--surface-2);color:var(--ink)">${k + 1}</span><span class="row-main"><b>${x.title}</b><span class="row-meta code">${x.code}</span></span>
            <span class="muted num">${fmtNum(x.views)} ${t('dash.views')}</span></a>`)}</div>`
          : html`<p class="muted" style="margin:0">${t('dash.noViews')}</p>`}</section>
        ${d.activity ? html`<section class="card"><div class="card-head"><h3>${t('dash.activity')}</h3><a class="btn btn-ghost btn-sm" href="#/activity">${t('app.more')}</a></div>
          <ul class="timeline">${d.activity.map((a) => html`<li>${activityLine(a)}<small>${ago(a.at)}</small></li>`)}</ul></section>` : ''}
      </div></div>`);
    spotlight(el); countUp(el);
  },
};
