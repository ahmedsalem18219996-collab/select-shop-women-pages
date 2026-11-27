import { t } from '../i18n.js';
import { html, render, $, $$, icon, skRows, withBusy, done, fail } from '../ui.js';
import { call, uploadStoreAsset, mediaUrl } from '../api.js';
import { optimizeUploadImage } from '../image-optimize.js';
import { mountStudioMarqueeSettings } from '../studio-marquee-settings.js?v=20261123-studio-v2';

const egyptianMobile = /^201[0125][0-9]{8}$/;
const validNumbers = (numbers) => Array.isArray(numbers) && numbers.length >= 1 &&
  numbers.length <= 5 && numbers.every((number) => typeof number === 'string' && egyptianMobile.test(number));

function mountWhatsApp(form, initial) {
  const list = $('[data-wa-list]', form);
  const add = $('[data-wa-add]', form);
  const save = $('[data-wa-save]', form);
  const read = () => $$('[data-wa-number]', list).map((input) => input.value.trim());
  const paint = (numbers, focus) => {
    render(list, html`${numbers.map((number, index) => html`<div class="row" style="align-items:end">
      <label class="field space"><span>رقم واتساب ${index + 1}</span>
        <input class="input ltr" type="tel" inputmode="numeric" maxlength="12" required
          pattern="201[0125][0-9]{8}" data-wa-number value="${number}" placeholder="201xxxxxxxxx"></label>
      <button type="button" class="btn btn-ghost" data-wa-remove="${index}" aria-label="حذف رقم واتساب ${index + 1}"
        ${numbers.length === 1 ? 'disabled' : ''}>${icon('x')}</button>
    </div>`)}`);
    add.disabled = numbers.length >= 5;
    if (focus !== undefined) $$('[data-wa-number]', list)[focus]?.focus();
  };
  paint(initial);
  add.onclick = () => {
    const numbers = read();
    if (numbers.length < 5) paint([...numbers, ''], numbers.length);
  };
  list.onclick = (event) => {
    const remove = event.target.closest('[data-wa-remove]');
    const numbers = read();
    if (!remove || numbers.length < 2) return;
    const index = Number(remove.dataset.waRemove);
    numbers.splice(index, 1);
    paint(numbers, Math.min(index, numbers.length - 1));
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const numbers = read();
    if (!validNumbers(numbers)) { fail({ outcome: 'invalid', field: 'whatsappNumbers' }); return; }
    const response = await withBusy(save, () => call('settings.whatsapp_save', { whatsappNumbers: numbers }));
    if (response.outcome === 'saved' && validNumbers(response.whatsappNumbers)) {
      if (read().every((value, index) => value === numbers[index]) && read().length === numbers.length) paint(response.whatsappNumbers);
      done();
    } else fail(response);
  };
}

