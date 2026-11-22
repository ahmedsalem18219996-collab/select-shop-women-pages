// Product Landing Studio: per-product landing page design with three manually uploaded marketing images
// (Hero / Features / Closing). Images are made by hand (e.g. in Gemini) and uploaded here; nothing calls any
// image-generation service. Marketing images are stored apart from the product gallery and never touch it.
// The design is presentation only: prices, shipping and stock stay server-side. Save = draft; only the
// Owner publishes. The live preview is the real landing page in an iframe, fed the unsaved draft.
import { withBusy, island, done, fail, ago, confirmDialog } from '../ui.js';
import { call, mediaUrl, uploadLandingImage } from '../api.js';
import { optimizeUploadImage } from '../image-optimize.js';
import { buildGeminiPrompt, STUDIO_STYLES } from '../studio-prompts.js';
import { createStudioStackEditor } from '../studio-stack-editor.js?v=20261122-visual';
import { normalizeDesign, defaultDesign, HIDEABLE, CHOICES, IMAGE_PATH, STORAGE, parseDesignImport, suggestAccent, DEFAULT_HINT, MAX_MOTION_IMAGES } from '../../../lp/studio-design.js?v=20261120-campaign';

const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null && text !== '') el.textContent = String(text);
  return el;
};
const imgUrl = (path) => path ? mediaUrl(/^media\//.test(path) ? 'product-media/' + path : path) : null;
const button = (label, cls, handler, attrs = {}) => {
  const b = make('button', 'btn ' + cls, label);
  b.type = 'button';
  Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
  b.addEventListener('click', handler);
  return b;
};
const LABELS = {
  section: { hero: 'صورة البداية (Hero)', product: 'المنتج والصور الأصلية وفورم الطلب', features: 'المميزات', closing: 'الخاتمة' },
  slot: { hero: 'صورة البداية (Hero)', features: 'صورة المميزات', closing: 'صورة الختام' },
  template: { classic: 'كلاسيك (في المنتصف)', editorial: 'مجلة (صورة بجانب النص)', minimal: 'بسيط بدون إطار' },
  background: { midnight: 'كحلي ليلي', navy: 'كحلي غامق', elevated: 'كحلي فاتح', light: 'فاتح' },
  font: { readex: 'Readex Pro (الأساسي)', rakkas: 'Rakkas للعناوين', system: 'خط الجهاز' },
  divider: { none: 'بدون فواصل', line: 'خط', dots: 'نقط', wave: 'موجة' },
  color: { purple: 'بنفسجي (زر الشراء)', cyan: 'سماوي', white: 'أبيض', gold: 'ذهبي' },
  position: { below: 'تحت النص', overlay: 'فوق الصورة', both: 'الاتنين' },
  shape: { pill: 'دائري', rounded: 'حواف ناعمة', square: 'مربع' },
  size: { md: 'عادي', lg: 'كبير', xl: 'كبير جدًا' },
  animation: { none: 'بدون حركة', pulse: 'نبض', shine: 'لمعة', bounce: 'قفزة خفيفة' },
  cardStyle: { card: 'كارت', outlined: 'إطار سماوي', glass: 'زجاجي', flat: 'بدون إطار' },
  fields: { labeled: 'العنوان فوق كل خانة', compact: 'مضغوط (العنوان داخل الخانة)' },
  motion: { none: 'بدون حركة', cinematic: 'سينمائي', calm: 'فخم وهادي', bold: 'جريء وسريع' },
  direction: { side: 'من الجنب', top: 'من فوق' },
};

let disposeStudio = () => {};

function field(label, control, hint = '') {
  const l = make('label', 'field');
  l.append(make('span', '', label), control);
  if (hint) l.append(make('small', 'muted', hint));
  return l;
}
function select(name, options, labels, value) {
  const s = make('select', 'select');
  s.name = name;
  options.forEach(o => { const op = make('option', '', labels[o] || o); op.value = o; s.append(op); });
  s.value = value;
  return s;
}

async function renderPicker(ctx) {
  const r = await call('products.list', { limit: 100 });
  if (r.outcome !== 'ok') { fail(r); return; }
  const items = (r.data || []).filter(p => p.status !== 'archived');
  const page = make('div', 'page');
  const head = make('div', 'page-head');
  const copy = make('div');
  copy.append(make('h2', '', 'Studio صفحات الهبوط'), make('p', '', 'اختار موديل علشان ترتّب صوره وتضيف النصوص والحركة وتراجع المعاينة قبل النشر.'));
  head.append(copy);
  page.append(head);
  const grid = make('div', 'studio-product-grid');
  items.forEach(p => {
    const b = make('button', 'card studio-product-card');
    b.type = 'button';
    b.dataset.studioProduct = p.public_code;
    const thumb = make('span', 'thumb');
    if (p.image) { const img = make('img'); img.src = imgUrl(p.image); img.alt = ''; img.loading = 'lazy'; thumb.append(img); } else thumb.textContent = 'صورة';
    const info = make('span');
    info.append(make('b', '', p.title), make('small', 'code', p.public_code), make('small', '', p.status === 'public' ? 'منشور' : 'مسودة'));
    b.append(thumb, info);
    b.addEventListener('click', () => ctx.go('studio/' + p.public_code));
    grid.append(b);
  });
  if (!items.length) page.append(make('p', 'empty', 'مفيش منتجات لسه.'));
  page.append(grid);
  ctx.el.replaceChildren(page);
}

export default {
  title: (params) => params?.[0] ? 'Studio صفحة الهبوط' : 'Studio صفحات الهبوط',
  destroy() { disposeStudio(); disposeStudio = () => {}; },
  async render(ctx) {
    const code = ctx.params?.[0];
    if (!code) return renderPicker(ctx);
    const owner = ctx.can('owner');
    const editor = ctx.can('products.edit');
    const [pr, lr] = await Promise.all([call('products.get', { code }), call('landing.get', { code })]);
    if (!ctx.el.isConnected) return;
    if (pr.outcome !== 'ok') { fail(pr); return; }
    const p = pr.data.product;
    const landingLive = lr?.outcome === 'ok';
    let state = landingLive ? (lr.data || { version: 0 }) : { version: 0 };
    let design = normalizeDesign(state.draft || defaultDesign());
    let dirty = false;
    let editRevision = 0;
    ctx.setTitle('Studio · ' + p.title);

    const page = make('div', 'page studio-page');
    const head = make('div', 'page-head');
    const headCopy = make('div');
    headCopy.append(button('رجوع لقائمة المنتجات', 'btn-ghost btn-sm', () => ctx.go('studio')));
    headCopy.append(make('h2', '', p.title));
    const meta = make('p', 'row wrap');
    const statusBadge = make('span', 'badge', '');
    statusBadge.dataset.studioStatus = '';
    meta.append(make('span', 'code', p.public_code), statusBadge);
    headCopy.append(meta);
    head.append(headCopy);
    const actions = make('div', 'row wrap studio-actions');
    const saveBtn = button('حفظ كمسودة', 'btn-primary', () => save(), { 'data-studio-save': '' });
    const publishBtn = button('اعتماد ونشر التصميم', 'btn-soft', () => publish(), { 'data-studio-publish': '' });
    const unpublishBtn = button('إيقاف التصميم المنشور', 'btn-ghost', () => unpublish(), { 'data-studio-unpublish': '' });
    const liveLink = make('a', 'btn btn-ghost', 'فتح صفحة المنتج');
    liveLink.href = '/lp/?p=' + encodeURIComponent(code); liveLink.target = '_blank'; liveLink.rel = 'noopener';
    if (editor) actions.append(saveBtn);
    if (owner) actions.append(publishBtn, unpublishBtn);
    actions.append(liveLink);
    head.append(actions);
    page.append(head);
    if (!landingLive) page.append(make('p', 'card warn', 'حفظ التصميم يتطلب تفعيل الخادم (Migration الـ Studio لسه متطبقتش). المعاينة شغالة.'));
    if (!editor) page.append(make('p', 'card', 'صلاحيتك للعرض فقط: تقدر تشوف التصميم والمعاينة بدون حفظ.'));

    const stackEditor = createStudioStackEditor({
      code, title: p.title, initial: state.draft?.studioStack,
      price: Number.isFinite(p.base_price?.amount_minor) ? new Intl.NumberFormat('ar-EG').format(p.base_price.amount_minor / 100) + ' جنيه' : '',
      editable: editor && landingLive,
      legacyPaths: () => design.order.map(slot => design.images[slot]).filter(Boolean),
      onChange: () => { edited(); paintStatus(); }, onBusy: () => paintStatus(),
    });
    page.append(stackEditor.el);

    const layout = make('div', 'studio-layout');
    const controls = make('div', 'studio-controls stack');
    const previewCol = make('div', 'studio-preview-col');
    layout.append(controls, previewCol);
    const legacy = button('إعدادات التصميم السابق', 'btn-soft', () => {
      layout.hidden = !layout.hidden;
      legacy.setAttribute('aria-expanded', String(!layout.hidden));
      if (!layout.hidden) fit();
    }, { 'data-legacy-studio': '' });
    layout.hidden = !state.draft || Boolean(state.draft.studioStack?.photos?.length);
    legacy.setAttribute('aria-expanded', String(!layout.hidden));
    page.append(legacy, layout);

    // ---------- 1. the three marketing images (manual upload only)
    const imagesCard = make('section', 'card stack');
    imagesCard.append(make('h3', '', '1. الصور التسويقية الثلاثة'));
    imagesCard.append(make('p', 'muted', 'ارفع الصور اللي عملتها بنفسك (مثلاً في Gemini). الصور دي منفصلة تمامًا عن صور المورد والمعرض الأصلية للمنتج، ومش بتظهر للعميلات غير بعد النشر.'));
    const slots = make('div', 'studio-slots');
    const slotEls = {};
    ['hero', 'features', 'closing'].forEach(slot => {
      const box = make('div', 'studio-slot');
      box.dataset.slot = slot;
      const thumb = make('div', 'studio-slot-thumb');
      const input = make('input');
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
      input.dataset.slotInput = slot;
      const up = button('رفع صورة', 'btn-soft btn-sm', () => input.click(), { 'data-slot-upload': slot });
      const rm = button('إزالة', 'btn-ghost btn-sm', () => { design.images[slot] = null; changed(); }, { 'data-slot-remove': slot });
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await withBusy(up, async () => {
          let prepared;
          try { prepared = await optimizeUploadImage(file, 'storefront'); }
          catch { island('error', 'الصورة دي مش مدعومة. استخدم JPG أو PNG أو WebP.'); return; }
          const fd = new FormData();
          fd.append('image', prepared.file);
          const r = await uploadLandingImage(code, fd);
          if (r.outcome !== 'saved') { fail(r); return; }
          // Store "<bucket>/<object>" (what the server validates), taken from the public URL when the reply has one.
          const stored = typeof r.url === 'string' && r.url.startsWith(STORAGE) ? r.url.slice(STORAGE.length) : r.path;
          if (typeof stored !== 'string' || !IMAGE_PATH.test(stored)) { island('error', 'الصورة اترفعت بس مسارها مش مقبول للتصميم. جرّب صورة WebP أو JPG تانية.'); return; }
          design.images[slot] = stored;
          changed();
          done('اترفعت ' + LABELS.slot[slot] + '. احفظ المسودة علشان تتسجل.');
        });
      });
      const row = make('div', 'row wrap');
      row.append(up, rm);
      box.append(make('b', '', LABELS.slot[slot]), thumb, row, input);
      slotEls[slot] = { thumb, rm, up };
      slots.append(box);
    });
    imagesCard.append(slots);
    controls.append(imagesCard);

    // ---------- 2. sections order and visibility
    const orderCard = make('section', 'card stack');
    orderCard.append(make('h3', '', '2. ترتيب الأقسام وإظهارها'));
    orderCard.append(make('p', 'muted', 'قسم المنتج (الصور الأصلية والسعر والمقاسات وفورم الطلب) ثابت ومينفعش يتخفي.'));
    const orderList = make('ol', 'studio-order');
    orderCard.append(orderList);
    controls.append(orderCard);

    // ---------- 3. look
    const lookCard = make('section', 'card stack');
    lookCard.append(make('h3', '', '3. شكل الصفحة'));
    const sTemplate = select('template', CHOICES.template, LABELS.template, design.template);
    const sBg = select('background', CHOICES.background, LABELS.background, design.background);
    const sFont = select('font', CHOICES.font, LABELS.font, design.font);
    const sDivider = select('divider', CHOICES.divider, LABELS.divider, design.divider);
    const grid3 = make('div', 'grid2');
    grid3.append(field('القالب', sTemplate), field('خلفية الأقسام', sBg), field('الخط', sFont), field('الفواصل بين الأقسام', sDivider));
    lookCard.append(grid3);
    controls.append(lookCard);

    // ---------- 4. texts
    const textCard = make('section', 'card stack');
    textCard.append(make('h3', '', '4. النصوص'));
    const iTitle = make('input', 'input'); iTitle.name = 'title'; iTitle.maxLength = 120; iTitle.value = design.title;
    const iDesc = make('textarea', 'textarea'); iDesc.name = 'description'; iDesc.rows = 3; iDesc.maxLength = 600; iDesc.value = design.description;
    textCard.append(field('العنوان التسويقي', iTitle, 'مش بيغيّر اسم المنتج في الطلب.'), field('الوصف', iDesc));
    const featureInputs = Array.from({ length: 6 }, (_, i) => {
      const f = make('input', 'input'); f.name = 'feature' + i; f.maxLength = 90; f.value = design.features[i] || '';
      f.placeholder = i === 0 ? 'مثال: خامة ناعمة ومريحة' : 'ميزة ' + (i + 1) + ' (اختياري)';
      return f;
    });
    const featWrap = make('div', 'stack');
    featureInputs.forEach(f => featWrap.append(f));
    textCard.append(field('المميزات (لحد 6)', featWrap, 'اكتب بس المميزات الحقيقية الظاهرة في القطعة.'));
    controls.append(textCard);

    // ---------- 5. CTA
    const ctaCard = make('section', 'card stack');
    ctaCard.append(make('h3', '', '5. زر الطلب'));
    const iCta = make('input', 'input'); iCta.name = 'ctaText'; iCta.maxLength = 40; iCta.value = design.cta.text; iCta.placeholder = 'اطلب الآن';
    const sColor = select('ctaColor', CHOICES.color, LABELS.color, design.cta.color);
    const sPos = select('ctaPosition', CHOICES.position, LABELS.position, design.cta.position);
    const sShape = select('ctaShape', CHOICES.shape, LABELS.shape, design.cta.shape);
    const sSize = select('ctaSize', CHOICES.size, LABELS.size, design.cta.size);
    const sAnim = select('ctaAnimation', CHOICES.animation, LABELS.animation, design.cta.animation);
    const g5 = make('div', 'grid2');
    g5.append(field('نص الزر', iCta), field('اللون', sColor), field('المكان', sPos), field('الشكل', sShape), field('الحجم', sSize), field('الحركة', sAnim, 'بتقف تلقائيًا عند اللي مفعّل تقليل الحركة.'));
    ctaCard.append(g5, make('p', 'muted', 'كل زر بيودّي لفورم الطلب الحالي. التأكيد والسعر والشحن من الخادم زي ما هم.'));
    controls.append(ctaCard);

    // ---------- 6. order card
    const cardCard = make('section', 'card stack');
    cardCard.append(make('h3', '', '6. كارت الطلب'));
    const sCard = select('cardStyle', CHOICES.cardStyle, LABELS.cardStyle, design.orderCard.style);
    const sFields = select('cardFields', CHOICES.fields, LABELS.fields, design.orderCard.fields);
    const iCardTitle = make('input', 'input'); iCardTitle.name = 'cardTitle'; iCardTitle.maxLength = 60; iCardTitle.value = design.orderCard.title; iCardTitle.placeholder = 'تسجيل الطلب';
    const g6 = make('div', 'grid2');
    g6.append(field('الشكل', sCard), field('شكل الخانات', sFields), field('عنوان الكارت', iCardTitle));
    cardCard.append(g6, make('p', 'muted', 'الخانات ثابتة: الاسم، الموبايل، المحافظة، العنوان، اللون والمقاس والكمية، والإجمالي والشحن والدفع عند الاستلام.'));
    controls.append(cardCard);

    // ---------- 7. motion and main colour (presentation only; reduced-motion visitors get a still page)
    const motionCard = make('section', 'card stack');
    motionCard.append(make('h3', '', '7. الحركة واللون الأساسي'));
    const sMotion = select('motionMode', CHOICES.motion, LABELS.motion, design.motion.mode);
    const iHint = make('input', 'input'); iHint.name = 'motionHint'; iHint.maxLength = 60; iHint.value = design.motion.hint; iHint.placeholder = DEFAULT_HINT;
    const photos = [...(pr.data.media?.media || [])].filter(m => !m.hidden && !m.delete_pending).sort((a, b) => a.position - b.position);
    const dirSelects = Array.from({ length: Math.min(MAX_MOTION_IMAGES, Math.max(photos.length - 1, 3)) }, (_, i) =>
      select('motionDir' + i, CHOICES.direction, LABELS.direction, design.motion.dirs[i] || 'side'));
    const dirWrap = make('div', 'grid2');
    dirSelects.forEach((s, i) => {
      const box = make('div', 'row');
      const m = photos[i + 1];
      if (m) { const img = make('img', 'studio-dir-thumb'); img.src = imgUrl(m.storage_path); img.alt = ''; img.loading = 'lazy'; box.append(img); }
      box.append(field('الصورة ' + (i + 2), s));
      dirWrap.append(box);
    });
    const iAccent = make('input', 'input studio-accent'); iAccent.type = 'color'; iAccent.name = 'accent'; iAccent.value = design.accent || '#d100d1';
    let accentOn = !!design.accent;
    const accentNote = make('small', 'muted', '');
    const paintAccentNote = () => { accentNote.textContent = accentOn ? 'اللون الأساسي: ' + iAccent.value : 'بدون لون أساسي: الزرار بالبنفسجي الأساسي للمتجر.'; };
    iAccent.addEventListener('input', () => { accentOn = true; paintAccentNote(); });
    const suggestBtn = button('اقتراح من صور المنتج', 'btn-soft btn-sm', () => suggest(true), { 'data-accent-suggest': '' });
    const clearBtn = button('بدون لون أساسي', 'btn-ghost btn-sm', () => { accentOn = false; paintAccentNote(); readControls(); changed(); }, { 'data-accent-clear': '' });
    // Reads the dominant garment colour from the first product photos (needs CORS-enabled public storage).
    const suggest = async (manual) => {
      for (const m of photos.slice(0, 3)) {
        const hex = await new Promise((resolve) => {
          const img = new Image(); img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const c = document.createElement('canvas'); c.width = 64; c.height = 64;
              const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 64, 64);
              resolve(suggestAccent(g.getImageData(0, 0, 64, 64).data));
            } catch { resolve(''); }
          };
          img.onerror = () => resolve('');
          img.src = imgUrl(m.storage_path);
        });
        if (hex) { iAccent.value = hex; accentOn = true; paintAccentNote(); readControls(); changed(); if (manual) done('اتقترح لون من صور المنتج. تقدر تغيّره.'); return; }
      }
      if (manual) island('error', 'مقدرناش نطلع لون واضح من الصور. اختار اللون بنفسك.');
    };
    paintAccentNote();
    const accentRow = make('div', 'row wrap');
    accentRow.append(iAccent, suggestBtn, clearBtn);
    motionCard.append(field('مود الحركة', sMotion, 'أول صورة بتفتح بدايرة، والباقي بيدخل مع السكرول. بتقف تلقائيًا عند اللي مفعّل تقليل الحركة.'),
      field('اتجاه دخول كل صورة', dirWrap), field('نص توجيه السحب', iHint, 'بيظهر تحت لحد أول سكرول.'),
      field('اللون الأساسي (الزرار، التوجيه، الشريط المتحرك، عداد الشنطة)', accentRow), accentNote);
    controls.append(motionCard);

    // ---------- Structured Design Import: JSON only (e.g. a Claude design), never HTML or scripts
    const importCard = make('details', 'card stack studio-import');
    importCard.append(make('summary', '', 'استيراد تصميم منظم (JSON)'));
    importCard.append(make('p', 'muted', 'الصيغة: {"format":"ssw.landing.v1","design":{"title":"…","description":"…","features":["…"],"background":"navy","font":"readex","cta":{"text":"…","color":"purple","shape":"pill"}}}. الصور بتترفع من هنا بس، وأي HTML أو كود أو سعر بيتشال.'));
    const importText = make('textarea', 'textarea'); importText.rows = 5; importText.dataset.designImport = '';
    const importBtn = button('تطبيق على المسودة', 'btn-soft btn-sm', () => {
      const r = parseDesignImport(importText.value);
      if (!r.ok || r.kind !== 'landing') { island('error', r.ok ? 'ده تصميم صفحة كاملة؛ استورده من مجموعات الإعلانات.' : 'الملف مش بالصيغة المطلوبة (ssw.landing.v1).'); return; }
      // Uploaded images stay unless the import carries valid uploaded paths of its own.
      design = normalizeDesign({ ...r.design, images: Object.fromEntries(Object.entries(r.design.images).map(([k, v]) => [k, v || design.images[k]])) });
      sTemplate.value = design.template; sBg.value = design.background; sFont.value = design.font; sDivider.value = design.divider;
      iTitle.value = design.title; iDesc.value = design.description;
      featureInputs.forEach((f, i) => { f.value = design.features[i] || ''; });
      iCta.value = design.cta.text; sColor.value = design.cta.color; sPos.value = design.cta.position; sShape.value = design.cta.shape; sSize.value = design.cta.size; sAnim.value = design.cta.animation;
      sCard.value = design.orderCard.style; sFields.value = design.orderCard.fields; iCardTitle.value = design.orderCard.title;
      sMotion.value = design.motion.mode; iHint.value = design.motion.hint; dirSelects.forEach((x, i) => { x.value = design.motion.dirs[i] || 'side'; });
      accentOn = !!design.accent; if (design.accent) iAccent.value = design.accent; paintAccentNote();
      changed();
      done('اتطبق التصميم على المسودة' + (r.dropped.length ? ' — اتشال: ' + r.dropped.join('، ') : '') + '. راجعه في المعاينة واحفظ.');
    }, { 'data-design-import-apply': '' });
    importCard.append(importText, importBtn);
    controls.append(importCard);

    // ---------- 7. manual Gemini prompt helper (copy only; no API of any kind)
    const helper = make('details', 'card stack');
    helper.append(make('summary', '', 'مساعد كتابة Prompt يدوي (اختياري)'));
    const sStyle = select('promptStyle', STUDIO_STYLES.map(s => s.key), Object.fromEntries(STUDIO_STYLES.map(s => [s.key, s.label])), 'model');
    const prompt = make('textarea', 'textarea studio-prompt'); prompt.rows = 8; prompt.readOnly = true;
    const paintPrompt = () => { prompt.value = buildGeminiPrompt({ title: p.title, description: p.description, style: sStyle.value }); };
    sStyle.addEventListener('change', paintPrompt); paintPrompt();
    helper.append(field('نوع الصورة', sStyle), prompt, button('نسخ Prompt', 'btn-soft btn-sm', async () => {
      try { await navigator.clipboard.writeText(prompt.value); done('اتنسخ Prompt.'); } catch { island('error', 'حدّد النص وانسخه يدويًا.'); }
    }), make('p', 'muted', 'انسخ النص واستخدمه بنفسك في Gemini، وبعدين ارفع الصورة الناتجة في الخانات فوق. الـ Studio مش بيتصل بأي خدمة توليد صور.'));
    controls.append(helper);

    // ---------- preview: the real landing page, mobile and desktop
    const pvHead = make('div', 'row wrap');
    pvHead.append(make('h3', '', 'المعاينة المباشرة'), make('span', 'space'));
    const seg = make('div', 'seg');
    const frames = {};
    ['mobile', 'desktop'].forEach((kind, i) => {
      const b = make('button', '', kind === 'mobile' ? 'موبايل' : 'كمبيوتر');
      b.type = 'button'; b.dataset.preview = kind; b.setAttribute('aria-selected', String(i === 0));
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
        Object.entries(frames).forEach(([k, f]) => { f.wrap.hidden = k !== kind; });
        fit();
      });
      seg.append(b);
    });
    pvHead.append(seg);
    previewCol.append(pvHead);
    const sizes = { mobile: [390, 800], desktop: [1366, 900] };
    Object.entries(sizes).forEach(([kind, [w, h]]) => {
      const wrap = make('div', 'studio-frame studio-frame--' + kind);
      wrap.hidden = kind !== 'mobile';
      const frame = make('iframe');
      frame.title = 'معاينة ' + (kind === 'mobile' ? 'الموبايل' : 'الكمبيوتر');
      frame.dataset.previewFrame = kind;
      frame.width = String(w); frame.height = String(h);
      frame.src = '/lp/?p=' + encodeURIComponent(code) + '&studio_preview=1';
      wrap.append(frame);
      previewCol.append(wrap);
      frames[kind] = { wrap, frame, w, h };
    });
    previewCol.append(make('p', 'muted', 'اضغط على العنوان أو الصورة أو زر الطلب أو كارت الطلب داخل المعاينة علشان يحدد مكان تعديله في لوحة التحكم. الطلب متوقف داخل المعاينة.'));
    const fit = () => Object.values(frames).forEach(({ wrap, frame, w, h }) => {
      const scale = Math.min(1, (previewCol.clientWidth || w) / w);
      frame.style.transform = `scale(${scale})`;
      wrap.style.height = Math.ceil(h * scale) + 'px';
    });
    addEventListener('resize', fit);

    ctx.el.replaceChildren(page);
    fit();

    // ---------- state <-> controls
    const readControls = () => {
      design = normalizeDesign({
        ...design,
        template: sTemplate.value, background: sBg.value, font: sFont.value, divider: sDivider.value,
        title: iTitle.value, description: iDesc.value, features: featureInputs.map(f => f.value),
        cta: { text: iCta.value, color: sColor.value, position: sPos.value, shape: sShape.value, size: sSize.value, animation: sAnim.value },
        orderCard: { style: sCard.value, fields: sFields.value, title: iCardTitle.value },
        motion: { mode: sMotion.value, hint: iHint.value, dirs: dirSelects.map(x => x.value) },
        accent: accentOn ? iAccent.value : '',
      });
    };
    const previewDesign = () => normalizeDesign({ ...design, images: Object.fromEntries(Object.entries(design.images).map(([k, v]) => [k, v ? mediaUrl(v) : null])) }, { urls: true });
    const send = (frame) => { try { frame.contentWindow?.postMessage({ type: 'lp-studio-design', design: previewDesign() }, location.origin); } catch { /* frame still loading */ } };
    const paintOrder = () => {
      orderList.replaceChildren();
      design.order.forEach((key, i) => {
        const li = make('li', 'studio-order-item');
        li.dataset.section = key;
        li.append(make('b', '', LABELS.section[key]));
        const row = make('div', 'row');
        if (HIDEABLE.includes(key)) {
          const lab = make('label', 'switch');
          const cb = make('input'); cb.type = 'checkbox'; cb.checked = !design.hidden.includes(key); cb.dataset.sectionVisible = key;
          cb.addEventListener('change', () => { design.hidden = cb.checked ? design.hidden.filter(x => x !== key) : [...design.hidden, key]; changed(); });
          lab.append(cb, make('i'), make('span', '', 'ظاهر'));
          row.append(lab);
        }
        const up = button('↑', 'btn-ghost btn-sm', () => move(i, -1), { 'aria-label': 'تحريك لفوق: ' + LABELS.section[key], 'data-section-up': key });
        const down = button('↓', 'btn-ghost btn-sm', () => move(i, 1), { 'aria-label': 'تحريك لتحت: ' + LABELS.section[key], 'data-section-down': key });
        up.disabled = i === 0; down.disabled = i === design.order.length - 1;
        row.append(up, down);
        li.append(row);
        orderList.append(li);
      });
    };
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= design.order.length) return;
      const o = [...design.order];
      [o[i], o[j]] = [o[j], o[i]];
      design.order = o;
      changed();
    };
    const paintSlots = () => Object.entries(slotEls).forEach(([slot, { thumb, rm }]) => {
      thumb.replaceChildren();
      const path = design.images[slot];
      if (path) { const img = make('img'); img.src = mediaUrl(path); img.alt = LABELS.slot[slot]; thumb.append(img); }
      else thumb.append(make('span', 'muted', 'لا توجد صورة'));
      rm.disabled = !path || !editor;
    });
    const paintStatus = () => {
      const published = !!state.published;
      const pending = published && (JSON.stringify(normalizeDesign(state.published)) !== JSON.stringify(design)
        || stackEditor.differsFrom(state.published.studioStack));
      statusBadge.className = 'badge ' + (published ? (pending || dirty ? 'warn' : 'success') : 'info');
      statusBadge.textContent = !state.version ? 'لم يُحفظ بعد'
        : published ? (pending || dirty ? 'منشور — فيه تعديلات غير منشورة' : 'منشور ' + (state.published_at ? ago(state.published_at) : ''))
          : 'مسودة غير منشورة';
      statusBadge.dataset.studioStatus = !state.version ? 'new' : published ? (pending || dirty ? 'changed' : 'published') : 'draft';
      saveBtn.disabled = !editor || !landingLive || stackEditor.pending();
      publishBtn.disabled = !landingLive || !state.version || dirty || stackEditor.pending();
      publishBtn.title = dirty ? 'احفظ المسودة الأول' : '';
      unpublishBtn.hidden = !published;
    };
    function edited() { dirty = true; editRevision++; }
    const changed = () => {
      edited();
      paintOrder(); paintSlots(); paintStatus();
      Object.values(frames).forEach(f => send(f.frame));
    };
    controls.addEventListener('input', (e) => { if (e.target.closest('details')) return; readControls(); edited(); paintStatus(); Object.values(frames).forEach(f => send(f.frame)); });
    controls.addEventListener('change', (e) => { if (e.target.closest('details') || e.target.type === 'file' || e.target.dataset.sectionVisible) return; readControls(); edited(); paintStatus(); Object.values(frames).forEach(f => send(f.frame)); });
    const onMessage = (e) => {
      if (e.origin !== location.origin) return;
      const frame = Object.values(frames).find(x => x.frame.contentWindow === e.source);
      if (!frame) return;
      if (e.data?.type === 'lp-studio-ready') {
        send(frame.frame);
        return;
      }
      if (e.data?.type !== 'lp-studio-select' || !editor) return;
      const { field: selected, slot, index } = e.data;
      let target = null;
      if (selected === 'image' && ['hero', 'features', 'closing'].includes(slot)) {
        target = controls.querySelector('[data-slot-upload="' + slot + '"]');
      } else if (selected === 'title') target = iTitle;
      else if (selected === 'description') target = iDesc;
      else if (selected === 'feature') target = featureInputs[Math.max(0, Math.min(5, Number(index) || 0))];
      else if (selected === 'cta') target = iCta;
      else if (selected === 'orderCard' || selected === 'orderCard.title') target = iCardTitle;
      else if (selected === 'background') target = sBg;
      else if (selected === 'template') target = sTemplate;
      if (!target) return;
      const card = target.closest('.field, .studio-slot') || target;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement && target.type !== 'file') target.select();
    };
    addEventListener('message', onMessage);
    disposeStudio = () => {
      stackEditor.destroy();
      removeEventListener('message', onMessage);
      removeEventListener('resize', fit);
    };
    if (!editor) controls.querySelectorAll('input,select,textarea,button').forEach(x => { if (!x.closest('details')) x.disabled = true; });
    paintOrder(); paintSlots(); paintStatus();
    // A new design starts with a main colour suggested from the product photos; the Owner can change or clear it.
    if (!state.draft && !design.accent && editor) void suggest(false);

    async function save() {
      if (stackEditor.pending()) return;
      readControls();
      const revision = editRevision;
      const stack = stackEditor.payload();
      const payload = { ...state.draft, ...design, ...(stack && { studioStack: stack }) };
      await withBusy(saveBtn, async () => {
        const r = await call('landing.save', { code, version: state.version || 0, design: payload });
        if (!ctx.el.isConnected) return;
        if (r.outcome === 'saved') {
          state = { ...state, version: r.version, draft: r.draft };
          if (revision === editRevision) {
            design = normalizeDesign(r.draft);
            stackEditor.setSaved(r.draft?.studioStack);
            dirty = false;
          }
          paintStatus();
          done(owner ? 'اتحفظت المسودة. راجع المعاينة واضغط «اعتماد ونشر» لما تكون جاهزة.' : 'اتحفظت المسودة. النشر بيكون من إدارة المتجر.');
        } else if (r.outcome === 'conflict') island('error', 'حد تاني عدّل التصميم. افتح الصفحة من جديد علشان تشوف آخر نسخة.');
        else if (r.outcome === 'invalid' && r.field?.startsWith('studioStack')) island('error', 'اتأكد من الصور والنصوص. لو التصميم كبير، قلّل العناصر وحاول تحفظ تاني.');
        else fail(r);
      });
    }
    async function publish() {
      if (dirty) { island('error', 'احفظ المسودة الأول، وبعدين انشر.'); return; }
      const newStack = Boolean(state.draft?.studioStack?.photos?.length);
      const publishText = newStack ? 'هتتحدد النسخة المنشورة. عرض الصور والحركة الجديدة يبدأ بعد تفعيلها في صفحة المنتج.' : 'التصميم المحفوظ هيظهر لكل العميلات على صفحة المنتج.';
      if (!(await confirmDialog({ title: 'نشر التصميم؟', text: publishText, okText: 'نشر' }))) return;
      await withBusy(publishBtn, async () => {
        const r = await call('landing.publish', { code, version: state.version });
        if (r.outcome === 'published') { state = { ...state, published: state.draft, published_at: r.published_at }; paintStatus(); done(newStack ? 'اتحفظت النسخة المنشورة.' : 'اتنشر التصميم على صفحة المنتج.'); }
        else if (r.outcome === 'conflict') island('error', 'التصميم اتعدل بعد آخر تحميل. افتح الصفحة من جديد.');
        else fail(r);
      });
    }
    async function unpublish() {
      if (!(await confirmDialog({ title: 'إيقاف التصميم المنشور؟', text: 'صفحة المنتج هترجع للشكل العادي. المسودة بتفضل محفوظة.', okText: 'إيقاف', danger: true }))) return;
      await withBusy(unpublishBtn, async () => {
        const r = await call('landing.unpublish', { code, version: state.version });
        if (r.outcome === 'unpublished') { state = { ...state, published: null, published_at: null }; paintStatus(); done('اتوقف التصميم المنشور.'); }
        else fail(r);
      });
    }
  },
};
