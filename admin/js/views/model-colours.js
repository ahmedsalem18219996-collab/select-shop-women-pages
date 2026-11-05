// Step 2 «الألوان والصور» and step 3 «المعاينة والنشر» of the product editor.
// One model = real colour × size Variants. Every change goes through the planners in colour-model.js
// (tested), runs in order with the structure token, and the screen reloads from the server afterwards,
// so what is shown is what was saved. Nothing here deletes a colour, size, photo, order or code:
// colours and sizes are retired (set inactive), photos are only hidden from the media tab.
import { html, render, $, $$, icon, money, toMinor, withBusy, island, done, fail, confirmDialog } from '../ui.js';
import { call, mediaUrl } from '../api.js';
import { uploadPhotos, uploadSummary } from '../photo-upload.js';
import { colourModel, checkDrafts, planNewModel, planAddColour, planSizes, planColourPrice, planColourAvailability, photoTarget, runSteps, ONE_SIZE } from '../colour-model.js';
import { loadCosts, saveCost, costOf, profitText } from '../profit.js';
import { PALETTE, hexOf, normName } from '../../../js/colour-palette.js';

const COMMON_SIZES = ['S', 'M', 'L', 'XL', 'XXL', ONE_SIZE];
const img = (m) => mediaUrl(/^media\//.test(m.storage_path) ? 'product-media/' + m.storage_path : m.storage_path);
const swatch = (hex, name) => html`<span class="swatch" style="--sw:${hex || 'transparent'}" ${hex ? '' : 'data-unknown'} aria-hidden="true" title="${name}"></span>`;
const allMedia = (d) => [...(d.media?.media || [])].filter((m) => !m.delete_pending).sort((a, b) => a.position - b.position);
const priceOf = (c, base) => (Number.isInteger(c.priceMinor) ? c.priceMinor : base);

/** Runs a plan with a visible step list; returns true when every step was saved. */
async function apply(steps, { ctx, p, code, list }) {
  if (!steps.length) { done('مفيش تغيير يتحفظ.'); return true; }
  list.replaceChildren(); list.hidden = false;
  const items = steps.map((s) => { const li = document.createElement('li'); li.textContent = '… ' + s.label; list.append(li); return li; });
  const r = await runSteps(steps, { call, code, version: p.structure_version, can: ctx.can,
    onStep: (i, s, state) => { items[i].textContent = (state === 'ok' ? '✓ ' : state === 'failed' ? '✗ ' : '… ') + s.label; } });
  if (r.ok) return true;
  if (r.res?.outcome === 'forbidden') island('error', 'صلاحيتك مش بتسمح بالخطوة «' + r.step.label + '». اطلبي من المسؤولة تكمّلها.');
  else fail(r.res);
  island('error', 'اتحفظ ' + r.at + ' من ' + steps.length + ' خطوة، ووقفنا عند «' + r.step.label + '». اللي اتحفظ ما اتلغاش؛ حدّثي الصفحة وكمّلي.');
  return false;
}

// ---------------------------------------------------------------- drafts (new model or one more colour)
function draftCard(dr, i, { canPrice }) {
  return html`<article class="card stack colour-card" data-draft="${i}">
    <div class="row">${swatch(hexOf(dr.name), dr.name)}<b>${dr.name || 'لون ' + (i + 1)}</b><span class="space"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-drop-draft="${i}">${icon('x')}شيلي اللون ده</button></div>
    <div class="grid2">
      <label class="field"><span>اسم اللون</span><input class="input" data-d-name value="${dr.name}" list="palette-names" maxlength="40" placeholder="مثال: بيبي بلو"><small>اختاري من القائمة علشان يظهر لون الدائرة صح للعميلة، أو اكتبي اسم جديد.</small></label>
      ${canPrice ? html`<label class="field"><span>سعر خاص للون (اختياري)</span><div class="input-money"><input data-d-price inputmode="decimal" value="${dr.priceMinor ? dr.priceMinor / 100 : ''}" placeholder="فاضي = السعر الأساسي"><span>EGP</span></div></label>` : ''}
    </div>
    <div class="field"><span>المقاسات المتاحة للون ده</span>
      <div class="chips" style="flex-wrap:wrap">${[...new Set([...COMMON_SIZES, ...dr.sizes])].map((s) => html`<button type="button" class="chip" data-d-size="${s}" aria-pressed="${dr.sizes.includes(s)}">${s}</button>`)}</div>
      <input class="input" data-d-custom maxlength="18" placeholder="مقاس تاني؟ اكتبيه واضغطي Enter (مثال: 38)"></div>
    <label class="switch"><input type="checkbox" data-d-avail ${dr.available ? 'checked' : ''}><i></i>متاح عند المورد</label>
  </article>`;
}

function mountDrafts(box, drafts, { canPrice, onSave, saveText, single = false }) {
  const paint = () => {
    render(box, html`<datalist id="palette-names">${PALETTE.map((c) => html`<option value="${c.name}"></option>`)}</datalist>
      <div class="stack">${drafts.map((dr, i) => draftCard(dr, i, { canPrice }))}</div>
      <div class="row" style="flex-wrap:wrap"><button type="button" class="btn btn-soft" data-add-draft ${single && drafts.length ? 'hidden' : ''}>${icon('plus')}إضافة لون</button><span class="space"></span>
        <button type="button" class="btn btn-primary" data-save-drafts ${drafts.length ? '' : 'disabled'}>${saveText}</button></div>
      <p class="err" data-draft-error role="alert" aria-live="polite" hidden></p><ol class="blockers" data-steps hidden></ol>`);
  };
  const at = (el) => drafts[+el.closest('[data-draft]').dataset.draft];
  box.addEventListener('input', (e) => {
    const dr = e.target.closest('[data-draft]') && at(e.target); if (!dr) return;
    if (e.target.matches('[data-d-name]')) { dr.name = e.target.value; const sw = $('.swatch', e.target.closest('[data-draft]')); const hex = hexOf(dr.name); sw.style.setProperty('--sw', hex || 'transparent'); sw.toggleAttribute('data-unknown', !hex); }
    if (e.target.matches('[data-d-price]')) { const v = e.target.value.trim(); dr.priceMinor = v ? (toMinor(v) ?? -1) : null; }
    if (e.target.matches('[data-d-avail]')) dr.available = e.target.checked;
  });
  box.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-d-custom]') || e.key !== 'Enter') return;
    e.preventDefault();
    const dr = at(e.target), v = e.target.value.trim();
    if (v && !dr.sizes.includes(v)) { dr.sizes = dr.sizes.filter((s) => s !== ONE_SIZE).concat(v); paint(); }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-add-draft]')) { drafts.push({ name: '', sizes: [], priceMinor: null, available: true }); paint(); $$('[data-d-name]', box).at(-1)?.focus(); return; }
    if (b.matches('[data-drop-draft]')) { drafts.splice(+b.dataset.dropDraft, 1); paint(); return; }
    if (b.matches('[data-d-size]')) {
      const dr = at(b), s = b.dataset.dSize;
      dr.sizes = dr.sizes.includes(s) ? dr.sizes.filter((x) => x !== s) : s === ONE_SIZE ? [ONE_SIZE] : dr.sizes.filter((x) => x !== ONE_SIZE).concat(s);
      paint(); return;
    }
    if (b.matches('[data-save-drafts]')) {
      const err = $('[data-draft-error]', box);
      const msg = checkDrafts(drafts.map((d) => ({ ...d, name: d.name.trim() })));
      err.textContent = msg; err.hidden = !msg;
      if (msg) return;
      await withBusy(b, () => onSave($('[data-steps]', box)));
    }
  });
  paint();
}