export default {
  title: () => t('nav.settings'),
  async render({ el, session, can }) {
    render(el, html`<div class="page">${skRows(2, 220)}</div>`);
    const owner = session.role === 'owner';
    const load = async () => {
      const [r, wa, marquee] = await Promise.all([
        call('settings.get'),
        owner ? call('settings.whatsapp_get') : null,
        owner ? call('settings.studio_marquee_get') : null,
      ]);
      if (!el.isConnected) return;
      if (r.outcome !== 'ok') { fail(r); return; }
      const s = r.data, editContact = can('settings.manage');
      const whatsappNumbers = wa?.outcome === 'ok' && validNumbers(wa.whatsappNumbers) ? wa.whatsappNumbers : null;
      const logo = s.logo_path ? mediaUrl(/^brand\//.test(s.logo_path) ? 'store-assets/' + s.logo_path : s.logo_path) : null;
      const inp = (id, k, type = 'text', ltr = true, max = 300) => html`<input class="input ${ltr ? 'ltr' : ''}" id="${id}" type="${type}" value="${s[k] || ''}" maxlength="${max}" ${editContact ? '' : 'disabled'}>`;
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('settings.title')}</h2><p>${t('settings.subtitle')}</p></div></div>
        <form class="card stack" id="brand"><div class="card-head"><h3>${t('settings.brand')}</h3>${owner ? '' : html`<span class="badge">${t('settings.ownerOnly')}</span>`}</div>
          <div class="row"><span class="thumb" style="width:72px;height:72px;border-radius:18px">${logo ? html`<img src="${logo}" alt="${t('settings.logo')}">` : icon('image')}</span>
            ${owner ? html`<label class="btn btn-soft">${icon('upload')}${t('settings.uploadLogo')}<input type="file" class="sr" id="logo" accept="image/png,image/jpeg,image/webp"></label>` : ''}</div>
          <div class="grid2"><label class="field"><span>${t('settings.storeName')}</span><input class="input" id="sn" value="${s.store_name || ''}" maxlength="100" ${owner ? '' : 'disabled'}></label>
            <label class="field"><span>${t('settings.tagline')}</span><input class="input" id="tg" value="${s.tagline || ''}" maxlength="200" ${owner ? '' : 'disabled'}></label></div>
          ${owner ? html`<div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div>` : ''}</form>
        ${owner ? html`<form class="card stack" id="whatsapp"><div class="card-head"><h3>أرقام واتساب</h3></div>
          ${whatsappNumbers ? html`<p class="muted">من رقم واحد لـ5 أرقام مصرية، بصيغة دولية زي 201289437444.</p>
            <div class="stack" data-wa-list></div>
            <div class="row wrap"><button type="button" class="btn btn-soft" data-wa-add>${icon('plus')} إضافة رقم</button>
              <span class="space"></span><button class="btn btn-primary" data-wa-save>${t('app.save')}</button></div>`
            : html`<p class="note" role="alert">تعذّر تحميل أرقام واتساب.</p><button type="button" class="btn btn-soft" data-wa-retry>${t('app.retry')}</button>`}
        </form>` : ''}
        ${owner ? html`<form class="card stack" id="studio-marquee">
          <div class="card-head"><h3>الشريط المتحرك لصفحات المنتجات</h3></div>
          ${marquee?.outcome === 'ok' ? html`
            <label class="studio-marquee-check"><input type="checkbox" data-marquee-enabled> <span>تشغيل الشريط في المتجر</span></label>
            <label class="field"><span>مدة حركة الشريط بالثواني <output data-marquee-seconds></output></span>
              <input type="range" min="8" max="60" step="1" data-marquee-speed></label>
            <div class="stack" data-marquee-lines></div>
            <div class="row wrap"><button type="button" class="btn btn-soft" data-marquee-add>إضافة سطر</button>
              <span class="space"></span><button class="btn btn-primary" data-marquee-save>احفظ الشريط</button></div>
          ` : html`<p class="muted">إعداد الشريط غير متاح حاليًا.</p>`}
          </form>` : ''}
        <form class="card stack" id="contact"><div class="card-head"><h3>${t('settings.contact')}</h3></div>
          <div class="grid2"><label class="field"><span>${t('settings.phone')}</span>${inp('ph', 'phone', 'tel', true, 20)}</label>
            <label class="field"><span>${t('settings.email')}</span>${inp('em', 'contact_email', 'email', true, 254)}</label>
            <label class="field"><span>${t('settings.locale')}</span><select class="select" id="lc" ${editContact ? '' : 'disabled'}><option value="ar" ${s.default_locale === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${s.default_locale === 'en' ? 'selected' : ''}>English</option></select></label>
            <label class="field"><span>${t('settings.instagram')}</span>${inp('ig', 'instagram_url', 'url')}</label>
            <label class="field"><span>${t('settings.facebook')}</span>${inp('fb', 'facebook_url', 'url')}</label>
            <label class="field"><span>${t('settings.tiktok')}</span>${inp('tt', 'tiktok_url', 'url')}</label></div>
          ${editContact ? html`<div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div>` : ''}</form></div>`);
      const after = (r2) => { if (r2.outcome === 'changed') { done(); load(); } else if (r2.outcome === 'unchanged') done(t('settings.unchanged')); else { fail(r2); if (r2.outcome === 'conflict') load(); } };
      $('#brand', el).onsubmit = async (e) => {
        e.preventDefault(); if (!owner) return;
        after(await withBusy($('button', e.currentTarget), () => call('settings.update_brand', { version: s.version, store_name: $('#sn', el).value.trim(), tagline: $('#tg', el).value.trim() || null, primary_color: s.primary_color ?? null })));
      };
      $('#contact', el).onsubmit = async (e) => {
        e.preventDefault(); if (!editContact) return;
        const v = (id) => $(id, el).value.trim() || null;
        after(await withBusy($('button', e.currentTarget), () => call('settings.update_contact', { version: s.version, whatsapp_e164: s.whatsapp_e164 ?? null, phone: v('#ph'), contact_email: v('#em'), default_locale: $('#lc', el).value, instagram_url: v('#ig'), facebook_url: v('#fb'), tiktok_url: v('#tt') })));
      };
      if (whatsappNumbers) mountWhatsApp($('#whatsapp', el), whatsappNumbers);
      if (marquee?.outcome === 'ok') mountStudioMarqueeSettings($('#studio-marquee', el), marquee);
      $('[data-wa-retry]', el)?.addEventListener('click', load);
      $('#logo', el)?.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        let prepared;
        try { prepared = await optimizeUploadImage(f, 'logo'); }
        catch (err) { fail({ outcome: 'invalid', field: 'image' }); return; }
        const fd = new FormData(); fd.append('kind', 'logo'); fd.append('image', prepared.file); fd.append('version', String(s.version));
        after(await uploadStoreAsset(fd));
      });
    };
    await load();
  },
};
