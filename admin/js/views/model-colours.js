// Step 2 «الألوان والصور» and step 3 «المعاينة والنشر» of the product editor.
// One model = real colour × size Variants. Every change goes through the planners in colour-model.js
// (tested), runs in order with the structure token, and the screen reloads from the server afterwards,
// so what is shown is what was saved. Colours, sizes, orders and product codes are never deleted here.
// Photo removal requires an explicit confirmation and the server's hide-then-storage-delete protocol.
import { html, render, $, $$, icon, money, toMinor, withBusy, island, done, fail, confirmDialog } from '../ui.js';
import { call, deleteProductImage, mediaUrl } from '../api.js';
import { uploadPhotos, uploadSummary } from '../photo-upload.js?v=20261113-media-team-v1';
import { checkSourceImage } from '../image-optimize.js?v=20261113-media-team-v1';
import { colourModel, checkDrafts, planNewModel, planAddColour, planSizes, planColourPrice, planColourAvailability, photoTarget, runSteps, ONE_SIZE } from '../colour-model.js?v=20261106-colourpicker';
import { loadCosts, saveCost, costOf, profitText } from '../profit.js';
import { PALETTE, hexOf, normName, colourKey } from '../../../js/colour-palette.js?v=20261106-colourpicker';
import { mountDraftColourPickers } from '../colour-picker.js';

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
  if (r.res?.outcome === 'forbidden') island('error', 'صلاحيتك مش بتسمح بالخطوة «' + r.step.label + '». يرجى التواصل مع فريق الإدارة لاستكمالها.');
  else fail(r.res);
  island('error', 'اتحفظ ' + r.at + ' من ' + steps.length + ' خطوة، ووقفنا عند «' + r.step.label + '». اللي اتحفظ ما اتلغاش؛ تحديث الصفحة ثم استكمال الخطوات.');
  return false;
}

// ---------------------------------------------------------------- drafts (new model or one more colour)
function draftCard(dr, i, { canPrice, canMedia }) {
  return html`<article class="card stack colour-card" data-draft="${i}">
    <div class="row">${swatch(hexOf(dr.name), dr.name)}<b>${dr.name || 'لون ' + (i + 1)}</b><span class="space"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-drop-draft="${i}">${icon('x')}إزالة اللون ده</button></div>
    <div class="grid2">
      <div class="colour-picker-slot" data-colour-picker-slot></div>
      <label class="field"><span>اسم اللون / لون مخصص (اختياري)</span><input class="input" data-d-name value="${dr.name}" list="palette-names" maxlength="40" placeholder="اختيار من القائمة فوق أو كتابة لون مخصص"><small>الاسم ده هو اللي هيتحفظ ويظهر للعميل. ولو اللون مزدوج هيتسجل كاختيار واحد.</small></label>
      ${canPrice ? html`<label class="field"><span>سعر خاص للون (اختياري)</span><div class="input-money"><input data-d-price inputmode="decimal" value="${dr.priceMinor ? dr.priceMinor / 100 : ''}" placeholder="فاضي = السعر الأساسي"><span>EGP</span></div></label>` : ''}
    </div>

    ${canMedia ? html`<div class="field"><span>صور اللون — رفعها مرة واحدة مع اللون</span>
      <div class="thumbs draft-colour-photos" data-d-photos>
        <label class="thumb thumb-add" data-d-photo-add>${icon('upload')}<span>اختيار صور اللون</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" data-d-files aria-label="رفع صور اللون"></label>
      </div>
      <small data-d-photo-count>${dr.files?.length ? dr.files.length + ' صورة جاهزة للحفظ (أول صورة هي الغلاف)' : 'ممكن اختيار عدة صور مرة واحدة، وهتترفع تلقائيًا بعد حفظ اللون.'}</small>
      <div class="thumbs" data-d-upload-progress aria-live="polite"></div>
    </div>` : ''}
    <div class="field"><span>المقاسات المتاحة للون ده</span>
      <div class="chips" style="flex-wrap:wrap">${[...new Set([...COMMON_SIZES, ...dr.sizes])].map((s) => html`<button type="button" class="chip" data-d-size="${s}" aria-pressed="${dr.sizes.includes(s)}">${s}</button>`)}</div>
      <input class="input" data-d-custom maxlength="18" placeholder="مقاس آخر؟ يمكن إدخاله ثم الضغط على Enter (مثال: 38)"></div>
    <label class="switch"><input type="checkbox" data-d-avail ${dr.available ? 'checked' : ''}><i></i>متاح عند المورد</label>
  </article>`;
}

