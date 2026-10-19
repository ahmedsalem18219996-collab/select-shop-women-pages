/* SELECT SHOP WOMEN · Claude design v2 · UI
   Renders the page from window.SelectStore (js/store-adapter.js) and window.SELECT_CONFIG (js/config.js).
   Interactions: stories viewer, stacking weekly looks, measuring-tape category filter,
   product feed, size bottom sheet with bust/waist finder, bottom tab bar. */
(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CFG = window.SELECT_CONFIG || {};
  const fmt = n => Number(n).toLocaleString('en-US');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const cssColor = v => /^#[0-9a-f]{3,8}$/i.test(v || '') ? v : '#B9BCC8';
  const cssUrl = u => `url("${String(u).replace(/["\\\n\r]/g, '')}")`;
  const CUR = CFG.currencyShort || 'ج', CUR_L = CFG.currencyLong || 'جنيه';
  /* Arabic counting: قطعة واحدة / قطعتين / 3–10 قطع / 11+ قطعة */
  const pieces = n => n === 1 ? 'قطعة واحدة' : n === 2 ? 'قطعتين' : n >= 3 && n <= 10 ? `${n} قطع` : `${n} قطعة`;

  const DATA = await window.SelectStore.loadCatalog();
  const SIZES = DATA.sizes;
  const P = DATA.products, LOOKS = DATA.looks, STORIES = DATA.stories, CATS = DATA.categories;
  const chart = DATA.sizeChart, chartMin = DATA.sizeChartMin || { bust: 80, waist: 62 };
  const byId = id => P.find(p => String(p.id) === String(id));

  // Public storefront = real WOMEN catalog. Claude's example data remains an
  // explicitly labelled comparison at ?design-preview=1 only.
  if (!CFG.demo) {
    const content = CFG.presentation || {};
    const brand = CFG.brand || {};
    const header = $('.hdr');
    if (header && content.announcement) {
      const banner = document.createElement('p');
      banner.className = 'storefront-owner-announcement';
      banner.textContent = String(content.announcement).slice(0, 160);
      if (/^#[0-9a-f]{6}$/i.test(brand.primaryColor || ''))
        banner.style.borderColor = brand.primaryColor;
      header.before(banner);
    }
    const hero = $('.hero h1');
    const lead = $('.hero p');
    if (hero) {
      const first = hero.firstChild;
      if (first && first.nodeType === Node.TEXT_NODE)
        first.textContent = (String(content.hero_title || 'اختاري ستايلك').slice(0, 100)) + ' ';
      const colored = hero.querySelector('.hl');
      if (colored) colored.textContent = String(content.hero_highlight || 'بطريقتك.').slice(0, 70);
    }
    if (lead) lead.textContent = String(content.hero_description || '').slice(0, 700);
    if (brand.storeName) {
      document.title = String(brand.storeName).slice(0, 100);
      const copyright = $('.foot > span');
      if (copyright) copyright.textContent = '© 2026 ' + String(brand.storeName).slice(0, 100);
    }
    const freshNote = $('#demoNote');
    if (freshNote) {
      freshNote.hidden = false;
      freshNote.textContent = CFG.loadError
        ? 'تعذّر تحميل المنتجات حاليًا. البيانات التجريبية مش معروضة، جربي تحديث الصفحة.'
        : P.length ? 'اختاري الموديل، وكمّلي المقاس والطلب من صفحة المنتج الآمنة.'
          : 'متجر WOMEN قيد التجهيز · لا توجد طلبات شراء مفعّلة حاليًا';
    }
    const storySection = $('#stories')?.parentElement;
    if (storySection && !STORIES.length) storySection.hidden = true;
    const looksSection = $('#looks');
    if (looksSection && !LOOKS.length) looksSection.hidden = true;
    const notes = [content.payment_note, content.shipping_note, content.returns_note];
    const promises = $$('.promises .promise');
    promises.forEach((el, index) => {
      const value = notes[index];
      if (!value) { el.hidden = true; return; }
      const heading = el.querySelector('b');
      const description = el.querySelector('span:not(.ic)');
      if (heading) heading.textContent = ['طرق الدفع', 'معلومات الشحن', 'الاستبدال والاسترجاع'][index];
      if (description) description.textContent = String(value).slice(0, 250);
    });
    if (!notes.some(Boolean)) {
      const promisesSection = $('.promises');
      if (promisesSection) promisesSection.hidden = true;
    }
  }

  /* ---------- config-driven bits ---------- */
  if (CFG.demo) $('#demoNote').hidden = false;
  // No dead '#' links on a public store: hide unresolved destinations.
  // Owner-provided contact info from WOMEN Supabase can re-enable these links.
  $$('[data-wa]').forEach(a => {
    if (/^[1-9]\d{6,14}$/.test(CFG.whatsapp || '')) {
      a.href = `https://wa.me/${CFG.whatsapp}`;
      a.hidden = false;
    } else {
      a.hidden = true;
      a.style.display = 'none';
    }
  });
  $$('[data-link]').forEach(a => {
    const u = CFG.links?.[a.dataset.link];
    if (typeof u === 'string' && u.trim() && u !== '#' &&
        (/^https:\/\//.test(u) || (u.startsWith('/') && !u.startsWith('//')) || u.startsWith('#'))) {
      a.href = u;
    } else {
      a.hidden = true;
      a.style.display = 'none';
    }
  });

  /* ---------- state + feedback ---------- */
  const toast = $('#toast'); let tt;
  const say = m => { $('#toastText').textContent = m; toast.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 2400); };
  /* Android haptics; silently skipped on iOS/desktop and before the first tap (browsers block it) */
  const buzz = ms => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} };
  function setDots(cls, n) { $$(cls).forEach(d => { d.hidden = !n; d.textContent = n; d.classList.add('pop'); setTimeout(() => d.classList.remove('pop'), 300); }); }
  let bagCount = 0, savedCount = window.SelectStore.savedCount();
  setDots('.savedot', savedCount);

  /* ---------- overlays: scroll lock, back button, focus trap ---------- */
  const viewer = $('#viewer'), sheet = $('#sheet'), scrim = $('#scrim');
  const isOpen = el => el.classList.contains('show');
  function lock(on) { document.documentElement.classList.toggle('ss-lock', on); }
  function pushOverlay() { if (!(history.state && history.state.ssOverlay)) history.pushState({ ssOverlay: 1 }, ''); }
  function popOverlay() { if (history.state && history.state.ssOverlay) history.back(); }
  addEventListener('popstate', () => { if (utilityOpen()) closeUtility(true); else if (isOpen(viewer)) closeStory(true); else if (isOpen(sheet)) closeSheet(true); });
  addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const box = utilityOpen() ? utilityDialog : isOpen(viewer) ? viewer : isOpen(sheet) ? sheet : null; if (!box) return;
    const f = [...box.querySelectorAll('button, a[href], input, summary')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });


  /* ---------- real favorites + guest account panels ---------- */
  const utility = $('#utility'), utilityDialog = $('.utility-dialog');
  const utilityTitle = $('#utilityTitle'), utilityBody = $('#utilityContent');
  let activeUtility = null, utilityOpener = null;
  const utilityOpen = () => !utility.hidden;
  function syncSaved() {
    savedCount = window.SelectStore.savedCount();
    setDots('.savedot', savedCount);
    $$('[data-save]').forEach(button => {
      button.setAttribute('aria-pressed', String(window.SelectStore.isSaved(button.dataset.save)));
    });
    if (utilityOpen() && activeUtility === 'saved') renderSaved();
    if (utilityOpen() && activeUtility === 'account') renderAccount();
  }
  function renderSaved() {
    const ids = window.SelectStore.savedIds();
    utilityTitle.textContent = 'المحفوظة';
    if (!ids.length) {
      utilityBody.innerHTML = `<div class="utility-empty"><span class="utility-empty-icon">♡</span><h3>لسه مفيش قطع محفوظة</h3><p>اضغطي على علامة القلب جنب أي موديل، وهتلاقيه هنا حتى بعد ما تقفلي الصفحة وتفتحيها تاني على نفس الجهاز.</p><button type="button" class="utility-main-btn" data-utility-shop>تصفحي الموديلات</button></div>`;
      return;
    }
    utilityBody.innerHTML = `<p class="utility-intro">${pieces(ids.length)} محفوظة على الجهاز ده. افتحي القطعة أو شيليها من القائمة.</p>
      <div class="utility-items">${ids.map(id => {
        const p = byId(id);
        const picture = p?.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '<span class="utility-photo-fallback">♡</span>';
        const action = p?.url
          ? `<a class="utility-product-link" href="${esc(p.url)}">شوفي الموديل</a>`
          : p ? `<button type="button" class="utility-product-link" data-utility-find="${esc(id)}">شوفي الموديل</button>`
            : '<span class="utility-unavailable">المنتج غير متاح حاليًا</span>';
        return `<article class="utility-item"><div class="utility-photo">${picture}</div>
          <div class="utility-item-info"><h3>${esc(p?.name || id)}</h3>
            ${p ? `<p>${fmt(p.price)} ${CUR_L}</p>` : ''}
            <div class="utility-item-actions">${action}<button type="button" class="utility-remove" data-remove-saved="${esc(id)}" aria-label="إزالة ${esc(p?.name || id)} من المفضلة">إزالة ♡</button></div>
          </div></article>`;
      }).join('')}</div>`;
  }
  function renderAccount() {
    utilityTitle.textContent = 'حسابي';
    utilityBody.innerHTML = `<div class="utility-account">
      <div class="utility-avatar" aria-hidden="true">♡</div>
      <h3>أهلًا بيكي في SELECT SHOP</h3>
      <p>تقدري ترجعي للموديلات اللي حفظتيها وتفتحي الشنطة على نفس الجهاز.</p>
      <p class="utility-account-note">حساب العميلات وتسجيل الدخول ومتابعة الطلبات الشخصية لسه مش متاحين؛ المفضلة هنا محلية ومش مرتبطة بحساب أو رقم موبايل.</p>
      <button type="button" class="utility-account-action" data-account-saved>♡ <span>المفضلة</span><strong>${savedCount}</strong></button>
      <button type="button" class="utility-account-action" data-account-bag>◫ <span>الشنطة</span><b>عرض الشنطة</b></button>
      <button type="button" class="utility-main-btn" data-utility-shop>كمّلي تسوق</button>
    </div>`;
  }
  function openUtility(kind) {
    if (utilityOpen()) {
      activeUtility = kind;
      kind === 'saved' ? renderSaved() : renderAccount();
      utilityDialog.focus({ preventScroll: true });
      return;
    }
    if (isOpen(viewer) || isOpen(sheet)) return;
    utilityOpener = document.activeElement;
    activeUtility = kind;
    utility.hidden = false;
    kind === 'saved' ? renderSaved() : renderAccount();
    lock(true);
    pushOverlay();
    utility.querySelector('.utility-close').focus({ preventScroll: true });
  }
  function closeUtility(fromHistory = false) {
    if (!utilityOpen()) return;
    utility.hidden = true;
    activeUtility = null;
    lock(false);
    if (!fromHistory) popOverlay();
    utilityOpener?.focus?.({ preventScroll: true });
  }
  $$('[data-open-saved]').forEach(b => b.addEventListener('click', () => openUtility('saved')));
  $$('[data-open-account]').forEach(b => b.addEventListener('click', () => openUtility('account')));
  // Deep links keep favorites/account reachable from product, cart and checkout.
  // Only the two supported values may open a panel; unknown query values do nothing.
  const requestedPanel = new URLSearchParams(location.search).get('panel');
  if (requestedPanel === 'saved' || requestedPanel === 'account') openUtility(requestedPanel);
  utility.querySelectorAll('[data-close-utility]').forEach(b => b.addEventListener('click', () => closeUtility()));
  utilityBody.addEventListener('click', async event => {
    const remove = event.target.closest('[data-remove-saved]');
    if (remove) {
      const id = remove.dataset.removeSaved;
      if (window.SelectStore.isSaved(id)) await window.SelectStore.toggleSaved(id);
      syncSaved();
      return;
    }
    if (event.target.closest('[data-account-saved]')) { openUtility('saved'); return; }
    if (event.target.closest('[data-account-bag]')) {
      if (!CFG.demo && window.SelectStore.cartUrl) location.assign(window.SelectStore.cartUrl);
      else say('الشنطة التجريبية متاحة من اختيار الموديلات.');
      return;
    }
    if (event.target.closest('[data-utility-shop]')) {
      closeUtility();
      $('#shop')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    const find = event.target.closest('[data-utility-find]');
    if (find) {
      const card = $(`[data-save="${CSS.escape(find.dataset.utilityFind)}"]`);
      closeUtility();
      if (card) {
        card.closest('.card')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
        card.focus({ preventScroll: true });
      } else say('الموديل مش ظاهر في القسم الحالي؛ اختاري كل القطع.');
    }
  });
  addEventListener('women-saved-changed', syncSaved);

  /* ---------- stories ---------- */
  $('#stories').innerHTML = STORIES.map((s, i) => { const p = byId(s.ids[0]);
    return `<button class="story" data-s="${i}"><span class="ring"><span style="--c:${cssColor(p.c)}${p.image ? `;background-image:${esc(cssUrl(p.image))}` : ''}"></span></span><small>${esc(s.name)}</small></button>`; }).join('');
  let sI = 0, slI = 0, lastFocus;
  function showSlide() {
    const s = STORIES[sI], p = byId(s.ids[slI]), frame = $('#frame');
    frame.style.setProperty('--c', cssColor(p.c));
    frame.style.backgroundImage = p.image ? cssUrl(p.image) : '';
    $('#vName').textContent = s.name;
    $('#vLine').textContent = s.lines[slI];
    $('#vMeta').textContent = `${p.name} · ${fmt(p.price)} ${CUR_L}`;
    $('#bars').innerHTML = s.ids.map((_, k) => `<span class="${k < slI ? 'done' : k === slI ? 'run' : ''}"><i></i></span>`).join('');
    const run = $('#bars .run i'); if (run) run.addEventListener('animationend', next, { once: true });
    if (reduce) { clearTimeout(viewer.t); viewer.t = setTimeout(next, 4500); }
  }
  function openStory(i) { lastFocus = document.activeElement; sI = i; slI = 0; viewer.classList.add('show'); lock(true); pushOverlay(); showSlide(); $('#vClose').focus(); $$('.story')[i].classList.add('seen'); }
  function closeStory(fromHistory, keepHistory) {
    if (!isOpen(viewer)) return;
    viewer.classList.remove('show'); clearTimeout(viewer.t); $('#bars').innerHTML = ''; lock(false);
    if (!fromHistory && !keepHistory) popOverlay();
    lastFocus && lastFocus.focus({ preventScroll: true });
  }
  function next() { if (slI < STORIES[sI].ids.length - 1) { slI++; showSlide(); } else if (sI < STORIES.length - 1) { sI++; slI = 0; $$('.story')[sI].classList.add('seen'); showSlide(); } else closeStory(); }
  function prev() { if (slI > 0) slI--; else if (sI > 0) { sI--; slI = 0; } showSlide(); }
  $('#stories').addEventListener('click', e => { const b = e.target.closest('.story'); if (b) openStory(+b.dataset.s); });
  $('#vNext').onclick = next; $('#vPrev').onclick = prev; $('#vClose').onclick = () => closeStory();
  $('#frame').addEventListener('pointerdown', () => viewer.classList.add('paused'));
  addEventListener('pointerup', () => viewer.classList.remove('paused'));
  addEventListener('pointercancel', () => viewer.classList.remove('paused'));
  /* story → size sheet keeps the same history entry, so Back closes the sheet */
  $('#vShop').onclick = () => { const p = byId(STORIES[sI].ids[slI]); closeStory(false, true); openSheet({ item: p }); };

  /* ---------- looks (sticky stack) ---------- */
  $('#looks').innerHTML = LOOKS.map((l, i) => {
    const items = l.ids.map(byId), total = items.reduce((a, p) => a + p.price, 0);
    return `<article class="look" style="--i:${i}">
      <div class="flat">
        <span class="look-tag">${pieces(items.length)}</span>
        ${items.map(p => `<div class="piece" style="--c:${cssColor(p.c)}">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ''}<em>${esc(p.name)}</em></div>`).join('')}
      </div>
      <div class="look-body">
        <h3>${esc(l.name)}</h3>
        <ul class="look-items">${items.map(p => `<li><span>${esc(p.name)}</span><span class="num">${fmt(p.price)}</span></li>`).join('')}</ul>
        <div class="look-foot">
          <div class="total"><small>اللوك كامل · ${esc(l.note)}</small><b>${fmt(total)} ${CUR}</b></div>
          <button class="cta" data-look="${i}">ضيفي اللوك</button>
        </div>
      </div>
    </article>`;
  }).join('');
  $('#looks').addEventListener('click', e => { const b = e.target.closest('[data-look]'); if (b) openSheet({ look: LOOKS[+b.dataset.look] }); });
  const looks = $$('.look');
  function stack() {
    looks.forEach((el, i) => {
      const nx = looks[i + 1]; if (!nx) return;
      const a = el.getBoundingClientRect(), b = nx.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, 1 - (b.top - a.top) / a.height));
      el.style.transform = p ? `scale(${(1 - p * .06).toFixed(4)})` : '';
      el.style.filter = p ? `brightness(${(1 - p * .12).toFixed(3)})` : '';
    });
  }
  if (!reduce) { let q; addEventListener('scroll', () => { if (!q) q = requestAnimationFrame(() => { stack(); q = 0; }); }, { passive: true }); }

  /* ---------- measuring tape ---------- */
  const tape = $('#tape'), tin = $('#tapeIn');
  tin.innerHTML = CATS.map((c, i) => `<button class="seg" role="tab" data-c="${esc(c)}" aria-selected="${i === 0}">${esc(c)}</button>`).join('');
  const segs = $$('.seg');
  function padTape() {
    const pad = tape.clientWidth / 2 - 66;
    tin.style.paddingInline = pad + 'px';
    tin.querySelectorAll('.cm').forEach(n => n.remove());
    const w = tin.scrollWidth;
    for (let x = 40, n = 5; x < w; x += 40, n += 5) { if (n % 10) continue; const s = document.createElement('span'); s.className = 'cm'; s.style.insetInlineStart = x + 'px'; s.textContent = n; tin.appendChild(s); }
  }
  let cur = null, liveSeg = segs[0];
  function nearest() {
    const mid = tape.getBoundingClientRect(); const cx = mid.left + mid.width / 2;
    let best, d = 1e9; segs.forEach(s => { const r = s.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - cx); if (dd < d) { d = dd; best = s; } });
    return best;
  }
  function mark(seg) { if (seg === liveSeg) return; liveSeg = seg; segs.forEach(s => { s.classList.toggle('on', s === seg); s.setAttribute('aria-selected', s === seg); }); buzz(6); }
  /* Fix: browser-initiated alignment on first render must not select a category.
     Only an actual pointer/wheel/touch/keyboard or header-category action arms tape filtering. */
  let tapeInteracted = false;
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
    tape.addEventListener(type, () => { tapeInteracted = true; }, { passive: type !== 'keydown' });
  }
  let st;
  tape.addEventListener('scroll', () => { if (!tapeInteracted) return; mark(nearest()); clearTimeout(st); st = setTimeout(() => apply(liveSeg.dataset.c), 110); }, { passive: true });
  tape.addEventListener('scrollend', () => { if (!tapeInteracted) return; mark(nearest()); clearTimeout(st); apply(liveSeg.dataset.c); });
  tin.addEventListener('click', e => { const s = e.target.closest('.seg'); if (s) { tapeInteracted = true; center(s); } });
  /* scrolls only the tape, never the page (scrollIntoView would jump the page on load) */
  function center(s, instant) {
    const t = tape.getBoundingClientRect(), r = s.getBoundingClientRect();
    tape.scrollBy({ left: (r.left + r.width / 2) - (t.left + t.width / 2), behavior: instant || reduce ? 'auto' : 'smooth' });
  }
  $$('[data-jump]').forEach(a => a.addEventListener('click', () => { const s = segs.find(x => x.dataset.c === a.dataset.jump); if (s) { tapeInteracted = true; setTimeout(() => center(s), 300); } }));
  /* mobile browsers fire resize when the address bar hides: only re-lay the tape when the width changes */
  let lastW = tape.clientWidth;
  addEventListener('resize', () => { if (tape.clientWidth === lastW) return; lastW = tape.clientWidth; padTape(); center(liveSeg, true); });
  padTape(); segs[0].classList.add('on');
  requestAnimationFrame(() => { tape.scrollLeft = 0; center(segs[0], true); });

  /* ---------- feed ---------- */
  const feed = $('#feed');
  function apply(c) {
    if (c === cur) return; cur = c;
    const list = P.filter(p => c === 'الكل' || (c === 'الجديد' ? p.isNew : c === 'تخفيضات' ? p.was : p.cat === c));
    $('#countOut').textContent = pieces(list.length);
    feed.innerHTML = list.length ? list.map((p, k) => `
      <article class="card" style="--k:${k}">
        <div class="shot" style="--c:${cssColor(p.c)}">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : '<span class="ph">صورة المنتج</span>'}
          ${p.was ? `<span class="badge">خصم ${Math.round((1 - p.price / p.was) * 100)}%</span>` : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
          <button class="heart" data-save="${esc(p.id)}" aria-pressed="${window.SelectStore.isSaved(p.id)}" aria-label="احفظي ${esc(p.name)}"><svg class="i" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
          <button class="add" data-add="${esc(p.id)}" aria-label="ضيفي ${esc(p.name)} للشنطة"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        </div>
        <h3><a href="${p.url ? esc(p.url) : '#shop'}" data-name="${esc(p.id)}">${esc(p.name)}</a></h3>
        <div class="card-row">
          <span class="pr ${p.was ? 'off' : ''}">${fmt(p.price)} ${CUR}${p.was ? `<s>${fmt(p.was)}</s>` : ''}</span>
          <span class="swatches">${(p.sw || []).map(s => `<i style="--s:${cssColor(s)}"></i>`).join('')}</span>
        </div>
      </article>`).join('') : `<p class="empty">مفيش قطع في القسم ده دلوقتي. اسحبي الشريط لقسم تاني.</p>`;
  }
  feed.addEventListener('click', async e => {
    const h = e.target.closest('[data-save]'), a = e.target.closest('[data-add]'), n = e.target.closest('[data-name]');
    if (h) {
      const product = byId(h.dataset.save);
      if (!product) return;
      const r = await window.SelectStore.toggleSaved(product.id);
      if (r.invalid || r.limitReached) { say('المحفوظة مليانة أو الموديل غير متاح.'); return; }
      syncSaved(); buzz(8);
      say(r.saved ? 'اتحفظت في المفضلة ♡' : 'اتشالت من المفضلة');
    }
    if (a) {
      const item = byId(a.dataset.add);
      if (!CFG.demo) {
        if (item.url) location.assign(item.url);
        else say("المنتج غير متاح للطلب دلوقتي.");
      } else openSheet({ item });
    }
    // The product PDP on the protected full-stack origin owns options, pricing and order writes.
    if (n && !byId(n.dataset.name).url) { e.preventDefault();
      if (!CFG.demo) say("المنتج غير متاح دلوقتي.");
      else openSheet({ item: byId(n.dataset.name) });
    }
  });
  apply('الكل');

  /* ---------- bottom sheet ---------- */
  const addBtn = $('#shAdd');
  let ctx = null, pick = null, opener;
  function openSheet(c) {
    opener = document.activeElement; ctx = c; pick = null;
    const items = c.look ? c.look.ids.map(byId) : [c.item];
    const sized = items.filter(p => !p.one);
    const outAll = new Set(sized.flatMap(p => p.out || []));
    $('#shTitle').textContent = c.look ? `${c.look.name} · ${pieces(items.length)}` : c.item.name;
    $('#shPrice').textContent = fmt(items.reduce((a, p) => a + p.price, 0)) + ' ' + CUR_L;
    const th = $('#shThumb'); th.style.setProperty('--c', cssColor(items[0].c)); th.style.backgroundImage = items[0].image ? cssUrl(items[0].image) : '';
    $('#shNote').textContent = c.look ? 'مقاس واحد لكل قطع اللوك' : ((items[0].out || []).length ? 'المقاسات المشطوبة خلصت' : '');
    const oneSize = !sized.length;
    $('#shSizes').innerHTML = oneSize
      ? `<button class="size" role="radio" aria-checked="true" data-z="ONE" style="grid-column:1/-1">مقاس واحد</button>`
      : SIZES.map(z => `<button class="size" role="radio" aria-checked="false" data-z="${z}" ${outAll.has(z) ? 'disabled aria-label="' + z + ' خلص"' : ''}>${z}</button>`).join('');
    $('#finder').hidden = oneSize; $('#finder').open = false;
    if (oneSize) choose('ONE'); else { addBtn.disabled = true; addBtn.textContent = 'اختاري المقاس الأول'; }
    sheet.style.removeProperty('--drag');
    sheet.classList.add('show'); scrim.classList.add('show'); lock(true); pushOverlay();
    setTimeout(() => (sheet.querySelector('.size:not(:disabled)') || addBtn).focus({ preventScroll: true }), 50);
    fit();
  }
  function closeSheet(fromHistory) {
    if (!isOpen(sheet)) return;
    sheet.classList.remove('show'); scrim.classList.remove('show'); lock(false);
    if (!fromHistory) popOverlay();
    opener && opener.focus && opener.focus({ preventScroll: true });
  }
  function choose(z) {
    pick = z; $$('#shSizes .size').forEach(b => b.setAttribute('aria-checked', b.dataset.z === z));
    addBtn.disabled = false; addBtn.textContent = z === 'ONE' ? 'ضيفي للشنطة' : `ضيفي ${z} للشنطة`; buzz(5);
  }
  $('#shSizes').addEventListener('click', e => { const b = e.target.closest('.size'); if (b && !b.disabled) choose(b.dataset.z); });
  addBtn.onclick = async () => {
    const items = ctx.look ? ctx.look.ids.map(byId) : [ctx.item];
    addBtn.disabled = true;
    const r = await window.SelectStore.addToBag(items.map(p => ({ productId: p.id, size: p.one ? 'ONE' : pick })));
    addBtn.disabled = false;
    if (!r.ok) { say(r.message || 'مقدرناش نضيفها للشنطة. جربي تاني.'); return; }
    bagCount = r.count; setDots('.bagdot', bagCount);
    say(ctx.look ? `اتضاف ${ctx.look.name} (${pieces(items.length)}) للشنطة` : `اتضافت للشنطة: ${ctx.item.name}${pick !== 'ONE' ? ' · ' + pick : ''}`);
    buzz([10, 40, 10]); closeSheet();
  };
  scrim.onclick = () => closeSheet(); $('#grab').onclick = () => closeSheet();
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (utilityOpen()) closeUtility(); else if (isOpen(viewer)) closeStory(); else if (isOpen(sheet)) closeSheet(); } if (isOpen(viewer)) { if (e.key === 'ArrowLeft') next(); if (e.key === 'ArrowRight') prev(); } });
  /* drag the sheet down to close */
  let y0 = null;
  $('#grab').addEventListener('pointerdown', e => { y0 = e.clientY; sheet.classList.add('dragging'); $('#grab').setPointerCapture(e.pointerId); });
  $('#grab').addEventListener('pointermove', e => { if (y0 === null) return; sheet.style.setProperty('--drag', Math.max(0, e.clientY - y0) + 'px'); });
  const dragEnd = e => { if (y0 === null) return; const d = e.clientY - y0; y0 = null; sheet.classList.remove('dragging'); if (d > 90) closeSheet(); else sheet.style.removeProperty('--drag'); };
  $('#grab').addEventListener('pointerup', dragEnd); $('#grab').addEventListener('pointercancel', dragEnd);
  /* size finder inside the sheet (uses DATA.sizeChart) */
  function fit() {
    $$('#shSizes .size').forEach(b => b.classList.remove('rec'));
    const b = +$('#fBust').value, w = +$('#fWaist').value, out = $('#fOut');
    if (!b || !w) { out.textContent = 'هنعلّملك المقاس المناسب على الأزرار فوق.'; return; }
    const bi = chart.findIndex(r => b <= r[1]), wi = chart.findIndex(r => w <= r[2]);
    if (b < chartMin.bust || w < chartMin.waist) { out.textContent = 'قياساتك أصغر من جدولنا. كلمينا على واتساب ونرشحلك.'; return; }
    if (bi < 0 || wi < 0) { out.textContent = 'قياساتك أكبر من جدولنا العادي. اسألي على واتساب عن المقاسات الخاصة.'; return; }
    const z = chart[Math.max(bi, wi)][0], btn = $(`#shSizes .size[data-z="${z}"]`);
    if (btn) btn.classList.add('rec');
    if (btn && !btn.disabled) { choose(z); out.textContent = `مقاسك ${z}${bi !== wi ? ` (اخترناه على ${bi > wi ? 'الصدر' : 'الوسط'})` : ''}. اخترناهولك فوق.`; }
    else out.textContent = `مقاسك ${z} بس خلص في القطعة دي. فعّلي تنبيه لما يرجع من صفحة المنتج.`;
  }
  $('#fBust').addEventListener('input', fit); $('#fWaist').addEventListener('input', fit);

  /* ---------- header + tab bar actions ---------- */
  $$('[data-open-bag]').forEach(b => b.addEventListener('click', () => {
    // Cart must open at the same origin as checkout so its persisted selections survive.
    if (!CFG.demo && window.SelectStore.cartUrl) location.assign(window.SelectStore.cartUrl);
    else say(bagCount ? `في الشنطة ${pieces(bagCount)}` : 'الشنطة فاضية. اضغطي + على أي قطعة');
  }));

})();
