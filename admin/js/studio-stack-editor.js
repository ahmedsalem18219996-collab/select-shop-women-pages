import { html, render, island, fail, icon } from './ui.js';
import { uploadLandingImage, mediaUrl } from './api.js';
import { optimizeUploadImage } from './image-optimize.js';
import { accentFromImage, applyAccent, fitRibbonLabels, makeStrip, mountPhoto, playEnter, renderOverlays } from '../studio/motion.js?v=20261123-studio-v2';
import { createMarquee, createScrollHint } from '../studio/studio-v2-motion.js?v=20261123-studio-v2';
import { EFFECTS, ELEMENTS, ENTRIES, FITS, FONTS, LOOPS, SCROLL_HINTS, SHADES, TEMPLATES, TEXT_ENTRIES, TEXT_LOOPS } from './studio-visual-options.js?v=20261123-studio-v2';
import { STUDIO_COPY, getStudioCopyWarnings } from './studio-copy.js?v=20261123-studio-v2';

const PATH = /^women-storefront\/storefront\/[A-Za-z0-9][A-Za-z0-9_-]{0,120}\.(webp|jpg|jpeg|png)$/;
const LIMIT = 8, MAX_LAYERS = 24;
const TEMPLATE_KEY = 'women.studio.photo-presets.v1';
const SECTIONS_KEY = 'women.studio.sections.v2';
const OPEN_SECTIONS = new Set(['copy','effect','personal','templates','elements','layers','photos','accent']);
const COPY_CATEGORIES = Object.keys(STUDIO_COPY);
const DEFAULT_MARQUEE = { enabled:true, position:'above' };
const DEFAULT_HINT = { style:'pill', gradient:false };
const TABS = [['templates','قوالب','▦'], ['elements','عناصر','✦'], ['photo','الصورة','▣'], ['page','الصفحة','◐']];
const PALETTE = ['#FFFFFF','#111111','#2563EB','#D0021B','#FF2D8A','#D8B36A','#16A34A','#7C3AED'];
const PHOTO_FIELDS = new Set(['enter','loop','fit','shade']);
const MOTION_FIELDS = new Set(['enter','loop','in','anim','delay']);
const TEXT_TYPES = new Set(['text','badge','callout']);
const CONNECTORS = new Set(['arrow','callout']);
const TEXT_SHADOWS = [['soft','تلقائي'], ['','من غير']];
const PATH_ASSET = name => new URL('../studio/' + name, import.meta.url).href;
const blankPhoto = path => ({ path, enter:'', loop:'none', fit:'auto', shade:'', overlays:[] });
const blankOverlay = type => ({ type, text: TEXT_TYPES.has(type) ? 'اكتب هنا' : '', x:50, y:45, x2:63, y2:51,
  size:type === 'text' ? 1 : .8, rot:0, in:'pop', anim:'none', sh:TEXT_TYPES.has(type) ? 'soft' : '' });
const ribbonLayer = strip => ({ ...blankOverlay('badge'), fx:'ribbon', size:1, y:82,
  text:strip?.text ?? 'شريط هنا', color:strip?.color ?? '', rot:strip?.rot ?? 0 });
const isRibbon = item => item.type === 'badge' && item.fx === 'ribbon';
const short = (text, max) => [...String(text ?? '')].slice(0,max).join('');
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const round = n => Math.round(n * 10) / 10;
function positionLayer(item, axis, value, origin = item) {
  if (!CONNECTORS.has(item.type)) { item[axis] = value; return; }
  const end = axis + '2', from = origin[axis], to = origin[end] ?? from;
  const delta = clamp(value - from, -Math.min(from,to), 100 - Math.max(from,to));
  item[axis] = round(from + delta);
  item[end] = round(to + delta);
}
function sizeLayer(item, size, origin = item) {
  if (CONNECTORS.has(item.type)) {
    const ratio = size / (origin.size ?? 1);
    item.x2 = round(clamp(origin.x + ((origin.x2 ?? origin.x) - origin.x) * ratio,0,100));
    item.y2 = round(clamp(origin.y + ((origin.y2 ?? origin.y) - origin.y) * ratio,0,100));
  }
  item.size = size;
}
const clone = data => data?.v === 1 && Array.isArray(data.photos)
  ? structuredClone({ ...data, photos: data.photos.filter(photo => PATH.test(photo?.path)) }) : undefined;

