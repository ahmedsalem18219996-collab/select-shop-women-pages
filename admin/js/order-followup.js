import { t } from './i18n.js';
import { $, $$, closeLayer, date, done, fail, fmtNum, html, icon, money, render, sheet, withBusy } from './ui.js';

const STATUSES = {
  not_called: { text: 'لسه', tone: 'plain' },
  confirmed: { text: 'اتأكد', tone: 'ok' },
  no_answer: { text: 'مفيش رد', tone: 'warn' },
  declined: { text: 'رفض التأكيد', tone: 'danger' },
};
const ATTEMPT_RESULTS = ['confirmed', 'no_answer', 'declined'];
const REASONS = {
  changed_mind: 'غيّرت رأيها', price: 'السعر', found_cheaper: 'لقت أرخص', no_answer: 'ما ردتش',
  wrong_address: 'العنوان غلط', size_colour: 'المقاس أو اللون', other: 'تانية',
};
const NOTE_LIMIT = 500;
const UNAVAILABLE = new Set(['unknown_operation', 'not_found']);

export function egyptianMobile(value) {
  const input = String(value ?? '').trim()
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
  if (!/^\+?[\d\s().-]+$/.test(input)) return null;
  const number = input.replace(/[\s().-]/g, '');
  const match = /^(?:\+20|0020|20|0)?(1[0125]\d{8})$/.exec(number);
  return match ? '20' + match[1] : null;
}

export function snapshotItems(order) {
  const groups = Array.isArray(order.groups) ? order.groups : [];
  const grouped = groups.flatMap(group => Array.isArray(group?.items) ? group.items : []);
  return grouped.length ? grouped : (Array.isArray(order.items) ? order.items : []);
}

function orderLine(item) {
  const choices = item.option_selections || [];
  const nameOf = choice => String(choice.name || '').trim().toLowerCase();
  const color = choices.find(choice => /^(?:ال)?(?:لون|ألوان|الوان)$|^colou?rs?$/.test(nameOf(choice)));
  const size = choices.find(choice => /^(?:ال)?مقاس(?:ات)?$|^sizes?$/.test(nameOf(choice)));
  return [item.product_title || item.product_public_code || 'المنتج',
    color?.value && `لون ${color.value}`, size?.value && `مقاس ${size.value}`,
    ...choices.filter(choice => choice !== size && choice !== color).map(choice => choice.value),
    Number(item.quantity) > 1 && `عدد ${item.quantity}`].filter(Boolean).join(' ');
}

export function followupScripts(order, callerName = '') {
  const items = snapshotItems(order).map(orderLine).join('، و') || order.public_order_code || 'حضرتك';
  const amount = order.grand_total_minor;
  const total = Number.isSafeInteger(amount) && amount >= 0 ? `${(amount / 100).toFixed(2).replace(/\.?0+$/, '')} جنيه` : '';
  const cod = order.payment_method === 'cod';
  const caller = callerName.trim() ? `${callerName.trim()} من SELECT SHOP` : 'فريق SELECT SHOP';
  const callTotal = total ? `، والإجمالي ${total}` : '';
  const whatsAppTotal = total ? ` الإجمالي ${total}${cod ? ' دفع عند الاستلام وتعاينيه قبل ما تدفعي' : ''}.` : '';
  const payment = cod ? '، دفع عند الاستلام وتقدري تعاينيه قبل ما تدفعي' : '';
  const address = order.delivery_address ? `. العنوان ${order.delivery_address}، مظبوط؟` : '، مظبوط؟';
  return {
    call: `أهلًا يا فندم، معاكي ${caller}. حضرتك سجّلتي طلب ${items}${callTotal}${payment}${address}`,
    whatsapp: `أهلًا ${order.buyer_name || 'يا فندم'}، حاولت أتصل بحضرتك بخصوص طلب ${items}.${whatsAppTotal} اكتبيلي "تأكيد" هنا لو البيانات مظبوطة، أو قوليلي لو عايزة تغيّري لون أو مقاس.`,
  };
}