// ---------------------------------------------------------------- step 2
export async function coloursTab(body, { ctx, d, p, code, reload }) {
  const { can } = ctx;
  const model = colourModel(p, d.stock, d.media?.media || []);
  const media = allMedia(d);
  const costs = can('owner') ? await loadCosts(call, code) : null;
  const cost = (pos) => (costs?.ready ? costOf(costs.data, pos) : null);
  const live = model.colours.filter((c) => c.variants.length);
  const half = p.options.length && !p.variants.length;

  render(body, html`<div class="stack">
    <section class="card stack"><div class="card-head"><h3>الألوان والمقاسات والصور</h3><span class="muted">${live.length} لون</span></div>
      <p class="muted" style="margin:0">كل لون ليه صوره ومقاساته وسعره الخاص لو موجود. لما العميلة تختار اللون، الصور والمقاسات والسعر بتتغير معاه. المخزون افتراضي: «متاح عند المورد» معناه بنقبل الأوردر وبنشتري بعده.</p>
      ${!model.canAddColour ? html`<p class="note" role="note"><b>موديل قديم من غير اختيار لون.</b> تقدري تعدّلي صوره وسعره وتوافره من هنا. إضافة ألوان على نفس الكود مش مسموحة من قاعدة البيانات بعد ما اتعمل له مقاس؛ لو عايزة ألوان، اعملي موديل جديد. الكود والأوردرات واللينكات القديمة زي ما هي، ومفيش دمج أو حذف تلقائي.</p>` : ''}
      ${half ? html`<p class="note" role="note">الموديل ده عليه خيارات من غير مقاسات جاهزة (غالبًا الحفظ اتقطع). كمّلي من تبويب «المقاسات والمخزون» بزر «إنشاء كل التوليفات».</p>` : ''}
      ${can('owner') && costs && !costs.ready ? html`<p class="note" role="note">${costs.missing ? 'تكلفة المورد والربح محتاجين تفعيل من السيرفر (التعديل جاهز للمراجعة). الأسعار والصور شغالة عادي.' : 'تعذّر تحميل تكلفة المورد دلوقتي. باقي الشاشة شغالة.'}</p>` : ''}
    </section>
    ${live.map((c, ci) => colourCard(c, ci, { model, media, can, cost, costsReady: costs?.ready }))}
    ${can('products.edit') && model.canAddColour && !half ? html`<section class="card stack" data-new-colours><div class="card-head"><h3>${live.length ? 'إضافة لون جديد' : 'ابدئي بأول لون'}</h3></div><div data-drafts></div></section>` : ''}
  </div>`);

  // New colours: on a fresh draft all colours are saved together (options must exist before any Variant).
  const draftsBox = $('[data-drafts]', body);
  if (draftsBox) {
    const fresh = !p.variants.length;
    const drafts = fresh ? [{ name: '', sizes: [], priceMinor: null, available: true }] : [];
    mountDrafts(draftsBox, drafts, {
      canPrice: can('products.price'),
      saveText: fresh ? 'احفظي الألوان والمقاسات' : 'احفظي اللون الجديد',
      single: !fresh,
      onSave: async (list) => {
        const clean = drafts.map((x) => ({ ...x, name: x.name.trim() }));
        let steps;
        if (fresh) steps = planNewModel(clean, model.base);
        else {
          // An existing model gets one colour per save; the screen reloads with the new positions before the next.
          if (clean.length !== 1) { island('error', 'ضيفي لون واحد في المرة، احفظيه، وبعدها ضيفي اللي بعده.'); return; }
          if (model.colours.some((c) => normName(c.name) === normName(clean[0].name))) { island('error', 'اللون ده موجود بالفعل في الموديل. لو متوقف، رجّعيه من الكارت بتاعه.'); return; }
          steps = planAddColour(model, clean[0]);
        }
        if (await apply(steps, { ctx, p, code, list })) { done('اتحفظت الألوان. ارفعي صور كل لون من الكارت بتاعه.'); reload(); }
      },
    });
  }

  body.addEventListener('change', async (e) => {
    const card = e.target.closest('[data-colour]'); if (!card) return;
    const c = live[+card.dataset.colour];
    if (e.target.matches('[data-upload]')) {
      const files = [...e.target.files]; e.target.disabled = true;
      try {
        const res = await uploadPhotos({ files, code, title: p.title + ' - ' + (c.name || 'الموديل'), version: d.media?.structure_version ?? p.structure_version,
          grid: $('.thumbs', card), before: $('.thumb-add', card), fields: photoTarget(c) });
        if (!res.total) return;
        if (res.ok === res.total) done('اترفعت ' + res.ok + ' صورة للون ' + (c.name || 'الموديل') + '.'); else island('error', uploadSummary(res));
        if (res.ok) reload();
      } finally { if (document.contains(e.target)) { e.target.disabled = false; e.target.value = ''; } }
    }
    if (e.target.matches('[data-c-avail]')) {
      const ok = await apply(planColourAvailability(c, e.target.checked), { ctx, p, code, list: $('[data-steps]', card) });
      if (ok) { done(); reload(); } else e.target.checked = !e.target.checked;
    }
  });

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); const card = b?.closest('[data-colour]'); if (!card) return;
    const c = live[+card.dataset.colour], list = $('[data-steps]', card);
    if (b.matches('[data-c-size]')) {
      const s = b.dataset.cSize, on = b.getAttribute('aria-pressed') !== 'true';
      if (on && s === ONE_SIZE) $$('[data-c-size]', card).forEach((x) => x.setAttribute('aria-pressed', 'false'));
      if (on && s !== ONE_SIZE) $(`[data-c-size="${ONE_SIZE}"]`, card)?.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', String(on)); return;
    }
    const run = async (steps, text) => withBusy(b, async () => { if (await apply(steps, { ctx, p, code, list })) { done(text); reload(); } });
    if (b.matches('[data-save-sizes]')) {
      const wanted = $$('[data-c-size][aria-pressed="true"]', card).map((x) => x.dataset.cSize);
      const extra = $('[data-c-custom]', card).value.trim(); if (extra) wanted.push(extra);
      if (!wanted.length) { island('error', 'سيبي مقاس واحد على الأقل للون، أو وقّفي اللون كله.'); return; }
      await run(planSizes(model, c, wanted), 'اتحفظت مقاسات اللون.');
    }
    if (b.matches('[data-save-cprice]')) {
      const v = $('[data-c-price]', card).value.trim(), amount = v ? toMinor(v) : null;
      if (v && (amount === null || amount < 100)) { island('error', 'اكتبي السعر بالجنيه، مثلًا 650، أو سيبيه فاضي علشان ياخد السعر الأساسي.'); return; }
      await run(planColourPrice(c, amount === model.base ? null : amount), 'اتحفظ سعر اللون.');
    }
    if (b.matches('[data-retire]')) {
      if (!(await confirmDialog({ title: 'وقف اللون ' + c.name, text: 'اللون هيختفي من المتجر للطلبات الجديدة. الأوردرات القديمة والصور والكود زي ما هم، وتقدري ترجّعيه بعدين.', okText: 'وقّفي اللون', danger: true }))) return;
      await run([{ label: 'وقف اللون', op: 'products.structure', args: { change: { op: 'set_value_active', option: c.optionPosition, value: c.valuePosition, active: false } }, need: 'products.edit' }], 'اللون اتوقف.');
    }
    if (b.matches('[data-restore]')) await run([{ label: 'رجوع اللون', op: 'products.structure', args: { change: { op: 'set_value_active', option: c.optionPosition, value: c.valuePosition, active: true } }, need: 'products.edit' }], 'اللون رجع.');
    if (b.matches('[data-first]')) {
      // The colour's first photo is its cover in the store: move this one before the colour's current first photo.
      const id = b.dataset.first, ids = media.map((m) => m.media_id).filter((x) => x !== id);
      ids.splice(ids.indexOf(c.media[0].media_id), 0, id);
      const r = await withBusy(b, () => call('media.reorder', { code, media_ids: ids }));
      if (r.outcome === 'saved') { done('بقت أول صورة للون.'); reload(); } else fail(r);
    }
    if (b.matches('[data-save-cost]')) {
      // Cost is Owner-only and never part of the public product. Updating it never changes a price.
      const inputs = $$('[data-cost]', card), jobs = [];
      for (const inp of inputs) {
        const v = inp.value.trim(), amount = v ? toMinor(v) : null, pos = Number(inp.dataset.cost);
        if (v && (amount === null || amount < 1)) { island('error', 'التكلفة لازم تكون رقم بالجنيه، مثلًا 350.'); inp.focus(); return; }
        if (amount !== cost(pos)) jobs.push([pos, amount]);
      }
      if (!jobs.length) { done('مفيش تغيير في التكلفة.'); return; }
      await withBusy(b, async () => {
        for (const [pos, amount] of jobs) { const r = await saveCost(call, code, pos, amount); if (r.outcome !== 'saved') { fail(r); return; } }
        done('اتحفظت التكلفة. السعر ما اتغيرش.'); reload();
      });
    }
  });
  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-cost], [data-c-price]')) return;
    const card = e.target.closest('[data-colour]'), c = live[+card.dataset.colour];
    const sell = toMinor($('[data-c-price]', card)?.value.trim() || '') ?? priceOf(c, model.base);
    for (const out of $$('[data-profit]', card)) {
      const v = $(`[data-cost="${out.dataset.profit}"]`, card)?.value.trim();
      const t = profitText(sell, v ? toMinor(v) : null, money); out.textContent = t.text; out.dataset.kind = t.kind;
    }
  });
}

