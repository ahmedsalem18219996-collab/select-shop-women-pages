import { t } from '../i18n.js';
import { html, render, icon, money, fmtNum, toMinor } from '../ui.js';
import { call } from '../api.js';
import { summarizeLines } from '../profit.js';
import { summarizeStageRows, summarizeConfirmedStages, filterOpenReturns, estimateNet } from '../finance-summary.js';

const safeCall = async (op, data) => {
  try { return await call(op, data); }
  catch { return { outcome: 'network' }; }
};
const listRows = async (status) => safeCall('orders.list', { status, limit: 100 });
const asSummary = (r) => r?.outcome === 'ok' ? summarizeStageRows(r.data) : { complete: false };
const amount = (s) => s?.complete ? money(s.orderValueMinor) : 'غير مكتمل';
const number = (s) => s?.complete ? fmtNum(s.count) : '—';
const inputValue = (o, key) => Number.isInteger(o[key]) && o[key] >= 0 ? String(o[key] / 100) : '';


const isCost = (x) => Number.isSafeInteger(x) && x > 0;
const rangeLabel = (a, b) => !Number.isSafeInteger(a) || !Number.isSafeInteger(b) ? 'غير محدد'
  : a === b ? money(a) : money(a) + ' – ' + money(b);

// The catalogue view deliberately never estimates a per-size profit from unmatched price/cost ranges.
function ownerCostCells(product, reply) {
  const sellMin = product.price_min_minor, sellMax = product.price_max_minor;
  if (!reply) return { cost: 'جارٍ التحميل…', gross: '—', complete: false };
  if (reply.outcome !== 'ok' || !reply.data) return { cost: 'تعذر قراءة التكلفة', gross: '—', complete: false };
  const base = isCost(reply.data.product_cost_minor) ? reply.data.product_cost_minor : null;
  const overrides = Array.isArray(reply.data.variants)
    ? reply.data.variants.map(v => v.cost_minor).filter(isCost) : [];
  if (base === null && !overrides.length) return { cost: 'غير مسجلة', gross: '—', complete: false };
  const known = [...(base === null ? [] : [base]), ...overrides];
  const cost = rangeLabel(Math.min(...known), Math.max(...known)) + (base === null ? ' (جزئي)' : '');
  const exact = base !== null && known.every(v => v === base) &&
    Number.isSafeInteger(sellMin) && sellMin > 0 && sellMin === sellMax;
  return { cost, gross: exact ? money(sellMin - base) : 'يختلف حسب المقاس/السعر',
    complete: base !== null };
}