function callState(result, code) {
  const state = result?.data;
  return state?.code === code && Object.hasOwn(STATUSES, state.status) && Number.isSafeInteger(state.version) ? state : null;
}

function contactLinks(order) {
  const phone = egyptianMobile(order.buyer_phone);
  if (!phone) return html`<p class="muted">رقم الموبايل المصري غير متاح.</p>`;
  const message = new URLSearchParams({ text: followupScripts(order).whatsapp });
  return html`<div class="row">
    <a class="btn btn-soft" style="min-height:44px" href="tel:+${phone}">اتصال</a>
    <a class="btn btn-soft" style="min-height:44px" href="https://wa.me/${phone}?${message.toString()}" target="_blank" rel="noopener noreferrer">واتساب</a>
  </div>`;
}

function summary(state) {
  const status = STATUSES[state.status];
  const last = state.lastAttemptAt && Number.isFinite(Date.parse(state.lastAttemptAt));
  return html`<div class="row" role="status">
    <span class="badge ${status.tone}">${status.text}</span>
    <span class="muted">المحاولات ${fmtNum(state.attempts)}</span>
    ${last ? html`<span class="muted">آخر محاولة <time datetime="${state.lastAttemptAt}">${date(state.lastAttemptAt)}</time></span>` : html`<span class="muted">لسه مفيش محاولات</span>`}
  </div>`;
}

export function chooseOrderReason(title, okText, hint = '') {
  return new Promise(resolve => {
    const box = sheet({
      title,
      body: html`${hint ? html`<p style="margin:0">${hint}</p>` : ''}<form id="order-reason-form"><label class="field"><span>السبب</span>
        <select class="select" name="reason" required data-nodirty><option value="">اختاري السبب</option>
          ${Object.entries(REASONS).map(([value, text]) => html`<option value="${value}">${text}</option>`)}
        </select></label></form>`,
      foot: html`<button type="button" class="btn btn-ghost" data-close>${t('app.cancel')}</button>
        <button type="submit" class="btn btn-danger" form="order-reason-form">${okText}</button>`,
    });
    $('form', box).onsubmit = event => {
      event.preventDefault();
      const reason = event.currentTarget.elements.reason.value;
      closeLayer();
      resolve(reason);
    };
    $$('[data-close]', document.getElementById('layer')).forEach(button => button.addEventListener('click', () => resolve(null)));
    box.addEventListener('keydown', event => { if (event.key === 'Escape') resolve(null); });
  });
}