function loadStyles() {
  for (const file of ['motion.css?v=20261123-studio-v2', 'studio-v2-motion.css?v=20261123-studio-v2', 'fonts/fonts-studio.css']) {
    const url = PATH_ASSET(file);
    if (document.querySelector('link[href="' + url + '"]')) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.append(link);
  }
}
function localTemplates() {
  try {
    const data = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
    return Array.isArray(data) ? data.filter(t => typeof t?.name === 'string' && Array.isArray(t.items)).slice(0,20) : [];
  } catch { return []; }
}
function localSections() {
  try {
    const stored = JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch { return {}; }
}
const group = (label, body) => label ? html`<section class="studio-visual-group"><h5>${label}</h5>${body}</section>` : body;
const action = (key, text, icon, disabled = false) => html`<button type="button" class="studio-visual-chip" data-action="${key}" ${disabled ? 'disabled' : ''}><b aria-hidden="true">${icon}</b>${text}</button>`;
const deck = (field, label, items, selected, mode = '') => group(label, html`<div class="studio-visual-deck" data-deck="${mode}">
  ${items.map(([value, name]) => html`<button type="button" class="studio-visual-choice" data-choice="${field}" data-value="${value}" aria-pressed="${String(value === selected)}">
    ${mode ? html`<span class="studio-visual-sample" aria-hidden="true" data-sample="${mode}" data-sample-value="${value}">${mode === 'font' ? 'أناقة' : ''}</span>` : ''}
    <span>${name}</span>
  </button>`)}
</div>`);
const field = (key, label, value, min, max, step = 1) => html`<label class="studio-visual-field"><span>${label}</span>
  <input type="range" data-field="${key}" value="${value}" min="${min}" max="${max}" step="${step}">
</label>`;
const swatches = (key, label, current, fallback) => group(label, html`<div class="studio-visual-swatches">
  ${PALETTE.map(value => html`<button type="button" data-choice="${key}" data-value="${value}" aria-label="${value}" aria-pressed="${String(current === value)}" style="--swatch:${value}"></button>`)}
  <label class="studio-visual-chip"><input type="color" data-field="${key}" value="${current || fallback}"> لون حر</label>
  <button type="button" class="studio-visual-chip" data-choice="${key}" data-value="" aria-pressed="${String(!current)}">افتراضي</button>
</div>`);

export function createStudioStackEditor({ code, title, initial, legacyPaths, editable, marqueeSettings, onChange, onBusy }) {
  loadStyles();
  let stack = clone(initial), photoIndex = 0, layerIndex = -1, tab = 'templates', uploading = false;
  let playing = false, photoMode = 'add', playTimer, move, device = 'mobile', editedField;
  let copyCategory = COPY_CATEGORIES[0];
  let personal = localTemplates();
  const sections = localSections();
  const history = [], el = document.createElement('section');
  el.className = 'studio-stack-editor studio-visual';
  render(el, html`
    <header class="studio-visual-head">
      <h3><span aria-hidden="true">S</span> استوديو الصفحات</h3>
      <div class="studio-visual-actions">
        <button type="button" class="studio-visual-chip" data-action="undo" aria-label="تراجع">↶</button>
        <button type="button" class="studio-visual-chip" data-action="full" aria-label="الصفحة كاملة">${icon('eye')}<span>الصفحة كاملة</span></button>
        <button type="button" class="studio-visual-play" data-action="play">▶ شغّل</button>
      </div>
    </header>
    <div class="studio-visual-workspace">
      <section class="studio-visual-center" aria-label="معاينة الموبايل">
        <div class="studio-visual-runway"><div class="studio-visual-stage ssm-edit" data-visual-stage></div></div>
        <div class="studio-visual-photos" aria-label="صور التصميم"></div>
      </section>
      <section class="studio-visual-tools" aria-label="أدوات التصميم"></section>
      <aside class="studio-visual-inspector" aria-label="العنصر المختار"></aside>
    </div>
    <input type="file" data-stack-files accept="image/jpeg,image/png,image/webp" multiple hidden>
    <dialog class="studio-visual-dialog">
      <div class="studio-visual-dialog-head">
        <b>معاينة الصفحة كاملة</b>
        <button type="button" class="studio-visual-chip" data-device="mobile" aria-pressed="true">موبايل</button>
        <button type="button" class="studio-visual-chip" data-device="desktop" aria-pressed="false">كمبيوتر</button>
        <button type="button" class="studio-visual-chip" data-action="close" aria-label="اقفل المعاينة">✕</button>
      </div>
      <div class="studio-visual-frame"><iframe title="معاينة تصميم الصور"></iframe></div>
    </dialog>`);
  const stage = el.querySelector('[data-visual-stage]');
  const center = el.querySelector('.studio-visual-center');
  const tools = el.querySelector('.studio-visual-tools');
  const inspector = el.querySelector('.studio-visual-inspector');
  const thumbnails = el.querySelector('.studio-visual-photos');
  const input = el.querySelector('[data-stack-files]');
  const dialog = el.querySelector('dialog'), frame = dialog.querySelector('iframe');
  const undo = el.querySelector('[data-action="undo"]'), play = el.querySelector('[data-action="play"]');
  const photos = () => stack?.photos || [];
  const current = () => photos()[photoIndex];
  const selected = () => layerIndex === 'strip' ? current()?.strip : current()?.overlays[layerIndex];
  const canEdit = () => editable && !uploading;
  const ensure = () => (stack ??= { v:1, accent:'', photos:[], marquee:{ ...DEFAULT_MARQUEE }, scrollHint:{ ...DEFAULT_HINT } });
  const marquee = () => ({ ...DEFAULT_MARQUEE, ...stack?.marquee });
  const hint = () => ({ ...DEFAULT_HINT, ...stack?.scrollHint });
  const isOpen = key => typeof sections[key] === 'boolean' ? sections[key] : OPEN_SECTIONS.has(key);

  function send() {
    if (dialog.open) frame.contentWindow?.postMessage({ type:'women-stack-preview', title, stack, marqueeSettings }, location.origin);
  }
  function sizeFrame() {
    if (!dialog.open) return;
    const [w,h] = device === 'mobile' ? [390,680] : [1100,860];
    const scale = Math.min(1, (frame.parentElement.clientWidth || w) / w, (innerHeight - 160) / h);
    Object.assign(frame.style, { width: w + 'px', height: h + 'px', transform: 'scale(' + scale + ')' });
    frame.parentElement.style.height = Math.floor(h * scale) + 'px';
  }
  const observer = new ResizeObserver(() => { sizeFrame(); fitRibbonLabels(stage); samples(tools); samples(inspector); });
  observer.observe(dialog);
  observer.observe(stage);
  frame.addEventListener('load', send);

  function snapshot() {
    history.push({ stack:clone(stack), photoIndex, layerIndex });
    if (history.length > 32) history.shift();
    undo.disabled = false;
  }
  function editPosition(item, end) {
    return end ? [item.x2 ?? item.x, item.y2 ?? item.y] : [item.x, item.y];
  }
  function drawStage() {
    const photo = current();
    stage.replaceChildren();
    delete stage.dataset.marqueePosition;
    stage.classList.toggle('ssm-edit', !playing);
    center.classList.toggle('is-playing', playing);
    play.textContent = playing ? '✎ تعديل' : '▶ شغّل';
    play.disabled = !photo;
    applyAccent(stage, stack?.accent || '#2563eb');
    if (!photo) {
      render(stage, html`<div class="studio-visual-empty"><strong>معاينة الموبايل</strong>
        ${editable ? action('add','ضيف أول صورة','＋',uploading) : ''}</div>`);
      return;
    }
    const card = document.createElement('div'), wrap = document.createElement('div');
    card.className = 'ssm-card';
    wrap.className = 'ssm-wrap';
    wrap.dataset.photoLoop = photo.loop || 'none';
    card.append(wrap);
    stage.append(card);
    if (stack?.marquee || stack?.scrollHint) {
      const options = marquee();
      const banner = options.enabled && createMarquee(marqueeSettings, { preview:true });
      if (banner) {
        stage.dataset.marqueePosition = options.position;
        if (options.position === 'above') stage.prepend(banner);
        else stage.append(banner);
      }
      if (photoIndex === 0) {
        const guide = createScrollHint(hint(), { preview:true, count:photos().length });
        if (guide) wrap.append(guide);
      }
    }
    mountPhoto(wrap, { url:mediaUrl(photo.path), alt:'صورة ' + (photoIndex + 1), fit:photo.fit, shade:photo.shade }, true);
    const layer = renderOverlays(wrap, photo.overlays);
    if (photo.strip?.text) {
      const strip = makeStrip(photo.strip.text, photo.strip.rot, photo.strip.color);
      if (!playing) {
        strip.dataset.overlay = 'strip';
        strip.tabIndex = 0;
        strip.removeAttribute('aria-hidden');
        strip.setAttribute('role','button');
        strip.setAttribute('aria-label','اختار شريط الكلام');
      }
      stage.append(strip);
    }
    if (playing) {
      if (photo.enter) playEnter(wrap, photo.enter);
      requestAnimationFrame(() => { if (card.isConnected) card.classList.add('ssm-in'); });
      return;
    }
    for (const overlay of layer.querySelectorAll('[data-i]')) {
      overlay.dataset.overlay = overlay.dataset.i;
      overlay.setAttribute('aria-hidden','true');
    }
    photo.overlays.forEach((item, index) => {
      if (isRibbon(item)) return; // use the ribbon itself, leaving the caption uncovered
      for (const end of CONNECTORS.has(item.type) ? [false,true] : [false]) {
        const handle = document.createElement('button');
        const [x,y] = editPosition(item,end);
        handle.className = 'studio-visual-handle';
        handle.type = 'button';
        handle.dataset.overlay = String(index);
        handle.dataset.end = end ? '1' : '';
        handle.setAttribute('aria-label', 'اختار ' + short(item.text || ELEMENTS.find(([key]) => key === item.type)?.[1] || 'العنصر', 36));
        handle.setAttribute('aria-pressed', String(index === layerIndex));
        handle.style.left = clamp(x,0,100) + '%';
        handle.style.top = clamp(y,0,100) + '%';
        wrap.append(handle);
      }
    });
    const active = layer.querySelector('[data-i="' + layerIndex + '"]');
    if (active) {
      const box = wrap.getBoundingClientRect(), rect = active.getBoundingClientRect();
      if (box.width && box.height) {
        const handle = document.createElement('button');
        handle.className = 'studio-visual-handle studio-visual-resize';
        handle.type = 'button';
        handle.dataset.resize = String(layerIndex);
        handle.setAttribute('aria-label','غيّر حجم العنصر بالسحب');
        handle.textContent = '↘';
        handle.style.left = clamp(Math.max(rect.right - box.left + 4, rect.left - box.left + 36),22,box.width - 22) + 'px';
        handle.style.top = clamp(Math.max(rect.bottom - box.top + 10, rect.top - box.top + 31),22,box.height - 22) + 'px';
        wrap.append(handle);
      }
    }
  }

  function samples(root) {
    for (const sample of root.querySelectorAll('[data-sample]:not([data-ready])')) {
      if (sample.closest('details:not([open])') || !sample.getClientRects().length) continue;
      sample.dataset.ready = '';
      const value = sample.dataset.sampleValue;
      if (sample.dataset.sample === 'hint') {
        applyAccent(sample, stack?.accent || '#2563eb');
        const guide = createScrollHint({ style:value, gradient:hint().gradient }, { preview:true, count:3 });
        if (guide) sample.append(guide);
      } else if (sample.dataset.sample === 'effect' || sample.dataset.sample === 'text-entry') {
        const effect = sample.dataset.sample === 'effect';
        renderOverlays(sample, [{ ...blankOverlay('text'), text:'ستايل', fx:effect ? value : '', in:effect ? 'pop' : value, x:50, y:50 }]);
        const preview = () => {
          sample.classList.remove('ssm-in');
          requestAnimationFrame(() => { if (sample.isConnected) sample.classList.add('ssm-in'); });
        };
        sample.parentElement.addEventListener('pointerenter', preview);
        sample.parentElement.addEventListener('focus', preview);
      } else if (sample.dataset.sample === 'font') {
        sample.style.fontFamily = value ? '"' + value + '",sans-serif' : '';
      } else {
        const card = document.createElement('i');
        card.className = 'studio-visual-motion-mini';
        sample.dataset.motion = value;
        sample.append(card);
        if (sample.dataset.sample === 'entry' && value) {
          const preview = () => playEnter(card, value, 520);
          sample.parentElement.addEventListener('pointerenter', preview);
          sample.parentElement.addEventListener('focus', preview);
        }
      }
    }
  }
  const templateCard = (template, index, own = false) => html`<button type="button" class="studio-visual-template" data-template="${index}" data-own="${String(own)}" ${canEdit() && current() ? '' : 'disabled'}>
    <span class="studio-visual-template-preview" aria-hidden="true">${template.items.slice(0,MAX_LAYERS).map(item => html`<i style="left:${clamp(item.x,10,90)}%;top:${clamp(item.y,12,88)}%"></i>`)}${template.strip ? html`<em></em>` : ''}</span>
    ${template.name}
  </button>`;
  const section = (key, label, body) => html`<details class="studio-visual-section" data-section="${key}" ${isOpen(key) ? 'open' : ''}>
    <summary><span>${label}</span>${icon('chev')}</summary><div class="studio-visual-section-body">${body}</div>
  </details>`;
  const allSectionsButton = html`<button type="button" class="studio-visual-chip studio-visual-toggle-all" data-action="sections">فتح الكل</button>`;
  const copyId = 'studio-copy-' + code;
  function copyLibrary() {
    return html`<div class="studio-visual-copy-tabs" role="tablist" aria-label="أنواع النصوص">
      ${COPY_CATEGORIES.map(key => html`<button type="button" id="${copyId}-tab-${key}" role="tab" data-copy-tab="${key}"
        aria-controls="${copyId}-panel-${key}" aria-selected="${String(key === copyCategory)}" tabindex="${key === copyCategory ? 0 : -1}">${STUDIO_COPY[key].label}</button>`)}
      </div>
      ${COPY_CATEGORIES.map(key => html`<div class="studio-visual-copy-list" role="tabpanel" id="${copyId}-panel-${key}"
        aria-labelledby="${copyId}-tab-${key}" data-copy-panel="${key}" ${key === copyCategory ? '' : 'hidden'}>
        ${STUDIO_COPY[key].phrases.map((phrase, index) => html`<button type="button" class="studio-visual-chip" data-copy-index="${index}">${phrase}</button>`)}
      </div>`)}`;
  }
  function switchCopyTab(key) {
    copyCategory = key;
    for (const button of inspector.querySelectorAll('[data-copy-tab]')) {
      const active = button.dataset.copyTab === key;
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-selected', String(active));
      if (active) button.focus({ preventScroll:true });
    }
    for (const panel of inspector.querySelectorAll('[data-copy-panel]')) panel.hidden = panel.dataset.copyPanel !== key;
  }
  function updateWarnings(value) {
    const warning = inspector.querySelector('[data-copy-warning]');
    if (!warning) return;
    const { restricted, price } = getStudioCopyWarnings(value);
    warning.textContent = [
      restricted && 'النص فيه كلام غير مسموح عند النشر. تقدري تعدّليه وتحفظي المسودة.',
      price && 'استخدمي السعر من بيانات المنتج وشيلي رقم السعر من النص.',
    ].filter(Boolean).join(' ');
  }
  function updateSectionsButton(panel) {
    const details = [...panel.querySelectorAll('details[data-section]')].filter(d => d.getClientRects().length);
    const button = panel.querySelector('[data-action="sections"]');
    if (button) button.textContent = details.length && details.every(d => d.open) ? 'قفل الكل' : 'فتح الكل';
    return details;
  }
  function rememberSections() {
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections)); } catch { /* The in-memory state still applies. */ }
  }
  const toggle = (key, label, checked) => html`<label class="studio-visual-switch"><span>${label}</span>
    <input type="checkbox" role="switch" data-design-toggle="${key}" ${checked ? 'checked' : ''}></label>`;

  function drawPanels() {
    const photo = current(), item = selected(), layerName = layerIndex === 'strip' ? 'شريط الكلام' : (item?.text || 'العنصر المختار');
    const editableText = TEXT_TYPES.has(item?.type) || layerIndex === 'strip';
    const active = document.activeElement;
    const focusPanel = inspector.contains(active) ? inspector : tools.contains(active) ? tools : undefined;
    const focusAttributes = ['data-choice','data-value','data-tab','data-copy-index','data-design-toggle'].filter(attr => active?.hasAttribute(attr));
    const tabs = TABS.map(([id,label,icon]) => html`<button type="button" data-tab="${id}" aria-pressed="${String(id === tab)}"><b aria-hidden="true">${icon}</b>${label}</button>`);
    const pane = (name, body) => html`<section class="studio-visual-pane" ${tab === name ? '' : 'hidden'}>${body}</section>`;
    render(thumbnails, html`${photos().map((p,i) => html`<button type="button" class="studio-visual-thumb" data-pick="${i}" aria-label="الصورة ${i+1}" aria-pressed="${String(photoIndex === i)}">
      <img alt="" src="${mediaUrl(p.path)}" decoding="async"><span>${i+1}</span></button>`)}
      ${editable && photos().length ? action('add','إضافة','＋',!canEdit() || photos().length >= LIMIT) : ''}`);
    render(tools, html`<header class="studio-visual-panel-head"><h4>مكتبة التصميم</h4>${allSectionsButton}</header>
      <nav class="studio-visual-tabs" aria-label="أقسام الأدوات">${tabs}</nav>
      <fieldset ${canEdit() ? '' : 'disabled'}>
        ${pane('templates', html`
          ${section('personal','قوالبك', html`${action('save-template','احفظ تصميم الصورة كقالب','★',!photo)}${personal.length ? html`<div class="studio-visual-templates">${personal.map((t,i) => templateCard(t,i,true))}</div>` : ''}`)}
          ${section('templates','قوالب جاهزة', html`<div class="studio-visual-templates">${TEMPLATES.map((t,i) => templateCard(t,i))}</div>`)}`)}
        ${pane('elements', html`
          ${section('elements','المكتبة', html`<div class="studio-visual-chips">${ELEMENTS.map(([value,label,icon]) => html`<button type="button" class="studio-visual-chip" data-element="${value}" ${photo ? '' : 'disabled'}><b aria-hidden="true">${icon}</b>${label}</button>`)}</div>`)}
          ${photo?.overlays.length ? section('layers','عناصر الصورة', html`<div class="studio-visual-layers">${photo.overlays.map((o,i) => html`<button type="button" class="studio-visual-chip" data-layer="${i}" aria-pressed="${String(i === layerIndex)}">${short(o.text || ELEMENTS.find(([key]) => key === o.type)?.[1],32)}</button>`)}</div>`) : ''}`)}
        ${pane('photo', html`
          ${section('photos','الصور', html`<div class="studio-visual-chips">
            ${action('add','إضافة صور','＋',photos().length >= LIMIT)}${action('replace','بدّل الصورة','⇄',!photo)}
            ${action('earlier','قدّمها','→',!photo || photoIndex === 0)}${action('later','أخّرها','←',!photo || photoIndex === photos().length - 1)}
            ${action('remove-photo','حذف الصورة','✕',!photo)}
            ${!photos().length && legacyPaths().length ? action('import','استخدم صور التصميم السابق','↗') : ''}
            ${photo ? action('copy-all','انسخ التصميم لكل الصور','⧉',photos().length < 2) : ''}
          </div>`)}
          ${photo ? html`
            ${section('photo-entry','الصورة دي تدخل إزاي',deck('enter','',ENTRIES,photo.enter || '','entry'))}
            ${section('photo-loop','حركة الصورة المستمرة',deck('loop','',LOOPS,photo.loop || 'none','loop'))}
            ${section('photo-fit','عرض الصورة',deck('fit','',FITS,photo.fit || 'auto'))}
            ${section('photo-shade','تظليل الصورة',deck('shade','',SHADES,photo.shade || ''))}` : ''}`)}
        ${pane('page', html`
          ${section('accent','لون الصفحة',html`${swatches('accent','',stack?.accent,'#2563eb')}${action('auto-accent','خد اللون من الصورة','✦',!photo)}`)}
          ${section('marquee','الشريط المتحرك',html`
            ${toggle('marquee-enabled','إظهار الشريط',marquee().enabled)}
            ${deck('marquee-position','مكان الشريط',[['above','فوق الصور'],['below','تحت الصور']],marquee().position)}
          `)}
          ${section('hint','توجيه السحب',html`
            ${deck('scroll-hint','',SCROLL_HINTS,hint().style,'hint')}
            ${hint().style === 'progress' ? toggle('hint-gradient','تدرّج بلون الحملة',hint().gradient) : ''}
          `)}`)}
      </fieldset>`);

    el.dataset.selected = String(Boolean(item));
    render(inspector, html`<header class="studio-visual-panel-head"><h4>العنصر المختار</h4>${item ? html`
      <div>${allSectionsButton}<button type="button" class="studio-visual-chip" data-action="deselect">تمام</button></div>` : ''}</header>
      ${item ? html`<fieldset ${canEdit() ? '' : 'disabled'}>
        ${editableText ? section('copy','الكلام',html`
          <label class="studio-visual-field"><textarea aria-label="الكلام" data-field="text" rows="2">${item.text || ''}</textarea></label>
          <p class="studio-visual-copy-warning" data-copy-warning role="status"></p>`) : html`<p class="studio-visual-muted">${layerName}</p>`}
        ${item.type === 'text' ? section('effect','تأثير الكلام',html`
          ${deck('fx','',EFFECTS,item.fx || '','effect')}${swatches('fxc','لون التأثير',item.fxc,stack?.accent || '#2563eb')}`) : ''}
        ${TEXT_TYPES.has(item.type) ? section('font','الخط',deck('font','',FONTS,item.font || '','font')) : ''}
        ${TEXT_TYPES.has(item.type) ? section('shadow','ظل النص',deck('sh','',TEXT_SHADOWS,item.sh === '' ? '' : 'soft')) : ''}
        ${section('color','اللون',swatches('color','',item.color,'#ffffff'))}
        ${layerIndex !== 'strip' ? html`
          ${section('entry','بيدخل إزاي',deck('in','',TEXT_ENTRIES,item.in || 'pop','text-entry'))}
          ${section('loop','وبعدها يفضل',deck('anim','',TEXT_LOOPS,item.anim || 'none','loop'))}` : ''}
        ${section('geometry','الحجم والمكان',layerIndex !== 'strip' ? html`<div class="studio-visual-ranges">
            ${field('size','الحجم',item.size ?? 1,.6,2.5,.1)}${field('rot','اللفّ',item.rot ?? 0,-180,180)}
            ${field('x','يمين وشمال',item.x ?? 50,0,100,.1)}${field('y','فوق وتحت',item.y ?? 45,0,100,.1)}
          </div>` : field('rot','اللفّ',item.rot ?? -3,-20,20))}
        ${editableText ? section('library','نصوص جاهزة',copyLibrary()) : ''}
        <div class="studio-visual-chips studio-visual-layer-actions">${action('duplicate','نسخة','⧉',layerIndex === 'strip')}${action('remove-layer','مسح','✕')}</div>
      </fieldset>` : html`<p class="studio-visual-muted">دوس على النص أو العنصر في المعاينة علشان تعدّله.</p>`}`);
    samples(tools);
    samples(inspector);
    updateWarnings(item?.text);
    updateSectionsButton(tools);
    updateSectionsButton(inspector);
    if (focusPanel && focusAttributes.length) {
      const selector = focusAttributes.map(attr => '[' + attr + '="' + CSS.escape(active.getAttribute(attr)) + '"]').join('');
      const scope = active.hasAttribute('data-copy-index') ? focusPanel.querySelector('[data-copy-panel="' + copyCategory + '"]') : focusPanel;
      scope?.querySelector(selector)?.focus({ preventScroll:true });
    }
    undo.disabled = !canEdit() || !history.length;
    el.querySelector('[data-action="full"]').disabled = !photo;
  }
  function draw() { drawStage(); drawPanels(); send(); }
  function changed(repaint = true) {
    if (repaint) draw(); else { drawStage(); send(); }
    onChange();
  }
  function stopPlay() { clearTimeout(playTimer); playing = false; }
  function replay() {
    stopPlay();
    playing = true;
    drawStage();
    playTimer = setTimeout(() => { stopPlay(); drawStage(); }, 3200);
  }
  function selectLayer(index) {
    if (index === 'strip' ? !current()?.strip : !current()?.overlays[index]) return;
    if (index === 'strip' && canEdit() && current().overlays.length < MAX_LAYERS) {
      snapshot();
      current().overlays.push(ribbonLayer(current().strip));
      delete current().strip;
      layerIndex = current().overlays.length - 1;
      changed();
      return;
    }
    stopPlay();
    layerIndex = index;
    draw();
  }
  function target(key) { return key === 'accent' ? ensure() : PHOTO_FIELDS.has(key) ? current() : selected(); }
  function setValue(key, value, button = false) {
    if (key === 'accent' && (stack?.accent || '') === value) return;
    const object = target(key);
    if (!object || object[key] === value) return;
    if (button) snapshot();
    if (key === 'size') sizeLayer(object,value);
    else if (key === 'x' || key === 'y') positionLayer(object,key,value);
    else object[key] = value;
    stopPlay();
    changed(button);
    if (button && MOTION_FIELDS.has(key)) replay();
  }
  function setDesignValue(option, key, value) {
    const current = option === 'marquee' ? marquee() : hint();
    if (current[key] === value) return;
    snapshot();
    ensure();
    stack.marquee = marquee();
    stack.scrollHint = hint();
    stack[option][key] = value;
    stopPlay();
    changed();
  }
  function applyCopy(index) {
    const item = selected();
    const { phrases, visual } = STUDIO_COPY[copyCategory];
    const text = phrases[index];
    if (!item || !text) return;
    snapshot();
    item.text = text;
    if (layerIndex !== 'strip') {
      item.in = visual.in;
      item.anim = visual.anim;
      if (item.type === 'text') item.fx = visual.fx;
    }
    stopPlay();
    changed();
  }
  function applyTemplate(template) {
    const photo = current();
    if (!photo || !template) return;
    snapshot();
    photo.overlays = template.items.slice(0,MAX_LAYERS).map(item => ({
      ...item, text: short(String(item.text || '').replaceAll('{name}', title || ''),80),
      sh: item.sh ?? (TEXT_TYPES.has(item.type) ? 'soft' : ''),
    }));
    if (template.full) photo.fit = 'fill';
    if (template.shade) photo.shade = template.shade;
    if (template.strip) {
      const strip = typeof template.strip === 'string' ? { text:template.strip } : template.strip;
      if (photo.overlays.length < MAX_LAYERS) {
        photo.overlays.push(ribbonLayer(strip));
        delete photo.strip;
      } else photo.strip = structuredClone(strip);
    }
    layerIndex = -1;
    changed();
  }
  function saveTemplate() {
    const photo = current();
    if (!photo || (!photo.overlays.length && !photo.strip)) return;
    const name = short(photo.overlays.find(o => o.text)?.text || photo.strip?.text || title, 28);
    personal = [{ name, items:structuredClone(photo.overlays), strip:structuredClone(photo.strip), full:photo.fit === 'fill', shade:photo.shade }, ...personal].slice(0,20);
    try { localStorage.setItem(TEMPLATE_KEY,JSON.stringify(personal)); }
    catch { island('error','القالب متاح في الجلسة دي بس. المتصفح مقفّل التخزين المحلي.'); }
    drawPanels();
  }
  function choosePhoto(index) {
    stopPlay();
    photoIndex = clamp(index,0,photos().length - 1);
    layerIndex = -1;
    draw();
  }
  function addElement(type) {
    const photo = current();
    if (!photo || !ELEMENTS.some(([key]) => key === type)) return;
    if (type === 'strip') {
      const index = photo.overlays.findIndex(isRibbon);
      if (index !== -1 || photo.strip) { selectLayer(index === -1 ? 'strip' : index); return; }
    }
    if (photo.overlays.length >= MAX_LAYERS) { island('error','الحد 24 عنصر في الصورة.'); return; }
    snapshot();
    photo.overlays.push(type === 'strip' ? ribbonLayer() : blankOverlay(type));
    layerIndex = photo.overlays.length - 1;
    changed();
  }
  function movePhoto(offset) {
    const next = photoIndex + offset, list = photos();
    if (next < 0 || next >= list.length) return;
    snapshot();
    [list[next],list[photoIndex]] = [list[photoIndex],list[next]];
    photoIndex = next;
    stopPlay();
    changed();
  }

  async function handleAction(key) {
    const photo = current();
    if (key === 'play') {
      if (playing) { stopPlay(); drawStage(); } else replay();
      return;
    }
    if (key === 'deselect') { stopPlay(); layerIndex = -1; draw(); return; }
    if (key === 'close') { dialog.close(); return; }
    if (key === 'full') {
      if (!dialog.open) dialog.showModal();
      if (!frame.getAttribute('src')) frame.src = PATH_ASSET('preview.html?v=20261123-studio-v2');
      sizeFrame(); send(); return;
    }
    if (!canEdit()) return;
    if (key === 'add' || key === 'replace') {
      photoMode = key;
      input.multiple = key === 'add';
      input.click();
      return;
    }
    if (key === 'undo') {
      const past = history.pop();
      if (!past) return;
      ({ stack, photoIndex, layerIndex } = past);
      stopPlay(); changed(); return;
    }
    if (key === 'earlier' || key === 'later') { movePhoto(key === 'earlier' ? -1 : 1); return; }
    if (key === 'save-template') { saveTemplate(); return; }
    if (key === 'auto-accent' && photo) {
      const color = await accentFromImage(mediaUrl(photo.path));
      if (el.isConnected && canEdit() && photo === current() && /^#[0-9a-f]{6}$/i.test(color)) setValue('accent',color,true);
      return;
    }
    if (key === 'import' && !photos().length) {
      const paths = legacyPaths().filter(path => PATH.test(path)).slice(0,LIMIT);
      if (!paths.length) return;
      snapshot(); ensure().photos = paths.map(blankPhoto); photoIndex = 0; layerIndex = -1;
    } else if (key === 'remove-photo' && photo) {
      snapshot(); photos().splice(photoIndex,1); photoIndex = clamp(photoIndex,0,photos().length - 1); layerIndex = -1;
    } else if (key === 'remove-layer' && selected()) {
      snapshot();
      if (layerIndex === 'strip') delete photo.strip;
      else photo.overlays.splice(layerIndex,1);
      layerIndex = -1;
    } else if (key === 'duplicate' && selected() && layerIndex !== 'strip' && photo.overlays.length < MAX_LAYERS) {
      snapshot();
      const item = selected();
      photo.overlays.push({ ...item, x:clamp(item.x + 6,0,100), y:clamp(item.y + 6,0,100) });
      layerIndex = photo.overlays.length - 1;
    } else if (key === 'copy-all' && photo) {
      snapshot();
      for (const p of photos()) if (p !== photo) {
        const { path } = p;
        Object.assign(p,structuredClone(photo),{ path });
        if (!photo.strip) delete p.strip;
      }
    } else return;
    stopPlay(); changed();
  }

  el.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const { action:key, tab:name, pick, layer, template, own, element, choice, value, device:mode, overlay, copyTab, copyIndex } = button.dataset;
    if (key === 'sections') {
      const panel = button.closest('.studio-visual-tools,.studio-visual-inspector');
      const details = updateSectionsButton(panel), open = details.some(detail => !detail.open);
      for (const detail of details) detail.open = sections[detail.dataset.section] = open;
      rememberSections();
      updateSectionsButton(panel);
      samples(panel);
      return;
    }
    if (key) { void handleAction(key).catch(() => island('error','الخطوة دي ما كملتش. جرّب تاني.')); return; }
    if (mode) {
      device = mode;
      for (const b of dialog.querySelectorAll('[data-device]')) b.setAttribute('aria-pressed', String(b === button));
      sizeFrame(); return;
    }
    if (name) { tab = name; drawPanels(); return; }
    if (pick !== undefined) { choosePhoto(Number(pick)); return; }
    if (layer !== undefined) { selectLayer(Number(layer)); return; }
    if (overlay !== undefined) return;
    if (!canEdit()) return;
    if (copyTab) { switchCopyTab(copyTab); return; }
    if (copyIndex !== undefined) { applyCopy(Number(copyIndex)); return; }
    if (choice === 'marquee-position') { setDesignValue('marquee','position',value); return; }
    if (choice === 'scroll-hint') { setDesignValue('scrollHint','style',value); return; }
    if (template !== undefined) applyTemplate((own === 'true' ? personal : TEMPLATES)[Number(template)]);
    if (element) addElement(element);
    if (choice) setValue(choice,value,true);
  });
  el.addEventListener('toggle', event => {
    const detail = event.target;
    if (!detail.matches('details[data-section]')) return;
    const key = detail.dataset.section;
    if (isOpen(key) !== detail.open) { sections[key] = detail.open; rememberSections(); }
    const panel = detail.closest('.studio-visual-tools,.studio-visual-inspector');
    updateSectionsButton(panel);
    if (detail.open) samples(detail);
  }, true);
  el.addEventListener('change', event => {
    if (!canEdit()) return;
    const { designToggle } = event.target.dataset;
    if (designToggle === 'marquee-enabled') setDesignValue('marquee','enabled',event.target.checked);
    if (designToggle === 'hint-gradient') setDesignValue('scrollHint','gradient',event.target.checked);
  });
  inspector.addEventListener('keydown', event => {
    const key = event.target.dataset.copyTab;
    if (!key) return;
    const index = COPY_CATEGORIES.indexOf(key), last = COPY_CATEGORIES.length - 1;
    const step = getComputedStyle(inspector).direction === 'rtl' ? -1 : 1;
    const next = { Home:0, End:last, ArrowRight:(index + step + last + 1) % (last + 1), ArrowLeft:(index - step + last + 1) % (last + 1) }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    switchCopyTab(COPY_CATEGORIES[next]);
  });
  // Leave the input mounted while typing, so each edit appears on the photo without losing the caret.
  el.addEventListener('focusin', () => { editedField = undefined; });
  el.addEventListener('input', event => {
    const field = event.target, key = field.dataset.field;
    if (!key || !canEdit()) return;
    if (editedField !== field) { snapshot(); editedField = field; }
    const value = key === 'text' ? short(field.value,80) : field.type === 'range' ? field.valueAsNumber : field.value;
    if (field.value !== value && key === 'text') field.value = value;
    setValue(key,value);
    if (key === 'text') updateWarnings(value);
    if (key === 'x' || key === 'y') field.value = selected()[key];
  });

  stage.addEventListener('click', event => {
    if (playing || move || event.target.closest('[data-action]')) return;
    const overlay = event.target.closest('[data-overlay]');
    if (overlay?.dataset.overlay === 'strip') selectLayer('strip');
    else if (overlay && !canEdit()) selectLayer(Number(overlay.dataset.overlay));
  });
  stage.addEventListener('keydown', event => {
    const overlay = event.target.closest('[data-overlay],[data-resize]');
    if (!overlay || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    const resize = overlay.hasAttribute('data-resize');
    if (!resize) selectLayer(overlay.dataset.overlay === 'strip' ? 'strip' : Number(overlay.dataset.overlay));
    const input = inspector.querySelector(resize ? '[data-field="size"]' : '[data-field="text"]');
    if (input) {
      const detail = input.closest('details');
      detail.open = sections[detail.dataset.section] = true;
      rememberSections();
      input.focus({ preventScroll:true });
    } else inspector.querySelector('summary')?.focus({ preventScroll:true });
  });
  stage.addEventListener('pointerdown', event => {
    if (playing || !canEdit() || event.button !== 0) return;
    const hit = event.target.closest('[data-overlay],[data-resize]');
    if (!hit) {
      if (layerIndex !== -1 && !event.target.closest('[data-action]')) { layerIndex = -1; draw(); }
      return;
    }
    if (hit.dataset.overlay === 'strip') return;
    const index = Number(hit.dataset.overlay ?? hit.dataset.resize), item = current()?.overlays[index];
    if (!item) return;
    const box = stage.querySelector('.ssm-wrap').getBoundingClientRect();
    const end = hit.dataset.end === '1' || (hit.matches('.ssm-o') && CONNECTORS.has(item.type));
    const [x,y] = editPosition(item,end);
    const origin = { x:item.x, y:item.y, x2:item.x2, y2:item.y2, size:item.size ?? 1 };
    const rect = stage.querySelector('[data-i="' + index + '"]').getBoundingClientRect();
    const sizing = hit.hasAttribute('data-resize'), centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
    move = { index,item,origin,pointer:event.pointerId,x,y,end,box,startX:event.clientX,startY:event.clientY,centerX,centerY,sizing,moved:false };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!move || move.pointer !== event.pointerId || move.item.lock) return;
    const { startX,startY,box,item,end,x,y,index,origin,centerX,centerY,sizing } = move;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (!move.moved && Math.hypot(dx,dy) < 4) return;
    if (!move.moved) { snapshot(); move.moved = true; layerIndex = index; }
    if (sizing) {
      const distance = Math.hypot(event.clientX - centerX,event.clientY - centerY);
      const initial = Math.max(10,Math.hypot(startX - centerX,startY - centerY));
      sizeLayer(item,round(clamp(origin.size * distance / initial,.6,2.5)),origin);
    } else {
      const nextX = round(clamp(x + dx / box.width * 100,0,100)), nextY = round(clamp(y + dy / box.height * 100,0,100));
      if (end) { item.x2 = nextX; item.y2 = nextY; }
      else { positionLayer(item,'x',nextX,origin); positionLayer(item,'y',nextY,origin); }
    }
    drawStage();
  });
  function endMove(event) {
    if (!move || move.pointer !== event.pointerId) return;
    const { moved,index } = move;
    move = undefined;
    if (moved) changed();
    else if (event.type !== 'pointercancel') selectLayer(index);
  }
  stage.addEventListener('pointerup', endMove);
  stage.addEventListener('pointercancel', endMove);

  input.addEventListener('change', async () => {
    if (!canEdit()) return;
    const files = [...input.files];
    input.value = '';
    if (!files.length) return;
    const replace = photoMode === 'replace', photo = current();
    const free = replace ? 1 : LIMIT - photos().length;
    if (files.length > free) { island('error','المساحة المتاحة ' + free + ' صور.'); return; }
    stopPlay(); uploading = true; drawPanels(); drawStage(); onBusy();
    let applied = 0;
    try {
      for (const file of files) {
        let prepared;
        try { prepared = await optimizeUploadImage(file,'storefront'); }
        catch { island('error','استخدم صورة JPG أو PNG أو WebP مدعومة.'); break; }
        if (!el.isConnected) break;
        const body = new FormData(); body.append('image',prepared.file);
        const result = await uploadLandingImage(code,body);
        if (!el.isConnected) break;
        if (result.outcome !== 'saved') { fail(result); break; }
        const storage = mediaUrl('women-storefront/');
        const path = typeof result.url === 'string' && result.url.startsWith(storage)
          ? 'women-storefront/' + result.url.slice(storage.length) : result.path;
        if (!PATH.test(path)) { island('error','مسار الصورة المرفوعة مش صالح للتصميم.'); break; }
        if (!applied) snapshot();
        if (replace && photo) photo.path = path;
        else ensure().photos.push(blankPhoto(path));
        applied++;
      }
    } finally {
      uploading = false;
      if (el.isConnected) {
        if (applied) {
          if (!replace) { photoIndex = photos().length - applied; layerIndex = -1; }
          tab = 'templates'; changed();
        } else draw();
        onBusy();
      }
    }
  });
  draw();
  return {
    el, payload: () => stack, pending: () => uploading,
    differsFrom: value => JSON.stringify(clone(value)) !== JSON.stringify(stack),
    setSaved(value) {
      stack = clone(value);
      photoIndex = clamp(photoIndex,0,photos().length - 1);
      if (!selected()) layerIndex = -1;
      stopPlay(); draw();
    },
    reset(value) {
      stack = clone(value);
      photoIndex = 0; layerIndex = -1; tab = 'templates'; move = undefined; editedField = undefined;
      history.length = 0;
      stopPlay(); draw();
    },
    setMarqueeSettings(settings) { marqueeSettings = settings; drawStage(); send(); },
    destroy() { stopPlay(); observer.disconnect(); if (dialog.open) dialog.close(); },
  };
}
