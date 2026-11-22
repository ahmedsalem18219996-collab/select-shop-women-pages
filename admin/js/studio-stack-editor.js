import { html, render, island, fail } from './ui.js';
import { uploadLandingImage, mediaUrl } from './api.js';
import { optimizeUploadImage } from './image-optimize.js';

const PATH = /^women-storefront\/storefront\/[A-Za-z0-9][A-Za-z0-9_-]{0,120}\.(webp|jpg|jpeg|png)$/;
const LIMIT = 8;
const ENTER = ['', 'blur', 'flip', 'zoom', 'slide', 'fade', 'side', 'top', 'curtain', 'rise'];
const LOOPS = ['none', 'bounce', 'float', 'pulse', 'swing'];
const EFFECTS = ['', 'shiny', 'aurora', 'lines', 'glitch', 'sparkle', 'comic', 'neon', '3d', 'glow', 'pop'];
const FONTS = ['', 'Cairo', 'Changa', 'El Messiri', 'Aref Ruqaa', 'Marhey', 'Lalezar'];
const LABEL = {
  '': 'افتراضي', none: 'بدون حركة', blur: 'تمويه', flip: 'قلب', zoom: 'تكبير', slide: 'انزلاق', fade: 'ظهور تدريجي',
  bounce: 'قفزة', float: 'طفو', pulse: 'نبض', swing: 'تمايل', auto: 'تلقائي', fill: 'إظهار الصورة كاملة', cover: 'ملء الإطار',
  side: 'من الجنب', top: 'من فوق', curtain: 'ستارة', rise: 'صعود', bottom: 'أسفل', both: 'أعلى وأسفل', full: 'كامل', '3d': '3D',
};

const blankPhoto = path => ({ path, enter: '', loop: 'none', fit: 'auto', shade: '', overlays: [] });
const blankText = () => ({ type: 'text', text: '', x: 50, y: 45, size: 1, font: '', fx: '', in: 'pop', anim: 'none', color: '', fxc: '' });
const clone = value => value?.v === 1 && Array.isArray(value.photos)
  ? structuredClone({ ...value, photos: value.photos.filter(item => PATH.test(item.path)) }) : undefined;
const short = (text, max) => [...text].slice(0, max).join('');

function select(key, label, values, selected) {
  const options = values.includes(selected) || !selected ? values : [...values, selected];
  return html`<label class="field"><span>${label}</span>
    <select class="select" data-field="${key}">${options.map(value => html`<option value="${value}" ${value === selected ? 'selected' : ''}>${LABEL[value] || value}</option>`)}</select>
  </label>`;
}
const color = (key, label, selected, fallback) => html`<div class="studio-stack-color row wrap">
  <label class="field"><span>${label}</span><input type="color" value="${selected || fallback}" data-field="${key}"></label>
  <button type="button" class="btn btn-ghost btn-sm" data-clear="${key}" ${selected ? '' : 'disabled'}>افتراضي</button>
</div>`;
const range = (key, label, value, min, max, step = 1) => html`<label class="field"><span>${label}</span>
  <input type="range" data-field="${key}" value="${value}" min="${min}" max="${max}" step="${step}">
</label>`;

