import { t } from '../i18n.js';
import { html, render, toString, $, $$, icon, money, toMinor, fmtNum, ago, date, statusBadge, skRows, sheet, closeLayer, confirmDialog, withBusy, island, done, fail, debounce, segmented, idempotencyKey, spotlight, esc } from '../ui.js';
import { call, uploadProductImage, deleteProductImage, mediaUrl } from '../api.js';
import { activityLine } from './dashboard.js';

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
    <div class="toolbar">
      <label class="searchbox"><span class="sr">${t('app.search')}</span>${icon('search')}<input class="input" id="q" type="search" value="${state.q}" placeholder="${t('products.searchPh')}" autocomplete="off"></label>
      <div class="row" style="justify-content:flex-end">
        <div class="chips" role="group" aria-label="${t('products.status')}">
          ${['', 'public', 'draft', 'hidden'].map((s) => html`<button class="chip" data-status="${s}" aria-pressed="${state.status === s}">${s ? t('status.' + s) : t('app.all')}</button>`)}
        </div>
        <select class="select" id="cat" style="width:auto;min-width:160px" aria-label="${t('products.category')}"><option value="">${t('products.allCategories')}</option></select>
      </div>
    </div>
    <div id="results">${skRows(6)}</div></div>`);
  // The list may arrive after the user has moved to another screen: only fill the select if it is still on the page.
  loadCategories().then((cs) => { const s = $('#cat', el); if (!s) return; cs.forEach((c) => { const o = new Option(c.name, c.name); o.selected = c.name === state.category; s.add(o); }); });
  const results = $('#results', el);
  const load = async () => {
    const r = await call('products.list', { q: state.q || null, status: state.status || null, category: state.category || null });
    if (r.outcome !== 'ok') { fail(r); return; }
    const items = r.data;
    if (!items.length) {
      render(results, html`<div class="empty">${icon('box')}<b>${state.q || state.status || state.category ? t('products.empty') : t('products.emptyAll')}</b>
        ${can('products.edit') && !state.q ? html`<button class="btn btn-primary" data-new>${icon('plus')}${t('products.new')}</button>` : ''}</div>`);
      $('[data-new]', results)?.addEventListener('click', () => createSheet(ctx));
      return;
    }
    render(results, html`
      <div class="list mobile-only">${items.map((p, k) => html`<a class="row-card" style="--k:${k}" href="#/products/${p.public_code}">
        <span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
        <span class="row-main"><b>${p.title}</b><span class="row-meta"><span class="code">${p.public_code}</span><span>${p.category}</span>
          ${p.stock_low ? html`<span class="badge warn">${t('products.lowStock')}</span>` : ''}</span></span>
        <span class="row-end"><b class="num">${priceText(p)}</b>${statusBadge(p.status)}</span></a>`)}</div>
      <div class="table-wrap desk-only"><table class="t">
        <thead><tr><th>${t('products.title')}</th><th>${t('products.category')}</th><th>${t('products.price')}</th><th>${t('products.stock')}</th><th>${t('products.views')}</th><th>${t('products.status')}</th><th></th></tr></thead>
        <tbody>${items.map((p) => html`<tr data-code="${p.public_code}">
          <td><div class="cell-main"><span class="thumb">${p.image ? html`<img src="${imgUrl(p.image)}" alt="" loading="lazy">` : icon('image')}</span>
            <div class="row-main"><a class="rowlink" href="#/products/${p.public_code}">${p.title}</a><span class="row-meta"><span class="code">${p.public_code}</span>${p.is_new ? html`<span class="badge info plain">${t('products.isNew')}</span>` : ''}</span></div></div></td>
          <td>${can('products.edit') ? html`<select class="select" data-cat style="min-width:140px;min-height:36px" aria-label="${t('products.category')}">${categories.map((c) => html`<option ${c.name === p.category ? 'selected' : ''}>${c.name}</option>`)}</select>` : p.category}</td>
          <td class="num">${can('products.price') ? html`<button class="btn btn-ghost btn-sm" data-price title="${t('products.quickPrice')}">${priceText(p)}</button>` : priceText(p)}</td>
          <td class="num">${p.stock_total === null ? html`<span class="muted">—</span>` : html`${fmtNum(p.stock_total)}${p.stock_low ? html` <span class="badge warn">${t('products.lowStock')}</span>` : ''}`}</td>
          <td class="num muted">${fmtNum(p.views_30d)}</td>
          <td>${statusBadge(p.status)}</td>
          <td>${can('products.publish') && p.status !== 'archived' ? html`<button class="btn btn-soft btn-sm" data-toggle>${p.status === 'public' ? t('products.hide') : t('products.publish')}</button>` : ''}</td>
        </tr>`)}</tbody></table></div>`);
    // categories list may arrive after the first paint
    if (can('products.edit') && !categories.length) await loadCategories().then(load);
  };
  results.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-cat]'); if (!s) return;
    const code = s.closest('tr').dataset.code;
    const isNew = !!s.closest('tr').querySelector('.badge.info');
    const r = await call('products.set_display', { code, category: s.value, is_new: isNew });
    r.outcome === 'saved' ? done() : fail(r);
  });
  results.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-code]');
    if (e.target.closest('[data-toggle]') && tr) {
      const btn = e.target.closest('[data-toggle]');
      const publish = btn.textContent.trim() === t('products.publish');
      const r = await withBusy(btn, () => call(publish ? 'products.publish' : 'products.hide', { code: tr.dataset.code }));
      if (['published', 'hidden', 'already_public', 'already_hidden'].includes(r.outcome)) { done(publish ? t('products.published') : t('products.hidden')); load(); }
      else if (r.outcome === 'rejected' && r.blockers) island('error', t('editor.blockers'), r.blockers.map((b) => t('blocker.' + b, b)).join('، '));
      else fail(r);
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

// ======================================================================= create
function createSheet(ctx) {
  const sizes = [];
  const box = sheet({ title: t('create.title'), body: html`
    <label class="field"><span>${t('create.name')}</span><input class="input" id="c-title" maxlength="200" placeholder="${t('create.namePh')}"></label>
    <label class="field"><span>${t('create.description')}</span><textarea class="textarea" id="c-desc" maxlength="10000"></textarea></label>
    <div class="grid2">
      <label class="field"><span>${t('create.category')}</span><select class="select" id="c-cat"></select></label>
      ${ctx.can('products.price') ? html`<label class="field"><span>${t('create.price')}</span><div class="input-money"><input id="c-price" inputmode="decimal" placeholder="0"><span>EGP</span></div></label>` : ''}
    </div>
    <div class="field"><span>${t('create.sizes')}</span>
      <button class="chip" type="button" id="c-one-size" aria-pressed="false">${t('create.oneSize')}</button>
      <div class="chips" id="c-sizes" style="flex-wrap:wrap"></div>
      <input class="input" id="c-size" placeholder="${t('create.sizesPh')}" maxlength="18"><small>${t('create.sizesHint')}</small></div>
    <label class="switch"><input type="checkbox" id="c-new" checked><i></i>${t('create.isNew')}</label>
    <ol class="blockers" id="c-steps" hidden></ol>`,
    foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-create>${t('create.submit')}</button>` });
  $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
  const catSel = $('#c-cat', box);
  const createButton = $('[data-create]', box);
  createButton.disabled = true;
  (categories.length ? Promise.resolve(categories) : loadCategories()).then((cs) => {
    const ordered = [...cs].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));
    ordered.forEach((c) => catSel.add(new Option(c.visible === false ? `${c.name} (${t('status.hidden')})` : c.name, c.name)));
    const firstVisible = ordered.find((c) => c.visible !== false);
    if (firstVisible) catSel.value = firstVisible.name;
  }).finally(() => { createButton.disabled = false; });
  const oneSize = 'One Size';
  const oneSizeButton = $('#c-one-size', box);
  const sizeInput = $('#c-size', box);
  const paintSizes = () => {
    const onlyOne = sizes.length === 1 && sizes[0] === oneSize;
    oneSizeButton.setAttribute('aria-pressed', String(onlyOne));
    sizeInput.disabled = onlyOne;
    render($('#c-sizes', box), html`${sizes.map((s, i) => html`<button type="button" class="chip" data-rm="${i}" aria-label="${t('app.delete')} ${s}">${s} ${icon('x')}</button>`)}`);
  };
  oneSizeButton.addEventListener('click', () => {
    if (sizes.length === 1 && sizes[0] === oneSize) sizes.length = 0;
    else { sizes.length = 0; sizes.push(oneSize); }
    sizeInput.value = '';
    paintSizes();
  });
  sizeInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return; e.preventDefault();
    const v = e.target.value.trim(); if (v && !sizes.some((x) => x.toLowerCase() === v.toLowerCase()) && sizes.length < 20) sizes.push(v);
    e.target.value = ''; paintSizes();
  });
  $('#c-sizes', box).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { sizes.splice(+b.dataset.rm, 1); paintSizes(); } });
  const key = idempotencyKey();
  $('[data-create]', box).onclick = async (e) => {
    const title = $('#c-title', box).value.trim();
    if (!title) { $('#c-title', box).setAttribute('aria-invalid', 'true'); $('#c-title', box).focus(); return; }
    const priceIn = $('#c-price', box)?.value.trim();
    const price = priceIn ? toMinor(priceIn) : null;
    if (priceIn && (price === null || price < 100)) { $('#c-price', box).parentElement.style.borderColor = 'var(--danger)'; return; }
    const steps = $('#c-steps', box); steps.hidden = false;
    const step = (label, state) => { const li = document.createElement('li'); li.textContent = `${state === 'ok' ? '✓' : '…'} ${label}`; steps.append(li); return li; };
    await withBusy(e.currentTarget, async () => {
      let li = step(t('create.steps.create'));
      const r = await call('products.create', { idempotency_key: key, title, description: $('#c-desc', box).value.trim(), category: catSel.value || null, is_new: $('#c-new', box).checked });
      if (!['created', 'existing'].includes(r.outcome)) { fail(r); li.remove(); return; }
      li.textContent = '✓ ' + t('create.steps.create');
      const code = r.code; let version = r.structure_version;
      if (price) { li = step(t('create.steps.price')); const pr = await call('products.set_price', { code, amount_minor: price }); li.textContent = (pr.outcome === 'saved' ? '✓ ' : '✗ ') + t('create.steps.price'); }
      if (sizes.length && r.outcome === 'created') {
        li = step(t('create.steps.sizes'));
        const a = await call('products.structure', { code, version, change: { op: 'add_option', name: 'المقاس', values: sizes } });
        if (a.outcome === 'applied') { version = a.structure_version; const v = await call('products.structure', { code, version, change: { op: 'create_variants', selections: sizes.map((_, i) => [i]) } }); li.textContent = (v.outcome === 'applied' ? '✓ ' : '✗ ') + t('create.steps.sizes'); }
        else li.textContent = '✗ ' + t('create.steps.sizes');
      } else if (!sizes.length && r.outcome === 'created') {
        await call('products.structure', { code, version, change: { op: 'create_variants', selections: [[]] } });
      }
      // Shipping is a separate explicit product assignment. Without it, an Owner-created
      // product may be visible but cannot be quoted correctly at checkout.
      // Pick the WOMEN default when available, else the first active shipping profile.
      if (ctx.can('shipping.manage') && r.outcome === 'created') {
        const available = await call('shipping.get');
        if (available.outcome === 'ok') {
          const active = (available.data?.profiles || []).filter((p) => p.active);
          const standard = active.find((p) => p.key === 'women_standard') || active[0];
          if (standard) {
            const assigned = await call('products.set_shipping_profile', { code, profile_key: standard.key });
            if (assigned.outcome !== 'saved') fail(assigned);
          }
        } else fail(available);
      }
      closeLayer(); done(t('create.done')); ctx.go('products/' + code);
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
  let tab = sessionStorage.getItem('wa.ptab') || 'details';
  const tabs = ['details', 'media', 'variants', 'publish', ...(d.activity ? ['activity'] : [])];
  if (!tabs.includes(tab)) tab = 'details';
  render(el, html`<div class="page">
    <div class="page-head"><div><a class="btn btn-ghost btn-sm" href="#/products">${icon(document.dir === 'rtl' ? 'chev' : 'chevBack')}${t('nav.products')}</a>
      <h2 style="margin-top:8px">${p.title}</h2><p class="row"><span class="code">${p.public_code}</span>${statusBadge(p.status)}<span class="muted">${ago(p.updated_at)}</span></p></div>
      ${can('products.publish') && p.status !== 'archived' ? html`<div class="actions"><button class="btn ${p.status === 'public' ? 'btn-ghost' : 'btn-primary'}" data-pub>${p.status === 'public' ? t('products.hide') : t('products.publish')}</button></div>` : ''}</div>
    <div class="seg" role="tablist">${tabs.map((x) => html`<button role="tab" data-v="${x}" aria-selected="${x === tab}">${t('editor.tabs.' + x)}</button>`)}</div>
    <div class="editor"><div id="tabbody"></div>
      <aside>
        <section class="card"><div class="card-head"><h3>${t('editor.viewsTitle')}</h3>${icon('eye')}</div>
          <dl class="kv"><dt>${t('editor.today')}</dt><dd class="num">${fmtNum(d.views?.today)}</dd><dt>${t('editor.d7')}</dt><dd class="num">${fmtNum(d.views?.last_7_days)}</dd>
          <dt>${t('editor.d30')}</dt><dd class="num">${fmtNum(d.views?.last_30_days)}</dd><dt>${t('editor.total')}</dt><dd class="num">${fmtNum(d.views?.total)}</dd></dl></section>
        ${publishCard(p, d)}
      </aside></div></div>`);
  $('[data-pub]', el)?.addEventListener('click', async (e) => {
    const publish = p.status !== 'public';
    const res = await withBusy(e.currentTarget, () => call(publish ? 'products.publish' : 'products.hide', { code }));
    if (['published', 'hidden', 'already_public', 'already_hidden'].includes(res.outcome)) { done(); reload(); }
    else if (res.outcome === 'rejected' && res.blockers) island('error', t('editor.blockers'), res.blockers.map((b) => t('blocker.' + b, b)).join('، '));
    else fail(res);
  });
  const body = $('#tabbody', el);
  const show = (name) => { tab = name; sessionStorage.setItem('wa.ptab', name); TABS[name](body, { ctx, d, p, code, reload }); };
  segmented($('.seg', el), show);
  show(tab);
}

function publishCard(p, d) {
  const blockers = p.publish_blockers || [];
  const soft = [!p.shipping_profile && 'noShipping', !(d.media?.media || []).length && 'noMedia'].filter(Boolean);
  return html`<section class="card"><div class="card-head"><h3>${t('editor.publishTitle')}</h3>${statusBadge(p.status)}</div>
    ${blockers.length ? html`<p class="muted" style="margin:0 0 8px">${t('editor.blockers')}</p><ul class="blockers">${blockers.map((b) => html`<li>${icon('alert')}${t('blocker.' + b, b)}</li>`)}</ul>`
      : html`<div class="ready">${t('editor.ready')}</div>`}
    ${soft.length ? html`<ul class="blockers" style="margin-top:8px">${soft.map((b) => html`<li>${icon('alert')}${t('blocker.' + b)}</li>`)}</ul>` : ''}</section>`;
}

const TABS = {
  details(body, { ctx, d, p, code, reload }) {
    const { can } = ctx;
    render(body, html`<div class="stack">
      <form class="card stack" id="f-text"><div class="card-head"><h3>${t('editor.details')}</h3></div>
        <label class="field"><span>${t('editor.title')}</span><input class="input" id="e-title" value="${p.title}" maxlength="200" ${can('products.edit') ? '' : 'disabled'}></label>
        <label class="field"><span>${t('editor.description')}</span><textarea class="textarea" id="e-desc" maxlength="10000" ${can('products.edit') ? '' : 'disabled'}>${p.description || ''}</textarea></label>
        ${can('products.edit') ? html`<div class="row"><span class="space"></span><button class="btn btn-primary">${t('app.save')}</button></div>` : ''}</form>
      <section class="card stack"><div class="card-head"><h3>${t('editor.display')}</h3></div>
        <div class="grid2"><label class="field"><span>${t('editor.category')}</span><select class="select" id="e-cat" ${can('products.edit') ? '' : 'disabled'}>${categories.map((c) => html`<option ${c.name === d.card.category ? 'selected' : ''}>${c.name}</option>`)}</select></label>
          <label class="field"><span>${t('editor.basePrice')}</span><div class="input-money"><input id="e-price" inputmode="decimal" value="${p.base_price ? (p.base_price.amount_minor / 100) : ''}" ${can('products.price') ? '' : 'disabled'}><span>EGP</span></div></label></div>
        <label class="switch"><input type="checkbox" id="e-new" ${d.card.is_new ? 'checked' : ''} ${can('products.edit') ? '' : 'disabled'}><i></i>${t('editor.isNew')}</label>
        <label class="field"><span>${t('editor.shipping')}</span><select class="select" id="e-ship" ${can('shipping.manage') ? '' : 'disabled'}>
          <option value="">${t('editor.shippingNone')}</option>${(d.shipping_profiles || []).map((s) => html`<option value="${s.key}" ${p.shipping_profile?.key === s.key ? 'selected' : ''}>${s.name}</option>`)}</select></label>
        ${can('products.edit') || can('products.price') || can('shipping.manage') ? html`<div class="row"><span class="space"></span><button class="btn btn-primary" data-save-display>${t('app.save')}</button></div>` : ''}</section></div>`);
    $('#f-text', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await withBusy($('button', e.currentTarget), () => call('products.update_text', { code, title: $('#e-title', body).value.trim(), description: $('#e-desc', body).value.trim(), updated_at: p.updated_at }));
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
    render(body, html`<section class="card stack"><div class="card-head"><h3>${t('editor.media')}</h3><span class="muted">${fmtNum(media.length)}</span></div>
      <p class="muted" style="margin:0;font-size:12.5px">${t('editor.uploadHint')}</p>
      <div class="media-grid">
        ${media.map((m, i) => html`<figure class="media ${m.hidden ? 'hidden' : ''}" data-id="${m.media_id}" style="margin:0">
          <img src="${imgUrl(m.storage_path)}" alt="${m.alt_text || ''}" loading="lazy">
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
    const upload = async (files) => {
      const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 5 * 1024 * 1024);
      if (list.length !== files.length) island('error', t('err.image'));
      let version = d.media?.structure_version ?? d.product.structure_version, ok = 0;
      for (const [i, f] of list.entries()) {
        island('busy', `${t('editor.upload')} ${i + 1}/${list.length}`);
        const fd = new FormData(); fd.append('code', code); fd.append('image', f); fd.append('version', String(version)); fd.append('alt', d.product.title);
        const res = await uploadProductImage(fd);
        if (res.outcome === 'saved') ok++; else { fail(res); break; }
      }
      if (ok) { done(); reload(); }
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
      ${p.variants.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>${t('editor.variant')}</th><th>${t('editor.vPrice')}</th><th>${t('editor.qty')}</th><th>${t('editor.available')}</th><th></th></tr></thead>
        <tbody>${p.variants.map((v) => { const st = d.stock[String(v.position)]; return html`<tr data-pos="${v.position}" ${v.active ? '' : 'style="opacity:.55"'}>
          <td><b>${valueOf(v)}</b>${v.blockers?.length && v.active ? html`<div class="row-meta">${v.blockers.filter((b) => b !== 'product_not_public').map((b) => html`<span>${t('blocker.' + b, b)}</span>`)}</div>` : ''}</td>
          <td><div class="input-money"><input data-vprice inputmode="decimal" value="${v.price_source === 'variant_override' ? v.amount_minor / 100 : ''}" placeholder="${p.base_price ? p.base_price.amount_minor / 100 : ''}" ${can('products.price') ? '' : 'disabled'} aria-label="${t('editor.vPrice')}"><span>EGP</span></div></td>
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
    body.addEventListener('change', async (e) => {
      const tr = row(e.target); if (!tr) return; const pos = +tr.dataset.pos;
      let res;
      if (e.target.matches('[data-vprice]')) { const raw = e.target.value.trim(); const v = raw ? toMinor(raw) : null; if (raw && (v === null || v < 100)) { e.target.setAttribute('aria-invalid', 'true'); return; } res = await call('products.set_variant_price', { code, version: ver(), position: pos, amount_minor: v }); }
      if (e.target.matches('[data-qty]')) { const q = e.target.value.trim(); if (!/^\d{1,6}$/.test(q)) { e.target.setAttribute('aria-invalid', 'true'); return; } res = await call('products.set_stock', { code, version: ver(), position: pos, quantity: Number(q) }); if (res.outcome === 'saved') $('[data-avail]', tr).checked = res.available; }
      if (e.target.matches('[data-avail]')) res = await call('products.set_availability', { code, version: ver(), position: pos, available: e.target.checked });
      if (res?.outcome === 'saved') { e.target.removeAttribute('aria-invalid'); done(); refreshAside(); } else if (res) { fail(res); if (res.code === 'PS002') reload(); }
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      let res;
      if (b.matches('[data-active]')) { const pos = +row(b).dataset.pos; res = await call('products.structure', { code, version: ver(), change: { op: 'set_variant_active', variant: pos, active: !p.variants.find((v) => v.position === pos).active } }); }
      if (b.matches('[data-addopt]')) { const name = $('#o-name', body).value.trim(); const values = $('#o-values', body).value.split(/[,،]/).map((x) => x.trim()).filter(Boolean); if (!name || !values.length) return; res = await call('products.structure', { code, version: ver(), change: { op: 'add_option', name, values } }); }
      if (b.matches('[data-addval]')) { const oi = +b.dataset.addval; const v = $(`[data-newval="${oi}"]`, body).value.trim(); if (!v) return; res = await call('products.structure', { code, version: ver(), change: { op: 'add_value', option: oi, value: v } }); }
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
