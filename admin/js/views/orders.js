import { t } from '../i18n.js';
import { html, render, $, $$, icon, money, fmtNum, ago, date, statusBadge, skRows, confirmDialog, withBusy, done, fail, debounce } from '../ui.js';
import { call } from '../api.js';
import { activityLine } from './dashboard.js';

const STAGES = ['preparing', 'shipped', 'delivered'];
const NEXT = { null: ['preparing'], preparing: ['shipped'], shipped: ['delivered', 'returned'], delivered: ['return_requested'], return_requested: ['returned', 'delivered'] };

// UTF-8 BOM CSV is directly editable in Excel without putting buyer data on a third-party service.
// Prefix spreadsheet formula triggers so untrusted notes/addresses cannot execute as Excel formulas.
const csvCell = (value) => {
  let text = String(value ?? '').replace(/\u0000/g, '');
  if (/^\s*[=+@-]/.test(text) || /^\s*[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
function orderShippingRow(data) {
  const o = data?.order || {}, f = data?.fulfillment || {};
  const groups = Array.isArray(o.groups) ? o.groups : [];
  const items = groups.flatMap(g => Array.isArray(g.items) ? g.items : []);
  const lines = items.length ? items : (Array.isArray(o.items) ? o.items : []);
  const summary = lines.map(x => {
    const sizes = (x.option_selections || []).map(v => v.value).join(' / ');
    return [x.product_title || x.product_public_code || 'منتج', sizes, '×' + (x.quantity ?? 1)].filter(Boolean).join(' ');
  }).join(' | ');
  return [o.public_order_code, o.created_at, o.status, o.buyer_name, o.buyer_phone,
    o.delivery_region_label, o.delivery_address, o.delivery_notes, summary,
    lines.reduce((total,x)=>total+(Number(x.quantity)||0),0),
    Number(o.merchandise_subtotal_minor || 0)/100,
    Number(o.shipping_total_minor || 0)/100,
    Number(o.grand_total_minor || 0)/100,
    o.payment_method === 'cod' ? 'الدفع عند الاستلام' : (o.payment_method || ''),
    f.carrier || '', f.tracking_code || ''];
}
async function exportShippingCsv(button, state) {
  if (!confirm('تحميل بيانات عملاء الشحن على جهازك؟ احتفظ بالملف بأمان وشاركه مع شركة الشحن فقط.')) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'بنجهز ملف الشحن…';
  try {
    // Existing privileged API caps lists to 100. Never silently export a partial batch.
    const result = await call('orders.list', {
      status: state.status || 'confirmed', q: state.q || null, stage: state.stage || null, limit: 100
    });
    if (result.outcome !== 'ok' || !Array.isArray(result.data)) { fail(result); return; }
    if (result.data.length >= 100) {
      alert('فيه 100 أوردر أو أكتر مطابقين للفلتر. ضيّق البحث أو اختار حالة محددة قبل التنزيل علشان ميفوتش أي أوردر.');
      return;
    }
    const records = [];
    for (const item of result.data) {
      const detail = await call('orders.get', { code: item.public_order_code });
      if (detail.outcome !== 'ok' || !detail.data?.order) {
        throw new Error('تعذر قراءة تفاصيل أحد الأوردرات. لم ننزّل ملفًا ناقصًا.');
      }
      records.push(orderShippingRow(detail.data));
    }
    if (!records.length) { alert('مفيش أوردرات مطابقة للتصدير.'); return; }
    const head = ['رقم الطلب','تاريخ الطلب','حالة الطلب','اسم العميل','الموبايل','المحافظة',
      'العنوان بالتفصيل','ملاحظات التوصيل','المنتجات والمقاسات','إجمالي القطع',
      'سعر المنتجات (جنيه)','مصاريف الشحن (جنيه)','الإجمالي للتحصيل (جنيه)',
      'طريقة الدفع','شركة الشحن','رقم التتبع'];
    const csv = '\uFEFF' + [head,...records].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'select-shop-women-shipping-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    done('تم تجهيز ملف الشحن ('+records.length+' أوردر). افتحه في Excel.');
  } catch (error) {
    alert('التصدير وقف من غير تنزيل ملف ناقص: ' + String(error?.message || 'خطأ اتصال'));
  } finally { button.disabled = false; button.textContent = original; }
}

async function renderList({ el, query, session }) {
  const state = { q: query.get('q') || '', status: query.get('status') || '', stage: query.get('stage') || '' };
  render(el, html`<div class="page">
    <div class="page-head"><div><h2>${t('orders.title')}</h2><p>${t('orders.subtitle')}</p></div>
      ${session?.role === 'owner' ? html`<button type="button" class="btn btn-primary" data-export-shipping>تنزيل شيت الشحن (Excel)</button>` : ''}</div>
    ${session?.role === 'owner' ? html`<p class="muted" style="font-size:12px">ينزّل الأوردرات المؤكدة حسب الفلتر الحالي (حتى 99 أوردر في كل ملف). الملف فيه بيانات العملاء؛ شاركه مع شركة الشحن فقط.</p>` : ''}
    <div class="toolbar"><label class="searchbox"><span class="sr">${t('app.search')}</span>${icon('search')}<input class="input" id="q" type="search" value="${state.q}" placeholder="${t('orders.searchPh')}" autocomplete="off"></label>
      <div class="chips" role="group" aria-label="${t('products.status')}" style="justify-content:flex-end">
        ${['', 'pending', 'confirmed', 'cancelled'].map((s) => html`<button class="chip" data-status="${s}" aria-pressed="${state.status === s}">${s ? t('status.' + s) : t('app.all')}</button>`)}</div></div>
    <div class="chips" role="group" aria-label="${t('orders.stageFilter')}">${['', 'none', 'preparing', 'shipped', 'delivered', 'return_requested', 'returned'].map((s) => html`<button class="chip" data-stage="${s}" aria-pressed="${state.stage === s}">${s ? t('stage.' + s) : t('orders.stageFilter')}</button>`)}</div>
    <div id="results">${skRows(6)}</div></div>`);
  $('[data-export-shipping]', el)?.addEventListener('click',e=>exportShippingCsv(e.currentTarget,state));
  const results = $('#results', el);
  const load = async () => {
    const r = await call('orders.list', { q: state.q || null, status: state.status || null, stage: state.stage || null });
    if (r.outcome !== 'ok') { fail(r); return; }
    if (!r.data.length) { render(results, html`<div class="empty">${icon('cart')}<b>${t('orders.empty')}</b></div>`); return; }
    render(results, html`
      <div class="list mobile-only">${r.data.map((o, k) => html`<a class="row-card" style="--k:${k};grid-template-columns:1fr auto" href="#/orders/${o.public_order_code}">
        <span class="row-main"><b>${o.buyer_name}</b><span class="row-meta"><span class="code">${o.public_order_code}</span><span>${o.delivery_region_label}</span><span>${ago(o.created_at)}</span></span></span>
        <span class="row-end"><b class="num">${money(o.grand_total_minor)}</b>${statusBadge(o.status)}${o.stage ? statusBadge(o.stage) : ''}</span></a>`)}</div>
      <div class="table-wrap desk-only"><table class="t"><thead><tr><th>#</th><th>${t('orders.customer')}</th><th>${t('orders.region')}</th><th>${t('orders.items')}</th><th>${t('orders.total')}</th><th>${t('products.status')}</th><th>${t('orders.fulfillment')}</th><th></th></tr></thead>
        <tbody>${r.data.map((o) => html`<tr><td><a class="rowlink code" href="#/orders/${o.public_order_code}">${o.public_order_code}</a></td>
          <td>${o.buyer_name}<br><small class="muted ltr">${o.buyer_phone}</small></td><td>${o.delivery_region_label}</td><td class="num">${fmtNum(o.item_quantity)}</td>
          <td class="num"><b>${money(o.grand_total_minor)}</b></td><td>${statusBadge(o.status)}</td><td>${o.stage ? statusBadge(o.stage) : html`<span class="muted">—</span>`}</td>
          <td class="muted">${ago(o.created_at)}</td></tr>`)}</tbody></table></div>`);
  };
  $('#q', el).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 350));
  $$('[data-status]', el).forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.status; $$('[data-status]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  $$('[data-stage]', el).forEach((b) => b.addEventListener('click', () => { state.stage = b.dataset.stage; $$('[data-stage]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  await load();
}

async function renderDetail(ctx, code) {
  const { el, can } = ctx;
  render(el, html`<div class="page">${skRows(1, 80)}${skRows(2, 200)}</div>`);
  const r = await call('orders.get', { code });
  if (r.outcome !== 'ok') { r.outcome === 'not_found' ? render(el, html`<div class="empty">${icon('cart')}<b>${t('err.notFound')}</b><a class="btn btn-ghost" href="#/orders">${t('app.back')}</a></div>`) : fail(r); return; }
  const { order: o, fulfillment: f, fulfillment_events: ev = [], activity } = r.data;
  const reload = () => renderDetail(ctx, code);
  const stage = f?.stage || null;
  // The database groups lines per shipping group (groups[].items); a flat list is kept as a fallback.
  const lines = (o.groups || []).flatMap((g) => g.items || []).concat(o.items || []);
  const next = o.status === 'confirmed' ? (NEXT[stage] || []) : [];
  const history = [...(o.history || []).map((h) => ({ at: h.changed_at, text: t('status.' + h.to_status) })), ...ev.map((e) => ({ at: e.at, text: t('stage.' + e.to) + (e.note ? ` · ${e.note}` : '') }))]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  render(el, html`<div class="page">
    <div class="page-head"><div><a class="btn btn-ghost btn-sm" href="#/orders">${icon(document.dir === 'rtl' ? 'chev' : 'chevBack')}${t('nav.orders')}</a>
      <h2 style="margin-top:8px" class="code">${o.public_order_code}</h2><p class="row">${statusBadge(o.status)}${stage ? statusBadge(stage) : ''}<span class="muted">${date(o.created_at)}</span></p></div>
      ${can('orders.manage') ? html`<div class="actions">
        ${(o.allowed_transitions || []).includes('confirmed') ? html`<button class="btn btn-primary" data-to="confirmed">${icon('check')}${t('orders.confirm')}</button>` : ''}
        ${(o.allowed_transitions || []).includes('cancelled') && (!stage || stage === 'preparing') ? html`<button class="btn btn-danger" data-to="cancelled">${t('orders.cancel')}</button>` : ''}</div>` : ''}</div>
    <div class="editor"><div class="stack">
      ${o.status === 'confirmed' ? html`<section class="card stack"><div class="card-head"><h3>${t('orders.fulfillment')}</h3>${f?.tracking_code ? html`<span class="code muted">${f.carrier || ''} ${f.tracking_code}</span>` : ''}</div>
        <div class="stepper">${STAGES.map((s) => { const idx = STAGES.indexOf(stage), i = STAGES.indexOf(s); return html`<div class="step ${i < idx || (stage === 'delivered' && s === 'delivered') ? 'done' : i === idx ? 'now' : ''}"><i></i>${t('stage.' + s)}</div>`; })}
          <div class="step ${['return_requested', 'returned'].includes(stage) ? 'now' : ''}"><i></i>${stage === 'returned' ? t('stage.returned') : t('stage.return_requested')}</div></div>
        ${can('orders.manage') && next.length ? html`<form class="stack" id="ff"><div class="grid2">
          <label class="field"><span>${t('orders.nextStage')}</span><select class="select" id="fs">${next.map((s) => html`<option value="${s}">${t('stage.' + s)}</option>`)}</select></label>
          <label class="field"><span>${t('orders.carrier')}</span><input class="input" id="fc" value="${f?.carrier || ''}" maxlength="80"></label>
          <label class="field"><span>${t('orders.tracking')}</span><input class="input ltr" id="ft" value="${f?.tracking_code || ''}" maxlength="80"></label>
          <label class="field"><span>${t('orders.note')}</span><input class="input" id="fn" maxlength="500"></label></div>
          <div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div></form>` : ''}</section>` : ''}
      <section class="card"><div class="card-head"><h3>${t('orders.items')}</h3><span class="muted">${fmtNum(lines.length)}</span></div>
        <div class="order-items">${lines.map((it) => html`<div class="order-item"><div><a class="rowlink" href="#/products/${it.product_public_code}">${it.product_title}</a>
          <div class="row-meta"><span class="code">${it.product_public_code}</span>${(it.option_selections || []).map((s) => html`<span>${s.name}: ${s.value}</span>`)}<span>${t('orders.qty')} ${fmtNum(it.quantity)}</span></div></div>
          <b class="num">${money(it.line_total_minor)}</b></div>`)}</div>
        <div class="totals" style="margin-top:14px"><div><span>${t('orders.subtotal')}</span><span class="num">${money(o.merchandise_subtotal_minor)}</span></div>
          <div><span>${t('orders.shippingFee')}</span><span class="num">${money(o.shipping_total_minor)}</span></div>
          <div class="grand"><span>${t('orders.total')}</span><span class="num">${money(o.grand_total_minor)}</span></div></div></section>
    </div><aside>
      <section class="card"><div class="card-head"><h3>${t('orders.customer')}</h3>${can('customers.view') ? html`<a class="btn btn-ghost btn-sm" href="#/customers/${o.public_order_code}">${t('app.open')}</a>` : ''}</div>
        <dl class="kv"><dt>${t('orders.customer')}</dt><dd>${o.buyer_name}</dd><dt>${t('settings.phone')}</dt><dd class="ltr">${o.buyer_phone}</dd>
          <dt>${t('orders.region')}</dt><dd>${o.delivery_region_label}</dd><dt>${t('orders.address')}</dt><dd style="white-space:pre-line">${o.delivery_address}</dd>
          ${o.delivery_notes ? html`<dt>${t('orders.notes')}</dt><dd>${o.delivery_notes}</dd>` : ''}<dt>${t('orders.payment')}</dt><dd>${o.payment_method === 'cod' ? t('orders.cod') : o.payment_method}</dd></dl></section>
      <section class="card"><div class="card-head"><h3>${t('orders.history')}</h3></div><ul class="timeline">${history.map((h) => html`<li>${h.text}<small>${date(h.at)}</small></li>`)}</ul></section>
      ${activity?.length ? html`<section class="card"><div class="card-head"><h3>${t('nav.activity')}</h3></div><ul class="timeline">${activity.map((a) => html`<li>${activityLine(a)}<small>${date(a.at)}</small></li>`)}</ul></section>` : ''}
    </aside></div></div>`);
  $$('[data-to]', el).forEach((b) => b.addEventListener('click', async () => {
    const to = b.dataset.to;
    if (!(await confirmDialog({ title: to === 'confirmed' ? t('orders.confirm') : t('orders.cancel'), text: to === 'confirmed' ? t('orders.confirmQ') : t('orders.cancelQ'), okText: to === 'confirmed' ? t('orders.confirm') : t('orders.cancel'), danger: to === 'cancelled' }))) return;
    const res = await withBusy(b, () => call('orders.transition', { code, version: o.status_version, target: to }));
    if (res.outcome === 'changed') { done(); reload(); } else { fail(res); if (res.outcome === 'conflict') reload(); }
  }));
  $('#ff', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await withBusy($('button', e.currentTarget), () => call('orders.set_fulfillment', { code, stage: $('#fs', el).value, version: f?.version || 0,
      carrier: $('#fc', el).value.trim() || null, tracking_code: $('#ft', el).value.trim() || null, note: $('#fn', el).value.trim() || null }));
    if (res.outcome === 'saved') { done(); reload(); } else { fail(res); if (res.outcome === 'conflict') reload(); }
  });
}

export default {
  title: (params) => params[0] || t('nav.orders'),
  render(ctx) { return ctx.params[0] ? renderDetail(ctx, ctx.params[0]) : renderList(ctx); },
};
