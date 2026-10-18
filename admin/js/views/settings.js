import { t } from '../i18n.js';
import { html, render, $, icon, skRows, withBusy, done, fail } from '../ui.js';
import { call, uploadStoreAsset, mediaUrl } from '../api.js';

export default {
  title: () => t('nav.settings'),
  async render({ el, session, can }) {
    render(el, html`<div class="page">${skRows(2, 220)}</div>`);
    const owner = session.role === 'owner';
    const load = async () => {
      const r = await call('settings.get');
      if (r.outcome !== 'ok') { fail(r); return; }
      const s = r.data, editContact = can('settings.manage');
      const logo = s.logo_path ? mediaUrl(/^brand\//.test(s.logo_path) ? 'store-assets/' + s.logo_path : s.logo_path) : null;
      const inp = (id, k, type = 'text', ltr = true, max = 300) => html`<input class="input ${ltr ? 'ltr' : ''}" id="${id}" type="${type}" value="${s[k] || ''}" maxlength="${max}" ${editContact ? '' : 'disabled'}>`;
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('settings.title')}</h2><p>${t('settings.subtitle')}</p></div></div>
        <form class="card stack" id="brand"><div class="card-head"><h3>${t('settings.brand')}</h3>${owner ? '' : html`<span class="badge">${t('settings.ownerOnly')}</span>`}</div>
          <div class="row"><span class="thumb" style="width:72px;height:72px;border-radius:18px">${logo ? html`<img src="${logo}" alt="${t('settings.logo')}">` : icon('image')}</span>
            ${owner ? html`<label class="btn btn-soft">${icon('upload')}${t('settings.uploadLogo')}<input type="file" class="sr" id="logo" accept="image/png,image/jpeg,image/webp"></label>` : ''}</div>
          <div class="grid2"><label class="field"><span>${t('settings.storeName')}</span><input class="input" id="sn" value="${s.store_name || ''}" maxlength="100" ${owner ? '' : 'disabled'}></label>
            <label class="field"><span>${t('settings.tagline')}</span><input class="input" id="tg" value="${s.tagline || ''}" maxlength="200" ${owner ? '' : 'disabled'}></label></div>
          <label class="field"><span>${t('settings.color')}</span><div class="row"><input type="color" class="swatch" id="pc" value="${s.primary_color || '#16192B'}" ${owner ? '' : 'disabled'}><span class="code">${s.primary_color || '—'}</span></div></label>
          ${owner ? html`<div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div>` : ''}</form>
        <form class="card stack" id="contact"><div class="card-head"><h3>${t('settings.contact')}</h3></div>
          <div class="grid2"><label class="field"><span>${t('settings.whatsapp')}</span>${inp('wa', 'whatsapp_e164', 'tel', true, 20)}</label>
            <label class="field"><span>${t('settings.phone')}</span>${inp('ph', 'phone', 'tel', true, 20)}</label>
            <label class="field"><span>${t('settings.email')}</span>${inp('em', 'contact_email', 'email', true, 254)}</label>
            <label class="field"><span>${t('settings.locale')}</span><select class="select" id="lc" ${editContact ? '' : 'disabled'}><option value="ar" ${s.default_locale === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${s.default_locale === 'en' ? 'selected' : ''}>English</option></select></label>
            <label class="field"><span>${t('settings.instagram')}</span>${inp('ig', 'instagram_url', 'url')}</label>
            <label class="field"><span>${t('settings.facebook')}</span>${inp('fb', 'facebook_url', 'url')}</label>
            <label class="field"><span>${t('settings.tiktok')}</span>${inp('tt', 'tiktok_url', 'url')}</label></div>
          ${editContact ? html`<div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div>` : ''}</form></div>`);
      const after = (r2) => { if (r2.outcome === 'changed') { done(); load(); } else if (r2.outcome === 'unchanged') done(t('settings.unchanged')); else { fail(r2); if (r2.outcome === 'conflict') load(); } };
      $('#brand', el).onsubmit = async (e) => {
        e.preventDefault(); if (!owner) return;
        after(await withBusy($('button', e.currentTarget), () => call('settings.update_brand', { version: s.version, store_name: $('#sn', el).value.trim(), tagline: $('#tg', el).value.trim() || null, primary_color: $('#pc', el).value.toUpperCase() })));
      };
      $('#contact', el).onsubmit = async (e) => {
        e.preventDefault(); if (!editContact) return;
        const v = (id) => $(id, el).value.trim() || null;
        after(await withBusy($('button', e.currentTarget), () => call('settings.update_contact', { version: s.version, whatsapp_e164: v('#wa'), phone: v('#ph'), contact_email: v('#em'), default_locale: $('#lc', el).value, instagram_url: v('#ig'), facebook_url: v('#fb'), tiktok_url: v('#tt') })));
      };
      $('#logo', el)?.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const fd = new FormData(); fd.append('kind', 'logo'); fd.append('image', f); fd.append('version', String(s.version));
        after(await uploadStoreAsset(fd));
      });
    };
    await load();
  },
};
