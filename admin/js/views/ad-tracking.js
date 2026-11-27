import { call } from '../api.js';
import { $, closeLayer, done, fmtNum, html, icon, money, outcomeMessage, render, sheet, withBusy } from '../ui.js';

const dayMs = 86_400_000;
const maxSpendMinor = 100_000_000_000;
const cairoCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const displayDay = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
});
const reasonLabels = {
  changed_mind: 'غيّر رأيه',
  price: 'السعر',
  found_cheaper: 'لقى سعر أقل',
  no_answer: 'مفيش رد',
  wrong_address: 'العنوان غلط',
  size_colour: 'المقاس أو اللون',
  other: 'سبب تاني',
  unrecorded: 'السبب مش مسجّل',
};
const unavailableMessage = 'تقرير الإعلانات لسه مش متاح على الخادم الحالي.';
const spend = (value) => value == null ? 'مش مسجّل' : money(value);
const rate = (value) => value == null ? '—' : `${fmtNum(value)}٪`;
const headlineMetrics = [
  ['spendMinor', 'صرف الإعلانات', spend],
  ['orders', 'الطلبات', fmtNum],
  ['costPerOrderMinor', 'تكلفة الطلب', money],
  ['costPerDeliveredMinor', 'تكلفة الطلب المستلَم', money],
];
const detailMetrics = [
  ['confirmed', 'المؤكّدة', fmtNum],
  ['shipped', 'المشحونة', fmtNum],
  ['delivered', 'المستلمة', fmtNum],
  ['returnedOrders', 'المرتجعة', fmtNum],
  ['cancelledOrders', 'الملغاة', fmtNum],
  ['rejectedOrCancelled', 'المرفوضة أو الملغاة', fmtNum],
  ['confirmationRate', 'نسبة التأكيد', rate],
  ['deliveryRate', 'نسبة الاستلام', rate],
  ['rejectionRate', 'نسبة الرفض أو الإلغاء', rate],
  ['recordedSpendDays', 'أيام الصرف المسجّل', fmtNum],
];

function cairoToday() {
  const { year, month, day } = Object.fromEntries(cairoCalendar.formatToParts().map(({ type, value }) => [type, value]));
  return `${year}-${month}-${day}`;
}

function dayValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

function validCampaign(value) {
  return !value || (/^[a-zA-Zء-ي0-9 _.:-]{1,80}$/.test(value) && /[a-zA-Zء-ي]/.test(value));
}

function amountInPiastres(value) {
  const normalized = value.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replaceAll('٫', '.').replaceAll('٬', ',');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [pounds, piastres = ''] = normalized.replaceAll(',', '').split('.');
  const amount = Number(pounds) * 100 + Number(piastres.padEnd(2, '0'));
  return amount <= maxSpendMinor ? amount : null;
}

function metrics(stats, fields, className) {
  return html`<dl class="${className}">${fields.map(([key, label, format]) => html`
    <div><dt>${label}</dt><dd><bdi class="num">${format(stats[key])}</bdi></dd></div>
  `)}</dl>`;
}

