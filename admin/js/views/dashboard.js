import { t, getLang } from '../i18n.js';
import { html, render, $, icon, money, fmtNum, ago, statusBadge, skCards, skRows, spotlight, countUp, fail, esc } from '../ui.js';
import { call } from '../api.js';

export function activityLine(a) {
  const who = a.actor_email ? a.actor_email.split('@')[0] : t(`role.${a.actor_role || 'staff'}`);
  const what = t(`op.${a.operation}`, a.operation);
  return html`<b class="ltr">${who}</b> ${what} ${a.entity_ref && a.entity_type !== 'user' && !/^[0-9a-f-]{36}$/.test(a.entity_ref) ? html`<span class="code">${a.entity_ref}</span>` : ''}`;
}


/**
 * Show every currently published product, even those with zero tracked views.
 * The existing backend limits recorded events to one per browser/product in 24h;
 * these are not exact unique people or all raw page loads.
 * Use the authenticated products.list operation: no public analytics endpoint.
 */
async function populateProductViews(el, fallback = [], canReadSales = false) {
  const list = $('#productViewsList', el);
  const search = $('#productViewsSearch', el);
  const count = $('#productViewsCount', el);
  if (!list || !search || !count) return;

  let rows = [];
  let partial = false;
  try {
    const response = await call('products.list', { status: 'public', limit: 100 });
    if (!list.isConnected) return;
    if (response.outcome !== 'ok' || !Array.isArray(response.data) || response.data.length >= 100) {
      partial = true;
    } else {
      rows = response.data.filter(p => p.status === 'public')
        .map(p => ({
          code: String(p.public_code || ''),
          title: String(p.title || p.public_code || ''),
          views: Math.max(0, Number(p.views_30d) || 0),
        }))
        .filter(p => p.code)
        .sort((a, b) => b.views - a.views || a.code.localeCompare(b.code));
    }
  } catch {
    partial = true;
  }

  if (partial) {
    rows = (Array.isArray(fallback) ? fallback : [])
      .map(p => ({ code: String(p.code || ''), title: String(p.title || ''), views: Math.max(0, Number(p.views) || 0) }))
      .filter(p => p.code)
      .sort((a, b) => b.views - a.views || a.code.localeCompare(b.code));
  }
  const update = () => {
    if (!list.isConnected) return;
    const q = search.value.trim().toLocaleLowerCase();
    const matching = rows.filter(p => !q || p.title.toLocaleLowerCase().includes(q) || p.code.toLocaleLowerCase().includes(q));
    count.textContent = partial ? 'بيانات جزئية' : fmtNum(rows.length) + ' منتج';
    render(list, html`
      ${partial ? html`<p class="muted" style="font-size:12px;margin:0 0 9px">تعذر تحميل جميع المنتجات؛ المعروض حاليًا المنتجات ذات الزيارات المسجلة فقط.</p>` : ''}
      ${matching.length ? html`<div class="list" style="max-height:430px;overflow-y:auto;overscroll-behavior:contain;padding-inline-end:4px">
        ${matching.map((p, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:auto minmax(0,1fr) auto" href="#/products/${p.code}">
          <span class="avatar" style="background:var(--surface-2);color:var(--ink)">${k + 1}</span>
          <span class="row-main"><b>${p.title}</b><span class="row-meta code">${p.code}</span></span>
          <span class="muted num" style="white-space:nowrap">${fmtNum(p.views)} زيارة</span>
        </a>`)}
      </div>` : html`<p class="muted" style="margin:0">${q ? 'مفيش منتجات مطابقة للبحث' : 'مفيش منتجات منشورة'}</p>`}
    `);
  };
  search.addEventListener('input', update);
  update();
  void populateWinnerPanel(el, rows, partial, canReadSales);
}

const WINNER_MAX_ORDERS = 40;
function orderProductLines(detail) {
  const order = detail?.order || {};
  const groups = Array.isArray(order.groups) ? order.groups : [];
  const items = groups.flatMap(group => Array.isArray(group.items) ? group.items : []);
  return items.length ? items : (Array.isArray(order.items) ? order.items : []);
}
async function loadWinnerSales(canReadSales) {
  if (!canReadSales) return { ok: false, reason: 'ما عندكيش صلاحية عرض الطلبات؛ WINNER بالمشاهدات فقط.' };
  try {
    const responses = await Promise.all(['confirmed', 'pending'].map(status =>
      call('orders.list', { status, limit: 100 })
    ));
    if (responses.some(r => r.outcome !== 'ok' || !Array.isArray(r.data)))
      return { ok: false, reason: 'تعذر تحميل طلبات البيع؛ مش هنحسب مبيعات غير مؤكدة.' };
    const [confirmed, pending] = responses.map(r => r.data);
    if (confirmed.length >= 100 || pending.length >= 100 ||
        confirmed.length + pending.length > WINNER_MAX_ORDERS)
      return { ok: false, reason: 'عدد الطلبات أكبر من حد التقرير الدقيق؛ محتاجين تجميع من الخادم بدل ترتيب ناقص.' };
    const since = Date.now() - 30 * 86400000;
    const byCode = new Map();
    for (const [status, records] of [['confirmed', confirmed], ['pending', pending]]) {
      for (const row of records) {
        if (!row?.public_order_code) continue;
        const created = Date.parse(row.created_at);
        if (!Number.isFinite(created) || created < since || created > Date.now() + 60000) continue;
        const result = await call('orders.get', { code: row.public_order_code });
        if (result.outcome !== 'ok' || !result.data?.order)
          return { ok: false, reason: 'تعذر قراءة تفاصيل طلب؛ التقرير متوقف علشان ما نعرضش أرقام ناقصة.' };
        const detail = result.data;
        if (detail.order.status !== status) continue;
        const stage = String(detail.fulfillment?.stage || '').toLowerCase();
        if (stage === 'returned' || stage === 'return_requested') continue;
        for (const item of orderProductLines(detail)) {
          const code = String(item.product_public_code || '');
          const qty = Number(item.quantity);
          if (!/^SS-\d{4,19}$/.test(code) || !Number.isSafeInteger(qty) || qty <= 0) continue;
          const stats = byCode.get(code) || { confirmed: 0, pending: 0 };
          stats[status] += qty;
          byCode.set(code, stats);
        }
      }
    }
    return { ok: true, byCode };
  } catch {
    return { ok: false, reason: 'فيه مشكلة اتصال ببيانات الطلبات؛ هنكتفي بالمشاهدات.' };
  }
}
async function populateWinnerPanel(el, rows, viewsPartial, canReadSales) {
  const panel = $('#womenWinnerPanel', el);
  if (!panel) return;
  const sales = await loadWinnerSales(canReadSales);
  if (!panel.isConnected) return;
  const ranked = rows.map(p => ({ ...p, confirmed: sales.byCode?.get(p.code)?.confirmed || 0,
    pending: sales.byCode?.get(p.code)?.pending || 0 }));
  ranked.sort((a,b) => b.confirmed - a.confirmed || b.views - a.views ||
    a.code.localeCompare(b.code));
  const trusted = !viewsPartial && sales.ok;
  const leader = ranked[0];
  const hasConfirmed = ranked.some(p => p.confirmed > 0);
  const reason = viewsPartial ? 'المشاهدات جزئية؛ مفيش WINNER مؤكد.'
    : !sales.ok ? sales.reason : '';
  render(panel, html`
    ${reason ? html`<p class="muted" style="font-size:12px">${reason}</p>` : ''}
    ${leader && !viewsPartial ? html`
      <a class="row-card" href="#/products/${leader.code}" style="grid-template-columns:minmax(0,1fr) auto;background:var(--surface-2)">
        <span class="row-main"><b>${hasConfirmed && trusted ? '🏆 WINNER المبيعات' : '⭐ الأكثر مشاهدة'} — ${leader.title}</b>
          <span class="row-meta code">${leader.code}</span></span>
        <span class="row-end" style="text-align:end">
          <b class="num">${fmtNum(leader.views)} مشاهدة</b>
          ${sales.ok ? html`<small>${fmtNum(leader.confirmed)} قطعة مؤكدة · ${fmtNum(leader.pending)} قيد المراجعة</small>` : ''}
        </span>
      </a>
      ${!hasConfirmed && sales.ok ? html`<p class="muted" style="font-size:12px;margin:9px 0">لسه مفيش قطع في طلبات مؤكدة؛ المعروض هو الأكثر جذبًا للزيارات، مش الأكثر بيعًا.</p>` : ''}
      <div class="list" style="margin-top:12px">
        ${ranked.slice(0, 5).map((p, i) => html`<a class="row-card" href="#/products/${p.code}" style="--k:${i};grid-template-columns:auto minmax(0,1fr) auto">
          <span class="avatar">${i + 1}</span><span class="row-main"><b>${p.title}</b><span class="row-meta code">${p.code}</span></span>
          <span class="row-end num">${fmtNum(p.views)} مشاهدة ${sales.ok ? html`<small>${fmtNum(p.confirmed)} مؤكدة · ${fmtNum(p.pending)} معلقة</small>` : ''}</span>
        </a>`)}
      </div>` : html`<p class="muted">لسه مفيش بيانات كافية لاختيار منتج WINNER.</p>`}
    <p class="muted" style="font-size:11px;margin:10px 0 0">آخر 30 يوم: المشاهدات محسوبة مرة لكل متصفح ومنتج خلال 24 ساعة. المبيعات هنا عدد القطع في الطلبات المؤكدة، مش الشحنات المسلَّمة أو الإيراد المحصَّل. الطلبات الملغية والمرتجعة مستبعدة.</p>
  `);
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
        <section class="card spotlight"><div class="card-head"><h3>🏆 WINNER — أداء المنتجات (30 يوم)</h3></div><div id="womenWinnerPanel">${skRows(2)}</div></section>
        <section class="card"><div class="card-head"><h3>زيارات المنتجات (30 يوم)</h3><span class="muted" id="productViewsCount">—</span></div>
          <p class="muted" style="font-size:12px;margin:0 0 12px">زيارات محسوبة: مرة لكل متصفح ومنتج خلال 24 ساعة، مش عدد أشخاص فريدين.</p>
          <label class="searchbox" style="margin-bottom:12px"><span class="sr">بحث عن منتج</span>${icon('search')}<input class="input" id="productViewsSearch" type="search" placeholder="ابحث باسم المنتج أو الكود" autocomplete="off"></label>
          <div id="productViewsList">${skRows(4)}</div>
        </section>
        ${d.activity ? html`<section class="card"><div class="card-head"><h3>${t('dash.activity')}</h3><a class="btn btn-ghost btn-sm" href="#/activity">${t('app.more')}</a></div>
          <ul class="timeline">${d.activity.map((a) => html`<li>${activityLine(a)}<small>${ago(a.at)}</small></li>`)}</ul></section>` : ''}
      </div></div>`);
    spotlight(el); countUp(el);
    void populateProductViews(el, d.top_viewed, Boolean(o && can('orders.view')));
  },
};
