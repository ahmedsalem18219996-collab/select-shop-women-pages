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
      <section class="card"><h3>سعر المورد وسعر البيع</h3><p class="muted">من المنتجات افتح الموديل، وبعدها «سعر المورد والربح». سعر البيع يظهر للفريق حسب صلاحيات الأسعار؛ تكلفة المورد تظهر للمالك فقط.</p></section>
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
  }
};