function report(data, filters) {
  const { total, days = [], reasons = [] } = data;
  return html`
    <section class="card" aria-labelledby="ad-report-totals-title">
      <div class="ad-report-section-head">
        <h3 id="ad-report-totals-title">إجمالي الفترة</h3>
        <p><bdi>${filters.from}</bdi> إلى <bdi>${filters.to}</bdi> · <bdi>${filters.campaign || 'كل الحملات'}</bdi></p>
      </div>
      ${metrics(total, headlineMetrics, 'ad-report-headline-metrics')}
      ${metrics(total, detailMetrics, 'ad-report-detail-metrics')}
      <p class="ad-report-note">التكلفة بتظهر لما تسجّل الصرف لكل أيام الطلبات، ويكون فيه طلبات لحسابها.</p>
    </section>
    <section class="card" aria-labelledby="ad-report-reasons-title">
      <div class="ad-report-section-head">
        <h3 id="ad-report-reasons-title">أسباب الرفض أو الإلغاء</h3>
      </div>
      ${reasons.length ? html`<ul class="ad-report-reasons">${reasons.map(({ reason, count }) => html`
        <li><span>${Object.hasOwn(reasonLabels, reason) ? reasonLabels[reason] : reasonLabels.other}</span>
          <bdi class="num">${fmtNum(count)}</bdi></li>`)}</ul>` : html`<p class="ad-report-note">مفيش أسباب في الفترة دي.</p>`}
    </section>
    <section class="card" aria-labelledby="ad-report-daily-title">
      <div class="ad-report-section-head">
        <h3 id="ad-report-daily-title">التفاصيل اليومية</h3>
        <p>الطلبات محسوبة بتاريخ إنشائها بتوقيت القاهرة. الطلب اللي اتسلّم واترد بعد كده بيتحسب في المستلمة والمرتجعة.</p>
      </div>
      ${days.length ? html`<div class="ad-report-days">${days.map((day) => html`
        <details>
          <summary>
            <time datetime="${day.date}">${displayDay.format(dayValue(day.date))}</time>
            <span>${fmtNum(day.orders)} طلب</span>
            <bdi class="num">${spend(day.spendMinor)}</bdi>
            ${icon('chev')}
          </summary>
          ${metrics(day, [...detailMetrics, ...headlineMetrics.slice(2)], 'ad-report-detail-metrics')}
        </details>`)}</div>` : html`<p class="ad-report-note">مفيش بيانات يومية للفترة دي.</p>`}
    </section>`;
}

function openSpendSheet({ today, filters, campaigns, onSaving, onSaved, onUnavailable }) {
  sheet({
    title: 'تسجيل صرف الإعلانات',
    body: html`<form class="stack ad-spend-sheet" novalidate>
      <label class="field"><span>اليوم</span><input name="date" class="input" type="date" max="${today}" value="${filters.to}" required></label>
      <label class="field"><span>المبلغ بالجنيه</span>
        <input name="amount" class="input" inputmode="decimal" autocomplete="off" dir="ltr" placeholder="0.00" required>
      </label>
      <label class="field"><span>اسم الحملة (اختياري)</span>
        <input name="campaign" class="input" list="ad-spend-campaigns" maxlength="80" autocomplete="off" dir="auto"
          value="${filters.campaign}" aria-describedby="ad-spend-campaign-help">
      </label>
      <datalist id="ad-spend-campaigns">${campaigns.map((name) => html`<option value="${name}"></option>`)}</datalist>
      <p id="ad-spend-campaign-help" class="ad-report-note">استخدم اسم UTM للحملة. لو سيبت الاسم فاضي، الصرف يدخل في «كل الحملات» كصرف غير مخصّص.</p>
      <p class="ad-report-note">الحفظ بيستبدل المبلغ المسجّل لنفس اليوم والحملة.</p>
      <p class="ad-report-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">احفظ الصرف</button>
    </form>`,
    onMount(box) {
      const form = $('form', box);
      const alert = $('[role="alert"]', form);
      const submitButton = $('button[type="submit"]', form);
      const showError = (message, field) => {
        alert.textContent = message;
        alert.hidden = false;
        field?.setAttribute('aria-invalid', 'true');
        field?.focus();
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        if (submitButton.disabled) return;
        alert.hidden = true;
        const { date: dateInput, amount, campaign: campaignInput } = form.elements;
        for (const input of [dateInput, amount, campaignInput]) input.removeAttribute('aria-invalid');
        const date = dateInput.value;
        const campaign = campaignInput.value.trim();
        const amountMinor = amountInPiastres(amount.value);
        if (!Number.isFinite(dayValue(date)) || date > today) return showError('اختار يوم صحيح لحد النهارده.', dateInput);
        if (amountMinor === null) return showError('اكتب مبلغ صحيح بالجنيه لحد مليار جنيه وبحد أقصى رقمين بعد العلامة العشرية.', amount);
        if (!validCampaign(campaign)) return showError('اكتب اسم UTM صالح للحملة أو سيبه فاضي.', campaignInput);

        void withBusy(submitButton, async () => {
          onSaving(true);
          let response;
          try {
            response = await call('ads.spend_save', { date, campaign, amountMinor });
          } finally {
            onSaving(false);
          }
          if (response.outcome === 'unknown_operation') {
            onUnavailable();
            showError('تسجيل صرف الإعلانات لسه مش متاح على الخادم الحالي.');
          } else if (response.outcome !== 'saved') {
            showError(outcomeMessage(response));
          } else {
            const restoreFocus = box.isConnected;
            if (restoreFocus) closeLayer();
            onSaved(restoreFocus);
          }
        });
      };
    },
  });
}