function colourCard(c, ci, { model, media, can, cost, costsReady }) {
  const live = c.variants.filter((v) => v.active);
  const sell = priceOf(c, model.base);
  const photos = c.media.length ? c.media : [];
  const sizes = [...new Set([...COMMON_SIZES, ...c.variants.map((v) => v.size ?? ONE_SIZE)])];
  return html`<article class="card stack colour-card ${c.active ? '' : 'retired'}" data-colour="${ci}">
    <div class="row" style="flex-wrap:wrap">${swatch(c.hex, c.name)}<h3 style="margin:0">${c.name || 'الموديل (لون واحد)'}</h3>
      <span class="badge ${!c.active ? '' : c.available ? 'ok' : 'warn'}">${!c.active ? 'متوقف' : c.available ? 'متاح عند المورد' : 'مش متاح'}</span>
      <span class="space"></span><b class="num">${sell === null ? 'السعر ناقص' : money(sell)}</b></div>
    <div class="field"><span>صور اللون ${photos.length ? '(' + photos.length + ')' : '— لسه ناقصة'}</span>
      <div class="thumbs">${photos.map((m, i) => html`<figure class="thumb ${m.hidden ? 'hidden' : ''}"><img src="${img(m)}" alt="${m.alt_text || c.name}" loading="lazy" width="96" height="120">
        ${i === 0 ? html`<span class="badge ok">غلاف اللون</span>` : can('media.manage') ? html`<button type="button" class="icon-btn" data-first="${m.media_id}" aria-label="اجعليها أول صورة للون" title="اجعليها أول صورة للون">${icon('star')}</button>` : ''}</figure>`)}
        ${can('media.manage') && (c.optionPosition !== null || !model.colourOption) ? html`<label class="thumb thumb-add">${icon('upload')}<span>صور ${c.name || ''}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" data-upload></label>` : ''}</div>
      <small>تقدري تختاري كذا صورة مرة واحدة. بنضغطها WebP بجودة تحافظ على اللون وتفاصيل القماش، وكل صورة ليها حالة رفع. لو صورة فشلت، الصور القديمة زي ما هي.</small></div>
    ${model.sizeOption && can('products.edit') && c.active ? html`<div class="field"><span>المقاسات</span>
      <div class="chips" style="flex-wrap:wrap">${sizes.map((s) => html`<button type="button" class="chip" data-c-size="${s}" aria-pressed="${live.some((v) => (v.size ?? ONE_SIZE) === s)}">${s}</button>`)}</div>
      <div class="row"><input class="input" data-c-custom maxlength="18" placeholder="مقاس تاني" style="max-width:160px"><button type="button" class="btn btn-soft btn-sm" data-save-sizes>احفظي المقاسات</button></div>
      <small>شيل المقاس بيوقفه بس للطلبات الجديدة؛ الأوردرات القديمة زي ما هي.</small></div>`
      : html`<p class="muted" style="margin:0">المقاسات: ${live.map((v) => v.size ?? ONE_SIZE).join('، ') || '—'}</p>`}
    <div class="grid2">
      ${can('products.price') ? html`<label class="field"><span>سعر خاص للون</span><div class="row"><div class="input-money"><input data-c-price inputmode="decimal" value="${Number.isInteger(c.priceMinor) ? c.priceMinor / 100 : ''}" placeholder="${model.base ? model.base / 100 : ''}"><span>EGP</span></div><button type="button" class="btn btn-soft btn-sm" data-save-cprice>احفظي</button></div>
        <small>${c.priceMinor === 'mixed' ? 'المقاسات عليها أسعار مختلفة؛ الحفظ هنا هيوحّدها.' : 'فاضي = السعر الأساسي ' + (model.base ? money(model.base) : '')}</small></label>` : ''}
      ${can('inventory.manage') && c.active ? html`<label class="switch" style="align-self:center"><input type="checkbox" data-c-avail ${c.available ? 'checked' : ''}><i></i>متاح عند المورد</label>` : ''}
    </div>
    ${can('owner') && costsReady ? html`<details class="cost-box" ${live.some((v) => cost(v.position) === null) ? 'open' : ''}><summary>تكلفة المورد والربح (للمالكة بس)</summary>
      <div class="stack" style="margin-top:8px">${live.map((v) => { const k = cost(v.position); const t = profitText(v.amountMinor ?? sell, k, money); return html`<div class="row" style="flex-wrap:wrap">
        <span style="min-width:72px">${v.size ?? ONE_SIZE}</span><div class="input-money" style="max-width:140px"><input data-cost="${v.position}" inputmode="decimal" value="${k === null ? '' : k / 100}" placeholder="التكلفة" aria-label="تكلفة ${c.name} ${v.size ?? ''}"><span>EGP</span></div>
        <small data-profit="${v.position}" data-kind="${t.kind}" role="status">${t.text}</small></div>`; })}
        <div class="row"><span class="space"></span><button type="button" class="btn btn-soft btn-sm" data-save-cost>احفظي التكلفة</button></div>
        <small class="muted">الربح المبدئي = سعر البيع − تكلفة المورد. الشحن اللي بتدفعه العميلة مش ربح. التكلفة بتتحفظ مع كل أوردر وقت الطلب، فتغييرها مش بيغيّر حسابات الأوردرات القديمة.</small></div></details>` : ''}
    ${can('products.edit') && c.optionPosition !== null ? html`<div class="row"><span class="space"></span>${c.active ? html`<button type="button" class="btn btn-ghost btn-sm" data-retire>وقّفي اللون</button>` : html`<button type="button" class="btn btn-soft btn-sm" data-restore>رجّعي اللون</button>`}</div>` : ''}
    <ol class="blockers" data-steps hidden></ol>
  </article>`;
}

// ---------------------------------------------------------------- step 3
export function previewTab(body, { ctx, d, p, code }) {
  const model = colourModel(p, d.stock, d.media?.media || []);
  const colours = model.colours.filter((c) => c.active && c.variants.some((v) => v.active));
  const shared = model.shared.filter((m) => !m.hidden);
  const problems = [
    !colours.length && 'مفيش لون فيه مقاس شغال.',
    ...colours.filter((c) => c.available && !c.media.some((m) => !m.hidden) && !shared.length).map((c) => `اللون «${c.name || 'الموديل'}» مالوش صور.`),
    ...colours.filter((c) => c.available && priceOf(c, model.base) === null).map((c) => `اللون «${c.name || 'الموديل'}» مالوش سعر.`),
    !colours.some((c) => c.available) && 'ولا لون متاح عند المورد، فالعميلة مش هتقدر تطلب.',
    !p.shipping_profile && 'طريقة الشحن مش محددة.',
  ].filter(Boolean);
  let pick = Math.max(0, colours.findIndex((c) => c.available));
  const paint = () => {
    const c = colours[pick];
    const photos = c ? [...c.media.filter((m) => !m.hidden), ...shared] : shared;
    const sizes = c ? c.variants.filter((v) => v.active && v.available).map((v) => v.size ?? ONE_SIZE) : [];
    render($('[data-shop]', body), html`<div class="preview-shop">
      <div class="preview-gallery">${photos.length ? html`<img src="${img(photos[0])}" alt="${p.title}" width="320" height="400">` : html`<div class="empty">${icon('image')}<b>مفيش صور للون ده</b></div>`}
        <div class="thumbs">${photos.slice(1, 6).map((m) => html`<img src="${img(m)}" alt="" width="56" height="70" loading="lazy">`)}</div></div>
      <div class="stack"><h3 style="margin:0">${p.title}</h3><b class="num">${c && priceOf(c, model.base) !== null ? money(priceOf(c, model.base)) : '—'}</b>
        ${model.colourOption ? html`<div><small class="muted">اللون: ${c?.name || ''}</small><div class="chips" role="radiogroup" aria-label="اللون" style="flex-wrap:wrap">${colours.map((x, i) => html`<button type="button" class="chip swatch-chip" role="radio" data-pick="${i}" aria-checked="${i === pick}" aria-pressed="${i === pick}" ${x.available ? '' : 'disabled'}>${swatch(x.hex, x.name)}${x.name}</button>`)}</div></div>` : ''}
        <div><small class="muted">المقاس</small><div class="chips" style="flex-wrap:wrap">${sizes.length ? sizes.map((s, i) => html`<button type="button" class="chip" aria-pressed="${i === 0}">${s}</button>`) : html`<span class="muted">مفيش مقاس متاح للون ده</span>`}</div></div>
        <p class="muted" style="margin:0;font-size:12px">العميلة بتشوف الصور والمقاسات والسعر الخاص باللون اللي اختارته بس، وبتطلب الدفع عند الاستلام أو تضيف للسلة.</p></div></div>`);
  };
  render(body, html`<div class="stack">
    <section class="card stack"><div class="card-head"><h3>معاينة زي ما العميلة هتشوفه</h3><span class="muted">${colours.length} لون</span></div><div data-shop></div></section>
    <section class="card stack"><div class="card-head"><h3>مراجعة الألوان والصور والأسعار</h3></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>اللون</th><th>المقاسات</th><th>السعر</th><th>الصور</th><th>المورد</th></tr></thead><tbody>
      ${colours.map((c) => html`<tr><td>${swatch(c.hex, c.name)} ${c.name || 'الموديل'}</td><td>${c.variants.filter((v) => v.active).map((v) => v.size ?? ONE_SIZE).join('، ')}</td>
        <td class="num">${priceOf(c, model.base) === null ? '—' : c.priceMinor === 'mixed' ? 'أسعار مختلفة' : money(priceOf(c, model.base))}</td><td class="num">${c.media.filter((m) => !m.hidden).length}${shared.length ? ' + ' + shared.length + ' عامة' : ''}</td>
        <td>${c.available ? 'متاح' : 'مش متاح'}</td></tr>`)}</tbody></table></div>
      ${problems.length ? html`<ul class="blockers">${problems.map((x) => html`<li>${icon('alert')}${x}</li>`)}</ul>` : html`<div class="ready">كل لون ليه صور وسعر ومقاس متاح.</div>`}
      <div class="row" style="flex-wrap:wrap"><span class="space"></span>
        <button type="button" class="btn btn-soft" data-verify>حفظ مسودة</button>
        ${ctx.can('products.publish') && p.status !== 'public' && p.status !== 'archived' ? html`<button type="button" class="btn btn-primary" data-publish ${problems.length ? 'disabled' : ''}>نشر</button>` : ''}</div>
      <p class="muted" role="status" aria-live="polite" data-verified style="margin:0"></p></section></div>`);
  paint();
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-pick]')) { pick = +b.dataset.pick; paint(); return; }
    if (b.matches('[data-verify]')) {
      // Every edit is already saved as a draft; this re-reads the server and states exactly what it holds.
      const r = await withBusy(b, () => call('products.get', { code }));
      if (r.outcome !== 'ok') { fail(r); return; }
      const m = colourModel(r.data.product, r.data.stock, r.data.media?.media || []);
      const live = m.colours.filter((c) => c.active && c.variants.some((v) => v.active));
      const text = `✓ اتأكدنا من السيرفر: المنتج مسودة محفوظة بـ ${live.length} لون، ${live.reduce((n, c) => n + c.variants.filter((v) => v.active).length, 0)} مقاس، ${live.reduce((n, c) => n + c.media.length, 0) + m.shared.length} صورة. `
        + live.map((c) => `${c.name || 'الموديل'}: ${priceOf(c, m.base) === null ? 'من غير سعر' : c.priceMinor === 'mixed' ? 'أسعار مختلفة' : money(priceOf(c, m.base))}`).join(' · ');
      $('[data-verified]', body).textContent = text; done('المسودة محفوظة ومتأكدين منها.');
    }
    if (b.matches('[data-publish]')) document.querySelector('[data-pub]')?.click();
  });
}
