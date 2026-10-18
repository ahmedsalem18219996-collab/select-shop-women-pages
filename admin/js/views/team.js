import { t } from '../i18n.js';
import { html, render, $, $$, icon, ago, initials, skRows, sheet, closeLayer, confirmDialog, withBusy, done, fail } from '../ui.js';
import { call, inviteStaff } from '../api.js';

const GROUPS = {
  general: ['dashboard.view', 'reports.view', 'audit.view'],
  catalog: ['products.view', 'products.edit', 'products.price', 'products.publish', 'media.manage', 'inventory.manage', 'categories.manage'],
  sales: ['orders.view', 'orders.manage', 'customers.view', 'shipping.view', 'shipping.manage'],
  store: ['storefront.manage', 'settings.view', 'settings.manage'],
};
const PRESETS = {
  catalog: ['dashboard.view', 'products.view', 'products.edit', 'products.price', 'media.manage', 'inventory.manage', 'categories.manage'],
  orders: ['dashboard.view', 'orders.view', 'orders.manage', 'customers.view', 'shipping.view'],
  content: ['products.view', 'storefront.manage', 'media.manage'],
  viewer: ['dashboard.view', 'products.view', 'orders.view', 'customers.view'],
};

function permEditor(grantable, selected) {
  const sel = new Set(selected);
  return html`<div class="field"><span>${t('team.presets')}</span><div class="presets">${Object.keys(PRESETS).map((k) => html`<button type="button" class="chip" data-preset="${k}">${t('team.preset.' + k)}</button>`)}</div></div>
    <div class="perm-grid">${Object.entries(GROUPS).map(([g, keys]) => html`<div class="perm-group"><h4>${t('team.groups.' + g)}</h4>
      ${keys.filter((k) => grantable.includes(k)).map((k) => html`<label class="switch"><span>${t('perm.' + k, k)}</span><input type="checkbox" value="${k}" ${sel.has(k) ? 'checked' : ''}><i></i></label>`)}</div>`)}</div>`;
}
function wirePresets(box) {
  $$('[data-preset]', box).forEach((b) => b.addEventListener('click', () => {
    const want = new Set(PRESETS[b.dataset.preset]);
    $$('.perm-grid input[type=checkbox]', box).forEach((c) => { c.checked = want.has(c.value); });
  }));
}
const picked = (box) => $$('.perm-grid input[type=checkbox]:checked', box).map((c) => c.value);

export default {
  title: () => t('nav.team'),
  async render({ el, session }) {
    render(el, html`<div class="page">${skRows(4, 72)}</div>`);
    const load = async () => {
      const r = await call('users.list');
      if (r.outcome !== 'ok') { fail(r); return; }
      const { users, grantable } = r.data;
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('team.title')}</h2><p>${t('team.subtitle')}</p></div>
          <div class="actions"><button class="btn btn-primary" data-invite>${icon('mail')}${t('team.invite')}</button></div></div>
        <div class="list">${users.map((u, k) => html`<div class="row-card member" style="--k:${k};grid-template-columns:auto minmax(0,1fr) auto" data-id="${u.id}">
          <span class="avatar" ${u.role === 'owner' ? '' : 'style="background:var(--surface-2);color:var(--ink)"'}>${initials(u.email)}</span>
          <span class="row-main"><b class="ltr" style="text-align:start">${u.email || '—'}</b><span class="row-meta">
            <span>${t('role.' + u.role)}</span>${u.role === 'staff' ? html`<span>${(u.permissions || []).length} ${t('team.count')}</span>` : ''}
            <span>${t('team.lastActive')}: ${u.last_activity_at ? ago(u.last_activity_at) : (u.last_sign_in_at ? ago(u.last_sign_in_at) : t('team.never'))}</span></span></span>
          <span class="row-end">${u.role === 'owner' ? html`<span class="badge info">${icon('shield')}${t('role.owner')}</span>` : html`
            ${u.active ? html`<span class="badge ok">${t('team.active')}</span>` : html`<span class="badge danger">${t('team.suspended')}</span>`}
            ${u.id === session.user_id ? '' : html`<div class="row"><button class="btn btn-ghost btn-sm" data-edit>${t('team.editPerms')}</button>
              <button class="btn ${u.active ? 'btn-danger' : 'btn-soft'} btn-sm" data-toggle>${u.active ? t('team.suspend') : t('team.activate')}</button></div>`}`}</span></div>`)}</div></div>`);
      $('[data-invite]', el).onclick = () => {
        const box = sheet({ title: t('team.inviteTitle'), wide: true, body: html`
          <label class="field"><span>${t('team.email')}</span><input class="input ltr" id="ie" type="email" maxlength="254" autocomplete="off"><small>${t('team.inviteHint')}</small></label>
          ${permEditor(grantable, PRESETS.viewer)}`,
          foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-send>${icon('mail')}${t('team.send')}</button>` });
        $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
        wirePresets(box);
        $('[data-send]', box).onclick = async (e) => {
          const email = $('#ie', box).value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#ie', box).setAttribute('aria-invalid', 'true'); $('#ie', box).focus(); return; }
          const res = await withBusy(e.currentTarget, () => inviteStaff(email, picked(box)));
          if (res.outcome === 'saved') { closeLayer(); done(t('team.invited')); load(); } else fail(res);
        };
      };
      $$('[data-edit]', el).forEach((b) => b.onclick = () => {
        const u = users.find((x) => x.id === b.closest('[data-id]').dataset.id);
        const box = sheet({ title: u.email, wide: true, body: permEditor(grantable, u.permissions || []),
          foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
        $$('[data-close]', box).forEach((x) => x.addEventListener('click', closeLayer));
        wirePresets(box);
        $('[data-save]', box).onclick = async (e) => {
          const res = await withBusy(e.currentTarget, () => call('users.set_access', { user_id: u.id, permissions: picked(box), active: u.active }));
          if (res.outcome === 'saved') { closeLayer(); done(); load(); } else fail(res);
        };
      });
      $$('[data-toggle]', el).forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === b.closest('[data-id]').dataset.id);
        if (u.active && !(await confirmDialog({ title: u.email, text: t('team.suspendQ'), okText: t('team.suspend'), danger: true }))) return;
        const res = await withBusy(b, () => call('users.set_access', { user_id: u.id, permissions: u.permissions || [], active: !u.active }));
        if (res.outcome === 'saved') { done(); load(); } else fail(res);
      });
    };
    await load();
  },
};