export function renderAdTracking(el) {
  const today = cairoToday();
  const firstDay = new Date(dayValue(today) - 6 * dayMs).toISOString().slice(0, 10);
  let filters = { from: firstDay, to: today, campaign: '' };
  let campaigns = [];
  let reportReady = false;
  let reportRequest = 0;
  let savingSpend = false;
  let spendUnavailable = false;
  render(el, html`<div class="ad-report">
    <section class="card" aria-labelledby="ad-report-filter-title">
      <div class="ad-report-section-head ad-report-filter-head">
        <h3 id="ad-report-filter-title">الفترة والحملة</h3>
        <button class="btn btn-soft" type="button" data-ad-spend disabled>${icon('plus')} سجّل الصرف</button>
      </div>
      <form class="ad-report-filters" novalidate>
        <label class="field"><span>من يوم</span>
          <input name="from" class="input" type="date" value="${firstDay}" max="${today}" data-nodirty required>
        </label>
        <label class="field"><span>إلى يوم</span>
          <input name="to" class="input" type="date" value="${today}" max="${today}" data-nodirty required>
        </label>
        <div class="field ad-report-campaign"><label for="ad-report-campaign">الحملة</label>
          <select id="ad-report-campaign" name="campaign" class="select" data-nodirty><option value="">كل الحملات</option></select>
        </div>
        <button class="btn btn-primary" type="submit">عرض التقرير</button>
        <p class="ad-report-error" role="alert" data-ad-filter-error hidden></p>
      </form>
    </section>
    <div class="ad-report-results" data-ad-results></div>
  </div>`);

  const form = $('form', el);
  const submitButton = $('button[type="submit"]', form);
  const spendButton = $('[data-ad-spend]', el);
  const results = $('[data-ad-results]', el);
  const filterError = $('[data-ad-filter-error]', form);

  function updateSpendButton() {
    spendButton.disabled = !reportReady || spendUnavailable || savingSpend;
  }

  async function load() {
    const applied = filters;
    const request = ++reportRequest;
    reportReady = false;
    submitButton.disabled = true;
    updateSpendButton();
    render(results, html`<p class="card ad-report-note" role="status">بنحمّل تقرير الإعلانات…</p>`);
    const response = await call('ads.stats', applied);
    if (!el.isConnected || request !== reportRequest) return;
    submitButton.disabled = false;
    if (response.outcome !== 'ok' || !response.data?.total) {
      render(results, html`<p class="card ad-report-error" role="alert">${response.outcome === 'unknown_operation'
        ? unavailableMessage : outcomeMessage(response)}</p>`);
      return;
    }
    const select = form.elements.campaign;
    const selection = select.value;
    campaigns = [...new Set([...(response.data.campaigns || []), applied.campaign, selection])].filter(Boolean);
    render(select, html`<option value="">كل الحملات</option>
      ${campaigns.map((name) => html`<option value="${name}">${name}</option>`)}`);
    select.value = selection;
    render(results, report(response.data, applied));
    reportReady = true;
    updateSpendButton();
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const { from, to, campaign } = Object.fromEntries(new FormData(form));
    const duration = (dayValue(to) - dayValue(from)) / dayMs + 1;
    if (!Number.isFinite(duration) || duration < 1 || duration > 366 || to > today) {
      filterError.textContent = 'اختار فترة من يوم إلى 366 يوم، لحد النهارده.';
      filterError.hidden = false;
      return;
    }
    filterError.hidden = true;
    filters = { from, to, campaign };
    void load();
  };

  spendButton.onclick = () => openSpendSheet({
    today, filters, campaigns,
    onSaving(pending) {
      savingSpend = pending;
      updateSpendButton();
    },
    onSaved(restoreFocus) {
      if (!el.isConnected) return;
      done('تم تسجيل الصرف');
      void load().then(() => {
        if (restoreFocus && el.isConnected && document.activeElement === document.body) {
          (spendButton.disabled ? submitButton : spendButton).focus({ preventScroll: true });
        }
      });
    },
    onUnavailable() {
      spendUnavailable = true;
      updateSpendButton();
    },
  });
  void load();
}