async function loadOwnerCostCatalogue(el, button) {
  const output = el.querySelector('[data-owner-cost-results]');
  if (!output || !button) return;
  button.disabled = true;
  output.textContent = 'بنحمّل قائمة المنتجات…';
  // Read-only, opt-in and limited concurrency: no supplier, pricing or product writes.
  const [listed, archived] = await Promise.all([
    safeCall('products.list', { limit: 100 }),
    safeCall('products.list', { status: 'archived', limit: 100 })
  ]);
  if (!el.isConnected) return;
  if (listed?.outcome !== 'ok' || !Array.isArray(listed.data)) {
    output.textContent = 'تعذّر تحميل المنتجات. لم يتم تغيير أي سعر أو تكلفة.';
    button.disabled = false;
    return;
  }
  const archivedOk = archived?.outcome === 'ok' && Array.isArray(archived.data);
  const byCode = new Map();
  for (const p of [...listed.data, ...(archivedOk ? archived.data : [])]) {
    if (p && typeof p.public_code === 'string') byCode.set(p.public_code, p);
  }
  const products = [...byCode.values()].sort((a, b) => a.public_code.localeCompare(b.public_code, 'en'));
  const truncated = listed.data.length >= 100 || (archivedOk && archived.data.length >= 100);
  const costs = new Map();
  let readCount = 0;
  let displayed = 0;
  const paint = () => {
    if (!el.isConnected) return;
    const complete = products.filter(p => costs.get(p.public_code)?.outcome === 'ok' &&
      ownerCostCells(p, costs.get(p.public_code)).complete).length;
    const pending = products.length - readCount;
    render(output, html`
      <p class="muted" role="status">تمت مراجعة ${fmtNum(readCount)} من ${fmtNum(products.length)} منتج. ${pending ? 'جاري جلب الباقي بهدوء…' : 'انتهى تحميل الأسعار.'}</p>
      ${!archivedOk || truncated ? html`<p class="note" role="alert">القائمة غير مكتملة (حد النتائج أو تعذّر جلب المؤرشف). الأسعار الظاهرة تخص الصفوف المحمّلة فقط.</p>` : ''}
      <p class="muted">تكلفة مثبتة لعدد ${fmtNum(complete)} من الصفوف المحمّلة. «غير مسجلة» تعني أن التكلفة غير محفوظة؛ و«جزئي» يعني أن بعض المقاسات فقط لها تكلفة.</p>
      <div class="table-wrap" style="overflow-x:auto">
        <table class="t">
          <thead><tr><th>المنتج</th><th>الحالة</th><th>سعر البيع</th><th>تكلفة المورد</th><th>الربح المبدئي للوحدة</th></tr></thead>
          <tbody>${products.slice(0, displayed).map(p => {
            const cells = ownerCostCells(p, costs.get(p.public_code));
            return html`<tr><td><a href="#/products/${p.public_code}">${p.title || p.public_code}</a><small class="muted" style="display:block" dir="ltr">${p.public_code}</small></td>
              <td>${p.status === 'public' ? 'منشور' : p.status === 'draft' ? 'مسودة' : p.status === 'hidden' ? 'مخفي' : 'مؤرشف'}</td>
              <td>${rangeLabel(p.price_min_minor, p.price_max_minor)}</td><td>${cells.cost}</td><td>${cells.gross}</td></tr>`;
          })}</tbody>
        </table>
      </div>
      <small class="muted">الربح هنا فرق سعر البيع وتكلفة المورد فقط، من غير شحن أو إعلانات أو مرتجعات. لو المقاسات أو الأسعار مختلفة راجع تفاصيل المنتج.</small>
      ${displayed < products.length ? html`<button type="button" class="btn btn-soft btn-sm" data-cost-next>عرض 12 منتج تاني</button>` : ''}
    `);
    output.querySelector('[data-cost-next]')?.addEventListener('click', () => { void loadNext(); });
  };
  const loadNext = async () => {
    const until = Math.min(products.length, displayed + 12);
    const next = products.slice(displayed, until);
    displayed = until;
    paint();
    for (let i = 0; i < next.length; i += 3) {
      if (!el.isConnected) return;
      await Promise.all(next.slice(i, i + 3).map(async (p) => {
        costs.set(p.public_code, await safeCall('costs.get', { code: p.public_code }));
        readCount++;
      }));
      paint();
    }
  };
  await loadNext();
  button.disabled = false;
  button.textContent = 'تحديث أسعار المورد';
}

