import { money, fmtNum, withBusy, island, done, fail } from '../ui.js';
import { call, mediaUrl } from '../api.js';
import { uploadPhotos, uploadSummary } from '../photo-upload.js';
import { buildGeminiPrompt, STUDIO_STYLES } from '../studio-prompts.js';

const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
};
const imgUrl = (path) => path ? mediaUrl(/^media\//.test(path) ? 'product-media/' + path : path) : null;
const actionButton = (label, cls, handler) => {
  const b = make('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', handler);
  return b;
};

export default {
  title: (params) => params?.[0] ? 'Studio المنتج' : 'Studio الصور',
  async render(ctx) {
    const { el } = ctx;
    const code = ctx.params?.[0];
    if (!code) {
      const r = await call('products.list', { limit: 100 });
      if (r.outcome !== 'ok') { fail(r); return; }
      const items = (r.data || []).filter(p => p.status !== 'archived');
      const page = make('div', 'page');
      const head = make('div', 'page-head');
      const copy = make('div');
      copy.append(make('h2', '', 'Studio الصور وLanding Page'));
      copy.append(make('p', '', 'اختار موديل علشان تجهز الصور التسويقية وصفحة البيع الخاصة به.'));
      head.append(copy);
      page.append(head);
      const grid = make('div', 'studio-product-grid');
      items.forEach(p => {
        const button = make('button', 'card studio-product-card');
        button.type = 'button';
        const thumb = make('span', 'thumb');
        if (p.image) {
          const img = make('img'); img.src = imgUrl(p.image); img.alt = ''; img.loading = 'lazy'; thumb.append(img);
        } else thumb.textContent = 'صورة';
        const info = make('span');
        info.append(make('b', '', p.title), make('small', 'code', p.public_code), make('small', '', p.status === 'public' ? 'منشور' : 'مسودة'));
        button.append(thumb, info);
        button.addEventListener('click', () => ctx.go('studio/' + p.public_code));
        grid.append(button);
      });
      page.append(grid);
      el.replaceChildren(page);
      return;
    }

    const r = await call('products.get', { code });
    if (r.outcome !== 'ok') { fail(r); return; }
    const d = r.data, p = d.product;
    ctx.setTitle('Studio · ' + p.title);
    const photos = (d.media?.media || []).filter(m => !m.hidden && !m.delete_pending);
    let file = null, objectUrl = null, style = 'model';

    const page = make('div', 'page');
    const head = make('div', 'page-head');
    const headCopy = make('div');
    headCopy.append(actionButton('رجوع للـ Studio', 'btn-ghost btn-sm', () => ctx.go('studio')));
    headCopy.append(make('h2', '', p.title));
    const meta = make('p', 'row');
    meta.append(make('span', 'code', p.public_code), make('span', 'badge ' + (p.status === 'public' ? 'success' : 'info'), p.status === 'public' ? 'منشور' : 'مسودة'));
    headCopy.append(meta);
    head.append(headCopy);
    if (p.status === 'public') {
      const previewLink = make('a', 'btn btn-soft', 'معاينة صفحة البيع');
      previewLink.href = '/lp/?p=' + encodeURIComponent(code);
      previewLink.target = '_blank'; previewLink.rel = 'noopener';
      head.append(previewLink);
    } else head.append(make('span', 'muted', 'معاينة صفحة البيع العامة بعد نشر المنتج'));
    page.append(head);

    const referenceCard = make('section', 'card stack');
    referenceCard.append(make('h3', '', '1. الصور الأصلية المرجعية'));
    referenceCard.append(make('p', 'muted', 'اختار صورة أصلية من المورد، وارفع نفس الصورة داخل Gemini كـ Reference. الصور الأصلية بتفضل محفوظة زي ما هي.'));
    const referenceGrid = make('div', 'studio-reference-grid');
    photos.forEach((m, i) => {
      const label = make('label', 'studio-reference' + (i === 0 ? ' selected' : ''));
      const radio = make('input'); radio.type = 'radio'; radio.name = 'studio-reference'; radio.value = m.id; radio.checked = i === 0;
      const img = make('img'); img.src = imgUrl(m.storage_path); img.alt = ''; img.loading = 'lazy';
      label.append(radio, img, make('small', '', i === 0 ? 'الصورة الأساسية' : 'صورة مرجعية ' + (i + 1)));
      radio.addEventListener('change', () => {
        referenceGrid.querySelectorAll('.studio-reference').forEach(x => x.classList.remove('selected'));
        label.classList.add('selected');
      });
      referenceGrid.append(label);
    });
    if (!photos.length) referenceCard.append(make('p', 'muted', 'ارفع الصور الأصلية من تبويب الصور أولًا، ثم ارجع للـ Studio.'));
    else referenceCard.append(referenceGrid);
    page.append(referenceCard);

    const promptCard = make('section', 'card stack');
    const promptHead = make('div', 'row');
    promptHead.append(make('h3', '', '2. تجهيز Prompt لـ Gemini'), make('span', 'space'), make('span', 'badge info', 'بدون API مدفوع'));
    promptCard.append(promptHead);
    const styleLabel = make('label', 'field');
    styleLabel.append(make('span', '', 'نوع الصورة'));
    const styleSelect = make('select', 'select');
    STUDIO_STYLES.forEach(s => {
      const option = make('option', '', s.label);
      option.value = s.key;
      styleSelect.append(option);
    });
    styleLabel.append(styleSelect);
    promptCard.append(styleLabel);
    const prompt = make('textarea', 'textarea studio-prompt');
    prompt.rows = 9; prompt.readOnly = true;
    promptCard.append(prompt);
    const promptActions = make('div', 'row wrap');
    promptActions.append(actionButton('نسخ Prompt', 'btn-primary', async () => {
      try { await navigator.clipboard.writeText(prompt.value); done('اتنسخ Prompt.'); }
      catch { island('error', 'تعذّر النسخ. حدّد النص وانسخه يدويًا.'); }
    }));
    const aiLink = make('a', 'btn btn-soft', 'فتح Google AI Studio');
    aiLink.href = 'https://aistudio.google.com/';
    aiLink.target = '_blank'; aiLink.rel = 'noopener';
    promptActions.append(aiLink);
    promptCard.append(promptActions);
    promptCard.append(make('p', 'muted', 'داخل Gemini: ارفع الصورة الأصلية كمرجع، الصق الـ Prompt، وراجع تطابق اللون والقصة والخامة قبل تنزيل النتيجة.'));
    page.append(promptCard);

    const uploadCard = make('section', 'card stack');
    uploadCard.append(make('h3', '', '3. مراجعة الصورة الناتجة واعتمادها'));
    const fileLabel = make('label', 'field');
    fileLabel.append(make('span', '', 'ارفع الصورة التي أنشأتها في Gemini'));
    const input = make('input', 'input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    fileLabel.append(input);
    uploadCard.append(fileLabel);
    const outputPreview = make('div', 'studio-output-preview', 'معاينة الصورة الجديدة هتظهر هنا قبل الرفع للموقع.');
    uploadCard.append(outputPreview);
    const checksWrap = make('div', 'studio-checks');
    const checks = [];
    [
      'لون القطعة مطابق للصورة الأصلية.',
      'القصة والخامة والتقفيل والتفاصيل مطابقة.',
      'مفيش نصوص أو شعارات أو مزايا مخترعة.',
    ].forEach(label => {
      const row = make('label');
      const checkbox = make('input'); checkbox.type = 'checkbox';
      row.append(checkbox, make('span', '', label));
      checks.push(checkbox);
      checksWrap.append(row);
    });
    uploadCard.append(checksWrap);
    uploadCard.append(make('p', 'muted', 'الصورة تفضل على جهازك لحد ما تضغط «اعتماد ورفع». لو المنتج منشور، الصورة المعتمدة هتظهر ضمن صوره بعد الرفع.'));
    const approve = actionButton('اعتماد ورفع الصورة للمنتج', 'btn-primary', async (e) => {
      if (!file || !checks.every(x => x.checked)) return;
      const version = d.media?.structure_version ?? p.structure_version ?? 1;
      await withBusy(approve, async () => {
        const result = await uploadPhotos({
          files: [file], code, title: p.title + ' - صورة تسويقية',
          version, grid: uploadGrid, before: uploadBefore,
        });
        if (result.ok === 1) {
          done('اترفعت الصورة بعد اعتمادك. راجع ترتيب الصور والغلاف في تبويب الصور.');
          ctx.go('studio/' + code);
        } else island('error', uploadSummary(result) || 'الصورة لم تترفع.');
      });
    });
    approve.disabled = true;
    uploadCard.append(approve);
    const uploadBefore = make('div');
    const uploadGrid = make('div', 'studio-upload-grid');
    uploadCard.append(uploadBefore, uploadGrid);
    page.append(uploadCard);
    el.replaceChildren(page);

    const paintPrompt = () => { prompt.value = buildGeminiPrompt({ title: p.title, description: p.description, style: styleSelect.value }); };
    styleSelect.addEventListener('change', paintPrompt);
    paintPrompt();
    input.addEventListener('change', () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      file = input.files?.[0] || null;
      outputPreview.replaceChildren();
      if (file) {
        objectUrl = URL.createObjectURL(file);
        const img = make('img'); img.src = objectUrl; img.alt = 'معاينة الصورة الناتجة'; outputPreview.append(img);
      } else outputPreview.textContent = 'معاينة الصورة الجديدة هتظهر هنا قبل الرفع للموقع.';
      approve.disabled = !file || !checks.every(x => x.checked);
    });
    checks.forEach(x => x.addEventListener('change', () => { approve.disabled = !file || !checks.every(c => c.checked); }));
  },
};
