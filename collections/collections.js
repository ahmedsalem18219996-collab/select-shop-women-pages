const API = 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge';
const root = document.getElementById('collection-app');
const params = new URLSearchParams(location.search);
const slug = (params.get('slug') || '').trim();
const make = (tag, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
};
const money = (minor) => {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 'السعر داخل صفحة الموديل';
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n / 100) + ' جنيه';
};
const productUrl = (code) => {
  const url = new URL('/lp/', location.origin);
  url.searchParams.set('p', code);
  ['utm_source','utm_medium','utm_campaign','utm_term','utm_id','fbclid','gclid'].forEach(key => {
    if (params.has(key)) url.searchParams.set(key, params.get(key));
  });
  url.searchParams.set('utm_content', code);
  url.searchParams.set('collection', slug);
  return url.pathname + url.search;
};
const showState = (title, description, unavailable = false) => {
  const card = make('section', 'collection-state');
  card.append(make('h1', '', title), make('p', '', description));
  const link = make('a', '', unavailable ? 'اكتشفي باقي الموديلات' : 'العودة للمتجر');
  link.href = '/';
  card.append(link);
  root.replaceChildren(card);
};
async function boot() {
  if (!/^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    showState('الرابط غير صحيح', 'ارجعي للمتجر واختاري الموديلات المتاحة.');
    return;
  }
  try {
    const response = await fetch(API + '/collections/' + encodeURIComponent(slug), { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (response.status === 409) {
      showState('بنحدّث توافر المجموعة', 'بعض الموديلات محتاجة تأكيد جديد من المورد. ارجعي بعد شوية أو اكتشفي باقي الموديلات.', true);
      return;
    }
    if (!response.ok) {
      showState('المجموعة غير متاحة حاليًا', 'الصفحة ممكن تكون اتوقفت أو اتأرشفت. تقدري تكملي تصفح باقي المتجر.', true);
      return;
    }
    const data = await response.json();
    if (!data.collection || !Array.isArray(data.items) || data.items.length < 3 || data.items.length > 5) {
      showState('المجموعة غير مكتملة', 'بنراجع الموديلات المتاحة حاليًا. ارجعي للمتجر لاكتشاف باقي المنتجات.', true);
      return;
    }
    document.title = data.collection.title + ' · SELECT SHOP WOMEN';
    const hero = make('section', 'collection-hero');
    hero.append(make('span', 'collection-kicker', 'SELECT SHOP WOMEN · COLLECTION'));
    hero.append(make('h1', '', data.collection.title));
    if (data.collection.description) hero.append(make('p', '', data.collection.description));
    hero.append(make('div', 'collection-count', data.items.length + ' موديلات متاحة للاختيار'));
    const grid = make('section', 'collection-grid');
    data.items.forEach((item, index) => {
      const link = make('a', 'collection-card');
      link.href = productUrl(item.publicCode);
      link.setAttribute('data-product-link', item.publicCode);
      link.setAttribute('aria-label', 'تفاصيل ' + item.title);
      const imageWrap = make('div', 'collection-card-image');
      if (item.image) {
        const img = make('img');
        img.src = item.image; img.alt = item.title; img.loading = index < 2 ? 'eager' : 'lazy';
        imageWrap.append(img);
      } else imageWrap.append(make('span', 'collection-card-placeholder', 'صورة الموديل'));
      const body = make('div', 'collection-card-body');
      body.append(make('div', 'collection-card-title', item.title));
      body.append(make('div', 'collection-card-price', money(item.priceMinor)));
      body.append(make('span', 'collection-card-action', 'شوفي التفاصيل واطلبي'));
      link.append(imageWrap, body);
      grid.append(link);
    });
    const note = make('p', 'collection-note', 'اختاري الموديل المناسب، وهتلاقي الصور والتفاصيل والمقاسات وزر الطلب في صفحة المنتج. الدفع عند الاستلام.');
    root.replaceChildren(hero, grid, note);
  } catch {
    showState('تعذّر تحميل المجموعة', 'تأكدي من الاتصال بالإنترنت وجربي مرة تانية.', true);
  }
}
boot();
