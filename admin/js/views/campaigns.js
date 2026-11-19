import { money, ago, withBusy, island, done, fail, confirmDialog } from '../ui.js';
import { call, mediaUrl } from '../api.js';
import { moveProductCode, slugFromTitle, validateCampaignSelection } from '../campaigns-model.js';

const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
};
const imgUrl = (path) => path ? mediaUrl(/^media\//.test(path) ? 'product-media/' + path : path) : null;
const campaignPageUrl = (item) => {
  const codes = Array.isArray(item.product_codes) ? item.product_codes : [];
  const single = codes.length === 1;
  const url = new URL(single ? '/lp/' : '/collections/', location.origin);
  if (single) url.searchParams.set('p', codes[0]);
  else url.searchParams.set('slug', item.slug);
  url.searchParams.set('utm_source', 'meta');
  url.searchParams.set('utm_medium', 'paid_social');
  url.searchParams.set('utm_campaign', item.slug);
  url.searchParams.set('utm_content', single ? codes[0] : 'collection');
  return url.href;
};
const statusLabel = (status) => ({ draft: 'مسودة', published: 'منشورة', archived: 'مؤرشفة' }[status] || status);
const blockerLabel = (reason) => ({
  product_not_public: 'المنتج مش منشور',
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
    let editing = null;
    let selected = new Set();

    const load = async () => {
      el.replaceChildren(make('div', 'page-loading', 'جاري تحميل مجموعات الإعلانات والمنتجات...'));
      const [c, p] = await Promise.all([
        call('campaigns.list'),
        call('products.list', { limit: 100 }),
      ]);
      if (c.outcome !== 'ok' || p.outcome !== 'ok') {
        fail(c.outcome !== 'ok' ? c : p);
        return false;
      }
      collections = Array.isArray(c.data) ? c.data : [];
      products = (p.data || []).filter(x => x.status !== 'archived');
      paint();
      return true;
    };

    const previewProducts = (container, onMove = () => {}, onRemove = () => {}) => {
      container.replaceChildren();
      const chosen = [...selected].map(code => products.find(p => p.public_code === code)).filter(Boolean);
      if (!chosen.length) {
        container.append(make('p', 'muted', 'اختار منتجًا واحدًا أو أكثر.'));
        return;
      }
      chosen.forEach((p, index) => {
        const card = make('div', 'campaign-preview-item');
        card.draggable = true;
        card.dataset.code = p.public_code;
        if (p.image) {
          const img = make('img');
          img.src = imgUrl(p.image);
          img.alt = '';
          img.loading = 'lazy';
          card.append(img);
        } else card.append(make('div', 'campaign-image-placeholder', 'صورة المنتج'));
        card.append(make('b', '', p.title));
        card.append(make('small', '', p.price_min_minor === null ? 'السعر يحدد لاحقًا' : money(p.price_min_minor)));
        const controls = make('div', 'row wrap');
        controls.append(actionButton('↑', 'btn-ghost btn-sm', () => onMove(p.public_code, index - 1)));
        controls.append(actionButton('↓', 'btn-ghost btn-sm', () => onMove(p.public_code, index + 1)));
        controls.append(actionButton('إزالة', 'btn-ghost btn-sm', () => onRemove(p.public_code)));
        card.append(controls);
        card.addEventListener('dragstart', event => {
          event.dataTransfer?.setData('text/plain', p.public_code);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragover', event => event.preventDefault());
        card.addEventListener('drop', event => {
          event.preventDefault();
          const code = event.dataTransfer?.getData('text/plain');
          if (code && code !== p.public_code) onMove(code, index);
        });
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
      header.append(make('h3', '', editing ? 'تعديل Landing Page' : 'إنشاء Landing Page'));
      header.append(make('span', 'space'));
      header.append(make('span', 'badge info', 'منتج واحد أو أكثر'));
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
      const count = make('span', 'badge info', selected.size + ' منتج');
      countRow.append(count);
      panel.append(countRow);
      panel.append(make('p', 'muted', 'اختار موديلات منشورة. قبل تشغيل الإعلان، اتأكد من توافر كل موديل مع المورد بالتليفون.'));

      const options = make('div', 'campaign-product-options');
      const previewWrap = make('div', 'campaign-preview-wrap');
      const previewHead = make('div', 'row');
      previewHead.append(make('b', '', 'ترتيب المنتجات في الصفحة'));
      previewHead.append(make('span', 'space'));
      previewHead.append(make('small', 'muted', 'اسحب المنتج أو استخدم الأسهم لتغيير ترتيبه'));
      const preview = make('div', 'campaign-preview');
      previewWrap.append(previewHead, preview);
      const error = make('p', 'err');
      error.hidden = true;

      products.slice().sort((a,b) => String(a.title).localeCompare(String(b.title), 'ar')).forEach(p => {
        const eligible = p.status === 'public';
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
        info.append(make('small', '', eligible ? 'منشور — راجع توافره مع المورد بالتليفون' : 'غير منشور — انشر المنتج أولًا'));
        label.append(checkbox, thumb, info, make('span', 'campaign-product-price', p.price_min_minor === null ? 'بدون سعر' : money(p.price_min_minor)));
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(p.public_code);
          else selected.delete(p.public_code);
          count.textContent = selected.size + ' منتج';
          previewProducts(preview, moveSelected, removeSelected);
        });
        options.append(label);
      });
      panel.append(options, previewWrap, error);

      const moveSelected = (code, targetIndex) => {
        const ordered = moveProductCode([...selected], code, targetIndex);
        selected = new Set(ordered);
        count.textContent = selected.size + ' منتج';
        previewProducts(preview, moveSelected, removeSelected);
      };
      const removeSelected = (code) => {
        selected.delete(code);
        options.querySelectorAll('input[data-code]').forEach(input => { input.checked = selected.has(input.dataset.code); });
        count.textContent = selected.size + ' منتج';
        previewProducts(preview, moveSelected, removeSelected);
      };

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
        const validation = validateCampaignSelection(codes, new Map(products.map(p => [p.public_code, p])));
        if (!validation.ok) { showError(validation.errors.join(' ')); return; }
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
      previewProducts(preview, moveSelected, removeSelected);
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
      copy.append(make('p', '', 'أنشئ صفحة لمنتج واحد أو مجموعة منتجات، وعدّل الترتيب والرابط والتصميم في أي وقت.'));
      head.append(copy);
      head.append(actionButton('＋ إنشاء مجموعة', 'btn-primary', () => openEditor()));
      page.append(head);

      const explainer = make('section', 'card stack campaign-explainer');
      const explainerHead = make('div', 'row');
      explainerHead.append(make('b', '', 'الكتالوج منفصل عن صفحات الإعلانات'), make('span', 'space'), make('span', 'badge info', 'عدد اختياري'));
      explainer.append(explainerHead);
      explainer.append(make('p', 'muted', 'صفحة المنتج الواحد تستخدم صفحة المنتج المستقلة. وعند اختيار عدة منتجات، تتجمع في صفحة واحدة. يمكنك إضافة المنتجات أو إزالتها وتغيير ترتيبها دون حذفها من الكتالوج.'));
      explainer.append(make('p', 'muted', 'قبل نشر المجموعة أو تشغيل الإعلانات، اتأكد من توافر كل موديل مع المورد بالتليفون. مفيش ربط آلي بالمورد أو خصم تلقائي للمخزون؛ الطلبات تفضل على نظام COD الحالي.'));
      page.append(explainer);

      if (editing) paintEditor(page);
      else if (!collections.length) {
        const empty = make('div', 'empty');
        empty.append(make('b', '', 'لسه مفيش صفحات إعلانية'), make('p', '', 'ابدأ بصفحة لمنتج واحد أو مجموعة من المنتجات المنشورة.'));
        empty.append(actionButton('إنشاء أول صفحة', 'btn-primary', () => openEditor()));
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
          if (item.status === 'published') actions.append(actionButton('نسخ رابط الصفحة', 'btn-primary btn-sm', async () => {
            try { await navigator.clipboard.writeText(campaignPageUrl(item)); done('اتنسخ رابط الصفحة.'); }
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