export function mountOrderFollowup(section, { order, canManage, call, callerName = '' }) {
  const code = order.public_order_code;
  let loaded;
  render(section, html`<div class="card-head" style="margin-bottom:0"><h3>تأكيد المكالمة</h3></div>
    ${contactLinks(order)}
    <details><summary style="min-height:44px;align-content:center;cursor:pointer">نص المكالمة</summary>
      <div class="stack">
        <label class="field"><span>الاسم في المكالمة</span><input class="input" data-caller data-nodirty value="${callerName}" maxlength="80" autocomplete="off"></label>
        <p data-call-script style="margin:0;overflow-wrap:anywhere">${followupScripts(order, callerName).call}</p>
      </div>
    </details>
    <div class="stack" data-call-state></div>`);
  const caller = $('[data-caller]', section);
  caller.oninput = () => { $('[data-call-script]', section).textContent = followupScripts(order, caller.value).call; };
  const target = $('[data-call-state]', section);
  const paint = (state, draft) => {
    const reason = Object.hasOwn(REASONS, state.reason) ? REASONS[state.reason] : '';
    render(target, html`${summary(state)}
      ${reason ? html`<p class="muted" style="margin:0">${state.reasonType === 'returned' ? 'سبب رفض الاستلام أو الإرجاع' : 'سبب الإلغاء'} <b>${reason}</b></p>` : ''}
      ${canManage ? html`<form class="stack">
        <label class="field"><span>حالة المكالمة</span><select class="select" name="status" style="min-height:44px">
          ${Object.entries(STATUSES).map(([key, status]) => html`<option value="${key}" ${key === state.status ? 'selected' : ''}>${status.text}</option>`)}</select></label>
        <label class="field"><span>ملاحظة المكالمة</span><textarea class="input" name="note" rows="2" aria-describedby="call-note-length"></textarea></label>
        <small class="muted" id="call-note-length"></small>
        <div class="row">
          <button type="submit" class="btn btn-primary" style="min-height:44px" data-attempt>سجّل محاولة</button>
          <button type="submit" class="btn btn-soft" style="min-height:44px" data-save>احفظ التعديل</button>
        </div>
      </form>` : state.note ? html`<p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${state.note}</p>` : ''}`);
    const form = $('form', target);
    if (!form) return;
    const { note, status } = form.elements;
    note.value = draft ?? state.note ?? '';
    const attemptButton = $('[data-attempt]', form);
    const update = () => {
      const length = Array.from(note.value).length;
      $('#call-note-length', form).textContent = `${fmtNum(length)} من ${fmtNum(NOTE_LIMIT)} حرف`;
      note.setCustomValidity(length > NOTE_LIMIT ? 'الملاحظة لازم تكون ٥٠٠ حرف أو أقل.' : '');
      attemptButton.disabled = status.value === 'not_called';
    };
    note.oninput = update;
    status.onchange = update;
    update();
    let saving = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving) return;
      const button = event.submitter || $('[data-save]', form);
      const attempt = button === attemptButton;
      const value = note.value;
      const selected = status.value;
      saving = true;
      $$('button, select, textarea', form).forEach(control => { control.disabled = true; });
      const result = await withBusy(button, () => call('orders.call_save', { code, version: state.version, note: value, status: selected, attempt }));
      if (!target.isConnected) return;
      const latest = callState(result, code);
      if (result.outcome === 'saved' && latest) {
        paint(latest);
        done();
        $(`[data-${attempt ? 'attempt' : 'save'}]`, target)?.focus();
      } else if (result.outcome === 'conflict' && latest) {
        paint(latest, value === (state.note ?? '') ? undefined : value);
        fail(result);
        $('[name="status"]', target)?.focus();
      } else {
        saving = false;
        $$('button, select, textarea', form).forEach(control => { control.disabled = false; });
        update();
        fail(result);
      }
    };
  };
  const load = () => {
    render(target, html`<p class="muted" role="status" style="margin:0">بنحمّل حالة المكالمة…</p>`);
    loaded = call('orders.call_get', { code }).then(result => {
      if (target.isConnected) {
        const state = callState(result, code);
        if (state && result.outcome === 'ok') paint(state);
        else if (UNAVAILABLE.has(result.outcome)) target.remove();
        else {
          render(target, html`<p class="muted" role="alert" style="margin:0">تعذّر تحميل حالة المكالمة.</p>
            <div><button type="button" class="btn btn-soft">${t('app.retry')}</button></div>`);
          $('button', target).onclick = load;
        }
      }
      return !UNAVAILABLE.has(result.outcome);
    });
  };
  load();
  return () => loaded;
}