export default {
  title: () => 'الأرباح والمرتجعات',
  async render({ el, can }) {
    // Strong API authorization is on the server; also do not request costs for a non-owner client.
    if (!can('owner')) {
      render(el, html`<div class="empty">${icon('shield')}<b>الصفحة دي للمالك فقط.</b></div>`);
      return;
    }
    render(el, html`<div class="page"><div class="page-head"><h2>الأرباح والمرتجعات</h2></div><p class="muted" role="status">بنراجع أرقام آخر 30 يوم وحالات المرتجعات…</p></div>`);
    const [profit, confirmed, cancelled, pending] = await Promise.all([
      safeCall('profit.summary', { days: 30 }),
      // No stage filter: the existing server filters AFTER its 100-order limit.
      listRows('confirmed'),
      listRows('cancelled'),
      listRows('pending')
    ]);
    if (!el.isConnected) return;
    const stages = confirmed?.outcome === 'ok' ? summarizeConfirmedStages(confirmed.data) :
      { complete: false, open: { complete: false }, returned: { complete: false } };
    const open = stages.open, back = stages.returned;
    const cancels = asSummary(cancelled), newOrders = asSummary(pending);
    const validProfit = profit?.outcome === 'ok' && Array.isArray(profit.data?.lines);
    // The old profit endpoint still counts return_requested as sales. Exclude those orders explicitly.
    // If the confirmed order listing is missing/capped, do not show potentially inflated profit.
    // Exclude both pending and completed returns by their order codes, even if a
    // legacy profit row has no reliable returned flag.
    const returnedCodes = open.complete && back.complete
      ? new Set([...open.codes, ...back.codes]) : null;
    const lines = validProfit && returnedCodes ? filterOpenReturns(profit.data.lines, returnedCodes) : null;
    const s = lines ? summarizeLines(lines) : null;
    let exp = {};
    try { exp = JSON.parse(localStorage.getItem('wa.profitExpenses') || '{}') || {}; } catch { exp = {}; }
    const field = (key, title) => html`<label class="field"><span>${title}</span><div class="input-money"><input data-finance-exp="${key}" inputmode="decimal" value="${inputValue(exp,key)}" placeholder="اكتب 0 لو مفيش"><span>EGP</span></div></label>`;
    render(el, html`<div class="page">
      <div class="page-head"><div><h2>الأرباح والمرتجعات</h2><p>تقرير خاص بالمالك؛ مبالغ بالجنيه المصري.</p></div><a class="btn btn-soft" href="#/products">${icon('box')} تعديل أسعار المنتجات</a></div>
      <section class="card stack" aria-label="تكلفة المورد حسب المنتج" style="margin-top:14px">
        <div class="card-head"><h3>أسعار البيع والمورد لكل منتج</h3><button type="button" class="btn btn-soft btn-sm" data-owner-cost-load>تحميل أسعار المورد</button></div>
        <p class="muted">خاص بالمالك فقط. تحميل عند الطلب وعلى دفعات صغيرة علشان الموظفين يقدروا يكملوا شغلهم. التكاليف الناقصة مش محسوبة كصفر.</p>
        <div data-owner-cost-results role="region" aria-live="polite">اضغط «تحميل أسعار المورد» لعرض القائمة.</div>
      </section>
      <p class="note" role="note">الطلبات عند الاستلام مش معناها إن الفلوس اتحصلت. الإيراد المعروض قيمة طلبات مؤكدة أو متسلّمة، مش رصيد بنكي أو أرباح محصّلة.</p>
      <section class="kpis" aria-label="المالية آخر 30 يوم">
        <div class="card kpi"><span class="label">طلبات محتسبة في التقرير (30 يوم)</span><b class="value">${s ? fmtNum(s.orders) : '—'}</b></div>
        <div class="card kpi"><span class="label">قيمة المنتجات بعد الخصم (30 يوم)</span><b class="value">${s ? money(s.revenueMinor) : '—'}</b></div>
        <div class="card kpi"><span class="label">تكلفة المورد المجمدة وقت الطلب</span><b class="value">${s?.complete ? money(s.costMinor) : '—'}</b></div>
        <div class="card kpi"><span class="label">الربح الإجمالي المبدئي</span><b class="value">${s?.complete ? money(s.grossMinor) : '—'}</b></div>
      </section>
      ${!s ? html`<p class="note" role="alert">تعذر الحصول على تقرير ربح موثوق أو حالات الاسترجاع بالكامل. لم نعرض أرقام أرباح تقديرية.</p>` : s.complete ? '' : html`<p class="note" role="alert">الربح غير مكتمل: ${fmtNum(s.incompleteOrders)} طلب فيه تكلفة مورد ناقصة. لا يمكن حساب الصافي بأمان.</p>`}
      <section class="card stack" aria-label="المرتجعات" style="margin-top:14px">
        <div class="card-head"><h3>المرتجعات والإلغاءات — كل الفترات</h3><a href="#/orders" class="btn btn-soft btn-sm">إدارة الطلبات</a></div>
        <dl class="kv">
          <dt>طلبات الاسترجاع المفتوحة</dt><dd>${number(open)}</dd>
          <dt>مرتجعات مكتملة</dt><dd>${number(back)}</dd>
          <dt>قيمة فواتير الطلبات المرتجعة (تشمل الشحن)</dt><dd>${amount(back)}</dd>
          <dt>الطلبات الملغاة</dt><dd>${number(cancels)}</dd>
          <dt>الطلبات المنتظرة تأكيد</dt><dd>${number(newOrders)}</dd>
          <dt>مبالغ مستردة للعملاء فعلًا</dt><dd>غير مسجلة بالنظام</dd>
        </dl>
        ${[open,back,cancels,newOrders].some(x => !x.complete) ? html`<p class="note" role="alert">قائمة واحدة على الأقل لم تُحمّل بالكامل أو وصلت لحد 100 طلب. لتجنّب إخفاء مرتجعات قديمة مش هنحسب ربحًا من بيانات ناقصة.</p>` : ''}
        <p class="muted" style="margin:0">الملغي مش مرتجع. قيمة فاتورة المرتجع مش دليل على رد المبلغ، ولا يجوز خصمها مرتين من الربح. تكاليف شحن المرتجعات والتعويضات لسه محتاجة تسجيل مستقل.</p>
        <div class="row" style="flex-wrap:wrap"><a class="btn btn-soft btn-sm" href="#/orders?stage=return_requested">طلبات استرجاع</a><a class="btn btn-soft btn-sm" href="#/orders?stage=returned">مرتجع مكتمل</a><a class="btn btn-soft btn-sm" href="#/orders?status=cancelled">الملغية</a></div>
      </section>
      <section class="card stack" aria-label="الصافي التقديري" style="margin-top:14px">
        <div class="card-head"><h3>صافي تقديري بعد المصروفات</h3><span class="muted">على الجهاز الحالي فقط</span></div>
        <p class="muted" style="margin:0">اكتب متوسط التكلفة اللي المتجر دفعها لكل أوردر محسوب، واكتب 0 لو مفيش مصروف. التكاليف هنا تقديرية ومش حسابات فعلية.</p>
        <div class="grid2">${field('ship','شحن دفعه المتجر لكل أوردر')}${field('ad','إعلانات لكل أوردر')}${field('other','تغليف ومصاريف تانية لكل أوردر')}</div>
        <b data-finance-net role="status"></b>
        <small class="muted">الشحن اللي العميل دفعه مش مضاف لربح المنتجات. المصاريف دي محفوظة في المتصفح فقط، ومش بتعدّل بيانات الطلبات.</small>
      </section>
    </div>`);
    const updateNet = () => {
      const values = {};
      for (const key of ['ship','ad','other']) {
        const fieldEl = el.querySelector('[data-finance-exp="' + key + '"]');
        const raw = fieldEl?.value.trim() ?? '';
        values[key] = raw === '' ? null : toMinor(raw);
        if (values[key] !== null && (!Number.isSafeInteger(values[key]) || values[key] < 0)) values[key] = null;
      }
      const out = el.querySelector('[data-finance-net]');
      const net = estimateNet(s, values);
      out.textContent = net === null ? 'الصافي غير مكتمل — سجّل تكلفة المورد وكل المصاريف، حتى لو صفر.' : 'صافي تقديري: ' + money(net);
      try { localStorage.setItem('wa.profitExpenses', JSON.stringify(values)); } catch { /* private browser */ }
    };
    el.addEventListener('input', e => { if (e.target.matches('[data-finance-exp]')) updateNet(); });
    updateNet();
    el.querySelector('[data-owner-cost-load]')?.addEventListener('click', e => {
      void loadOwnerCostCatalogue(el, e.currentTarget);
    });
  }
};
