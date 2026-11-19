import { money, fmtNum, ago, withBusy, island, done, fail, confirmDialog } from '../ui.js';
import { call, mediaUrl } from '../api.js';
import { productCampaignEligibility, supplierStockSummary } from '../supplier-stock.js';
import { slugFromTitle } from '../campaigns-model.js';

const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
};
const imgUrl = (path) => path ? mediaUrl(/^media\//.test(path) ? 'product-media/' + path : path) : null;
const collectionUrl = (slug) => location.origin + '/collections/?slug=' + encodeURIComponent(slug);
const statusLabel = (status) => ({ draft: 'مسودة', published: 'منشورة', archived: 'مؤرشفة' }[status] || status);
const blockerLabel = (reason) => ({
  product_not_public: 'المنتج مش منشور',
  stock_missing: 'مفيش كمية مؤكدة عند المورد',
  out_of_stock: 'الكمية عند المورد صفر',
  stock_stale: 'تأكيد المورد أقدم من 24 ساعة',
  supplier_changed: 'المورد المرتبط اتغير',
  supplier_inactive: 'المورد موقوف',
}[reason] || 'محتاج مراجعة');
const actionButton = (label, cls, handler) => {
  const b = make('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', handler);
  return b;
};

export default {
  title: () => 'مجموعات الإعلانات',
  async render(ctx) {
    const { el } = ctx;
    if (!ctx.can('owner')) {
      const denied = make('div', 'empty', 'إدارة مجموعات الإعلانات متاحة للمالك فقط.');
      el.replaceChildren(denied);
      return;
    }

    let collections = [];
    let products = [];
    const stockByCode = new Map();
    let editing = null;
    let selected = new Set();

    const load = async () => {
      el.replaceChildren(make('div', 'page-loading', 'جاري تحميل مجموعات الإعلانات والمنتجات...'));
      const [c, p, s] = await Promise.all([
        call('campaigns.list'),
        call('products.list', { limit: 100 }),
        call('supplier-stock.list'),
      ]);
      if (c.outcome !== 'ok' || p.outcome !== 'ok') {
        fail(c.outcome !== 'ok' ? c : p);
        return false;
      }
      collections = Array.isArray(c.data) ? c.data : [];
      products = (p.data || []).filter(x => x.status !== 'archived');
      stockByCode.clear();
      if (s?.outcome === 'ok' && Array.isArray(s.data)) s.data.forEach(x => stockByCode.set(x.code, x));
      paint();
      return true;
    };

    const previewProducts = (container) => {
      container.replaceChildren();
      const chosen = [...selected].map(code => products.find(p => p.public_code === code)).filter(Boolean);
      if (!chosen.length) {
        container.append(make('p', 'muted', 'اختار الموديلات علشان تشوف معاينة المجموعة هنا.'));
        return;
      }
      chosen.forEach(p => {
        const card = make('div', 'campaign-preview-item');
        if (p.image) {
          const img = make('img');
          img.src = imgUrl(p.image);
          img.alt = '';
          img.loading = 'lazy';
          card.append(img);
        } else card.append(make('div', 'campaign-image-placeholder', 'صورة المنتج'));
        card.append(make('b', '', p.title));
        card.append(make('small', '', p.price_min_minor === null ? 'السعر يحدد لاحقًا' : money(p.price_min_minor)));
        container.append(card);
      });
    };

    const openEditor = (item = null) => {
      editing = item;
      selected = new Set(item?.product_codes || []);
      paint();
    };

    const paintEditor = (page) => {
      const panel = make('section', 'card stack campaign-editor');
      const header = make('div', 'row');
      header.append(make('h3', '', editing ? 'تعديل مجموعة الإعلانات' : 'إنشاء مجموعة إعلانية'));
      header.append(make('span', 'space'));
      header.append(make('span', 'badge info', '3–5 موديلات'));
      panel.append(header);

      const fields = make('div', 'grid2');
      const titleWrap = make('label', 'field');
      titleWrap.append(make('span', '', 'اسم المجموعة'));
      const titleInput = make('input', 'input');
      titleInput.maxLength = 120;
      titleInput.value = editing?.title || '';
      titleInput.placeholder = 'مثال: موديلات الخروج الجديدة';
      titleWrap.append(titleInput);
      const slugWrap = make('label', 'field');
      slugWrap.append(make('span', '', 'رابط المجموعة (Slug)'));
      const slugInput = make('input', 'input');
      slugInput.maxLength = 80;
      slugInput.value = editing?.slug || '';
      slugInput.placeholder = 'new-arrivals';
      slugWrap.append(slugInput);
      fields.append(titleWrap, slugWrap);
      panel.append(fields);

      const descriptionWrap = make('label', 'field');
      descriptionWrap.append(make('span', '', 'وصف قصير للصفحة'));
      const descriptionInput = make('textarea', 'textarea');
      descriptionInput.maxLength = 500;
      descriptionInput.rows = 2;
      descriptionInput.value = editing?.description || '';
      descriptionInput.placeholder = 'مجموعة موديلات متاحة من موردينا';
      descriptionWrap.append(descriptionInput);
      panel.append(descriptionWrap);

      let slugTouched = Boolean(editing?.slug);
      titleInput.addEventListener('input', () => {
        if (!slugTouched) slugInput.value = slugFromTitle(titleInput.value, 'collection-' + Date.now().toString(36).slice(-6));
      });
      slugInput.addEventListener('input', () => { slugTouched = true; });

      const countRow = make('div', 'row');
      countRow.append(make('b', '', 'اختيار الموديلات'));
      countRow.append(make('span', 'space'));
      const count = make('span', 'badge info', selected.size + '/5');
      countRow.append(count);
      panel.append(countRow);
      panel.append(make('p', 'muted', 'الموديلات غير المؤكدة أو غير المنشورة مش هتكون قابلة للإضافة الجديدة. لو تأكيد مورد قديم، حدّث الكمية من صفحة المنتج الأول.'));

      const options = make('div', 'campaign-product-options');
      const previewWrap = make('div', 'campaign-preview-wrap');
      const previewHead = make('div', 'row');
      previewHead.append(make('b', '', 'معاينة المجموعة'));
      previewHead.append(make('span', 'space'));
      previewHead.append(make('small', 'muted', 'شكل مبدئي قبل النشر'));
      const preview = make('div', 'campaign-preview');
      previewWrap.append(previewHead, preview);
      const error = make('p', 'err');
      error.hidden = true;

      products.slice().sort((a,b) => String(a.title).localeCompare(String(b.title), 'ar')).forEach(p => {
        const stock = stockByCode.get(p.public_code);
        const eligible = productCampaignEligibility(p, stock).ok;
        const checked = selected.has(p.public_code);
        const label = make('label', 'campaign-product-option' + (!eligible ? ' is-blocked' : ''));
        const checkbox = make('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.disabled = !eligible && !checked;
        checkbox.dataset.code = p.public_code;
        const thumb = make('span', 'thumb');
        if (p.image) {
          const img = make('img');
          img.src = imgUrl(p.image); img.alt = ''; img.loading = 'lazy';
          thumb.append(img);
        } else thumb.textContent = 'صورة';
        const info = make('span', 'campaign-product-info');
        info.append(make('b', '', p.title), make('small', 'code', p.public_code));
        info.append(make('small', '', (stock?.supplier_name || 'مورد غير محدد') + ' · ' + supplierStockSummary(stock)));
        label.append(checkbox, thumb, info, make('span', 'campaign-product-price', p.price_min_minor === null ? 'بدون سعر' : money(p.price_min_minor)));
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (selected.size >= 5) {
              checkbox.checked = false;
              island('error', 'المجموعة الواحدة حدها الأقصى 5 موديلات.');
              return;
            }
            selected.add(p.public_code);
          } else selected.delete(p.public_code);
          count.textContent = selected.size + '/5';
          previewProducts(preview);
        });
        options.append(label);
      });
      panel.append(options, previewWrap, error);

      const footer = make('div', 'row wrap');
      const cancel = actionButton('إلغاء', 'btn-ghost', () => { editing = null; paint(); });
      const save = actionButton('حفظ كمسودة', 'btn-primary', async () => {
        const title = titleInput.value.trim();
        const slug = slugInput.value.trim().toLowerCase();
        const description = descriptionInput.value.trim();
        const codes = [...selected];
        const showError = (message) => { error.textContent = message; error.hidden = false; };
        error.hidden = true;
        if (title.length < 2) { showError('اكتب اسم واضح للمجموعة.'); titleInput.focus(); return; }
        if (!/^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3) { showError('الرابط لازم يكون إنجليزي صغير ومن غير مسافات، مثال: new-arrivals.'); slugInput.focus(); return; }
        if (codes.length < 3 || codes.length > 5) { showError('لازم تختار من 3 إلى 5 موديلات.'); return; }
        await withBusy(save, async () => {
          const res = await call('campaigns.save', {
            ...(editing ? { id: editing.id, version: editing.version } : {}),
            title, slug, description, product_codes: codes,
          });
          if (res.outcome === 'saved') {
            editing = null;
            done('اتحفظت المجموعة كمسودة.');
            await load();
          } else if (res.outcome === 'duplicate') showError('الرابط ده مستخدم بالفعل. اختار رابط مختلف.');
          else if (res.outcome === 'conflict') showError('المجموعة اتعدلت في مكان تاني. اقفل وافتحها من جديد.');
          else fail(res);
        });
      });
      footer.append(cancel, make('span', 'space'), save);
      panel.append(footer);
      previewProducts(preview);
      page.append(panel);
    };

    const publishCollection = async (item, button) => {
      await withBusy(button, async () => {
        const res = await call('campaigns.publish', { id: item.id, version: item.version });
        if (res.outcome === 'published') { done('اتنشرت صفحة المجموعة.'); await load(); }
        else if (res.outcome === 'rejected') {
          const details = (res.blockers || []).map(x => x.code + ': ' + blockerLabel(x.reason)).join(' · ');
          island('error', 'مش هننشر المجموعة قبل حل: ' + details);
        } else if (res.outcome === 'conflict') { island('error', 'المجموعة اتغيرت. حدّث القائمة وجرب تاني.'); await load(); }
        else fail(res);
      });
    };

    const archiveCollection = async (item, button) => {
      const ok = await confirmDialog({ title: 'أرشفة المجموعة؟', text: 'الصفحة هتتوقف عن الظهور، لكن بيانات المجموعة والمنتجات هتفضل محفوظة.' });
      if (!ok) return;
      await withBusy(button, async () => {
        const res = await call('campaigns.archive', { id: item.id, version: item.version });
        if (res.outcome === 'archived') { done('اتأرشفت المجموعة.'); await load(); } else fail(res);
      });
    };

    const paint = () => {
      const page = make('div', 'page');
      const head = make('div', 'page-head');
      const copy = make('div');
      copy.append(make('h2', '', 'مجموعات الإعلانات'));
      copy.append(make('p', '', 'اجمع 3 أو 4 أو 5 موديلات في صفحة واحدة، وكل موديل يحتفظ بصفحة البيع الخاصة به.'));
      head.append(copy);
      head.append(actionButton('＋ إنشاء مجموعة', 'btn-primary', () => openEditor()));
      page.append(head);

      const explainer = make('section', 'card stack campaign-explainer');
      const explainerHead = make('div', 'row');
      explainerHead.append(make('b', '', 'الكتالوج منفصل عن الإعلانات'), make('span', 'space'), make('span', 'badge info', '3–5 موديلات'));
      explainer.append(explainerHead);
      explainer.append(make('p', 'muted', 'الموديلات غير المختارة تفضل في الموقع. المجموعة المنشورة تعرض المنتجات المتاحة فقط، وروابطها تفتح صفحة كل موديل.'));
      explainer.append(make('p', 'muted', 'شرط النشر: المنتج منشور، مربوط بمورد نشط، والكمية موجبة ومؤكدة خلال آخر 24 ساعة. لا يتم إنشاء حملة Meta أو صرف ميزانية من هنا.'));
      page.append(explainer);

      if (editing) paintEditor(page);
      else if (!collections.length) {
        const empty = make('div', 'empty');
        empty.append(make('b', '', 'لسه مفيش مجموعات إعلانية'), make('p', '', 'ابدأ بمجموعة من 3 إلى 5 موديلات مؤكدة عند المورد.'));
        empty.append(actionButton('إنشاء أول مجموعة', 'btn-primary', () => openEditor()));
        page.append(empty);
      } else {
        const grid = make('div', 'campaign-grid');
        collections.forEach(item => {
          const card = make('article', 'card campaign-card');
          const cardHead = make('div', 'row campaign-card-head');
          const title = make('div');
          title.append(make('h3', '', item.title), make('small', 'muted', item.slug));
          const badge = make('span', 'badge ' + (item.status === 'published' ? 'success' : item.status === 'archived' ? 'muted' : 'info'), statusLabel(item.status));
          cardHead.append(title, make('span', 'space'), badge);
          card.append(cardHead);
          card.append(make('p', 'muted', item.description || 'بدون وصف'));
          const chips = make('div', 'campaign-product-chips');
          (item.product_codes || []).forEach(code => chips.append(make('span', 'code', code)));
          card.append(chips);
          const meta = make('div', 'row campaign-card-meta');
          meta.append(make('span', 'muted', (item.product_codes || []).length + ' موديلات'), make('span', 'space'), make('span', 'muted', 'آخر تعديل ' + ago(item.updated_at)));
          card.append(meta);
          const actions = make('div', 'row wrap');
          if (item.status !== 'archived') actions.append(actionButton('تعديل', 'btn-soft btn-sm', () => openEditor(item)));
          if (item.status === 'draft') actions.append(actionButton('نشر الصفحة', 'btn-primary btn-sm', (e) => publishCollection(item, e.currentTarget)));
          if (item.status === 'published') actions.append(actionButton('نسخ رابط الصفحة', 'btn-soft btn-sm', async () => {
            try { await navigator.clipboard.writeText(collectionUrl(item.slug)); done('اتنسخ رابط المجموعة.'); }
            catch { island('error', 'تعذّر النسخ تلقائيًا.'); }
          }));
          if (item.status !== 'archived') actions.append(actionButton('أرشفة', 'btn-ghost btn-sm', (e) => archiveCollection(item, e.currentTarget)));
          card.append(actions);
          grid.append(card);
        });
        page.append(grid);
      }
      el.replaceChildren(page);
    };

    paint();
  },
};
