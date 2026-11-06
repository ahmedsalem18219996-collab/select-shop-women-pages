import { t } from '../i18n.js';
import { html, render, toString, $, $$, icon, money, toMinor, fmtNum, ago, date, statusBadge, skRows, sheet, closeLayer, confirmDialog, withBusy, island, done, fail, debounce, segmented, idempotencyKey, spotlight, esc } from '../ui.js';
import { call, deleteProductImage, mediaUrl } from '../api.js';
import { previewTile } from '../image-optimize.js';
import { uploadPhotos, uploadSummary } from '../photo-upload.js';
import { coloursTab, previewTab } from './model-colours.js?v=20261106-colourpicker';
import { mountDescriptionEnhancer } from '../description-enhancer.js';
import { initSupplierPicker, supplierChoice, createSupplierIfNeeded } from '../supplier-field.js';
import { saveCost, profitText, COST_OPS_MISSING } from '../profit.js';
import { activityLine } from './dashboard.js';
import { groupAdminProducts } from '../model-families.js';
import { saveFamilyCategory } from '../model-category.js';
import { mountQuickProductEditor } from '../quick-product.js?v=17';
import { countStatuses, PRODUCT_STATES, statusAction, prepublishHints } from '../product-lifecycle.js';

const imgUrl = (p) => (p ? mediaUrl(/^media\//.test(p) ? 'product-media/' + p : p) : null);
let categories = [];
async function loadCategories() { const r = await call('categories.list'); categories = r.outcome === 'ok' ? r.data : []; return categories; }
const priceText = (p) => p.price_min_minor === null ? html`<span class="muted">${t('products.noPrice')}</span>`
  : p.price_min_minor === p.price_max_minor ? money(p.price_min_minor) : html`${money(p.price_min_minor)} – ${money(p.price_max_minor)}`;

// ======================================================================= list
async function renderList(ctx) {
  const { el, can, query } = ctx;
  const state = { q: query.get('q') || '', status: query.get('status') || '', category: query.get('category') || '' };
  render(el, html`<div class="page">
    <div class="page-head"><div><h2>${t('products.title')}</h2><p>${t('products.subtitle')}</p></div>
      ${can('products.edit') ? html`<div class="actions"><button class="btn btn-primary" data-new>${icon('plus')}${t('products.new')}</button></div>` : ''}</div>
    <section class="card catalog-overview" aria-label="التحكم في نشر المنتجات" style="margin-bottom:14px">
      <details class="on-demand-note" aria-label="المخزون الافتراضي"><summary><b>التوريد حسب الطلب</b> · الكميات هنا افتراضية</summary>
        <p class="muted">كميات المخزون هنا افتراضية لتنظيم قبول الأوردرات، ومش معناها إن القطع موجودة عندك. اتأكدي من التوافر والسعر عند المورد قبل تأكيد كل طلب، واخفِي المنتج لو مش هتقدري توفريه.</p></details>
      <div class="catalog-state-grid">
        <a class="catalog-state" href="#/products?status=public"><strong data-product-count="public">—</strong><span>منشور للعميلات</span></a>
        <a class="catalog-state" href="#/products?status=draft"><strong data-product-count="draft">—</strong><span>مسودات للتجهيز</span></a>
        <a class="catalog-state" href="#/products?status=hidden"><strong data-product-count="hidden">—</strong><span>مخفي مؤقتًا</span></a>
        <a class="catalog-state" href="#/products?status=archived"><strong data-product-count="archived">—</strong><span>مؤرشف</span></a>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">«إخفاء» يوقف عرض المنتج من غير حذف الصور أو بيانات الطلبات القديمة. «نشر» بيخضع لفحص جاهزية المنتج.</p>
    </section>
    <div class="toolbar">
      <label class="searchbox"><span class="sr">${t('app.search')}</span>${icon('search')}<input class="input" id="q" type="search" value="${state.q}" placeholder="${t('products.searchPh')}" autocomplete="off"></label>
      <div class="row" style="justify-content:flex-end">
        <div class="chips" role="group" aria-label="${t('products.status')}">
          ${['', 'public', 'draft', 'hidden', 'archived'].map((s) => html`<button class="chip" data-status="${s}" aria-pressed="${state.status === s}">${s === 'archived' ? 'المؤرشفة' : s ? t('status.' + s) : t('app.all')}</button>`)}
        </div>
        <select class="select" id="cat" style="width:auto;min-width:160px" aria-label="${t('products.category')}"><option value="">${t('products.allCategories')}</option></select>
      </div>
    </div>
    <div id="results">${skRows(6)}</div></div>`);
  const refreshCounts = async () => {
    // Query each status explicitly: all-products results may omit archives.
    await Promise.all(PRODUCT_STATES.map(async status => {
      try {
        const r = await call('products.list', { status, limit: 100 });
        if (r?.outcome !== 'ok' || !Array.isArray(r.data)) return;
        const count = countStatuses(r.data)[status];
        const target = $('[data-product-count="' + status + '"]', el);
        if (target) target.textContent = fmtNum(count);
      } catch { /* Leave — rather than manufacture a count on failure. */ }
    }));
  };
  void refreshCounts();
  // The list may arrive after the user has moved to another screen: only fill the select if it is still on the page.
  loadCategories().then((cs) => { const s = $('#cat', el); if (!s) return; cs.forEach((c) => { const o = new Option(c.name, c.name); o.selected = c.name === state.category; s.add(o); }); });
  const results = $('#results', el);
  let listedGroups = [];
  const load = async () => {
    const r = await call('products.list', { q: state.q || null, status: state.status || null, category: state.category || null });
    if (r.outcome !== 'ok') { fail(r); return; }
    const items = r.data.filter(p => state.status === 'archived' ? p.status === 'archived' : p.status !== 'archived');
    listedGroups = groupAdminProducts(items);
    if (!items.length) {
      render(results, html`<div class="empty">${icon('box')}<b>${state.q || state.status || state.category ? t('products.empty') : t('products.emptyAll')}</b>
        ${can('products.edit') && !state.q ? html`<button class="btn btn-primary" data-new>${icon('plus')}${t('products.new')}</button>` : ''}</div>`);
      $('[data-new]', results)?.addEventListener('click', () => createSheet(ctx));
      return;
    }
    render(results, html`
      <div class="list mobile-only">${listedGroups.map((g, k) => {
        const p = g.members[0].product;
        const pricesOnModel = g.members.map(m => m.product.price_min_minor).filter(Number.isInteger);
        const minModelPrice = pricesOnModel.length ? Math.min(...pricesOnModel) : null;
        return g.family ? html`<div class="row-card model-summary" style="--k:${k}">
          <span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
          <span class="row-main"><button class="model-open" type="button" data-manage-model="${g.key}" aria-label="تعديل ${g.name} واختيار اللون"><b>${g.name}</b><span class="row-meta">${g.members.length} ألوان <span class="model-dots">${g.members.map(m => html`<i style="background:${m.color.hex}" title="${m.color.name}"></i>`)}</span></span><span class="model-edit-hint">اختاري اللون والمقاس وعدّلي بسهولة</span><span class="model-state-summary">${g.members.filter(m => m.product.status === 'public').length} من ${g.members.length} ألوان منشورة</span>${minModelPrice !== null ? html`<span class="model-price">السعر من ${money(minModelPrice)}</span>` : ''} </button></span>
        </div>` : html`<div class="row-card catalog-mobile-product" style="--k:${k}" data-mobile-product="${p.public_code}">
          <a class="catalog-mobile-open" href="#/products/${p.public_code}" aria-label="افتحي تفاصيل ${p.title}">
            <span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
            <span class="row-main"><b>${p.title}</b><span class="row-meta"><span class="code">${p.public_code}</span><span>${p.category}</span>
            ${p.stock_low ? html`<span class="badge warn">${t('products.lowStock')}</span>` : ''}</span></span>
            <span class="row-end"><b class="num">${priceText(p)}</b>${statusBadge(p.status)}</span>
          </a>
          <div class="catalog-mobile-actions">
            <button type="button" class="btn btn-primary btn-sm" data-quick-mobile="${p.public_code}">تعديل سريع</button>
            ${can('products.publish') && statusAction(p.status) ? html`<button type="button" class="btn btn-soft btn-sm" data-status-action="${p.public_code}">${statusAction(p.status).label}</button>` : ''}
          </div>
        </div>`;
      })}</div>
      <div class="table-wrap desk-only"><table class="t">
        <thead><tr><th>${t('products.title')}</th><th>${t('products.category')}</th><th>${t('products.price')}</th><th title="حد تنظيمي افتراضي وليس قطع مخزنة">كمية افتراضية</th><th>${t('products.views')}</th><th>${t('products.status')}</th><th></th></tr></thead>
        <tbody>${listedGroups.map(g => {
          const p = g.members[0].product;
          if (g.family) {
            const prices = g.members.flatMap(m => Number.isInteger(m.product.price_min_minor) ? [m.product.price_min_minor] : []);
            const maxPrices = g.members.flatMap(m => Number.isInteger(m.product.price_max_minor) ? [m.product.price_max_minor] : []);
            const low = prices.length ? Math.min(...prices) : null;
            const high = maxPrices.length ? Math.max(...maxPrices) : null;
            const stockKnown = g.members.every(m => Number.isInteger(m.product.stock_total));
            const stock = stockKnown ? g.members.reduce((n,m)=>n+m.product.stock_total,0) : null;
            const views = g.members.reduce((n,m)=>n+(Number(m.product.views_30d)||0),0);
            return html`<tr data-family="${g.key}" class="model-group-row">
              <td><div class="cell-main"><span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
                <div class="row-main"><button type="button" class="model-open" data-manage-model="${g.key}" aria-label="تعديل ${g.name} واختيار اللون"><b>${g.name}</b><span class="row-meta">${g.members.length} ألوان <span class="model-dots">${g.members.map(m=>html`<i style="background:${m.color.hex}" title="${m.color.name}"></i>`)}</span></span><span class="model-edit-hint">اختاري اللون والمقاس وعدّلي بسهولة</span></button></div></div></td>
              <td>${p.category}</td>
              <td class="num">${low === null || high === null ? '—' : low === high ? money(low) : html`${money(low)} – ${money(high)}`}</td>
              <td class="num">${stock === null ? '—' : fmtNum(stock)}</td>
              <td class="num muted">${fmtNum(views)}</td>
              <td><span class="muted">حسب كل لون</span></td>
              <td><button type="button" class="btn btn-primary btn-sm" data-manage-model="${g.key}">تعديل الموديل والنشر</button></td>
            </tr>`;
          }
          return html`<tr data-code="${p.public_code}">
          <td><div class="cell-main"><span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
            <div class="row-main"><a class="rowlink" href="#/products/${p.public_code}">${p.title}</a><span class="row-meta"><span class="code">${p.public_code}</span>${p.is_new ? html`<span class="badge info plain">${t('products.isNew')}</span>` : ''}</span></div></div></td>
          <td>${can('products.edit') ? html`<select class="select" data-cat style="min-width:140px;min-height:36px" aria-label="${t('products.category')}">${categories.map((c) => html`<option ${c.name === p.category ? 'selected' : ''}>${c.name}</option>`)}</select>` : p.category}</td>
          <td class="num">${can('products.price') ? html`<button class="btn btn-ghost btn-sm" data-price title="${t('products.quickPrice')}">${priceText(p)}</button>` : priceText(p)}</td>
          <td class="num">${p.stock_total === null ? html`<span class="muted">—</span>` : html`${fmtNum(p.stock_total)}${p.stock_low ? html` <span class="badge warn">${t('products.lowStock')}</span>` : ''}`}</td>
          <td class="num muted">${fmtNum(p.views_30d)}</td>
          <td>${statusBadge(p.status)}</td>
          <td><div class="row">
            ${can('products.publish') && statusAction(p.status) ? html`<button class="btn btn-soft btn-sm" data-status-action="${p.public_code}">${statusAction(p.status).label}</button>` : ''}
            ${ctx.session?.role === 'owner' && p.status !== 'archived' ? html`<button type="button" class="btn btn-danger btn-sm" data-archive>حذف المنتج</button>` : ''}
          </div></td></tr>`;
        })}</tbody></table></div>`);
    // categories list may arrive after the first paint
    if (can('products.edit') && !categories.length) await loadCategories().then(load);
  };
  const visibleProduct = (code) => listedGroups.flatMap(g => g.members).find(m => m.product.public_code === code)?.product;
  const changeStatus = async (button, code) => {
    if (!can('products.publish')) return;
    const item = visibleProduct(code);
    const action = statusAction(item?.status);
    if (!item || !action) { island('error', 'المنتج مش ظاهر في القائمة، اعملي تحديث وجربي تاني.'); return; }
    // A product can have stale listing metadata: use the authenticated detail and
    // never publish based on client-side guesses about readiness.
    if (action.op === 'products.publish') {
      let detail;
      try { detail = await call('products.get', { code }); } catch { detail = { outcome: 'network' }; }
      if (detail?.outcome !== 'ok') { fail(detail); return; }
      const hints = prepublishHints(detail.data);
      if (hints.length) {
        island('error', 'المنتج لسه مش جاهز للنشر: ' + hints.join('، '));
        return;
      }
    }
    const yes = await confirmDialog({
      title: action.op === 'products.publish' ? 'نشر ' + item.title : 'إخفاء ' + item.title,
      text: action.op === 'products.publish'
        ? 'بعد النشر المنتج هيظهر للعميلات ويقدروا يطلبوه. اتأكدتي من السعر والصور والتوافر عند المورد؟'
        : 'المنتج هيتشال من العرض مؤقتًا، من غير ما نحذف بياناته أو الأوردرات القديمة. موافقة؟',
      okText: action.label
    });
    if (!yes) return;
    const res = await withBusy(button, () => call(action.op, { code }));
    if (['published', 'hidden', 'already_public', 'already_hidden'].includes(res?.outcome)) {
      done(action.op === 'products.publish' ? 'المنتج اتنشر للعميلات' : 'المنتج اتخفى مؤقتًا من المتجر');
      await load(); void refreshCounts();
    } else if (res?.outcome === 'rejected' && Array.isArray(res.blockers)) {
      island('error', 'النشر مرفوض لأن فيه بيانات ناقصة: ' + res.blockers.map(b => t('blocker.' + b, b)).join('، '));
    } else fail(res);
  };
  const openQuickMobile = (code) => {
    const product = visibleProduct(code);
    if (!product) { island('error', 'المنتج اتغير، اعملي تحديث وجربي تاني.'); return; }
    const box = sheet({
      title: product.title + ' · تعديل سريع',
      wide: true,
      body: html`<div class="stack"><p class="muted">اختاري اللون والمقاس وعدّلي السعر والإتاحة والصور، أو ارجعي لبيانات المنتج المتقدمة.</p>
        <div class="quick-colors" data-quick-colors role="group" aria-label="اللون"></div>
        <div data-quick-panel aria-live="polite"></div></div>`,
      foot: html`<button class="btn btn-ghost" data-close type="button">إغلاق</button>`
    });
    mountQuickProductEditor({
      box, ctx,
      members: [{ product, color: { name: product.title, hex: '#66768B' } }],
      onChanged: () => { void load(); void refreshCounts(); }
    });
  };
  results.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-cat]'); if (!s) return;
    const code = s.closest('tr[data-code]')?.dataset.code;
    const original = listedGroups.flatMap(g => g.members).find(m => m.product.public_code === code)?.product;
    if (!original) { island('error', 'المنتج اتغير، حدّثي الصفحة وجربي تاني.'); await load(); return; }
    if (s.value === original.category) return;
    s.disabled = true;
    const r = await call('products.set_display', { code, category: s.value, is_new: original.is_new === true });
    s.disabled = false;
    if (r.outcome === 'saved') { done('تم تغيير قسم المنتج'); await load(); }
    else { fail(r); s.value = original.category; }
  });
  results.addEventListener('click', async (e) => {
    const manage = e.target.closest('[data-manage-model]');
    if (manage) {
      const g = listedGroups.find(g => g.family && g.key === manage.dataset.manageModel);
      if (!g) return;
      // A search/category/status filter may show only some sibling SKUs.
      // Read each hidden sibling through the authenticated Admin API before
      // promising to update the category of the ENTIRE model.
      const byCode = new Map(g.members.map(m => [m.product.public_code, m]));
      const missing = g.family.colors.filter(color => !byCode.has(color.code));
      if (missing.length) {
        const fetched = await Promise.all(missing.map(async color => {
          try { return { color, result: await call('products.get', { code: color.code }) }; }
          catch { return { color, result: { outcome: 'network' } }; }
        }));
        if (fetched.some(x => x.result.outcome !== 'ok')) {
          island('error', 'مش قادرين نحمل كل ألوان الموديل. مفيش أي تغيير حصل — حدّثي القائمة وجربي تاني.');
          return;
        }
        for (const {color, result} of fetched) {
          const d = result.data, p = d.product;
          const prices = [p.base_price?.amount_minor].filter(Number.isInteger);
          const stockRows = Object.values(d.stock || {});
          byCode.set(color.code, { color, product: {
            ...p, category: d.card?.category || 'أخرى', is_new: d.card?.is_new === true,
            image: d.card?.image || null, price_min_minor: prices[0] ?? null,
            price_max_minor: prices[0] ?? null,
            stock_total: stockRows.length ? stockRows.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0) : null,
          }});
        }
      }
      const allMembers = g.family.colors.map(color => byCode.get(color.code));
      if (allMembers.some(m => !m)) {
        island('error', 'الموديل فيه لون مؤرشف أو غير متاح، راجعيه قبل تغيير القسم.');
        return;
      }
      if (!categories.length) await loadCategories();
      const categoryNames = [...new Set(allMembers.map(m => m.product.category))];
      const currentCategory = categoryNames.length === 1 ? categoryNames[0] : '';
      const box = sheet({
        title: g.name + ' · تعديل سهل',
        wide: true,
        body: html`<div class="stack">
          <p class="muted">اختاري لون الموديل من الصور، وبعدها المقاس؛ عدّلي السعر والإتاحة والصور من نفس الشاشة. كل تغيير بيخص اللون اللي اخترتيه فقط.</p>
          <div class="quick-colors" data-quick-colors role="group" aria-label="اختاري لون الموديل"></div>
          <div data-quick-panel aria-live="polite"></div>
          <details class="quick-advanced"><summary>تغيير القسم لكل الألوان (اختياري)</summary>
          <p class="muted">القسم هنا بيتغير لكل الألوان الموجودة، من غير ما يلمس الأوردرات القديمة.</p>
          ${can('products.edit') ? html`<div class="model-category-editor">
            <label class="field"><span>القسم الخاص بالموديل (${allMembers.length} ألوان)</span>
              <select class="select" id="model-category" aria-label="اختاري قسم الموديل">
                ${categoryNames.length !== 1 ? html`<option value="" selected disabled>أقسام مختلفة — اختاري قسم موحّد</option>` : ''}
                ${categories.map(c => html`<option value="${c.name}" ${c.name === currentCategory ? 'selected' : ''}>${c.name}${c.visible === false ? ' (مخفي)' : ''}</option>`)}
              </select>
            </label>
            <button class="btn btn-primary" type="button" data-save-model-category>حفظ القسم لكل الألوان</button>
            <p class="muted" id="model-category-feedback" role="status" aria-live="polite"></p>
          </div>` : html`<p class="muted">تعديل القسم يحتاج صلاحية تعديل المنتجات.</p>`}
          </details>
          <details class="quick-advanced"><summary>روابط تعديل إضافية للمستخدم المتقدم</summary>
          <p class="muted">لو عايزة تعديل بيانات المنتج القديمة بالتفصيل افتحي اللون. إضافة لون جديد للموديل أو مقاس جديد لمنتج منشور محتاجة ربط خادم آمن مش موجود حاليًا.</p>
          ${allMembers.map(m => html`<div class="model-color-line">
            <span class="thumb">${m.product.image ? html`<img src="${imgUrl(m.product.image)}" alt="" loading="lazy">` : icon('image')}</span>
            <span class="model-dot" style="background:${m.color.hex}"></span>
            <div class="row-main"><b>${m.color.name}</b><span class="row-meta">${m.product.public_code} · ${priceText(m.product)} · مخزون ${m.product.stock_total === null ? '—' : fmtNum(m.product.stock_total)}</span>${statusBadge(m.product.status)}</div>
            <span class="model-color-actions">
              <a class="btn btn-primary btn-sm" href="#/products/${m.product.public_code}" data-open-sku data-edit-tab="variants">السعر والمخزون</a>
              <a class="btn btn-soft btn-sm" href="#/products/${m.product.public_code}" data-open-sku data-edit-tab="media">الصور</a>
              <a class="btn btn-ghost btn-sm" href="#/products/${m.product.public_code}" data-open-sku data-edit-tab="details">البيانات</a>
            </span>
          </div>`)}
          </details>
        </div>`,
        foot: html`<button class="btn btn-ghost" data-close>إغلاق</button>${can('products.price') || can('inventory.manage') ? html`<button type="button" class="btn btn-primary" data-quick-save-footer>حفظ اللون والمقاس</button>` : ''}`
      });
      mountQuickProductEditor({ box, ctx, members: allMembers, onChanged: load });
      box.querySelector('[data-close]')?.addEventListener('click', closeLayer);
      box.querySelector('[data-save-model-category]')?.addEventListener('click', async e => {
        const button = e.currentTarget;
        const select = $('#model-category', box);
        const feedback = $('#model-category-feedback', box);
        const category = select?.value;
        if (!category || !categories.some(c => c.name === category)) { feedback.textContent = 'اختاري قسم صحيح الأول.'; return; }
        if (allMembers.some(m => m.product.status === 'archived')) { feedback.textContent = 'فيه لون مؤرشف؛ مينفعش نغيّر القسم لكل الألوان. عدّلي الألوان النشطة منفصلة.'; return; }
        if (allMembers.every(m => m.product.category === category)) { feedback.textContent = 'الموديل بالفعل في القسم ده.'; return; }
        select.disabled = true;
        await withBusy(button, async () => {
          const summary = await saveFamilyCategory(allMembers, category, call, n => {
            feedback.textContent = 'تحديث ' + n + ' من ' + allMembers.length + ' لون…';
          });
          if (summary.failed.length) {
            feedback.textContent = 'اتحدث ' + summary.updated.length + ' لون، وفشل ' + summary.failed.length + '. الألوان اللي فشلت: ' + summary.failed.map(x => x.code).join('، ') + '.';
            island('error', 'تحديث قسم الموديل اكتمل جزئيًا — لازم نراجع الألوان اللي فشلت قبل إعادة المحاولة.');
          } else {
            closeLayer();
            done('تم تغيير القسم لكل الألوان (' + allMembers.length + ')');
          }
          await load();
        });
        if (document.contains(select)) select.disabled = false;
      });
      box.querySelectorAll('[data-open-sku]').forEach(a => a.addEventListener('click', () => {
        sessionStorage.setItem('wa.ptab', a.dataset.editTab || 'details');
        closeLayer();
      }));
      return;
    }
    const quick = e.target.closest('[data-quick-mobile]');
    if (quick) { openQuickMobile(quick.dataset.quickMobile); return; }
    const statusBtn = e.target.closest('[data-status-action]');
    if (statusBtn) { await changeStatus(statusBtn, statusBtn.dataset.statusAction); return; }
    const tr = e.target.closest('tr[data-code]');
    if (e.target.closest('[data-archive]') && tr && ctx.session?.role === 'owner') {
      const code=tr.dataset.code;
      const confirmed=await confirmDialog({
        title:'حذف المنتج '+code,
        text:'ده هيشيل المنتج من المتجر ويأرشفه نهائيًا، لكن الأوردرات والسجلات القديمة هتفضل محفوظة. الحذف ده مش ممكن تتراجع عنه. متأكد؟',
        okText:'تأكيد الحذف والأرشفة',danger:true
      });
      if(!confirmed)return;
      const button=e.target.closest('[data-archive]');
      const res=await withBusy(button,()=>call('products.archive',{code}));
      if(['archived','already_archived'].includes(res.outcome)){done('تم أرشفة المنتج وإخفاؤه من المتجر');load();}
      else fail(res);
    }
    if (e.target.closest('[data-price]') && tr) quickPrice(tr.dataset.code, load);
  });
  $('#q', el).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 300));
  $$('[data-status]', el).forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.status; $$('[data-status]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  $('#cat', el).addEventListener('change', (e) => { state.category = e.target.value; load(); });
  $$('[data-new]', el).forEach((b) => b.addEventListener('click', () => createSheet(ctx)));
  if (ctx.query.get('new') === '1' && can('products.edit')) { history.replaceState(null, '', '#/products'); createSheet(ctx); }
  await load();
}

