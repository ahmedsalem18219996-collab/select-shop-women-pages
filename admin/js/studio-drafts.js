import { call } from './api.js';
import { closeLayer, debounce, fail, html, island, render, sheet, withBusy } from './ui.js';

export function resetStudioDialog(onReset) {
  const box = sheet({
    title: 'ابدأ من جديد',
    body: html`<p>هتتحفظ نسخة من التصميم الحالي في سجل النسخ. الصفحة المنشورة هتفضل زي ما هي.</p>
      <fieldset class="studio-draft-options">
        <legend>ابدأ إزاي؟</legend>
        <label><input type="radio" name="studio-reset" value="keep" checked> بنفس الصور</label>
        <label><input type="radio" name="studio-reset" value="empty"> من غير صور</label>
      </fieldset>`,
    foot: html`<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-danger" data-studio-reset-yes>ابدأ المسودة الجديدة</button>`,
  });
  box.querySelector('[data-studio-reset-yes]').onclick = () => {
    const keepPhotos = box.querySelector('input:checked').value === 'keep';
    closeLayer();
    void onReset(keepPhotos);
  };
}

export async function studioVersionsDialog(code, opener, onRestore) {
  const result = await withBusy(opener, () => call('landing.versions', { code }));
  if (!opener.isConnected) return;
  if (result.outcome !== 'ok') { fail(result); return; }
  const versions = result.versions || [];
  const date = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo',
  });
  const box = sheet({
    title: 'رجوع لنسخة سابقة',
    body: html`<p>اختار نسخة حسب تاريخها. الرجوع بيغيّر المسودة فقط.</p>
      ${versions.length ? html`<div class="stack">${versions.map(version => html`
        <button type="button" class="btn btn-soft" data-studio-restore="${version.id}">
          ${date.format(new Date(version.createdAt))}
        </button>`)}</div>` : html`<p class="muted">مفيش نسخ محفوظة لسه.</p>`}`,
    foot: html`<button class="btn btn-ghost" data-close>إلغاء</button>`,
  });
  box.addEventListener('click', event => {
    const button = event.target.closest('[data-studio-restore]');
    if (!button) return;
    closeLayer();
    void onRestore(button.dataset.studioRestore);
  });
}

export async function studioTemplateDialog({ code, opener, onSave }) {
  const result = await withBusy(opener, () => call('products.list', { limit: 100 }));
  if (!opener.isConnected) return;
  if (result.outcome !== 'ok') { fail(result); return; }
  const products = result.data || [];
  const box = sheet({
    title: 'استخدم كقالب لمنتجات تانية',
    body: html`<p>مسودة كل منتج مختار هتتبدّل بالقالب وصوره الأصلية. النسخة المنشورة والسعر والألوان والمقاسات هيفضلوا زي ما هم.</p>
      <label class="field"><span>ابحث بالاسم أو الكود</span><input class="input" type="search" data-studio-target-search></label>
      <div class="studio-draft-options" data-studio-targets></div>
      <p class="muted" data-studio-target-status role="status"></p>`,
    foot: html`<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" data-studio-template-yes disabled>احفظ المسودات</button>`,
  });
  const selected = new Set();
  const list = box.querySelector('[data-studio-targets]');
  const search = box.querySelector('[data-studio-target-search]');
  const save = box.querySelector('[data-studio-template-yes]');
  const status = box.querySelector('[data-studio-target-status]');
  function paint(catalog = products) {
    const query = search.value.trim().toLocaleLowerCase('ar');
    const matches = catalog.filter(product => product.public_code !== code && product.status !== 'archived'
      && (product.title + ' ' + product.public_code).toLocaleLowerCase('ar').includes(query));
    render(list, matches.length ? html`${matches.map(product => html`
      <label><input type="checkbox" name="studio-target" value="${product.public_code}"
        ${selected.has(product.public_code) ? 'checked' : ''}> <span>${product.title} <small class="code">${product.public_code}</small></span></label>
    `)}` : html`<p class="muted">مفيش منتجات مطابقة.</p>`);
    save.disabled = !selected.size || selected.size > 20;
    status.textContent = selected.size > 20 ? 'اختار لحد 20 منتج في المرة.' : 'المنتجات المختارة: ' + selected.size;
  }
  const searchMore = debounce(async () => {
    const q = search.value.trim();
    if (!q || !box.isConnected) return;
    const matches = await call('products.list', { q, limit: 100 });
    if (box.isConnected && search.value.trim() === q && matches.outcome === 'ok') paint(matches.data || []);
  }, 250);
  search.oninput = () => {
    paint();
    if (products.length === 100) searchMore();
  };
  list.onchange = event => {
    const input = event.target;
    if (!input.matches('input[name="studio-target"]')) return;
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    save.disabled = !selected.size || selected.size > 20;
    status.textContent = selected.size > 20 ? 'اختار لحد 20 منتج في المرة.' : 'المنتجات المختارة: ' + selected.size;
  };
  save.onclick = async () => {
    // Read target versions just before the write. The server checks them again in the template transaction.
    const codes = [...selected];
    await withBusy(save, async () => {
      list.inert = search.disabled = true;
      try {
        const current = await Promise.all(codes.map(targetCode => call('landing.get', { code: targetCode })));
        if (!box.isConnected) return;
        if (current.some(item => item.outcome !== 'ok')) {
          island('error', 'تعذّر فحص المسودات المختارة. جرّب تاني.');
          return;
        }
        const targets = current.map((item, index) => ({ code: codes[index], version: item.data?.version || 0 }));
        if (await onSave(targets)) closeLayer();
      } finally {
        list.inert = search.disabled = false;
      }
    });
  };
  paint();
}
