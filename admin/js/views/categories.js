import { t } from '../i18n.js';
import { html, render, $, $$, icon, fmtNum, skRows, sheet, closeLayer, confirmDialog, withBusy, done, fail, sortable } from '../ui.js';
import { call } from '../api.js';

export default {
  title: () => t('nav.categories'),
  async render({ el }) {
    render(el, html`<div class="page">${skRows(6, 56)}</div>`);
    const load = async () => {
      const r = await call('categories.list');
      if (r.outcome !== 'ok') { fail(r); return; }
      const cats = r.data;
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('categories.title')}</h2><p>${t('categories.subtitle')}</p></div>
          <div class="actions"><button class="btn btn-primary" data-add>${icon('plus')}${t('categories.add')}</button></div></div>
        <ul class="drag-list" id="cats">${cats.map((c) => html`<li class="drag-item" data-id="${c.id}">
          <span class="grip" aria-hidden="true">${icon('grip')}</span>
          <span class="name"><b>${c.name}</b>${c.name_en ? html` <span class="muted ltr">· ${c.name_en}</span>` : ''}<br><small class="muted">${fmtNum(c.product_count)} ${t('categories.products')}</small></span>
          ${c.visible ? '' : html`<span class="badge">${t('status.hidden')}</span>`}
          <button class="icon-btn" data-move="up" aria-label="${t('editor.moveUp')}">${icon('up')}</button>
          <button class="icon-btn" data-move="down" aria-label="${t('editor.moveDown')}">${icon('down')}</button>
          <button class="icon-btn" data-edit aria-label="${t('app.edit')}">${icon('gear')}</button>
        </li>`)}</ul></div>`);
      sortable($('#cats', el), async (ids) => { const res = await call('categories.reorder', { ids }); res.outcome === 'saved' ? done() : (fail(res), load()); });
      $('[data-add]', el).onclick = () => edit(null);
      $$('[data-edit]', el).forEach((b) => b.onclick = () => edit(cats.find((c) => c.id === b.closest('[data-id]').dataset.id)));
    };
    const edit = (c) => {
      const box = sheet({ title: c ? c.name : t('categories.add'), body: html`
        <label class="field"><span>${t('categories.name')}</span><input class="input" id="cn" value="${c?.name || ''}" maxlength="70"></label>
        <label class="field"><span>${t('categories.nameEn')}</span><input class="input ltr" id="ce" value="${c?.name_en || ''}" maxlength="70"></label>
        <label class="switch"><input type="checkbox" id="cv" ${c?.visible === false ? '' : 'checked'}><i></i>${t('categories.visible')}</label>
        ${c && c.product_count ? html`<p class="muted" style="margin:0;font-size:12.5px">${t('categories.inUse')}</p>` : ''}`,
        foot: html`${c ? html`<button class="btn btn-danger" data-del ${c.product_count ? 'disabled' : ''}>${t('app.delete')}</button><span class="space"></span>` : ''}
          <button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
      $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
      $('[data-save]', box).onclick = async (e) => {
        const name = $('#cn', box).value.trim(); if (!name) { $('#cn', box).setAttribute('aria-invalid', 'true'); return; }
        const res = await withBusy(e.currentTarget, () => call('categories.save', { id: c?.id || null, name, name_en: $('#ce', box).value.trim() || null, visible: $('#cv', box).checked }));
        if (res.outcome === 'saved') { closeLayer(); done(); load(); } else fail(res);
      };
      $('[data-del]', box)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: c.name, text: t('categories.deleteQ'), okText: t('app.delete'), danger: true }))) return;
        const res = await call('categories.delete', { id: c.id });
        if (res.outcome === 'deleted') { done(); load(); } else fail(res);
      });
    };
    await load();
  },
};