function quickPrice(code, after) {
  const box = sheet({ title: `${t('products.quickPrice')} · ${code}`, body: html`<label class="field"><span>${t('editor.basePrice')}</span>
    <div class="input-money"><input id="qp" inputmode="decimal" autocomplete="off" placeholder="0"><span>EGP</span></div></label><p class="err" id="qperr"></p>`,
    foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
  $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
  const save = async () => {
    const v = toMinor($('#qp', box).value); if (v === null || v < 100) { $('#qperr', box).textContent = t('err.invalid'); return; }
    const r = await withBusy($('[data-save]', box), () => call('products.set_price', { code, amount_minor: v }));
    if (r.outcome === 'saved') { closeLayer(); done(); after(); } else fail(r);
  };
  $('[data-save]', box).onclick = save;
  $('#qp', box).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

// ======================================================================= create (step 1)
function createSheet(ctx) {
  const box = sheet({ title: t('create.title'), wide: true, body: html`
    <p class="muted" style="margin:0 0 8px"><b>الخطوة ١ من ٣:</b> البيانات الأساسية. بعد الحفظ هتضيفي الألوان، وكل لون بصوره ومقاساته وسعره. <strong>المنتج بيتحفظ مسودة ومش بيظهر للعميلات لحد ما تنشريه.</strong></p>
    <label class="field"><span>${t('create.name')}</span><input class="input" id="c-title" maxlength="200" required autocomplete="off" placeholder="${t('create.namePh')}"></label>
    <div class="grid2">
      <label class="field"><span>${t('create.category')}</span><select class="select" id="c-cat" required></select></label>
      ${ctx.can('products.price') ? html`<label class="field"><span>${t('create.price')}</span><div class="input-money"><input id="c-price" inputmode="decimal" autocomplete="off" placeholder="مثال: 650"><span class="sr">سعر بيع المنتج بالجنيه المصري</span><span>EGP</span></div></label>` : ''}
    </div>
    ${!ctx.can('products.price') ? html`<p class="muted">صلاحيتك تسمح بإضافة الموديل، لكن السعر هتحدده مسؤولة التسعير بعد الحفظ.</p>` : ''}
    ${ctx.can('owner') ? html`<label class="field"><span>تكلفة المورد (اختياري، للمالكة بس)</span><div class="input-money"><input id="c-cost" inputmode="decimal" autocomplete="off" placeholder="مثال: 350"><span>EGP</span></div><small data-c-profit role="status">التكلفة مش بتظهر للعميلات ولا في المتجر.</small></label>` : ''}
    <div class="field supplier-field" data-private-supplier>
      <label for="c-supplier">المورد اللي المنتج جاي منه (داخل الإدارة فقط)</label>
      <select class="select" id="c-supplier"><option value="">تحميل الموردين…</option></select>
      ${ctx.can('owner') ? html`<label for="c-supplier-new" class="muted">مورد جديد؟ اكتبي اسمه هنا بدل ما تختاري من القائمة</label>
        <input class="input" id="c-supplier-new" maxlength="200" placeholder="اسم المورد الجديد (اختياري)" autocomplete="off">` : ''}
      <p class="muted" id="c-supplier-note" role="status" aria-live="polite">جار تحميل الموردين…</p>
    </div>
    <label class="field"><span>${t('create.description')} (اختياري)</span><textarea class="textarea" id="c-desc" rows="3" maxlength="10000" placeholder="مثال: خامة ناعمة، مناسبة للخروج، تعليمات الغسيل"></textarea></label>
    <div class="desc-helper" data-description-helper>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn-soft" data-desc-improve>✨ تحسين الوصف مجانًا</button>
        <button type="button" class="btn btn-ghost" data-desc-undo hidden>رجوع للوصف الأصلي</button>
      </div>
      <p class="muted" data-desc-message role="status" aria-live="polite">اكتبي وصف بسيط، وخلّينا ننظّمه بشكل تسويقي. مفيش معلومات بتتبعت لخدمة خارجية.</p>
    </div>
    ${ctx.can('media.manage') ? html`<div class="field"><span>الصورة الرئيسية (اختياري)</span><div class="thumbs" id="c-photos"><label class="thumb thumb-add" id="c-photo-add">${icon('upload')}<span>اختاري صورة</span><input type="file" accept="image/jpeg,image/png,image/webp" class="sr" id="c-photo"></label></div><small>صورة عامة للموديل. صور كل لون هترفعيها في الخطوة الجاية.</small></div>` : ''}
    <label class="switch"><input type="checkbox" id="c-new" checked><i></i>${t('create.isNew')}</label>
    <p class="err" id="c-error" role="alert" aria-live="polite" hidden></p>
    <ol class="blockers" id="c-steps" hidden></ol>`,
    foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-create>احفظي المسودة وكمّلي الألوان</button>` });
  $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
  try { mountDescriptionEnhancer(box, { textarea: '#c-desc', titleInput: '#c-title' }); }
  catch {
    const feature = $('[data-description-helper]', box);
    const btn = feature?.querySelector('[data-desc-improve]');
    if (btn) btn.disabled = true;
    const hint = feature?.querySelector('[data-desc-message]');
    if (hint) hint.textContent = 'اكتبي الوصف واحفظيه عادي؛ التحسين المجاني مش متاح دلوقتي.';
  }
  const supplierState = initSupplierPicker({ root: box, selectId: '#c-supplier', statusId: '#c-supplier-note', call, isOwner: ctx.can('owner') });
  const catSel = $('#c-cat', box);
  const createButton = $('[data-create]', box);
  createButton.disabled = true;
  const error = $('#c-error', box);
  const message = (text, target) => {
    error.textContent = text;
    error.hidden = !text;
    if (target) {
      target.setAttribute('aria-invalid', 'true');
      target.focus();
    }
  };
  (categories.length ? Promise.resolve(categories) : loadCategories()).then((cs) => {
    if (!cs.some(c => c.visible !== false)) {
      message('مفيش قسم ظاهر متاح. خلي المسؤولة عن الأقسام تفعّل قسم الأول، أو راجعي الاتصال بالسيرفر.');
      return;
    }
    const ordered = [...cs].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));
    ordered.forEach((c) => catSel.add(new Option(c.visible === false ? `${c.name} (${t('status.hidden')})` : c.name, c.name)));
    const firstVisible = ordered.find((c) => c.visible !== false);
    if (firstVisible) catSel.value = firstVisible.name;
  }).catch(() => message('تعذّر تحميل الأقسام. اقفلي النافذة وجربي تاني.')).finally(() => {
    if (document.contains(createButton)) createButton.disabled = !catSel.value || !categories.some(c => c.name === catSel.value && c.visible !== false);
  });
  const costIn = $('#c-cost', box);
  const profitLine = () => {
    const out = $('[data-c-profit]', box); if (!out) return;
    const cost = costIn.value.trim() ? toMinor(costIn.value.trim()) : null, sell = toMinor($('#c-price', box)?.value.trim() || '');
    out.textContent = cost === null ? 'التكلفة مش بتظهر للعميلات ولا في المتجر.' : profitText(sell, cost, money).text;
  };
  costIn?.addEventListener('input', profitLine);
  $('#c-price', box)?.addEventListener('input', profitLine);
  const key = idempotencyKey();
  $('[data-create]', box).onclick = async (e) => {
    message('');
    const title = $('#c-title', box).value.trim();
    if (title.length < 2) { message('اكتبي اسم موديل واضح من حرفين على الأقل.', $('#c-title', box)); return; }
    if (!catSel.value || !categories.some(c => c.name === catSel.value && c.visible !== false)) {
      message('اختاري قسم ظاهر صحيح قبل حفظ المنتج.', catSel); return;
    }
    const priceIn = $('#c-price', box)?.value.trim();
    const price = priceIn ? toMinor(priceIn) : null;
    if ($('#c-price', box) && (price === null || price < 100)) {
      message('اكتبي سعر البيع بالجنيه، زي 650. السعر مطلوب علشان فريقك يقدر يجهز المنتج للنشر.', $('#c-price', box)); return;
    }
    const costText = costIn?.value.trim() || '';
    const cost = costText ? toMinor(costText) : null;
    if (costText && (cost === null || cost < 1)) { message('تكلفة المورد لازم تكون رقم بالجنيه، زي 350، أو سيبيها فاضية.', costIn); return; }
    await supplierState.ready;
    const chosenSupplier = supplierChoice({
      selected: $('#c-supplier', box)?.disabled ? '' : $('#c-supplier', box)?.value || '',
      newName: $('#c-supplier-new', box)?.value || '', suppliers: supplierState.items,
      owner: ctx.can('owner')
    });
    if (!chosenSupplier.ok) { message(chosenSupplier.error, $('#c-supplier-new', box) || $('#c-supplier', box)); return; }
    // Staff without price permission may still draft the catalogue; a price manager finishes it.
    $('#c-title', box).removeAttribute('aria-invalid');
    $('#c-price', box)?.removeAttribute('aria-invalid');
    const steps = $('#c-steps', box); steps.replaceChildren(); steps.hidden = false;
    const step = (label) => { const li = document.createElement('li'); li.textContent = `… ${label}`; steps.append(li); return li; };
    await withBusy(e.currentTarget, async () => {
      let li = step(t('create.steps.create'));
      const r = await call('products.create', { idempotency_key: key, title, description: $('#c-desc', box).value.trim(), category: catSel.value || null, is_new: $('#c-new', box).checked, ...(chosenSupplier.id ? { supplier_id: chosenSupplier.id } : {}) });
      if (!['created', 'existing'].includes(r.outcome)) { fail(r); li.remove(); return; }
      li.textContent = '✓ ' + t('create.steps.create');
      const code = r.code;
      const goToDraft = (tab, info) => {
        closeLayer();
        sessionStorage.setItem('wa.ptab', tab);
        island('error', info);
        ctx.go('products/' + code);
      };
      if (r.outcome === 'existing') {
        // A timed-out first attempt may have created only part of the draft: never overwrite or claim success.
        goToDraft('details', 'المسودة كانت اتحفظت بالفعل. راجعي السعر والألوان والصور قبل النشر؛ مش هنكرر الإنشاء.');
        return;
      }
      let supplierIssue = '';
      if (chosenSupplier.create && ctx.can('owner')) {
        li = step('تسجيل المورد');
        const created = await createSupplierIfNeeded({ call, choice: chosenSupplier });
        if (created.ok) {
          const assigned = await call('suppliers.assign', { code, supplier_id: created.id }).catch(() => ({ outcome: 'network' }));
          li.textContent = assigned.outcome === 'saved' ? '✓ المورد اتحفظ واتربط بالمنتج' : '✗ تعذّر ربط المورد';
          if (assigned.outcome !== 'saved') supplierIssue = 'المورد اتسجل لكن ربطه بالمنتج محتاج مراجعة في تبويب البيانات.';
        } else { li.textContent = '✗ المورد محتاج مراجعة'; supplierIssue = created.error; }
      }
      if (price) {
        li = step(t('create.steps.price'));
        const pr = await call('products.set_price', { code, amount_minor: price });
        if (pr.outcome !== 'saved') {
          li.textContent = '✗ ' + t('create.steps.price');
          fail(pr);
          goToDraft('details', 'الموديل اتحفظ مسودة، لكن السعر محتاج مراجعة. كمّلي السعر من تبويب البيانات، ومتنشريهوش قبل التحقق.');
          return;
        }
        li.textContent = '✓ ' + t('create.steps.price');
      }
      if (cost !== null) {
        li = step('تكلفة المورد');
        let cr;
        try { cr = await saveCost(call, code, null, cost); } catch { cr = { outcome: 'network' }; }
        // The cost table ships with this release for approval; until it is live the draft is still fine.
        li.textContent = cr.outcome === 'saved' ? '✓ تكلفة المورد' : COST_OPS_MISSING.has(cr.outcome) ? '– تكلفة المورد: محتاجة تفعيل من السيرفر' : '✗ تكلفة المورد';
      }
      // Shipping is a separate explicit product assignment: the WOMEN default, else the first active profile.
      let shippingReady = false;
      if (ctx.can('shipping.manage')) {
        const available = await call('shipping.get');
        if (available.outcome === 'ok') {
          const active = (available.data?.profiles || []).filter((p) => p.active);
          const standard = active.find((p) => p.key === 'women_standard') || active[0];
          if (standard) {
            const assigned = await call('products.set_shipping_profile', { code, profile_key: standard.key });
            if (assigned.outcome !== 'saved') fail(assigned);
            else shippingReady = true;
          }
        } else fail(available);
      }
      const photo = $('#c-photo', box)?.files;
      if (photo?.length) {
        li = step('الصورة الرئيسية');
        const up = await uploadPhotos({ files: photo, code, title, version: r.structure_version, grid: $('#c-photos', box), before: $('#c-photo-add', box) });
        li.textContent = up.ok ? '✓ الصورة الرئيسية' : '✗ الصورة الرئيسية: ارفعيها تاني من تبويب الصور';
      }
      closeLayer();
      sessionStorage.setItem('wa.ptab', 'colours');
      if (supplierIssue) island('error', supplierIssue);
      else done(shippingReady ? 'المسودة محفوظة. الخطوة ٢: ضيفي الألوان، وكل لون بمقاساته وصوره.' :
        'المسودة محفوظة. ضيفي الألوان، وطريقة الشحن لسه محتاجة تتحدد من موظفة عندها صلاحية الشحن قبل النشر.');
      ctx.go('products/' + code);
    });
  };
}

// ======================================================================= editor
async function renderEditor(ctx, code) {
  const { el, can } = ctx;
  render(el, html`<div class="page">${skRows(1, 80)}${skRows(3, 140)}</div>`);
  const [r] = await Promise.all([call('products.get', { code }), categories.length ? null : loadCategories()]);
  if (r.outcome === 'not_found') { render(el, html`<div class="empty">${icon('box')}<b>${t('editor.notFound')}</b><a class="btn btn-ghost" href="#/products">${t('app.back')}</a></div>`); return; }
  if (r.outcome !== 'ok') { fail(r); return; }
  const d = r.data, p = d.product;
  ctx.setTitle(p.title);
  const reload = () => renderEditor(ctx, code);
  const visiblePhotos = (d.media?.media || []).filter(m => !m.hidden && !m.delete_pending);
  const hasVirtualAvailability = (p.variants || []).some(v => v.active && v.availability === 'available'
    && Number(d.stock?.[String(v.position)]?.quantity || 0) > 0);
  let tab = sessionStorage.getItem('wa.ptab') || 'details';
  const tabs = ['details', 'colours', 'preview', 'media', 'variants', 'publish', ...(d.activity ? ['activity'] : [])];
  if (!tabs.includes(tab)) tab = 'details';
  render(el, html`<div class="page">
    <div class="page-head"><div><a class="btn btn-ghost btn-sm" href="#/products">${icon(document.dir === 'rtl' ? 'chev' : 'chevBack')}${t('nav.products')}</a>
      <h2 style="margin-top:8px">${p.title}</h2><p class="row"><span class="code">${p.public_code}</span>${statusBadge(p.status)}<span class="muted">${ago(p.updated_at)}</span></p></div>
      <div class="actions"><button type="button" class="btn btn-soft" data-quick-single>تعديل سريع للمقاس والسعر والصور</button></div>
      ${can('products.publish') && p.status !== 'archived' ? html`<div class="actions"><button class="btn ${p.status === 'public' ? 'btn-ghost' : 'btn-primary'}" data-pub>${p.status === 'public' ? t('products.hide') : t('products.publish')}</button></div>` : ''}</div>
    ${p.status !== 'public' && p.status !== 'archived' ? html`<section class="card stack" aria-label="خطوات تجهيز مسودة المنتج">
      <div class="card-head"><h3>كمّلي الموديل في ٣ خطوات</h3><span class="muted">مسودة مش ظاهرة للعميلات لحد النشر</span></div>
      <p class="muted" style="margin:0">كل لون ليه صوره ومقاساته وسعره. راجعي المعاينة زي ما العميلة هتشوفها، وبعدها انشري.</p>
      <div class="row" style="flex-wrap:wrap">
        <button type="button" class="btn btn-soft btn-sm" data-setup-tab="details">١. البيانات (${p.base_price ? 'السعر متحدد' : 'السعر ناقص'}${p.shipping_profile ? '' : '، الشحن ناقص'})</button>
        <button type="button" class="btn btn-soft btn-sm" data-setup-tab="colours">٢. الألوان والصور (${visiblePhotos.length ? visiblePhotos.length + ' صورة' : 'الصور ناقصة'}${hasVirtualAvailability ? '' : '، التوافر ناقص'})</button>
        <button type="button" class="btn btn-primary btn-sm" data-setup-tab="preview">٣. المعاينة والنشر</button>
      </div>
    </section>` : ''}
    <div class="seg" role="tablist">${tabs.map((x) => html`<button role="tab" data-v="${x}" aria-selected="${x === tab}">${t('editor.tabs.' + x)}</button>`)}</div>
    <div class="editor"><div id="tabbody"></div>
      <aside>
        <section class="card"><div class="card-head"><h3>${t('editor.viewsTitle')}</h3>${icon('eye')}</div>
          <dl class="kv"><dt>${t('editor.today')}</dt><dd class="num">${fmtNum(d.views?.today)}</dd><dt>${t('editor.d7')}</dt><dd class="num">${fmtNum(d.views?.last_7_days)}</dd>
          <dt>${t('editor.d30')}</dt><dd class="num">${fmtNum(d.views?.last_30_days)}</dd><dt>${t('editor.total')}</dt><dd class="num">${fmtNum(d.views?.total)}</dd></dl></section>
        ${publishCard(p, d)}
      </aside></div></div>`);
  $('[data-quick-single]', el)?.addEventListener('click', () => {
    const box = sheet({
      title: p.title + ' · تعديل سريع',
      wide: true,
      body: html`<div class="stack">
        <p class="muted">اختاري المقاس وعدّلي السعر والإتاحة والصور من نفس الشاشة. المقاسات غير المسجلة هتظهر بوضوح.</p>
        <div class="quick-colors" data-quick-colors role="group" aria-label="المنتج"></div>
        <div data-quick-panel aria-live="polite"></div>
      </div>`,
      foot: html`<button class="btn btn-ghost" type="button" data-close>إغلاق</button>${can('products.price') || can('inventory.manage') ? html`<button type="button" class="btn btn-primary" data-quick-save-footer>حفظ اللون والمقاس</button>` : ''}`
    });
    mountQuickProductEditor({
      box, ctx,
      members: [{ product: { ...p, image: d.card?.image || null }, color: { name: 'المنتج', hex: '#66768B' } }],
      onChanged: reload
    });
  });
  $('[data-pub]', el)?.addEventListener('click', async (e) => {
    const publish = p.status !== 'public';
    if (publish && !visiblePhotos.length) {
      island('error', 'المنتج لسه مالوش صور ظاهرة. ارفعي صورة واحدة على الأقل قبل النشر.');
      $('[data-v="media"]', el)?.click();
      return;
    }
    if (publish && !p.shipping_profile) {
      island('error', 'طريقة الشحن مش محددة. اختاري طريقة الشحن من تبويب البيانات قبل النشر.');
      $('[data-v="details"]', el)?.click();
      return;
    }
    const res = await withBusy(e.currentTarget, () => call(publish ? 'products.publish' : 'products.hide', { code }));
    if (['published', 'hidden', 'already_public', 'already_hidden'].includes(res.outcome)) { done(); reload(); }
    else if (res.outcome === 'rejected' && res.blockers) island('error', t('editor.blockers'), res.blockers.map((b) => t('blocker.' + b, b)).join('، '));
    else fail(res);
  });
  const body = $('#tabbody', el);
  const show = (name) => { tab = name; sessionStorage.setItem('wa.ptab', name); TABS[name](body, { ctx, d, p, code, reload }); };
  segmented($('.seg', el), show);
  $$('[data-setup-tab]', el).forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.setupTab;
    $('[data-v="' + target + '"]', el)?.click();
  }));
  show(tab);
}

function publishCard(p, d) {
  const blockers = p.publish_blockers || [];
  const photosReady = (d.media?.media || []).some(m => !m.hidden && !m.delete_pending);
  const soft = [!p.shipping_profile && 'noShipping', !photosReady && 'noMedia'].filter(Boolean);
  return html`<section class="card"><div class="card-head"><h3>${t('editor.publishTitle')}</h3>${statusBadge(p.status)}</div>
    ${blockers.length ? html`<p class="muted" style="margin:0 0 8px">${t('editor.blockers')}</p><ul class="blockers">${blockers.map((b) => html`<li>${icon('alert')}${t('blocker.' + b, b)}</li>`)}</ul>`
      : soft.length ? html`<p class="muted" style="margin:0">المنتج ناقصه حاجات قبل النشر:</p>`
      : html`<div class="ready">${t('editor.ready')}</div>`}
    ${soft.length ? html`<ul class="blockers" style="margin-top:8px">${soft.map((b) => html`<li>${icon('alert')}${t('blocker.' + b)}</li>`)}</ul>` : ''}</section>`;
}

const TABS = {
  colours: coloursTab,
  preview: previewTab,
  details(body, { ctx, d, p, code, reload }) {
    const { can } = ctx;
    render(body, html`<div class="stack">
      <form class="card stack" id="f-text"><div class="card-head"><h3>${t('editor.details')}</h3></div>
        <label class="field"><span>${t('editor.title')}</span><input class="input" id="e-title" value="${p.title}" maxlength="200" ${can('products.edit') ? '' : 'disabled'}></label>
        <label class="field"><span>${t('editor.description')}</span><textarea class="textarea" id="e-desc" maxlength="10000" ${can('products.edit') ? '' : 'disabled'}>${p.description || ''}</textarea></label>
        ${can('products.edit') ? html`<div class="desc-helper" data-description-helper>
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn btn-soft" data-desc-improve>✨ تحسين الوصف مجانًا</button>
            <button type="button" class="btn btn-ghost" data-desc-undo hidden>رجوع للوصف الأصلي</button>
          </div>
          <p class="muted" data-desc-message role="status" aria-live="polite">راجعي الوصف المحسّن قبل حفظ التعديل. مفيش نشر تلقائي.</p>
        </div>` : ''}
        ${can('products.edit') ? html`<div class="row"><span class="space"></span><button class="btn btn-primary" data-save-text>${t('app.save')}</button></div>` : ''}</form>
      <section class="card stack" data-private-supplier>
        <div class="card-head"><h3>المورد</h3><span class="muted">داخل لوحة الإدارة فقط</span></div>
        <label class="field" for="e-supplier"><span>المنتج جاي من مورد إيه؟</span>
          <select class="select" id="e-supplier" ${can('owner') && p.status !== 'archived' ? '' : 'disabled'}><option value="">تحميل الموردين…</option></select></label>
        ${can('owner') && p.status !== 'archived' ? html`<label class="field" for="e-supplier-new"><span>أو اكتبي اسم مورد جديد</span>
          <input class="input" id="e-supplier-new" maxlength="200" placeholder="اسم المورد (اختياري)" autocomplete="off"></label>
          <div class="row"><button type="button" class="btn btn-primary" data-save-supplier>احفظي المورد</button></div>` : ''}
        <p class="muted" id="e-supplier-note" role="status" aria-live="polite">جار تحميل الموردين…</p>
      </section>
      <section class="card stack"><div class="card-head"><h3>${t('editor.display')}</h3></div>
        <div class="grid2"><label class="field"><span>${t('editor.category')}</span><select class="select" id="e-cat" ${can('products.edit') ? '' : 'disabled'}>${categories.map((c) => html`<option ${c.name === d.card.category ? 'selected' : ''}>${c.name}</option>`)}</select></label>
          <label class="field"><span>${t('editor.basePrice')}</span><div class="input-money"><input id="e-price" inputmode="decimal" value="${p.base_price ? (p.base_price.amount_minor / 100) : ''}" ${can('products.price') ? '' : 'disabled'}><span>EGP</span></div></label></div>
        <label class="switch"><input type="checkbox" id="e-new" ${d.card.is_new ? 'checked' : ''} ${can('products.edit') ? '' : 'disabled'}><i></i>${t('editor.isNew')}</label>
        <label class="field"><span>${t('editor.shipping')}</span><select class="select" id="e-ship" ${can('shipping.manage') ? '' : 'disabled'}>
          <option value="">${t('editor.shippingNone')}</option>${(d.shipping_profiles || []).map((s) => html`<option value="${s.key}" ${p.shipping_profile?.key === s.key ? 'selected' : ''}>${s.name}</option>`)}</select></label>
        ${can('products.edit') || can('products.price') || can('shipping.manage') ? html`<div class="row"><span class="space"></span><button class="btn btn-primary" data-save-display>${t('app.save')}</button></div>` : ''}</section></div>`);
    const supplierState = initSupplierPicker({ root: body, selectId: '#e-supplier', statusId: '#e-supplier-note',
      call, currentId: d.supplier_id, isOwner: can('owner') });
    const saveSupplier = $('[data-save-supplier]', body);
    if (saveSupplier) saveSupplier.addEventListener('click', async e => {
      await supplierState.ready;
      const choice = supplierChoice({
        selected: $('#e-supplier', body)?.value || '', newName: $('#e-supplier-new', body)?.value || '',
        suppliers: supplierState.items, owner: can('owner')
      });
      if (!choice.ok) { island('error', choice.error); return; }
      if (!choice.create && (choice.id || null) === (d.supplier_id || null)) { done('المورد متسجل بالفعل.'); return; }
      await withBusy(e.currentTarget, async () => {
        const resolved = await createSupplierIfNeeded({ call, choice });
        if (!resolved.ok) { island('error', resolved.error); return; }
        const result = await call('suppliers.assign', { code, supplier_id: resolved.id }).catch(() => ({ outcome: 'network' }));
        if (result.outcome === 'saved') { done('المورد اتحفظ للمنتج.'); reload(); }
        else island('error', 'تعذّر ربط المورد. بيانات المنتج زي ما هي، جرّبي تاني.');
      });
    });
    if (can('products.edit')) {
      try { mountDescriptionEnhancer(body, { textarea: '#e-desc', titleInput: '#e-title' }); }
      catch {
        const btn = $('[data-desc-improve]', body);
        if (btn) btn.disabled = true;
        const hint = $('[data-desc-message]', body);
        if (hint) hint.textContent = 'اكتبي الوصف واحفظيه عادي؛ التحسين المجاني مش متاح دلوقتي.';
      }
    }
    $('#f-text', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await withBusy($('[data-save-text]', e.currentTarget), () => call('products.update_text', { code, title: $('#e-title', body).value.trim(), description: $('#e-desc', body).value.trim(), updated_at: p.updated_at }));
      if (res.outcome === 'updated') { done(); reload(); } else if (res.outcome === 'unchanged') done(t('settings.unchanged'));
      else if (res.outcome === 'conflict') { island('error', t('editor.conflict')); reload(); } else fail(res);
    });
    $('[data-save-display]', body)?.addEventListener('click', async (e) => {
      await withBusy(e.currentTarget, async () => {
        const jobs = [];
        const cat = $('#e-cat', body).value, isNew = $('#e-new', body).checked;
        if (can('products.edit') && (cat !== d.card.category || isNew !== d.card.is_new)) jobs.push(call('products.set_display', { code, category: cat, is_new: isNew }));
        const priceIn = $('#e-price', body).value.trim();
        if (can('products.price') && priceIn) { const v = toMinor(priceIn); if (v === null || v < 100) { island('error', t('err.invalid'), t('editor.basePrice')); return; } if (v !== p.base_price?.amount_minor) jobs.push(call('products.set_price', { code, amount_minor: v })); }
        const ship = $('#e-ship', body).value;
        if (can('shipping.manage') && ship && ship !== p.shipping_profile?.key) jobs.push(call('products.set_shipping_profile', { code, profile_key: ship }));
        const results = await Promise.all(jobs);
        const bad = results.find((x) => x.outcome !== 'saved');
        if (bad) fail(bad); else { done(); reload(); }
      });
    });
  },

  media(body, { ctx, d, code, reload }) {
    const media = [...(d.media?.media || [])].filter((m) => !m.delete_pending).sort((a, b) => a.position - b.position);
    const canEdit = ctx.can('media.manage');
    const variants = d.product?.variants || [];
    const options = d.product?.options || [];
    const variantName = (v) => (v.selections || []).map(s => options.find(o=>o.option_id===s.option_id)?.values.find(x=>x.value_id===s.value_id)?.value || '?').join(' / ') || 'مقاس واحد';
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('editor.media')}</h3><span class="muted">${fmtNum(media.length)}</span></div>
      <p class="muted" style="margin:0;font-size:12.5px">${t('editor.uploadHint')} ممكن تختاري أكتر من صورة مرة واحدة؛ النظام بيضغط الصور قبل الرفع. أول صورة ظاهرة بتكون الغلاف. <strong>لو المنتج ليه ألوان مختلفة، اختاري اللون والمقاس المناسب من القائمة قبل الرفع.</strong></p>
      ${canEdit && variants.length ? html`<label class="field"><span>الصور تخص أنهي لون ومقاس؟</span><select class="select" id="m-variant"><option value="">صور عامة للمنتج</option>${variants.map(v=>html`<option value="${v.position}">${variantName(v)}</option>`)}</select><small>اختاري اللون/المقاس قبل رفع الصور. الصور العامة لكل الاختيارات.</small></label>` : ""}
      <div class="media-grid">
        ${media.map((m, i) => html`<figure class="media ${m.hidden ? 'hidden' : ''}" data-id="${m.media_id}" style="margin:0">
          <img src="${imgUrl(m.storage_path)}" alt="${m.alt_text || ''}" loading="lazy">
          <small class="muted" style="display:block;max-width:120px;overflow-wrap:anywhere">${m.scope === "variant" ? (m.variant?.values || []).join(" / ") : m.scope === "option_value" ? m.option_value?.value : "كل الألوان"}</small>
          ${i === 0 ? html`<span class="badge ok cover">${t('editor.cover')}</span>` : ''}
          ${canEdit ? html`<div class="tools">
            ${i > 0 ? html`<button class="icon-btn" data-act="primary" title="${t('editor.makeCover')}" aria-label="${t('editor.makeCover')}">${icon('star')}</button>` : ''}
            <button class="icon-btn" data-act="left" aria-label="${t('editor.moveUp')}" ${i === 0 ? 'disabled' : ''}>${icon(document.dir === 'rtl' ? 'chev' : 'chevBack')}</button>
            <button class="icon-btn" data-act="right" aria-label="${t('editor.moveDown')}" ${i === media.length - 1 ? 'disabled' : ''}>${icon(document.dir === 'rtl' ? 'chevBack' : 'chev')}</button>
            <button class="icon-btn" data-act="hide" aria-label="${m.hidden ? t('editor.showImg') : t('editor.hideImg')}">${icon(m.hidden ? 'eye' : 'eyeOff')}</button>
            <button class="icon-btn" data-act="delete" aria-label="${t('editor.deleteImg')}">${icon('trash')}</button></div>` : ''}
        </figure>`)}
        ${canEdit ? html`<label class="drop" id="drop">${icon('upload')}<span>${t('editor.upload')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" id="file"></label>` : ''}
      </div>${!media.length && !canEdit ? html`<p class="muted">${t('editor.noMedia')}</p>` : ''}</section>`);
    if (!canEdit) return;
    let uploading = false;
    const upload = async (files) => {
      if (uploading) { island('busy', 'فيه صور بتترفع بالفعل؛ متضغطيش رفع تاني قبل ما تخلص.'); return; }
      uploading = true;
      const uploadField = $('#file', body);
      if (uploadField) uploadField.disabled = true;
      // Keep the chosen option stable for every photo in the same batch.
      const variantPos = $('#m-variant', body)?.value;
      try {
        const result = await uploadPhotos({ files, code, title: d.product.title, version: d.media?.structure_version ?? d.product.structure_version,
          grid: $('.media-grid', body), before: $('#drop', body), fields: { variant_position: variantPos } });
        if (!result.total) return;
        if (result.ok === result.total) { done('تم رفع ' + result.ok + ' صورة. راجعي الغلاف وربط الصور بالألوان قبل النشر.'); reload(); }
        else {
          if (result.ok) {
            // Show the saved photos as real media, then put the failed ones back so the retry list stays visible.
            await reload();
            const grid = $('.media-grid'), drop = $('#drop');
            if (grid) result.missed.forEach((m) => previewTile(grid, drop, m.file).failed(m.text));
          }
          island('error', uploadSummary(result));
        }
      } finally {
        uploading = false;
        if (uploadField && document.contains(uploadField)) { uploadField.disabled = false; uploadField.value = ''; }
      }
    };
    $('#file', body).addEventListener('change', (e) => upload(e.target.files));
    const drop = $('#drop', body);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = b.closest('[data-id]').dataset.id, idx = media.findIndex((m) => m.media_id === id);
      let res;
      if (b.dataset.act === 'primary') res = await call('media.set_primary', { code, media_id: id });
      if (b.dataset.act === 'hide') res = await call('media.set_hidden', { code, media_id: id, hidden: !media[idx].hidden });
      if (b.dataset.act === 'left' || b.dataset.act === 'right') {
        const ids = media.map((m) => m.media_id), j = idx + (b.dataset.act === 'left' ? -1 : 1);
        [ids[idx], ids[j]] = [ids[j], ids[idx]]; res = await call('media.reorder', { code, media_ids: ids });
      }
      if (b.dataset.act === 'delete') {
        if (!(await confirmDialog({ title: t('editor.deleteImg'), text: t('editor.deleteImgQ'), okText: t('app.delete'), danger: true }))) return;
        // The database only deletes a hidden photo (MD006): take it off the store first, then delete it.
        if (!media[idx].hidden) {
          const h = await call('media.set_hidden', { code, media_id: id, hidden: true });
          if (h.outcome !== 'saved') { fail(h); return; }
        }
        res = await deleteProductImage(code, id);
      }
      if (['saved', 'deleted'].includes(res?.outcome)) { done(); reload(); } else if (res) fail(res);
    });
  },

  variants(body, { ctx, d, p, code, reload }) {
    const { can } = ctx;
    const valueOf = (v) => v.selections?.length ? v.selections.map((s) => p.options.find((o) => o.option_id === s.option_id)?.values.find((x) => x.value_id === s.value_id)?.value).join(' / ') : '—';
    render(body, html`<div class="stack">
      <section class="card stack variants"><div class="card-head"><h3>${t('editor.variants')}</h3><span class="muted">${fmtNum(p.variants.length)}</span></div>
      <p class="muted" style="margin:0">المخزون هنا افتراضي: اكتبي عددًا تنظيميًا موجبًا للون والمقاس اللي تقدري توفريه من المورد، وفعّلي «متاح». راجعي المورد قبل تأكيد أي أوردر. علشان تحفظي سعر لون معين، اكتبي السعر واضغطي زر «حفظ السعر» في نفس الصف. الرقم الرمادي مثال للسعر الأساسي فقط. الكمية والإتاحة بتتحفظ لما تخرجي من الخانة.</p>
      <button type="button" class="btn btn-primary btn-sm" data-open-quick-colours>اختاري اللون والمقاس وعدّلي السعر بسهولة</button>
      ${p.variants.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>${t('editor.variant')}</th><th>${t('editor.vPrice')}</th><th title="عدد تنظيمي افتراضي، مش قطع مخزنة">كمية افتراضية</th><th>${t('editor.available')}</th><th></th></tr></thead>
        <tbody>${p.variants.map((v) => { const st = d.stock[String(v.position)]; return html`<tr data-pos="${v.position}" ${v.active ? '' : 'style="opacity:.55"'}>
          <td><b>${valueOf(v)}</b>${v.blockers?.length && v.active ? html`<div class="row-meta">${v.blockers.filter((b) => b !== 'product_not_public').map((b) => html`<span>${t('blocker.' + b, b)}</span>`)}</div>` : ''}</td>
          <td><div class="variant-price-cell"><div class="input-money"><input data-vprice inputmode="decimal" value="${v.price_source === 'variant_override' ? v.amount_minor / 100 : ''}" placeholder="${p.base_price ? p.base_price.amount_minor / 100 : ''}" ${can('products.price') ? '' : 'disabled'} aria-label="سعر اللون بالجنيه"><span>EGP</span></div>${can('products.price') ? html`<button type="button" class="btn btn-primary btn-sm" data-save-vprice>حفظ السعر</button>` : ''}<small data-price-feedback role="status" aria-live="polite"></small></div></td>
          <td><input class="input qty num" data-qty inputmode="numeric" value="${st ? st.quantity : ''}" placeholder="—" ${can('inventory.manage') ? '' : 'disabled'} aria-label="${t('editor.qty')}"></td>
          <td><label class="switch"><input type="checkbox" data-avail ${v.availability === 'available' ? 'checked' : ''} ${can('inventory.manage') ? '' : 'disabled'}><i></i><span class="sr">${t('editor.available')}</span></label></td>
          <td>${can('products.edit') ? html`<button class="btn btn-ghost btn-sm" data-active>${v.active ? t('team.suspend') : t('team.activate')}</button>` : ''}</td></tr>`; })}</tbody></table></div>
        <p class="muted" style="margin:0;font-size:12px">${t('editor.vPriceHint')}</p>` : html`<div class="empty">${icon('tag')}<b>${t('editor.noVariants')}</b></div>`}
      </section>
      ${can('products.edit') ? html`<section class="card stack"><div class="card-head"><h3>${t('editor.addOption')}</h3></div>
        ${p.status !== 'draft' ? html`<p class="muted" style="margin:0">${t('editor.structureDraftOnly')}</p>` : ''}
        ${p.options.map((o, oi) => html`<div class="perm-group"><h4>${o.name}<span class="muted">${o.values.map((v) => v.value).join('، ')}</span></h4>
          <div class="row"><input class="input" style="max-width:220px" data-newval="${oi}" placeholder="${t('editor.addValue')}" maxlength="40"><button class="btn btn-soft btn-sm" data-addval="${oi}">${t('editor.addValue')}</button></div></div>`)}
        ${p.status === 'draft' && !p.variants.length ? html`<div class="grid2"><label class="field"><span>${t('editor.optionName')}</span><input class="input" id="o-name" placeholder="${t('editor.optionNamePh')}" maxlength="40"></label>
          <label class="field"><span>${t('editor.values')}</span><input class="input" id="o-values" placeholder="S، M، L" maxlength="400"></label></div>
          <div class="row"><span class="space"></span><button class="btn btn-soft" data-addopt>${t('editor.addOption')}</button></div>` : ''}
        ${p.options.length ? html`<div class="row"><span class="space"></span><button class="btn btn-primary" data-combos>${t('editor.createVariants')}</button></div>` : ''}
      </section>` : ''}</div>`);
    const refreshAside = async () => {
      const fresh = await call('products.get', { code });
      const card = document.querySelector('.editor aside section:last-child');
      if (fresh.outcome === 'ok' && card) card.outerHTML = toString(publishCard(fresh.data.product, fresh.data));
    };
    const row = (el) => el.closest('tr[data-pos]');
    const ver = () => p.structure_version;
    const saveVariantPrice = async (tr) => {
      const input = tr?.querySelector('[data-vprice]'), button = tr?.querySelector('[data-save-vprice]');
      const feedback = tr?.querySelector('[data-price-feedback]');
      if (!input || !button || button.disabled) return;
      const raw = input.value.trim(), amount = raw ? toMinor(raw) : null;
      if (raw && (amount === null || amount < 100)) {
        input.setAttribute('aria-invalid', 'true');
        feedback.textContent = 'اكتبي سعر صحيح بالجنيه، مثل 650.';
        island('error', feedback.textContent); return;
      }
      input.removeAttribute('aria-invalid');
      button.disabled = true; input.disabled = true;
      feedback.textContent = 'جاري حفظ السعر…';
      try {
        const position = Number(tr.dataset.pos);
        const result = await call('products.set_variant_price', { code, version: ver(), position, amount_minor: amount });
        if (result?.outcome !== 'saved') {
          feedback.textContent = 'السعر ما اتحفظش، راجعي الرسالة.';
          fail(result);
          if (result?.code === 'PS002') reload();
          return;
        }
        const check = await call('products.get', { code });
        const latest = check?.outcome === 'ok' ? check.data?.product : null;
        const variant = latest?.variants?.find((v) => v.position === position);
        const confirmed = variant && (amount === null
          ? variant.price_source !== 'variant_override' && variant.amount_minor === latest.base_price?.amount_minor
          : variant.amount_minor === amount);
        if (!confirmed) {
          feedback.textContent = 'اتبعث الحفظ لكن التأكيد فشل. راجعي السعر قبل النشر.';
          island('error', feedback.textContent); return;
        }
        // Keep the current editor snapshot fresh when staff switches tabs without a page reload.
        p.structure_version = latest.structure_version;
        p.variants = latest.variants;
        p.base_price = latest.base_price;
        feedback.textContent = '✓ اتحفظ سعر اللون واتأكدنا منه';
        done('تم حفظ السعر');
        void refreshAside().catch(() => {});
      } catch {
        feedback.textContent = 'مشكلة اتصال: مش متأكدين إن السعر اتحفظ. حدّثي الصفحة.';
        island('error', feedback.textContent);
      } finally { button.disabled = false; input.disabled = false; }
    };
    body.addEventListener('change', async (e) => {
      const tr = row(e.target); if (!tr) return; const pos = +tr.dataset.pos;
      let res;
      // Price is saved only with the explicit button, so there is no silent blur-save.
      if (e.target.matches('[data-qty]')) { const q = e.target.value.trim(); if (!/^\d{1,6}$/.test(q)) {
        e.target.setAttribute('aria-invalid', 'true');
        island('error', 'اكتبي كمية افتراضية رقم صحيح من 0 لحد 999999، من غير حروف أو كسور.');
        return;
      } res = await call('products.set_stock', { code, version: ver(), position: pos, quantity: Number(q) }); if (res.outcome === 'saved') $('[data-avail]', tr).checked = res.available; }
      if (e.target.matches('[data-avail]')) res = await call('products.set_availability', { code, version: ver(), position: pos, available: e.target.checked });
      if (res?.outcome === 'saved') { e.target.removeAttribute('aria-invalid'); done(); refreshAside(); } else if (res) { fail(res); if (res.code === 'PS002') reload(); }
    });
    body.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-vprice]') && e.key === 'Enter') {
        e.preventDefault(); void saveVariantPrice(row(e.target));
      }
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-save-vprice]')) { await saveVariantPrice(row(b)); return; }
      if (b.matches('[data-open-quick-colours]')) { document.querySelector('[data-quick-single]')?.click(); return; }
      let res;
      if (b.matches('[data-active]')) { const pos = +row(b).dataset.pos; res = await call('products.structure', { code, version: ver(), change: { op: 'set_variant_active', variant: pos, active: !p.variants.find((v) => v.position === pos).active } }); }
      if (b.matches('[data-addopt]')) { const name = $('#o-name', body).value.trim(); const values = $('#o-values', body).value.split(/[,،]/).map((x) => x.trim()).filter(Boolean); if (!name || !values.length) return; res = await call('products.structure', { code, version: ver(), change: { op: 'add_option', name, values } }); }
      if (b.matches('[data-addval]')) { const oi = +b.dataset.addval; const v = $(`[data-newval="${oi}"]`, body).value.trim(); if (!v) return; res = await call('products.structure', { code, version: ver(), change: { op: 'add_value', option: oi, text: v } }); }
      if (b.matches('[data-combos]')) {
        const existing = new Set(p.variants.map((v) => p.options.map((o) => o.values.findIndex((x) => x.value_id === v.selections.find((s) => s.option_id === o.option_id)?.value_id)).join(',')));
        const combos = p.options.reduce((acc, o) => acc.flatMap((c) => o.values.filter((v) => v.active).map((v) => [...c, v.position])), [[]]).filter((c) => !existing.has(c.join(',')));
        if (!combos.length) { done(t('settings.unchanged')); return; }
        res = await withBusy(b, () => call('products.structure', { code, version: ver(), change: { op: 'create_variants', selections: combos } }));
      }
      if (res?.outcome === 'applied') { done(); reload(); } else if (res) fail(res);
    });
  },

  publish(body, { d, p }) {
    render(body, html`<div class="stack">${publishCard(p, d)}
      <section class="card"><dl class="kv"><dt>${t('products.status')}</dt><dd>${statusBadge(p.status)}</dd><dt>SS</dt><dd class="code">${p.public_code}</dd>
        <dt>${t('editor.shipping')}</dt><dd>${p.shipping_profile?.name || t('editor.shippingNone')}</dd><dt>${t('products.title')}</dt><dd>${date(p.created_at, false)}</dd></dl></section></div>`);
  },

  activity(body, { d }) {
    render(body, html`<section class="card"><div class="card-head"><h3>${t('editor.activity')}</h3></div>
      ${d.activity?.length ? html`<ul class="timeline">${d.activity.map((a) => html`<li>${activityLine(a)}<small>${date(a.at)}</small></li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('editor.noActivity')}</p>`}</section>`);
  },
};

export default {
  title: (params) => (params[0] ? params[0] : t('nav.products')),
  async render(ctx) { return ctx.params[0] ? renderEditor(ctx, ctx.params[0]) : renderList(ctx); },
};
