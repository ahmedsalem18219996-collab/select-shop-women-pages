import { t } from '../i18n.js';
import { html, render, $, $$, icon, skRows, sheet, closeLayer, confirmDialog, withBusy, done, fail, sortable, segmented } from '../ui.js';
import { call, uploadStorefrontImage, mediaUrl } from '../api.js';
import { checkSourceImage, optimizeUploadImage } from '../image-optimize.mjs';

const img = (x) => mediaUrl(x?.image || null);

async function pickImage() {
  return new Promise((resolve) => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return resolve(null);
      if (checkSourceImage(f)) { fail({ outcome: 'invalid', field: 'image' }); return resolve(null); }
      let prepared;
      try { prepared = await optimizeUploadImage(f, 'storefront'); }
      catch { fail({ outcome: 'invalid', field: 'image' }); return resolve(null); }
      const fd = new FormData(); fd.append('image', prepared.file);
      const r = await uploadStorefrontImage(fd);
      if (r.outcome !== 'saved') { fail(r); return resolve(null); }
      resolve({ path: r.path, url: r.url });
    };
    inp.click();
  });
}

export default {
  title: () => t('nav.storefront'),
  async render({ el }) {
    render(el, html`<div class="page">${skRows(4, 120)}</div>`);
    let tab = 'content';
    const load = async () => {
      const r = await call('storefront.get');
      if (r.outcome !== 'ok') { fail(r); return; }
      const d = r.data;
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('storefront.title')}</h2><p>${t('storefront.subtitle')}</p></div></div>
        <div class="seg" role="tablist">${['content', 'sections', 'banners', 'stories', 'looks'].map((x) => html`<button role="tab" data-v="${x}" aria-selected="${x === tab}">${t('storefront.' + (x === 'content' ? 'content' : x))}</button>`)}</div>
        <div id="sfbody"></div></div>`);
      const body = $('#sfbody', el);
      const show = (name) => { tab = name; PANES[name](body, d, load); };
      segmented($('.seg', el), show); show(tab);
    };
    await load();
  },
};

const PANES = {
  content(body, d, load) {
    const c = d.content;
    const f = (k, max, area) => html`<label class="field"><span>${t('storefront.' + k.replace(/_([a-z])/g, (_, x) => x.toUpperCase()))}</span>
      ${area ? html`<textarea class="textarea" data-k="${k}" maxlength="${max}">${c[k] || ''}</textarea>` : html`<input class="input" data-k="${k}" value="${c[k] || ''}" maxlength="${max}">`}</label>`;
    render(body, html`<form class="card stack" id="cf">
      <div class="grid2">${f('hero_title', 100)}${f('hero_highlight', 70)}</div>${f('hero_description', 700, true)}${f('announcement', 160)}
      <div class="grid2">${f('payment_note', 250)}${f('shipping_note', 250)}</div>${f('returns_note', 250)}
      <div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div></form>`);
    $('#cf', body).onsubmit = async (e) => {
      e.preventDefault();
      const args = { version: c.version }; $$('[data-k]', body).forEach((x) => { args[x.dataset.k] = x.value.trim(); });
      const r = await withBusy($('button', e.currentTarget), () => call('storefront.update_content', args));
      if (r.outcome === 'changed') { done(); load(); } else if (r.outcome === 'unchanged') done(t('settings.unchanged')); else fail(r);
    };
  },
  sections(body, d) {
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('storefront.sections')}</h3></div>
      <ul class="drag-list" id="secs">${d.sections.map((s) => html`<li class="drag-item" data-id="${s.key}"><span class="grip" aria-hidden="true">${icon('grip')}</span>
        <span class="name">${t('storefront.sec.' + s.key)}</span>
        <label class="switch"><input type="checkbox" data-vis ${s.visible ? 'checked' : ''}><i></i><span class="sr">${t('storefront.active')}</span></label>
        <button class="icon-btn" data-move="up" aria-label="${t('editor.moveUp')}">${icon('up')}</button><button class="icon-btn" data-move="down" aria-label="${t('editor.moveDown')}">${icon('down')}</button></li>`)}</ul></section>`);
    const list = $('#secs', body);
    const save = async () => {
      const sections = $$('.drag-item', list).map((li) => ({ key: li.dataset.id, visible: $('[data-vis]', li).checked }));
      const r = await call('storefront.set_sections', { sections }); r.outcome === 'saved' ? done() : fail(r);
    };
    sortable(list, save); list.addEventListener('change', save);
  },
  banners(body, d, load) {
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('storefront.banners')}</h3><button class="btn btn-primary btn-sm" data-add>${icon('plus')}${t('storefront.addBanner')}</button></div>
      ${d.banners.length ? html`<ul class="drag-list" id="bl">${d.banners.map((b) => html`<li class="drag-item" data-id="${b.id}"><span class="grip" aria-hidden="true">${icon('grip')}</span>
        <span class="thumb">${img(b) ? html`<img src="${img(b)}" alt="">` : icon('image')}</span>
        <span class="name"><b>${b.title}</b><br><small class="muted">${b.subtitle || ''}</small></span>${b.active ? '' : html`<span class="badge">${t('status.hidden')}</span>`}
        <button class="icon-btn" data-edit aria-label="${t('app.edit')}">${icon('gear')}</button></li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('storefront.noBanners')}</p>`}</section>`);
    if ($('#bl', body)) sortable($('#bl', body), async (ids) => { const r = await call('storefront.reorder', { kind: 'banners', ids }); r.outcome === 'saved' ? done() : fail(r); });
    const edit = (b) => {
      let image = { path: b?.image_path || null, url: img(b) };
      const box = sheet({ title: b ? b.title : t('storefront.addBanner'), body: html`
        <div class="row"><span class="thumb" id="bi" style="width:96px;height:120px">${image.url ? html`<img src="${image.url}" alt="">` : icon('image')}</span><button class="btn btn-soft" data-img>${icon('upload')}${t('storefront.image')}</button></div>
        <label class="field"><span>${t('storefront.bTitle')}</span><input class="input" id="bt" value="${b?.title || ''}" maxlength="100"></label>
        <label class="field"><span>${t('storefront.bSubtitle')}</span><input class="input" id="bs" value="${b?.subtitle || ''}" maxlength="200"></label>
        <label class="field"><span>${t('storefront.link')}</span><input class="input ltr" id="bl2" value="${b?.link_url || ''}" placeholder="https://… / #new" maxlength="300"></label>
        <label class="switch"><input type="checkbox" id="ba" ${b?.active === false ? '' : 'checked'}><i></i>${t('storefront.active')}</label>`,
        foot: html`${b ? html`<button class="btn btn-danger" data-del>${t('app.delete')}</button><span class="space"></span>` : ''}<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
      $$('[data-close]', box).forEach((x) => x.addEventListener('click', closeLayer));
      $('[data-img]', box).onclick = async () => { const p = await pickImage(); if (p) { image = p; render($('#bi', box), html`<img src="${p.url}" alt="">`); } };
      $('[data-save]', box).onclick = async (e) => {
        const title = $('#bt', box).value.trim(); if (!title) { $('#bt', box).setAttribute('aria-invalid', 'true'); return; }
        const r = await withBusy(e.currentTarget, () => call('storefront.save_banner', { id: b?.id || null, title, subtitle: $('#bs', box).value.trim(), link_url: $('#bl2', box).value.trim() || null, active: $('#ba', box).checked, image_path: image.path, image_preview: image.url }));
        if (r.outcome === 'saved') { closeLayer(); done(); load(); } else fail(r);
      };
      $('[data-del]', box)?.addEventListener('click', async () => { if (!(await confirmDialog({ title: b.title, text: t('app.delete') + '؟', okText: t('app.delete'), danger: true }))) return; const r = await call('storefront.delete_banner', { id: b.id }); r.outcome === 'deleted' ? (done(), load()) : fail(r); });
    };
    $('[data-add]', body).onclick = () => edit(null);
    $$('[data-edit]', body).forEach((x) => x.onclick = () => edit(d.banners.find((b) => b.id === x.closest('[data-id]').dataset.id)));
  },
  stories(body, d, load) {
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('storefront.stories')}</h3><button class="btn btn-primary btn-sm" data-add>${icon('plus')}${t('storefront.addStory')}</button></div>
      ${d.stories.length ? html`<ul class="drag-list" id="sl">${d.stories.map((s) => html`<li class="drag-item" data-id="${s.id}"><span class="grip" aria-hidden="true">${icon('grip')}</span>
        <span class="avatar" style="background:var(--tape)">${s.title.slice(0, 1)}</span><span class="name"><b>${s.title}</b><br><small class="muted">${s.slides.length} ${t('storefront.slides')}</small></span>
        ${s.active ? '' : html`<span class="badge">${t('status.hidden')}</span>`}<button class="icon-btn" data-edit aria-label="${t('app.edit')}">${icon('gear')}</button></li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('storefront.noStories')}</p>`}</section>`);
    if ($('#sl', body)) sortable($('#sl', body), async (ids) => { const r = await call('storefront.reorder', { kind: 'stories', ids }); r.outcome === 'saved' ? done() : fail(r); });
    const edit = (s) => {
      const slides = (s?.slides || [{ headline: '', product_code: '', image_path: null, image: null }]).map((x) => ({ ...x }));
      const box = sheet({ title: s ? s.title : t('storefront.addStory'), wide: true, body: html`
        <div class="grid2"><label class="field"><span>${t('storefront.bTitle')}</span><input class="input" id="st" value="${s?.title || ''}" maxlength="30"></label>
          <label class="switch" style="align-self:end"><input type="checkbox" id="sa" ${s?.active === false ? '' : 'checked'}><i></i>${t('storefront.active')}</label></div>
        <div class="field"><span>${t('storefront.slides')}</span><div class="stack" id="slides"></div><button class="btn btn-soft btn-sm" data-add-slide style="justify-self:start">${icon('plus')}${t('storefront.addSlide')}</button></div>`,
        foot: html`${s ? html`<button class="btn btn-danger" data-del>${t('app.delete')}</button><span class="space"></span>` : ''}<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
      const paint = () => render($('#slides', box), html`${slides.map((x, i) => html`<div class="perm-group" data-i="${i}"><div class="row">
        <span class="thumb">${mediaUrl(x.image) ? html`<img src="${mediaUrl(x.image)}" alt="">` : icon('image')}</span>
        <div class="grid2" style="flex:1"><input class="input" data-f="headline" value="${x.headline}" placeholder="${t('storefront.headline')}" maxlength="60">
          <input class="input ltr" data-f="product_code" value="${x.product_code || ''}" placeholder="SS-1001" maxlength="24"></div>
        <button class="icon-btn" data-slide-img aria-label="${t('storefront.image')}">${icon('upload')}</button><button class="icon-btn" data-rm aria-label="${t('app.delete')}">${icon('trash')}</button></div></div>`)}`);
      paint();
      $$('[data-close]', box).forEach((x) => x.addEventListener('click', closeLayer));
      const sync = () => $$('[data-i]', box).forEach((g) => { const i = +g.dataset.i; $$('[data-f]', g).forEach((inp) => { slides[i][inp.dataset.f] = inp.value.trim(); }); });
      box.addEventListener('click', async (e) => {
        const g = e.target.closest('[data-i]');
        if (e.target.closest('[data-add-slide]') && slides.length < 20) { sync(); slides.push({ headline: '', product_code: '', image_path: null, image: null }); paint(); }
        if (e.target.closest('[data-rm]') && g && slides.length > 1) { sync(); slides.splice(+g.dataset.i, 1); paint(); }
        if (e.target.closest('[data-slide-img]') && g) { sync(); const p = await pickImage(); if (p) { slides[+g.dataset.i].image_path = p.path; slides[+g.dataset.i].image = p.url; slides[+g.dataset.i].image_preview = p.url; paint(); } }
      });
      $('[data-save]', box).onclick = async (e) => {
        sync(); const title = $('#st', box).value.trim(); if (!title) { $('#st', box).setAttribute('aria-invalid', 'true'); return; }
        const r = await withBusy(e.currentTarget, () => call('storefront.save_story', { id: s?.id || null, title, active: $('#sa', box).checked,
          slides: slides.map((x) => ({ headline: x.headline, product_code: x.product_code || null, image_path: x.image_path || null, image_preview: x.image_preview })) }));
        if (r.outcome === 'saved') { closeLayer(); done(); load(); } else if (r.field === 'product_code') fail({ outcome: 'invalid', field: t('storefront.badCode') }); else fail(r);
      };
      $('[data-del]', box)?.addEventListener('click', async () => { if (!(await confirmDialog({ title: s.title, text: t('app.delete') + '؟', okText: t('app.delete'), danger: true }))) return; const r = await call('storefront.delete_story', { id: s.id }); r.outcome === 'deleted' ? (done(), load()) : fail(r); });
    };
    $('[data-add]', body).onclick = () => edit(null);
    $$('[data-edit]', body).forEach((x) => x.onclick = () => edit(d.stories.find((s) => s.id === x.closest('[data-id]').dataset.id)));
  },
  looks(body, d, load) {
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('storefront.looks')}</h3><button class="btn btn-primary btn-sm" data-add>${icon('plus')}${t('storefront.addLook')}</button></div>
      ${d.looks.length ? html`<ul class="drag-list" id="ll">${d.looks.map((l) => html`<li class="drag-item" data-id="${l.id}"><span class="grip" aria-hidden="true">${icon('grip')}</span>
        <span class="name"><b>${l.name}</b><br><small class="muted code">${l.items.join(' · ')}</small></span>${l.active ? '' : html`<span class="badge">${t('status.hidden')}</span>`}
        <button class="icon-btn" data-edit aria-label="${t('app.edit')}">${icon('gear')}</button></li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('storefront.noLooks')}</p>`}</section>`);
    if ($('#ll', body)) sortable($('#ll', body), async (ids) => { const r = await call('storefront.reorder', { kind: 'looks', ids }); r.outcome === 'saved' ? done() : fail(r); });
    const edit = (l) => {
      const items = [...(l?.items || [])];
      const box = sheet({ title: l ? l.name : t('storefront.addLook'), body: html`
        <div class="grid2"><label class="field"><span>${t('storefront.lookName')}</span><input class="input" id="ln" value="${l?.name || ''}" maxlength="40"></label>
          <label class="field"><span>${t('storefront.lookNote')}</span><input class="input" id="lo" value="${l?.note || ''}" maxlength="60"></label></div>
        <div class="field"><span>${t('storefront.items')}</span><div class="chips" id="li" style="flex-wrap:wrap"></div><input class="input ltr" id="lc" placeholder="SS-1001" maxlength="24"><small>${t('storefront.itemsHint')}</small></div>
        <label class="switch"><input type="checkbox" id="la" ${l?.active === false ? '' : 'checked'}><i></i>${t('storefront.active')}</label>`,
        foot: html`${l ? html`<button class="btn btn-danger" data-del>${t('app.delete')}</button><span class="space"></span>` : ''}<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
      const paint = () => render($('#li', box), html`${items.map((c, i) => html`<button type="button" class="chip code" data-rm="${i}">${c} ${icon('x')}</button>`)}`);
      paint();
      $$('[data-close]', box).forEach((x) => x.addEventListener('click', closeLayer));
      $('#lc', box).addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = e.target.value.trim().toUpperCase(); if (/^SS-\d{4,19}$/.test(v) && !items.includes(v) && items.length < 8) items.push(v); e.target.value = ''; paint(); });
      $('#li', box).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(+b.dataset.rm, 1); paint(); } });
      $('[data-save]', box).onclick = async (e) => {
        const name = $('#ln', box).value.trim(); if (!name || !items.length) { $(name ? '#lc' : '#ln', box).setAttribute('aria-invalid', 'true'); return; }
        const r = await withBusy(e.currentTarget, () => call('storefront.save_look', { id: l?.id || null, name, note: $('#lo', box).value.trim(), active: $('#la', box).checked, items }));
        if (r.outcome === 'saved') { closeLayer(); done(); load(); } else if (r.field === 'items') fail({ outcome: 'invalid', field: t('storefront.badCode') }); else fail(r);
      };
      $('[data-del]', box)?.addEventListener('click', async () => { if (!(await confirmDialog({ title: l.name, text: t('app.delete') + '؟', okText: t('app.delete'), danger: true }))) return; const r = await call('storefront.delete_look', { id: l.id }); r.outcome === 'deleted' ? (done(), load()) : fail(r); });
    };
    $('[data-add]', body).onclick = () => edit(null);
    $$('[data-edit]', body).forEach((x) => x.onclick = () => edit(d.looks.find((l) => l.id === x.closest('[data-id]').dataset.id)));
  },
};