function mountDrafts(box, drafts, { canPrice, canMedia, onSave, saveText, single = false }) {
  const paint = () => {
    render(box, html`<datalist id="palette-names">${PALETTE.map((c) => html`<option value="${c.name}"></option>`)}</datalist>
      <div class="stack">${drafts.map((dr, i) => draftCard(dr, i, { canPrice, canMedia }))}</div>
      <div class="row" style="flex-wrap:wrap"><button type="button" class="btn btn-soft" data-add-draft ${single && drafts.length ? 'hidden' : ''}>${icon('plus')}إضافة لون</button><span class="space"></span>
        <button type="button" class="btn btn-primary" data-save-drafts ${drafts.length ? '' : 'disabled'}>${saveText}</button></div>
      <p class="err" data-draft-error role="alert" aria-live="polite" hidden></p><ol class="blockers" data-steps hidden></ol>`);
    mountDraftColourPickers(box);

    // File objects stay in memory while switching sizes/colours. Never upload until the
    // structure (colour + its Variants) has been saved, so no unscoped duplicate photos.
    $$('[data-draft]', box).forEach((card) => {
      const draft = drafts[Number(card.dataset.draft)];
      const gallery = $('[data-d-photos]', card);
      if (!gallery) return;
      const add = $('[data-d-photo-add]', gallery);
      (draft.files || []).forEach((file, i) => {
        const figure = document.createElement('figure');
        figure.className = 'thumb draft-pending-photo';
        const image = document.createElement('img');
        image.alt = file.name;
        image.width = 96; image.height = 120;
        const url = URL.createObjectURL(file);
        image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        image.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
        image.src = url;
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'icon-btn';
        remove.dataset.dRemovePhoto = String(i);
        remove.setAttribute('aria-label', 'إزالة الصورة ' + (i + 1) + ' من اللون قبل الحفظ');
        remove.textContent = '×';
        figure.append(image);
        if (i === 0) {
          const cover = document.createElement('span');
          cover.className = 'badge ok'; cover.textContent = 'الغلاف';
          figure.append(cover);
        }
        figure.append(remove);
        gallery.insertBefore(figure, add);
      });
    });
  };
  const at = (el) => drafts[+el.closest('[data-draft]').dataset.draft];
  box.addEventListener('input', (e) => {
    const dr = e.target.closest('[data-draft]') && at(e.target); if (!dr) return;
    if (e.target.matches('[data-d-name]')) { dr.name = e.target.value; const sw = $('.swatch', e.target.closest('[data-draft]')); const hex = hexOf(dr.name); sw.style.setProperty('--sw', hex || 'transparent'); sw.toggleAttribute('data-unknown', !hex); }
    if (e.target.matches('[data-d-price]')) { const v = e.target.value.trim(); dr.priceMinor = v ? (toMinor(v) ?? -1) : null; }
    if (e.target.matches('[data-d-avail]')) dr.available = e.target.checked;
  });

  box.addEventListener('change', (e) => {
    if (!e.target.matches('[data-d-files]')) return;
    const draft = at(e.target);
    const chosen = [...(e.target.files || [])];
    const valid = chosen.filter((file) => checkSourceImage(file) === null);
    if (valid.length !== chosen.length) island('error', checkSourceImage(chosen.find((file) => checkSourceImage(file))) + ' هنحتفظ بالصور السليمة بس.');
    const existing = draft.files || [];
    const keys = new Set(existing.map((file) => [file.name, file.size, file.lastModified].join(':')));
    for (const file of valid) {
      const key = [file.name, file.size, file.lastModified].join(':');
      if (!keys.has(key)) { existing.push(file); keys.add(key); }
    }
    draft.files = existing;
    paint();
  });
  box.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-d-custom]') || e.key !== 'Enter') return;
    e.preventDefault();
    const dr = at(e.target), v = e.target.value.trim();
    if (v && !dr.sizes.includes(v)) { dr.sizes = dr.sizes.filter((s) => s !== ONE_SIZE).concat(v); paint(); }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-d-remove-photo]')) { const dr = at(b); dr.files.splice(Number(b.dataset.dRemovePhoto), 1); paint(); return; }
    if (b.matches('[data-add-draft]')) { drafts.push({ name: '', sizes: [], priceMinor: null, available: true, files: [] }); paint(); $$('[data-d-name]', box).at(-1)?.focus(); return; }
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
  const mayEditCost = can('products.edit') || can('owner');
  const costs = mayEditCost ? await loadCosts(call, code) : null;
  const cost = (pos) => (costs?.ready ? costOf(costs.data, pos) : null);
  const live = model.colours.filter((c) => c.variants.length);
  const half = p.options.length && !p.variants.length;
  const queuedPhotos = new Map(); // only local Files, per colour card; upload happens on Save
  let savingColour = false; // prevents another card being edited during async save/reload

  render(body, html`<div class="stack">
    <section class="card stack"><div class="card-head"><h3>الألوان والمقاسات والصور</h3><span class="muted">${live.length} لون</span></div>
      <p class="muted" style="margin:0">كل لون له صوره ومقاساته وسعره الخاص لو موجود. عند اختيار اللون، الصور والمقاسات والسعر بتتغير معاه. المخزون افتراضي: «متاح عند المورد» معناه بنقبل الأوردر وبنشتري بعده.</p>
      ${!model.canAddColour ? html`<p class="note" role="note"><b>موديل قديم من غير اختيار لون.</b> يمكن تعديل صوره وسعره وتوافره من هنا. إضافة ألوان على نفس الكود مش مسموحة من قاعدة البيانات بعد ما اتعمل له مقاس؛ لإضافة ألوان، يجب إنشاء موديل جديد. الكود والأوردرات واللينكات القديمة زي ما هي، ومفيش دمج أو حذف تلقائي.</p>` : ''}
      ${half ? html`<p class="note" role="note">الموديل ده عليه خيارات من غير مقاسات جاهزة (غالبًا الحفظ اتقطع). استكمال من تبويب «المقاسات والمخزون» بزر «إنشاء كل التوليفات».</p>` : ''}
      ${mayEditCost && costs && !costs.ready ? html`<p class="note" role="note">${costs.missing ? 'تكلفة المورد والربح محتاجين تفعيل من السيرفر (التعديل جاهز للمراجعة). الأسعار والصور شغالة عادي.' : 'تعذّر تحميل تكلفة المورد دلوقتي. باقي الشاشة شغالة.'}</p>` : ''}
    </section>
    ${live.map((c, ci) => colourCard(c, ci, { model, media, can, cost, costsReady: costs?.ready }))}
    ${can('products.edit') && model.canAddColour && !half ? html`<section class="card stack" data-new-colours><div class="card-head"><h3>${live.length ? 'إضافة لون جديد' : 'بداية بأول لون'}</h3></div><div data-drafts></div></section>` : ''}
  </div>`);

  // New colours: on a fresh draft all colours are saved together (options must exist before any Variant).
  const draftsBox = $('[data-drafts]', body);
  if (draftsBox) {
    const fresh = !p.variants.length;
    const drafts = fresh ? [{ name: '', sizes: [], priceMinor: null, available: true, files: [] }] : [];
    mountDrafts(draftsBox, drafts, {
      canPrice: can('products.price'), canMedia: can('media.manage'),
      saveText: fresh ? 'حفظ الألوان والمقاسات' : 'حفظ اللون الجديد',
      single: !fresh,
      onSave: async (list) => {
        const clean = drafts.map((x) => ({ ...x, name: x.name.trim() }));
        let steps;
        if (fresh) steps = planNewModel(clean, model.base);
        else {
          // An existing model gets one colour per save; the screen reloads with the new positions before the next.
          if (clean.length !== 1) { island('error', 'إضافة لون واحد في المرة، حفظه، وبعدها إضافة اللي بعده.'); return; }
          if (model.colours.some((c) => colourKey(c.name) === colourKey(clean[0].name))) { island('error', 'اللون ده موجود بالفعل في الموديل. لو متوقف، رجّعيه من الكارت بتاعه.'); return; }
          steps = planAddColour(model, clean[0]);
        }

        if (!(await apply(steps, { ctx, p, code, list }))) return;
        const batches = clean.map((draft, i) => ({ draft, i })).filter(({ draft }) => draft.files?.length);
        if (!batches.length) { done('اتحفظت الألوان والمقاسات. ممكن إضافة الصور من نفس كارت اللون.'); reload(); return; }
        // Fetch the newly assigned Variant positions. Never guess positions from a draft,
        // and never upload a photo as shared/product media when a named colour is missing.
        let latest;
        try { latest = await call('products.get', { code }); } catch { latest = { outcome: 'network' }; }
        if (latest?.outcome !== 'ok') {
          island('error', 'الألوان والمقاسات اتحفظت، لكن تعذر تحميل ربط الصور. فتح اللون من نفس الشاشة ورفع صوره؛ مفيش صور اتكررت.');
          reload(); return;
        }
        let uploaded = 0;
        let failed = 0;
        const total = batches.reduce((n, { draft }) => n + draft.files.length, 0);
        for (const [index, { draft, i }] of batches.entries()) {
          const current = colourModel(latest.data.product, latest.data.stock, latest.data.media?.media || []);
          const match = current.colours.find((colour) => colourKey(colour.name) === colourKey(draft.name));
          if (!match || !match.variants.length) {
            failed += draft.files.length;
            island('error', 'اللون «' + (draft.name || 'الموديل') + '» اتحفظ، لكن يلزم رفع الصور من بطاقة اللون بعد التحديث.');
          } else {
            const card = $('[data-draft="' + i + '"]', draftsBox);
            const grid = $('[data-d-upload-progress]', card);
            const up = await uploadPhotos({
              files: draft.files, code, title: p.title + ' - ' + (draft.name || 'الموديل'),
              version: latest.data.media?.structure_version ?? latest.data.product.structure_version,
              grid, before: null, fields: photoTarget(match)
            });
            uploaded += up.ok;
            failed += draft.files.length - up.ok;
            if (up.ok !== up.total) island('error', uploadSummary(up));
          }
          if (index < batches.length - 1) {
            try { latest = await call('products.get', { code }); } catch { latest = { outcome: 'network' }; }
            if (latest?.outcome !== 'ok') {
              failed += batches.slice(index + 1).reduce((n, b) => n + b.draft.files.length, 0);
              break;
            }
          }
        }
        if (failed) island('error', 'اتحفظت الألوان واترفعت ' + uploaded + ' من ' + total + ' صورة. الصور الناقصة تتضاف من كارت اللون؛ يرجى عدم إعادة رفع الصور الناجحة.');
        else done('اتحفظت الألوان واترفعت كل الصور (' + uploaded + ') وربطناها بألوانها.');
        reload();
      },
    });
  }


  const drawQueued = (card, colourIndex) => {
    const grid = $('[data-c-queued]', card); if (!grid) return;
    grid.replaceChildren();
    (queuedPhotos.get(colourIndex) || []).forEach((file, index) => {
      const fig = document.createElement('figure');
      fig.className = 'thumb draft-pending-photo';
      const photo = document.createElement('img');
      photo.alt = file.name; photo.width = 96; photo.height = 120;
      const url = URL.createObjectURL(file);
      photo.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      photo.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
      photo.src = url;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'icon-btn';
      remove.dataset.cRemoveQueued = String(index);
      remove.textContent = '×'; remove.setAttribute('aria-label', 'إزالة الصورة قبل الحفظ');
      fig.append(photo, remove); grid.append(fig);
    });
    const msg = $('[data-c-queue-count]', card);
    if (msg) msg.textContent = queuedPhotos.get(colourIndex)?.length
      ? queuedPhotos.get(colourIndex).length + ' صورة جاهزة؛ استخدام زر «حفظ اللون والصور» للرفع.'
      : '';
  };
  body.addEventListener('change', (e) => {
    if (e.target.matches('[data-c-avail]')) { e.target.dataset.dirty = 'true'; return; }
    if (!e.target.matches('[data-upload]')) return;
    const card = e.target.closest('[data-colour]'); if (!card) return;
    const colourIndex = Number(card.dataset.colour);
    const next = [...(e.target.files || [])];
    const accepted = next.filter((file) => checkSourceImage(file) === null);
    if (accepted.length !== next.length) island('error', checkSourceImage(next.find((file) => checkSourceImage(file))) + ' احتفظنا بالصور السليمة بس.');
    const files = queuedPhotos.get(colourIndex) || [];
    const seen = new Set(files.map((f) => [f.name, f.size, f.lastModified].join(':')));
    for (const file of accepted) {
      const key = [file.name, file.size, file.lastModified].join(':');
      if (!seen.has(key)) { files.push(file); seen.add(key); }
    }
    queuedPhotos.set(colourIndex, files);
    e.target.value = '';
    drawQueued(card, colourIndex);
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

    if (b.matches('[data-c-remove-queued]')) {
      const queued = queuedPhotos.get(Number(card.dataset.colour)) || [];
      queued.splice(Number(b.dataset.cRemoveQueued), 1);
      drawQueued(card, Number(card.dataset.colour));
      return;
    }
    if (queuedPhotos.get(Number(card.dataset.colour))?.length &&
      b.matches('[data-retire], [data-restore], [data-first], [data-delete-photo], [data-save-cost]')) {
      island('error', 'حفظ صور اللون المختارة الأول، علشان ما تضيعش لما الشاشة تتحدث.');
      return;
    }
    if (b.matches('[data-save-colour]')) {
      if (savingColour) return;
      const wanted = model.sizeOption && can('products.edit') && c.active
        ? $$('[data-c-size][aria-pressed="true"]', card).map((x) => x.dataset.cSize)
        : c.variants.filter((v) => v.active).map((v) => v.size ?? ONE_SIZE);
      const extra = $('[data-c-custom]', card)?.value.trim();
      if (extra && !wanted.includes(extra)) wanted.push(extra);
      if (!wanted.length && model.sizeOption && c.active) {
        island('error', 'اختيار مقاس واحد على الأقل، أو إيقاف اللون نفسه.'); return;
      }
      const input = $('[data-c-price]', card);
      const priceDirty = input?.dataset.dirty === 'true';
      const raw = input?.value.trim() || '';
      const amount = raw ? toMinor(raw) : null;
      if (priceDirty && raw && (amount === null || amount < 100)) {
        island('error', 'إدخال سعر صحيح بالجنيه، مثل 650، أو حذف السعر الخاص للرجوع للسعر الأساسي.'); input.focus(); return;
      }
      const desiredAvail = $('[data-c-avail]', card)?.checked;
      const files = queuedPhotos.get(Number(card.dataset.colour)) || [];
      // Freeze every card while saving. A product reload can otherwise replace another
      // colour's selected File input before its change event has been handled.
      savingColour = true;
      const unlocked = $$('button, input, select, textarea', body).filter((el) => !el.disabled);
      unlocked.forEach((el) => { el.disabled = true; });
      body.setAttribute('aria-busy', 'true');
      try {
        await withBusy(b, async () => {
        // Read fresh state first so repeated taps/retries never blindly repeat a
        // partially completed structural save with an old version token.
        let latest;
        try { latest = await call('products.get', { code }); } catch { latest = { outcome: 'network' }; }
        if (latest?.outcome !== 'ok') { island('error', 'تعذّر قراءة آخر نسخة من المنتج. مفيش صور اترفعت.'); return; }
        let freshModel = colourModel(latest.data.product, latest.data.stock, latest.data.media?.media || []);
        let current = freshModel.colours.find((x) => x.valuePosition === c.valuePosition && x.optionPosition === c.optionPosition);
        if (!current) { island('error', 'اللون اتغير من وقت فتح الصفحة؛ يرجى تحديث المنتج قبل الحفظ.'); return; }
        const sizesPlan = model.sizeOption && can('products.edit') && c.active ? planSizes(freshModel, current, wanted) : [];
        if (sizesPlan.length) {
          if (!(await apply(sizesPlan, { ctx, p: latest.data.product, code, list }))) return;
          try { latest = await call('products.get', { code }); } catch { latest = { outcome: 'network' }; }
          if (latest?.outcome !== 'ok') {
            island('error', 'تم حفظ جزء من المقاسات، لكن تعذر تحديث حالة المنتج. يرجى مراجعته قبل إعادة الحفظ.'); return;
          }
          freshModel = colourModel(latest.data.product, latest.data.stock, latest.data.media?.media || []);
          current = freshModel.colours.find((x) => x.valuePosition === c.valuePosition && x.optionPosition === c.optionPosition);
        }
        if (!current) { island('error', 'تعذر تحديد اللون بعد تعديل المقاسات.'); return; }
        const price = priceDirty ? (amount === freshModel.base ? null : amount) : c.priceMinor;
        const priceNeedsSync = can('products.price') && (priceDirty || (sizesPlan.length && Number.isInteger(c.priceMinor)));
        const pricePlan = priceNeedsSync && (priceDirty || current.priceMinor !== price)
          ? planColourPrice(current, price) : [];
        // An untouched switch must not turn unavailable sizes back on during a photo-only save.
        const availabilityEdited = $('[data-c-avail]', card)?.dataset.dirty === 'true';
        // If sizes changed but the supplier switch was untouched, turn on only
        // newly-created sizes; do not reactivate an older size intentionally unavailable.
        const oldPositions = new Set(c.variants.map((variant) => variant.position));
        const availPlan = typeof desiredAvail === 'boolean' && can('inventory.manage') && (availabilityEdited || sizesPlan.length > 0)
          ? planColourAvailability(current, desiredAvail).filter((step) =>
              availabilityEdited || !oldPositions.has(step.args.position))
          : [];
        if ((pricePlan.length || availPlan.length) &&
          !(await apply([...pricePlan, ...availPlan], { ctx, p: latest.data.product, code, list }))) return;
        if (files.length) {
          try { latest = await call('products.get', { code }); } catch { latest = { outcome: 'network' }; }
          if (latest?.outcome !== 'ok') {
            island('error', 'اتحفظت بيانات اللون، لكن الصور لسه ما اترفعتش. مراجعة الصفحة قبل رفعهم.'); return;
          }
          freshModel = colourModel(latest.data.product, latest.data.stock, latest.data.media?.media || []);
          current = freshModel.colours.find((x) => x.valuePosition === c.valuePosition && x.optionPosition === c.optionPosition);
          if (!current?.variants.length) {
            island('error', 'اتحفظ اللون لكن ماقدرناش نربط الصور بمقاس، فمفيش صورة اترفعت.'); return;
          }
          $('[data-c-queued]', card)?.replaceChildren();
          const result = await uploadPhotos({
            files, code, title: p.title + ' - ' + (current.name || 'الموديل'),
            version: latest.data.media?.structure_version ?? latest.data.product.structure_version,
            grid: $('.thumbs', card), before: $('.thumb-add', card), fields: photoTarget(current)
          });
          if (result.ok !== files.length) {
            island('error', 'اتحفظ اللون واترفعت ' + result.ok + ' من ' + files.length + ' صورة. إعادة رفع الصور الناقصة فقط، مش الصور الناجحة.');
            await reload(); return;
          }
        }
        done('اتحفظت بيانات اللون وصوره بنجاح.');
        await reload();
        });
      } finally {
        savingColour = false;
        body.removeAttribute('aria-busy');
        unlocked.forEach((el) => { if (el.isConnected) el.disabled = false; });
      }
    }
    if (b.matches('[data-retire]')) {
      if (!(await confirmDialog({ title: 'وقف اللون ' + c.name, text: 'سيختفي اللون من المتجر للطلبات الجديدة. الطلبات القديمة والصور والكود ستظل كما هي، ويمكن إعادة تفعيله لاحقًا.', okText: 'وقّفي اللون', danger: true }))) return;
      await run([{ label: 'وقف اللون', op: 'products.structure', args: { change: { op: 'set_value_active', option: c.optionPosition, value: c.valuePosition, active: false } }, need: 'products.edit' }], 'اللون اتوقف.');
    }
    if (b.matches('[data-restore]')) await run([{ label: 'رجوع اللون', op: 'products.structure', args: { change: { op: 'set_value_active', option: c.optionPosition, value: c.valuePosition, active: true } }, need: 'products.edit' }], 'اللون رجع.');
    if (b.matches('[data-delete-photo]')) {
      if (!can('media.manage')) { island('error', 'صلاحية إدارة الصور مطلوبة.'); return; }
      const id = b.dataset.deletePhoto;
      const photo = c.media.find((item) => item.media_id === id);
      if (!photo) { island('error', 'الصورة لم تعد موجودة. حدّث الصفحة وحاول مرة أخرى.'); return; }
      if (!(await confirmDialog({
        title: 'حذف صورة اللون',
        text: 'سيتم إخفاء الصورة أولًا ثم حذفها نهائيًا من ملفات المنتج. لا يمكن استعادتها. باقي صور اللون والأوردرات لن تتأثر.',
        okText: 'حذف الصورة نهائيًا',
        danger: true
      }))) return;
      await withBusy(b, async () => {
        // The storage route only permanently deletes photos after the database marks them hidden.
        if (!photo.hidden) {
          const hidden = await call('media.set_hidden', { code, media_id: id, hidden: true });
          if (hidden?.outcome !== 'saved') { fail(hidden); return; }
        }
        const result = await deleteProductImage(code, id);
        if (['saved', 'deleted'].includes(result?.outcome)) { done('اتحذفت الصورة من اللون.'); reload(); }
        else { fail(result); if (!photo.hidden) reload(); }
      });
      return;
    }
    if (b.matches('[data-first]')) {
      // The colour's first photo is its cover in the store: move this one before the colour's current first photo.
      const id = b.dataset.first, ids = media.map((m) => m.media_id).filter((x) => x !== id);
      const anchor = c.media.find((item) => !item.hidden && item.media_id !== id)?.media_id || c.media[0]?.media_id;
      ids.splice(Math.max(0, ids.indexOf(anchor)), 0, id);
      const r = await withBusy(b, () => call('media.reorder', { code, media_ids: ids }));
      if (r.outcome === 'saved') { done('بقت أول صورة للون.'); reload(); } else fail(r);
    }
    if (b.matches('[data-save-cost]')) {
      // Product editors may save expected supplier cost. Server enforces products.edit; Owner retains aggregate financial reports.
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
    if (e.target.matches('[data-c-price]')) e.target.dataset.dirty = 'true';
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
  const firstVisiblePhotoId = photos.find((m) => !m.hidden)?.media_id;
  const sizes = [...new Set([...COMMON_SIZES, ...c.variants.map((v) => v.size ?? ONE_SIZE)])];
  return html`<article class="card stack colour-card ${c.active ? '' : 'retired'}" data-colour="${ci}">
    <div class="row" style="flex-wrap:wrap">${swatch(c.hex, c.name)}<h3 style="margin:0">${c.name || 'الموديل (لون واحد)'}</h3>
      <span class="badge ${!c.active ? '' : c.available ? 'ok' : 'warn'}">${!c.active ? 'متوقف' : c.available ? 'متاح عند المورد' : 'مش متاح'}</span>
      <span class="space"></span><b class="num">${sell === null ? 'السعر ناقص' : money(sell)}</b></div>
    <div class="field"><span>صور اختيار اللون ${photos.length ? '(' + photos.length + ')' : '— لسه ناقصة'}</span>
      <div class="thumbs">${photos.map((m, i) => html`<figure class="thumb ${m.hidden ? 'hidden' : ''}"><img src="${img(m)}" alt="${m.alt_text || c.name}" loading="lazy" width="96" height="120">
        ${!m.hidden && m.media_id === firstVisiblePhotoId ? html`<span class="badge ok">غلاف اللون</span>` : ''}
        ${can('media.manage') ? html`<button type="button" class="icon-btn" data-delete-photo="${m.media_id}" aria-label="حذف صورة اللون" title="حذف الصورة">${icon('trash-2')}</button>` : ''}
        ${!m.hidden && m.media_id !== firstVisiblePhotoId && can('media.manage') ? html`<button type="button" class="icon-btn" data-first="${m.media_id}" aria-label="تعيينها أول صورة للون" title="تعيينها أول صورة للون">${icon('star')}</button>` : ''}</figure>`)}
        ${can('media.manage') && (c.optionPosition !== null || !model.colourOption) ? html`<label class="thumb thumb-add">${icon('upload')}<span>رفع صور ${c.name || 'الموديل'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" data-upload></label>` : ''}</div>
      <div class="thumbs" data-c-queued></div><small data-c-queue-count role="status"></small>
      <small>اختيار كل صور اللون مرة واحدة، ثم الضغط على «حفظ اللون والصور». ستُرفع الصور باللون الصحيح مع المقاسات والسعر، ولن تتغير الصور القديمة عند حدوث خطأ.</small></div>
    ${model.sizeOption && can('products.edit') && c.active ? html`<div class="field"><span>المقاسات</span>
      <div class="chips" style="flex-wrap:wrap">${sizes.map((s) => html`<button type="button" class="chip" data-c-size="${s}" aria-pressed="${live.some((v) => (v.size ?? ONE_SIZE) === s)}">${s}</button>`)}</div>
      <div class="row"><input class="input" data-c-custom maxlength="18" placeholder="مقاس تاني" style="max-width:160px"></div>
      <small>شيل المقاس بيوقفه بس للطلبات الجديدة؛ الأوردرات القديمة زي ما هي.</small></div>`
      : html`<p class="muted" style="margin:0">المقاسات: ${live.map((v) => v.size ?? ONE_SIZE).join('، ') || '—'}</p>`}
    <div class="grid2">
      ${can('products.price') ? html`<label class="field"><span>سعر خاص للون</span><div class="input-money"><input data-c-price inputmode="decimal" value="${Number.isInteger(c.priceMinor) ? c.priceMinor / 100 : ''}" placeholder="${model.base ? model.base / 100 : ''}"><span>EGP</span></div>
        <small>${c.priceMinor === 'mixed' ? 'المقاسات عليها أسعار مختلفة؛ الحفظ هنا هيوحّدها.' : 'فاضي = السعر الأساسي ' + (model.base ? money(model.base) : '')}</small></label>` : ''}
      ${can('inventory.manage') && c.active ? html`<label class="switch" style="align-self:center"><input type="checkbox" data-c-avail ${c.available ? 'checked' : ''}><i></i>متاح عند المورد</label>` : ''}
    </div>
    ${(can('products.edit') || can('products.price') || can('inventory.manage') || can('media.manage')) && c.active ? html`<div class="row"><span class="space"></span><button type="button" class="btn btn-primary" data-save-colour>حفظ اللون والصور</button></div>` : ''}
    ${(can('products.edit') || can('owner')) && costsReady ? html`<details class="cost-box" ${live.some((v) => cost(v.position) === null) ? 'open' : ''}><summary>${can('owner') ? 'سعر المورد والربح' : 'تكلفة المورد'}</summary>
      <div class="stack" style="margin-top:8px">${live.map((v) => { const k = cost(v.position); const t = profitText(v.amountMinor ?? sell, k, money); return html`<div class="row" style="flex-wrap:wrap">
        <span style="min-width:72px">${v.size ?? ONE_SIZE}</span><div class="input-money" style="max-width:140px"><input data-cost="${v.position}" inputmode="decimal" value="${k === null ? '' : k / 100}" placeholder="التكلفة" aria-label="تكلفة ${c.name} ${v.size ?? ''}"><span>EGP</span></div>
        ${can('owner') ? html`<small data-profit="${v.position}" data-kind="${t.kind}" role="status">${t.text}</small>` : ''}</div>`; })}
        <div class="row"><span class="space"></span><button type="button" class="btn btn-soft btn-sm" data-save-cost>حفظ التكلفة</button></div>
        <small class="muted">${can('owner') ? 'الربح المبدئي = سعر البيع − تكلفة المورد. الشحن اللي بيُدفع العميل مش ربح. التكلفة بتتحفظ مع كل أوردر وقت الطلب، فتغييرها مش بيغيّر حسابات الأوردرات القديمة.' : 'التكلفة مش بتظهر للعملاء. تعديلها مش بيغيّر سعر البيع أو التكاليف المسجلة على الطلبات القديمة.'}</small></div></details>` : ''}
    ${can('products.edit') && c.optionPosition !== null ? html`<div class="row"><span class="space"></span>${c.active ? html`<button type="button" class="btn btn-ghost btn-sm" data-retire>إيقاف اللون</button>` : html`<button type="button" class="btn btn-soft btn-sm" data-restore>رجّعي اللون</button>`}</div>` : ''}
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
    !colours.some((c) => c.available) && 'لا يوجد لون متاح عند المورد، لذلك الطلب غير متاح حاليًا.',
    !p.shipping_profile && 'طريقة الشحن مش محددة.',
  ].filter(Boolean);
  let pick = Math.max(0, colours.findIndex((c) => c.available));
  const paint = () => {
    const c = colours[pick];
    const photos = c ? [...c.media.filter((m) => !m.hidden), ...shared] : shared;
    const sizes = c ? c.variants.filter((v) => v.active && v.available).map((v) => v.size ?? ONE_SIZE) : [];
    render($('[data-shop]', body), html`<div class="preview-shop">
      <div class="preview-gallery">${photos.length ? html`<img src="${img(photos[0])}" alt="${p.title}" width="320" height="400">` : html`<div class="empty">${icon('image')}<b>مفيش صور للون ده</b></div>`}
        <div class="thumbs">${photos.slice(1, 6).map((m) => html`<img src="${img(m)}" alt="" width="56" height="70" loading="lazy">`)}</div>
        <p class="preview-description${p.description?.trim() ? '' : ' muted'}">${p.description?.trim() || 'مفيش وصف مضاف للمنتج.'}</p></div>
      <div class="stack"><h3 style="margin:0">${p.title}</h3><b class="num">${c && priceOf(c, model.base) !== null ? money(priceOf(c, model.base)) : '—'}</b>
        ${model.colourOption ? html`<div><small class="muted">اللون: ${c?.name || ''}</small><div class="chips" role="radiogroup" aria-label="اللون" style="flex-wrap:wrap">${colours.map((x, i) => html`<button type="button" class="chip swatch-chip" role="radio" data-pick="${i}" aria-checked="${i === pick}" aria-pressed="${i === pick}" ${x.available ? '' : 'disabled'}>${swatch(x.hex, x.name)}${x.name}</button>`)}</div></div>` : ''}
        <div><small class="muted">المقاس</small><div class="chips" style="flex-wrap:wrap">${sizes.length ? sizes.map((s, i) => html`<button type="button" class="chip" aria-pressed="${i === 0}">${s}</button>`) : html`<span class="muted">مفيش مقاس متاح للون ده</span>`}</div></div>
        <p class="muted" style="margin:0;font-size:12px">تظهر للعميل صور ومقاسات وسعر اللون المحدد فقط، مع إمكانية الدفع عند الاستلام أو الإضافة إلى السلة.</p></div></div>`);
  };
  render(body, html`<div class="stack">
    <section class="card stack"><div class="card-head"><h3>معاينة عرض المنتج في المتجر</h3><span class="muted">${colours.length} لون</span></div><div data-shop></div></section>
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