export function createStudioStackEditor({ code, title, initial, legacyPaths, editable, onChange, onBusy }) {
  let stack = clone(initial);
  let active = 0, layer = 0, uploading = false, timer, device = 'mobile';
  const el = document.createElement('section');
  el.className = 'card stack studio-stack-editor';
  render(el, html`<div class="stack"><h3>استوديو الصور والحركة</h3>
    <p class="muted">ارفع لحد 8 صور وحط النصوص والحركة عليها. عرض التصميم للعميلات يبدأ بعد تشغيله في صفحة المنتج.</p></div>
    <div class="studio-stack-layout">
      <fieldset class="studio-stack-fields"></fieldset>
      <section class="stack studio-stack-preview"><div class="row wrap">
        <h4>المعاينة الحية</h4><span class="space"></span>
        <button type="button" class="btn btn-soft btn-sm" data-stack-device="mobile" aria-pressed="true">موبايل</button>
        <button type="button" class="btn btn-soft btn-sm" data-stack-device="desktop" aria-pressed="false">كمبيوتر</button>
      </div>
      <div class="studio-stack-frame"><iframe title="معاينة تصميم الصور" src="${new URL('../studio/preview.html', import.meta.url).href}" loading="lazy"></iframe></div>
      <button type="button" class="btn btn-ghost btn-sm" data-stack-show>روح للصورة المحددة في المعاينة</button></section>
    </div>`);
  const fields = el.querySelector('fieldset'), frame = el.querySelector('iframe'), viewport = frame.parentElement;
  const show = el.querySelector('[data-stack-show]');
  const current = () => stack?.photos[active];
  const ensure = () => (stack ??= { v: 1, accent: '', photos: [] });
  function send() {
    if (el.isConnected) frame.contentWindow?.postMessage({ type: 'women-stack-preview', title, stack }, location.origin);
  }
  function fit() {
    const [w, h] = device === 'mobile' ? [390, 680] : [1100, 860];
    const scale = Math.min(1, (viewport.clientWidth || w) / w);
    Object.assign(frame.style, { width: w + 'px', height: h + 'px', transform: 'scale(' + scale + ')' });
    viewport.style.height = Math.floor(h * scale) + 'px';
  }
  const observer = new ResizeObserver(fit);
  observer.observe(viewport);
  frame.addEventListener('load', send);
  const devices = [...el.querySelectorAll('[data-stack-device]')];
  for (const button of devices) button.onclick = () => {
    device = button.dataset.stackDevice;
    for (const option of devices) option.setAttribute('aria-pressed', String(option === button));
    fit();
  };
  show.onclick = () => frame.contentWindow?.postMessage({ type: 'women-stack-focus', index: active }, location.origin);

  function paint() {
    const photos = stack?.photos || [], photo = current(), overlay = photo?.overlays[layer];
    render(fields, html`
      ${color('accent', 'اللون الرئيسي', stack?.accent, '#111111')}
      ${editable ? html`<div class="row wrap">
        <label class="btn btn-primary btn-sm studio-stack-upload">رفع صور <input type="file" data-stack-files multiple accept="image/jpeg,image/png,image/webp" ${photos.length >= LIMIT ? 'disabled' : ''}></label>
        ${!photos.length && legacyPaths().length ? html`<button type="button" class="btn btn-soft btn-sm" data-import>استخدم صور التصميم الحالي</button>` : ''}
      </div>` : ''}
      ${photos.length ? html`<ol class="studio-stack-list">${photos.map((item, index) => html`<li class="row wrap">
        <button type="button" class="btn btn-ghost studio-stack-photo" data-pick="${index}" aria-pressed="${index === active}"><img alt="" src="${mediaUrl(item.path)}">صورة ${index + 1}</button>
        ${editable ? html`<button type="button" class="btn btn-ghost btn-sm" data-move="${index}:-1" aria-label="حرّك صورة ${index + 1} لفوق" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-move="${index}:1" aria-label="حرّك صورة ${index + 1} لتحت" ${index === photos.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
      </li>`)}</ol>` : html`<p class="muted">لسه مفيش صور في التصميم الجديد.</p>`}
      ${photo ? html`<section class="stack studio-stack-photo-controls"><h4>الصورة ${active + 1}</h4>
        <div class="studio-stack-options">
          ${select('enter', 'حركة دخول الصورة', ENTER, photo.enter || '')}
          ${select('loop', 'حركة مستمرة للصورة', LOOPS, photo.loop || 'none')}
          ${select('fit', 'ملاءمة الصورة', ['auto','fill','cover'], photo.fit || 'auto')}
          ${select('shade', 'تظليل الصورة', ['','bottom','top','both','full'], photo.shade || '')}
        </div>
        <div class="row wrap"><b>النصوص على الصورة</b><span class="space"></span>
          ${editable ? html`<button type="button" class="btn btn-soft btn-sm" data-add-text ${photo.overlays.length >= 24 ? 'disabled' : ''}>إضافة نص</button>` : ''}</div>
        ${overlay ? html`<label class="field"><span>العنصر المحدد</span>
          <select class="select" data-layer>${photo.overlays.map((item, index) => html`<option value="${index}" ${index === layer ? 'selected' : ''}>${short(item.text || 'عنصر ' + (index + 1), 32)}</option>`)}</select></label>
          <label class="field"><span>النص على الصورة</span><textarea class="input" rows="2" data-field="text">${overlay.text || ''}</textarea></label>
          <div class="studio-stack-options">
            ${select('font', 'خط النص', FONTS, overlay.font || '')}
            ${select('fx', 'إفيكت النص', EFFECTS, overlay.fx || '')}
            ${color('color', 'لون النص', overlay.color, '#ffffff')}
            ${color('fxc', 'لون الإفيكت', overlay.fxc, stack.accent || '#111111')}
            ${select('in', 'دخول النص', ['pop','slide','zoom','spin','drop','type','blur','flip'], overlay.in || 'pop')}
            ${select('anim', 'حركة النص المستمرة', [...LOOPS,'shake','neon','heart'], overlay.anim || 'none')}
            ${range('x', 'المكان أفقيًا', overlay.x ?? 50, 0, 100)}
            ${range('y', 'المكان رأسيًا', overlay.y ?? 45, 0, 100)}
            ${range('size', 'الحجم', overlay.size ?? 1, .6, 2.5, .1)}
          </div>
          ${editable ? html`<button type="button" class="btn btn-ghost btn-sm" data-remove-text>إزالة العنصر</button>` : ''}` : ''}
        ${editable ? html`<button type="button" class="btn btn-ghost btn-sm" data-remove-photo>شيل الصورة من التصميم</button>` : ''}</section>` : ''}`);
    fields.disabled = uploading;
    if (!editable) for (const input of fields.querySelectorAll('[data-field], [data-clear]')) input.disabled = true;
    show.disabled = !photo;
  }
  function preview() { clearTimeout(timer); timer = setTimeout(send, 100); }
  function changed(repaint = true) { if (repaint) paint(); preview(); onChange(); }
  fields.onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-pick')) {
      active = Number(button.dataset.pick); layer = 0; paint(); return;
    }
    if (!editable || uploading) return;
    const photo = current();
    if (button.hasAttribute('data-import')) ensure().photos = legacyPaths().filter(path => PATH.test(path)).slice(0, LIMIT).map(blankPhoto);
    else if (button.dataset.move) {
      const [index, delta] = button.dataset.move.split(':').map(Number), next = index + delta;
      if (next < 0 || next >= stack.photos.length) return;
      [stack.photos[index], stack.photos[next]] = [stack.photos[next], stack.photos[index]];
      active = next; layer = 0;
    } else if (button.hasAttribute('data-add-text') && photo?.overlays.length < 24) {
      photo.overlays.push(blankText()); layer = photo.overlays.length - 1;
    } else if (button.hasAttribute('data-remove-text') && photo?.overlays[layer]) {
      photo.overlays.splice(layer, 1); layer = Math.max(0, layer - 1);
    } else if (button.hasAttribute('data-remove-photo') && photo) {
      stack.photos.splice(active, 1); active = Math.max(0, Math.min(active, stack.photos.length - 1)); layer = 0;
    } else if (button.dataset.clear) {
      const key = button.dataset.clear, target = key === 'accent' ? ensure() : photo?.overlays[layer];
      if (!target) return;
      target[key] = '';
    } else return;
    changed();
    if (button.hasAttribute('data-add-text')) fields.querySelector('[data-field="text"]')?.focus();
  };
  fields.oninput = event => {
    const input = event.target, key = input.dataset.field, photo = current();
    if (!editable || uploading || !key) return;
    const target = key === 'accent' ? ensure() : ['enter','loop','fit','shade'].includes(key) ? photo : photo?.overlays[layer];
    if (!target) return;
    const value = key === 'text' ? short(input.value, 80) : input.type === 'range' ? input.valueAsNumber : input.value;
    if (key === 'text') {
      if (input.value !== value) input.value = value;
      const option = fields.querySelector('[data-layer]').options[layer];
      option.textContent = short(value || 'عنصر ' + (layer + 1), 32);
    }
    target[key] = value;
    const reset = input.closest('.studio-stack-color')?.querySelector('[data-clear]');
    if (reset) reset.disabled = false;
    changed(false);
  };
  fields.onchange = async event => {
    if (event.target.hasAttribute('data-layer')) { layer = Number(event.target.value); paint(); return; }
    if (!editable || uploading || !event.target.hasAttribute('data-stack-files')) return;
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    const available = LIMIT - (stack?.photos.length || 0);
    if (files.length > available) { island('error', 'المساحة المتاحة ' + available + ' صور.'); return; }
    uploading = true; fields.disabled = true; onBusy();
    let added = 0;
    try {
      for (const file of files) {
        let prepared;
        try { prepared = await optimizeUploadImage(file, 'storefront'); }
        catch { island('error', 'استخدم صورة JPG أو PNG أو WebP مدعومة.'); break; }
        if (!el.isConnected) break;
        const body = new FormData(); body.append('image', prepared.file);
        const result = await uploadLandingImage(code, body);
        if (!el.isConnected) break;
        if (result.outcome !== 'saved') { fail(result); break; }
        const storage = mediaUrl('women-storefront/');
        const path = typeof result.url === 'string' && result.url.startsWith(storage)
          ? 'women-storefront/' + result.url.slice(storage.length) : result.path;
        if (!PATH.test(path)) { island('error', 'مسار الصورة المرفوعة مش صالح للتصميم.'); break; }
        ensure().photos.push(blankPhoto(path)); added++;
      }
      if (added && el.isConnected) { active = stack.photos.length - added; layer = 0; changed(false); }
    } finally {
      uploading = false;
      if (el.isConnected) { paint(); onBusy(); }
    }
  };
  paint(); preview();
  return {
    el, payload: () => stack, pending: () => uploading,
    differsFrom: value => JSON.stringify(clone(value)) !== JSON.stringify(stack),
    setSaved(value) { stack = clone(value); paint(); preview(); },
    destroy() { clearTimeout(timer); observer.disconnect(); },
  };
}
