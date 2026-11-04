// Simple mobile-first editor for legacy colour families AND standalone WOMEN SKUs.
// Each colour in legacy families is a separate real SKU. Never synthesize sizes,
// merge SKUs, or claim that an unavailable variant is purchasable.
import { $, $$, esc, money, toMinor, withBusy, island, done, fail, closeLayer } from './ui.js';
import { call, uploadProductImage, mediaUrl } from './api.js';
import { checkSourceImage, optimizeUploadImage, previewTile, sizeLabel } from './image-optimize.js';
import { variantChoices } from './quick-variants.js';
import { statusAction, prepublishHints, STATUS_LABELS } from './product-lifecycle.js';

const safeHex = (x) => /^#[\da-fA-F]{6}$/.test(x || '') ? x : '#777777';
const safeImage = (x) => {
  const path = String(x || '');
  return path ? mediaUrl(/^media\//.test(path) ? 'product-media/' + path : path) : '';
};
const num = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

export function mountQuickProductEditor({ box, ctx, members, onChanged = () => {} }) {
  const colorRoot = $('[data-quick-colors]', box);
  const panel = $('[data-quick-panel]', box);
  if (!colorRoot || !panel) throw new Error('Quick editor mount point missing');
  const validMembers = members.filter(m => /^SS-\d{4,19}$/.test(m?.product?.public_code || ''));
  if (!validMembers.length) { panel.textContent = 'مفيش ألوان أو منتجات قابلة للتعديل.'; return; }
  let code = '', details = null, position = null, loadNumber = 0;
  let saving = false, uploading = false;

  for (const member of validMembers) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'quick-color';
    item.dataset.quickCode = member.product.public_code;
    item.setAttribute('aria-pressed', 'false');
    const photo = safeImage(member.product.image);
    if (photo) {
      const img = document.createElement('img');
      img.src = photo; img.alt = ''; img.loading = 'lazy';
      item.append(img);
    }
    const dot = document.createElement('span');
    dot.className = 'quick-dot'; dot.style.background = safeHex(member.color?.hex);
    const title = document.createElement('b');
    title.textContent = member.color?.name || member.product.title || member.product.public_code;
    item.append(dot, title);
    colorRoot.append(item);
  }

  function show(detail) {
    const product = detail.product;
    const rows = variantChoices(product, detail.stock);
    if (!rows.length) {
      panel.innerHTML = '<p role="alert">اللون ده مالوش مقاسات أو اختيارات محفوظة. افتحي بيانات المنتج لإصلاحه قبل النشر.</p>' +
        '<a class="btn btn-soft" data-quick-link href="#/products/' + esc(code) + '">افتحي المنتج</a>';
      bindLink(); return;
    }
    const chosen = rows.find(v => v.position === position) || rows[0];
    position = chosen.position;
    const canPrice = ctx.can('products.price');
    const canQty = ctx.can('inventory.manage');
    const canImages = ctx.can('media.manage');
    const canPublish = ctx.can('products.publish');
    const lifecycle = canPublish ? statusAction(product.status) : null;
    const colourOptions = [...new Set(rows.map(r => r.colour).filter(Boolean))];
    const hasColourOption = colourOptions.length > 0;
    const selectedColour = chosen.colour || colourOptions[0] || null;
    const rowsInColour = hasColourOption ? rows.filter(r => r.colour === selectedColour) : rows;
    const hasUnspecifiedSize = !rowsInColour.some(r => r.hasExplicitSize);
    const visiblePhotos = (detail.media?.media || []).filter(m => {
      if (m.hidden || m.delete_pending) return false;
      if (!hasColourOption || m.scope === 'product') return true;
      if (m.scope === 'option_value') return m.option_value?.value === selectedColour;
      if (m.scope === 'variant') {
        const values = m.variant?.values || [];
        return values.includes(selectedColour) && (!chosen.size || values.includes(chosen.size));
      }
      return false;
    });
    const priceValue = chosen.amount_minor === null ? '' : String(chosen.amount_minor / 100);
    const colourButtons = colourOptions.map(c => '<button type="button" class="quick-size" data-quick-internal-colour="' + esc(c) +
      '" aria-pressed="' + (c === selectedColour) + '">' + esc(c) + '</button>').join('');
    const sizeOptions = rowsInColour.map(r => '<button type="button" class="quick-size" data-quick-position="' + r.position +
      '" aria-pressed="' + (r.position === position) + '">' + esc(r.size || (r.hasExplicitSize ? r.label : 'مقاس واحد (غير محدد)')) +
      (r.active ? '' : ' (موقوف)') + '</button>').join('');
    panel.innerHTML = [
      '<div class="quick-section">',
      '<div class="quick-header"><b>٢. اختاري اللون والمقاس</b><span class="code">' + esc(code) + '</span></div>',
      hasColourOption ? '<span class="muted">لون الاختيار:</span><div class="quick-sizes" role="group" aria-label="اختاري لون المنتج">' + colourButtons + '</div>' : '',
      '<span class="muted">المقاس:</span><div class="quick-sizes" role="group" aria-label="اختاري مقاس المنتج">' + sizeOptions + '</div>',
      hasUnspecifiedSize ? '<p class="muted quick-help">المنتج ده مش متسجل له مقاسات مختلفة. المعروض حاليًا اختيار واحد فقط؛ مش هنخترع مقاسات ممكن توصل غلط للعميلة.</p>' : '',
      '</div>',
      '<div class="quick-section">',
      '<div class="quick-header"><b>٣. السعر والإتاحة</b><span class="muted">' + esc(STATUS_LABELS[product.status] || 'غير منشور') + '</span></div>',
      '<div class="quick-fields">',
      '<label class="field"><span>سعر البيع (جنيه)</span><input class="input" inputmode="decimal" data-quick-price value="' + esc(priceValue) + '" placeholder="مثال: 650"' + (canPrice ? '' : ' disabled') + '></label>',
      '<label class="field"><span>كمية افتراضية</span><input class="input" inputmode="numeric" data-quick-qty value="' + esc(chosen.quantity ?? '') + '" placeholder="مثال: 20"' + (canQty ? '' : ' disabled') + '></label>',
      '</div>',
      '<label class="quick-check"><input type="checkbox" data-quick-available ' + (chosen.availability ? 'checked ' : '') + (canQty ? '' : 'disabled') +
      '> <span>متاح للتوريد من المورد</span></label>',
      '<p class="muted quick-help">الكمية افتراضية مش مخزون عندك. قبل تأكيد الأوردر لازم تراجعي اللون والمقاس والسعر عند المورد.</p>',
      (canPrice || canQty ? '<button type="button" class="btn btn-primary quick-save" data-quick-save>احفظي تعديل الاختيار ده</button>' : '<p class="muted">حسابك للعرض فقط. مسؤولة السعر أو الإتاحة تقدر تحفظ التعديلات.</p>'),
      '</div>',
      '<div class="quick-section">',
      '<div class="quick-header"><b>٤. صور اللون ده</b><span class="muted">' + visiblePhotos.length + ' صورة</span></div>',
      '<div class="quick-pictures">' + visiblePhotos.slice(0, 8).map(m => '<img src="' + esc(safeImage(m.storage_path)) + '" alt="صورة اللون" loading="lazy">').join('') + '</div>',
      (canImages ? '<label class="btn btn-soft quick-upload">' + (hasColourOption ? 'ارفعي صورة اللون والمقاس المختارين' : 'ارفعي صور اللون ده (كل المقاسات)') +
        '<input data-quick-files type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr"></label>' : '<p class="muted">رفع الصور يحتاج صلاحية إدارة الصور.</p>'),
      hasColourOption ? '<p class="muted quick-help">الصورة هنا تخص اختيار اللون والمقاس المحدد فقط. لو نفس الصورة مطلوبة لباقي المقاسات، لازم تربطيها بكل مقاس منفصل في النسخة الحالية.</p>'
        : '<p class="muted quick-help">الصور المرفوعة هنا تخص كود اللون المحدد، وبتظهر مع كل مقاساته. مش بتتغير صور بقية الألوان.</p>',
      '<div class="row" style="flex-wrap:wrap"><a class="btn btn-ghost btn-sm" data-quick-link data-quick-tab="details" href="#/products/' + esc(code) + '">الاسم والوصف والشحن</a>',
      '<a class="btn btn-ghost btn-sm" data-quick-link data-quick-tab="media" href="#/products/' + esc(code) + '">إدارة الصور القديمة</a></div>',
      '</div>',
      '<div class="quick-section">',
      '<div class="quick-header"><b>٥. حالة نشر اللون</b><span class="badge">' + esc(STATUS_LABELS[product.status] || 'غير معروف') + '</span></div>',
      lifecycle ? '<button type="button" class="btn ' + (product.status === 'public' ? 'btn-soft' : 'btn-primary') +
        '" data-quick-status>' + esc(lifecycle.label) + '</button>' :
        '<p class="muted">صلاحيات هذا الحساب لا تسمح بتغيير حالة النشر، أو المنتج مؤرشف.</p>',
      '<p class="muted quick-help">الإخفاء مؤقت ومش بيحذف المنتج أو أوردراته. النشر بيخلي المنتج متاح للعميلات بعد مراجعة جاهزيته.</p>',
      '</div>'
    ].join('');

    $$('[data-quick-position]', panel).forEach(button => button.addEventListener('click', () => {
      position = Number(button.dataset.quickPosition); show(detail);
    }));
    $$('[data-quick-internal-colour]', panel).forEach(button => button.addEventListener('click', () => {
      const target = rows.find(r => r.colour === button.dataset.quickInternalColour);
      if (target) { position = target.position; show(detail); }
    }));
    $('[data-quick-status]', panel)?.addEventListener('click', async (event) => {
      if (saving || uploading || !lifecycle) return;
      const btn = event.currentTarget;
      const draftPrice = $('[data-quick-price]', panel)?.value?.trim();
      const draftQty = $('[data-quick-qty]', panel)?.value?.trim();
      const draftAvailable = $('[data-quick-available]', panel)?.checked;
      if ((canPrice && toMinor(draftPrice) !== chosen.amount_minor) ||
          (canQty && (String(chosen.quantity ?? '') !== String(draftQty ?? '') ||
            draftAvailable !== chosen.availability))) {
        island('error', 'احفظي تعديلات السعر والإتاحة الأول، وبعدها غيّري حالة النشر.');
        return;
      }
      if (lifecycle.op === 'products.publish') {
        const hints = prepublishHints(detail);
        if (hints.length) { island('error', 'قبل النشر: ' + hints.join('، ')); return; }
      }
      // Confirm INSIDE the existing sheet. A nested confirmDialog would replace
      // the modal, losing colour/size context and discarding edited form fields.
      if ($('[data-quick-status-confirm]', panel)) return;
      const question = document.createElement('div');
      question.dataset.quickStatusConfirm = '1';
      question.className = 'quick-status-confirm';
      const paragraph = document.createElement('p');
      paragraph.textContent = lifecycle.op === 'products.publish'
        ? 'اللون ده هيظهر للعملاء. اتأكدتي من الصور والسعر والمقاس والتوافر عند المورد؟'
        : 'اللون ده هيختفي مؤقتًا من المتجر، من غير حذف الأوردرات أو الصور. موافقة؟';
      const controls = document.createElement('div');
      controls.className = 'row';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.className = 'btn btn-ghost btn-sm';
      cancel.textContent = 'رجوع';
      const proceed = document.createElement('button');
      proceed.type = 'button'; proceed.className = 'btn btn-primary btn-sm';
      proceed.dataset.quickStatusYes = '1'; proceed.textContent = 'تأكيد ' + lifecycle.label;
      controls.append(cancel, proceed); question.append(paragraph, controls);
      btn.after(question);
      cancel.addEventListener('click', () => question.remove());
      proceed.addEventListener('click', async () => {
        if (saving || uploading) return;
        saving = true; proceed.disabled = true;
        try {
          const result = await withBusy(proceed, () => call(lifecycle.op, { code }));
          if (['published', 'hidden', 'already_public', 'already_hidden'].includes(result?.outcome)) {
            done(lifecycle.op === 'products.publish' ? 'اتنشر اللون في المتجر' : 'اتخفى اللون مؤقتًا');
            onChanged();
            await load(code, position);
          } else if (result?.outcome === 'rejected' && result.blockers) {
            island('error', 'مش جاهز للنشر: ' + result.blockers.join('، '));
            question.remove();
          } else { fail(result); question.remove(); }
        } finally { saving = false; }
      });
    });
    $('[data-quick-save]', panel)?.addEventListener('click', async (event) => {
      if (saving || uploading) return;
      const btn = event.currentTarget;
      const newPriceText = $('[data-quick-price]', panel)?.value.trim();
      const newQtyText = $('[data-quick-qty]', panel)?.value.trim();
      const newAvailability = $('[data-quick-available]', panel)?.checked === true;
      const price = canPrice ? toMinor(newPriceText) : chosen.amount_minor;
      const q = canQty ? Number(newQtyText) : num(chosen.quantity);
      if (canPrice && (price === null || price < 100)) {
        island('error', 'اكتبي سعر صحيح بالجنيه، زي 650.'); $('[data-quick-price]', panel)?.focus(); return;
      }
      if (canQty && !/^\d{1,6}$/.test(newQtyText)) {
        island('error', 'اكتبي كمية افتراضية من 0 إلى 999999.'); $('[data-quick-qty]', panel)?.focus(); return;
      }
      if (canQty && q === 0 && newAvailability) {
        island('error', 'لو الكمية صفر، اقفلي «متاح للتوريد» الأول.'); return;
      }
      const tasks = [];
      if (canPrice && price !== chosen.amount_minor) {
        const single = rows.length === 1 && !rows[0].hasExplicitSize && !chosen.override;
        tasks.push(['سعر البيع', 'products.' + (single ? 'set_price' : 'set_variant_price'),
          single ? { code, amount_minor: price } :
            { code, version: product.structure_version, position, amount_minor: price }]);
      }
      if (canQty && q !== chosen.quantity) tasks.push(['الكمية', 'products.set_stock', { code, version: product.structure_version, position, quantity: q }]);
      if (canQty && newAvailability !== chosen.availability) tasks.push(['الإتاحة', 'products.set_availability', { code, version: product.structure_version, position, available: newAvailability }]);
      if (!tasks.length) { done('مفيش تغييرات جديدة'); return; }
      saving = true;
      try {
        await withBusy(btn, async () => {
          let saved = 0;
          for (const [label, op, args] of tasks) {
            let result;
            try { result = await call(op, args); } catch { result = { outcome: 'network' }; }
            if (result?.outcome !== 'saved') {
              fail(result);
              island('error', saved ? 'اتحفظ جزء من التعديلات. راجعي ' + label + '، واللي اتغير بالفعل مش هنكرره تلقائيًا.' :
                'ماقدرناش نحفظ ' + label + '. البيانات القديمة لسه زي ما هي، راجعي صلاحياتك وجربي تاني.');
              await load(code, position);
              return;
            }
            saved++;
          }
          done('اتحفظ السعر والإتاحة للاختيار المحدد (' + saved + ' تغيير).');
          onChanged();
          await load(code, position);
        });
      } finally { saving = false; }
    });
    $('[data-quick-files]', panel)?.addEventListener('change', async (event) => {
      if (uploading || saving) return;
      const input = event.currentTarget;
      const list = [...(input.files || [])];
      const invalid = list.filter(f => checkSourceImage(f) !== null);
      const photos = list.filter(f => checkSourceImage(f) === null);
      if (!photos.length) { island('error', 'اختاري صورة JPG أو PNG أو WebP مناسبة، أقل من 5MB.'); input.value = ''; return; }
      uploading = true; input.disabled = true;
      const selectedCode = code, selectedPosition = position, scopedToVariant = hasColourOption;
      let mediaVersion = detail.media?.structure_version ?? product.structure_version;
      let uploaded = 0;
      const pictures = $('.quick-pictures', panel);
      const tiles = pictures ? photos.map(f => previewTile(pictures, null, f)) : [];
      try {
        for (const [index, file] of photos.entries()) {
          let prepared;
          tiles[index]?.preparing();
          try { prepared = await optimizeUploadImage(file, 'product'); }
          catch(e) {
            tiles[index]?.failed('ما اترفعتش: ' + (e?.message || 'تعذّر تجهيز الصورة'));
            island('error', (e?.message || 'تعذّر تجهيز صورة') + ' الصورة الأصلية على جهازك زي ما هي، ومفيش حاجة اتغيرت في المتجر.'); break;
          }
          tiles[index]?.uploading(prepared.uploadedBytes);
          const form = new FormData();
          form.append('code', selectedCode);
          form.append('image', prepared.file);
          form.append('version', String(mediaVersion));
          form.append('alt', product.title);
          if (scopedToVariant) form.append('variant_position', String(selectedPosition));
          // Product-scope within the legacy one-SKU-per-colour family:
          // the photo applies to every size of THIS colour, not all sibling colours.
          let result;
          try { result = await uploadProductImage(form); } catch { result = { outcome: 'network' }; }
          if (result?.outcome !== 'saved') { tiles[index]?.failed('ما اترفعتش. الصور القديمة زي ما هي.'); fail(result); break; }
          uploaded++;
          tiles[index]?.ok(prepared.optimized ? 'اترفعت ✓ ' + sizeLabel(prepared.originalBytes) + ' ← ' + sizeLabel(prepared.uploadedBytes) : 'اترفعت ✓');
          // A media attachment may advance the server version. Refresh it before
          // the next image, rather than retrying with a stale version and
          // mistakenly reporting the entire colour batch as complete.
          if (index + 1 < photos.length) {
            let fresh;
            try { fresh = await call('products.get', { code: selectedCode }); } catch { fresh = { outcome: 'network' }; }
            if (fresh?.outcome !== 'ok') { island('error', 'اترفعت صور، لكن تعذّر التأكد من آخر نسخة قبل استكمال الباقي.'); break; }
            mediaVersion = fresh.data?.media?.structure_version ?? fresh.data?.product?.structure_version ?? mediaVersion;
          }
        }
        if (uploaded === photos.length && !invalid.length) done('تم رفع صور اللون المحدد بنجاح');
        else island('error', 'اترفع ' + uploaded + ' من ' + list.length + ' صورة. راجعي الناقص قبل إعادة المحاولة.');
        if (uploaded && code === selectedCode) { onChanged(); await load(selectedCode, position); }
      } finally { tiles.forEach(t => t.release()); uploading = false; if (document.contains(input)) { input.value = ''; input.disabled = false; } }
    });
    bindLink();
  }

  function bindLink() {
    $$('[data-quick-link]', panel).forEach(a => a.addEventListener('click', () => {
      sessionStorage.setItem('wa.ptab', a.dataset.quickTab || 'details');
      closeLayer();
    }));
  }
  async function load(nextCode, nextPosition = null) {
    if (!validMembers.some(m => m.product.public_code === nextCode)) return;
    code = nextCode; position = nextPosition;
    const requestId = ++loadNumber;
    $$('[data-quick-code]', colorRoot).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.quickCode === code)));
    panel.innerHTML = '<p class="muted" role="status">بنحمّل بيانات اللون والمقاسات…</p>';
    let response;
    try { response = await call('products.get', { code }); } catch { response = { outcome: 'network' }; }
    if (requestId !== loadNumber || !document.contains(panel)) return;
    if (response?.outcome !== 'ok' || !response.data?.product) {
      panel.innerHTML = '<p role="alert" class="err">تعذّر تحميل اللون ده. اتأكدي من الاتصال، وجربي تاني.</p>' +
        '<button class="btn btn-soft" type="button" data-quick-retry>إعادة المحاولة</button>';
      $('[data-quick-retry]', panel).onclick = () => load(nextCode, nextPosition);
      return;
    }
    details = response.data;
    show(details);
  }

  const footerSave = $('[data-quick-save-footer]', box);
  footerSave?.addEventListener('click', () => {
    if (saving || uploading) return;
    const inner = $('[data-quick-save]', panel);
    if (inner && !inner.disabled) inner.click();
  });

  colorRoot.addEventListener('click', e => {
    const button = e.target.closest('[data-quick-code]');
    if (button && !saving && !uploading) load(button.dataset.quickCode);
  });
  load(validMembers[0].product.public_code);
  return { load };
}