export function mountTodayCalls(section, { canManage, call }) {
  const limit = 10;
  const title = 'اتصالات النهارده';
  let rows = [];
  let offset = 0;
  let hasMore = false;
  let loading = false;
  let saving = false;
  render(section, html`<div class="card-head" style="margin-bottom:0"><h3 tabindex="-1">${title}</h3>${icon('clock')}</div>
    <div class="stack" data-queue-rows></div>
    <div data-queue-footer></div>`);
  const list = $('[data-queue-rows]', section);
  const footer = $('[data-queue-footer]', section);
  const heading = $('h3', section);
  const paint = () => {
    render(list, rows.length ? html`<ol class="stack" style="list-style:none;padding:0;margin:0">
      ${rows.map(({ order, call: state }) => html`<li class="stack" style="border-top:1px solid var(--line);padding-top:12px;min-width:0;overflow-wrap:anywhere">
        <div class="row" style="justify-content:space-between"><a class="rowlink" href="#/orders/${encodeURIComponent(order.public_order_code)}"><b>${order.buyer_name || order.public_order_code}</b></a><b class="num">${money(order.grand_total_minor)}</b></div>
        <p class="muted" style="margin:0"><span class="code">${order.public_order_code}</span> · <time datetime="${order.created_at}">${date(order.created_at)}</time></p>
        <p style="margin:0">${snapshotItems(order).map(orderLine).join('، و')}</p>
        ${summary(state)}
        ${state.note ? html`<p class="muted" style="margin:0;white-space:pre-wrap">${state.note}</p>` : ''}
        ${contactLinks(order)}
        ${canManage ? html`<div class="row" role="group" aria-label="سجّل نتيجة المكالمة ${order.public_order_code}">
          ${ATTEMPT_RESULTS.map(status => html`<button type="button" class="btn ${status === 'confirmed' ? 'btn-primary' : 'btn-ghost'}" style="min-height:44px" data-code="${order.public_order_code}" data-result="${status}">${STATUSES[status].text}</button>`)}
        </div>` : ''}
      </li>`)}
    </ol>` : html`<p class="muted" role="status" style="margin:0">مفيش طلبات مستنية اتصال.</p>`);
    $$('[data-result]', list).forEach(button => { button.onclick = () => save(button); });
  };
  const load = async (reset = false) => {
    if (loading) return;
    loading = true;
    render(footer, html`<p class="muted" role="status" style="margin:0">بنحمّل اتصالات النهارده…</p>`);
    $$('button', list).forEach(button => { button.disabled = true; });
    const result = await call('orders.calls_today', { limit, offset: reset ? 0 : offset });
    if (!section.isConnected) return;
    loading = false;
    if (UNAVAILABLE.has(result.outcome)) { section.remove(); return; }
    if (result.outcome !== 'ok' || !Array.isArray(result.data?.rows)) {
      render(footer, html`<p class="muted" role="alert">تعذّر تحميل اتصالات النهارده.</p><button type="button" class="btn btn-soft">${t('app.retry')}</button>`);
      $('button', footer).onclick = () => load(reset);
      $$('button', list).forEach(button => { button.disabled = false; });
      return;
    }
    const page = result.data.rows;
    rows = reset ? page : rows.concat(page.filter(row => !rows.some(existing => existing.order.public_order_code === row.order.public_order_code)));
    offset = (reset ? 0 : offset) + page.length;
    hasMore = result.data.hasMore === true;
    paint();
    render(footer, hasMore ? html`<button type="button" class="btn btn-soft" style="min-height:44px">طلبات أكتر</button>` : '');
    const more = $('button', footer);
    if (more) more.onclick = () => load();
  };
  const save = async button => {
    const { code, result: status } = button.dataset;
    const row = rows.find(entry => entry.order.public_order_code === code);
    if (!row || saving || loading) return;
    saving = true;
    $$('button', section).forEach(control => { control.disabled = true; });
    const result = await withBusy(button, () => call('orders.call_save', { code, version: row.call.version, note: row.call.note ?? '', status, attempt: true }));
    if (!section.isConnected) return;
    const latest = callState(result, code);
    saving = false;
    if ((result.outcome === 'saved' || result.outcome === 'conflict') && latest) {
      result.outcome === 'saved' ? done() : fail(result);
      if (latest.status === 'not_called' || latest.status === 'no_answer') {
        row.call = latest;
        paint();
        const replacement = $$('[data-result]', list).find(control => control.dataset.code === code && control.dataset.result === status);
        replacement?.focus();
      } else {
        rows = rows.filter(entry => entry !== row);
        paint();
        heading.focus({ preventScroll: true });
        // Refetch the oldest page after a row leaves the queue so offset paging cannot skip the next order.
        if (hasMore) { await load(true); return; }
      }
    } else fail(result);
    $$('button', section).forEach(control => { control.disabled = false; });
  };
  return load();
}
