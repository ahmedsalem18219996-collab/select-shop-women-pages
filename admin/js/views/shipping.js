import { t } from '../i18n.js';
import { html, render, $, $$, icon, money, toMinor, fmtNum, skRows, sheet, closeLayer, withBusy, done, fail } from '../ui.js';
import { call } from '../api.js';

export default {
  title: () => t('nav.shipping'),
  async render({ el, can }) {
    render(el, html`<div class="page">${skRows(4, 70)}</div>`);
    const edit = can('shipping.manage');
    const load = async () => {
      const r = await call('shipping.get');
      if (r.outcome !== 'ok') { fail(r); return; }
      const { profiles, regions, rates } = r.data;
      const rate = (p, g) => rates.find((x) => x.profile_key === p && x.region_key === g);
      const sortedRegions = regions.slice().sort((a, b) => {
        const priority = (g) => g.key === 'cairo' ? 0 : g.key === 'giza' ? 1 : 2;
        return priority(a) - priority(b) || a.label.localeCompare(b.label, 'ar');
      });
      render(el, html`<div class="page">
        <div class="page-head"><div><h2>${t('shipping.title')}</h2><p>${t('shipping.subtitle')}</p></div>
          ${edit ? html`<div class="actions"><button class="btn btn-ghost" data-new="region">${icon('plus')}${t('shipping.addRegion')}</button><button class="btn btn-primary" data-new="profile">${icon('plus')}${t('shipping.addProfile')}</button></div>` : ''}</div>
        <section class="card"><div class="card-head"><h3>${t('shipping.profiles')}</h3></div><div class="list">
          ${profiles.map((p) => html`<div class="row-card" style="grid-template-columns:1fr auto auto"><span class="row-main"><b>${p.name}</b><span class="row-meta"><span class="code">${p.key}</span><span>${fmtNum(p.products)} ${t('shipping.products')}</span></span></span>
            ${p.active ? html`<span class="badge ok">${t('shipping.active')}</span>` : html`<span class="badge">${t('status.hidden')}</span>`}
            ${edit ? html`<button class="icon-btn" data-edit-profile="${p.key}" aria-label="${t('app.edit')}">${icon('gear')}</button>` : ''}</div>`)}</div></section>
        <section class="card"><div class="card-head"><h3>${t('shipping.rates')}</h3><span class="muted">${fmtNum(regions.length)} ${t('shipping.regions')}</span></div>
          <div style="padding:0 16px 12px"><label class="field"><span>${t('shipping.searchRegion')}</span><input class="input" type="search" id="region-search" placeholder="${t('shipping.searchRegion')}" autocomplete="off"></label><small class="muted">${t('shipping.rateHint')}</small></div>
          <div class="table-wrap"><table class="t"><thead><tr><th>${t('shipping.regions')}</th>${profiles.map((p) => html`<th>${p.name}</th>`)}${edit ? html`<th></th>` : ''}</tr></thead>
          <tbody>${sortedRegions.map((g) => html`<tr data-region="${g.key}"><td><b>${g.label}</b> ${g.active ? '' : html`<span class="badge">${t('status.hidden')}</span>`}<br><small class="code muted">${g.key}</small></td>
            ${profiles.map((p) => { const x = rate(p.key, g.key); return html`<td>${edit ? html`<div class="input-money" style="min-width:110px"><input data-rate="${p.key}" data-last-amount="${x?.amount_minor || 0}" data-last-active="${x?.active ? '1' : '0'}" inputmode="decimal" value="${x?.active ? x.amount_minor / 100 : ''}" placeholder="${t('shipping.notSet')}" aria-label="${p.name} · ${g.label}"><span>EGP</span></div>` : (x?.active ? money(x.amount_minor) : html`<span class="muted">—</span>`)}</td>`; })}
            ${edit ? html`<td><button class="icon-btn" data-edit-region="${g.key}" aria-label="${t('app.edit')}">${icon('gear')}</button></td>` : ''}</tr>`)}</tbody></table></div></section></div>`);
      $('#region-search', el)?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLocaleLowerCase();
        $$('tr[data-region]', el).forEach((row) => {
          row.style.display = !q || row.textContent.toLocaleLowerCase().includes(q) ? '' : 'none';
        });
      });
      if (!edit) return;
      const form = (kind, cur) => {
        const box = sheet({ title: kind === 'region' ? (cur ? cur.label : t('shipping.addRegion')) : (cur ? cur.name : t('shipping.addProfile')), body: html`
          <label class="field"><span>${t('shipping.key')}</span><input class="input ltr" id="sk" value="${cur?.key || ''}" ${cur ? 'readonly' : ''} pattern="[a-z0-9_-]+" maxlength="64"><small>${t('shipping.keyHint')}</small></label>
          <label class="field"><span>${t('shipping.label')}</span><input class="input" id="sl" value="${cur?.label || cur?.name || ''}" maxlength="100"></label>
          <label class="switch"><input type="checkbox" id="sa" ${cur?.active === false ? '' : 'checked'}><i></i>${t('shipping.active')}</label>`,
          foot: html`<button class="btn btn-ghost" data-close>${t('app.cancel')}</button><button class="btn btn-primary" data-save>${t('app.save')}</button>` });
        $$('[data-close]', box).forEach((b) => b.addEventListener('click', closeLayer));
        $('[data-save]', box).onclick = async (e) => {
          const key = $('#sk', box).value.trim().toLowerCase(), label = $('#sl', box).value.trim();
          if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(key)) { $('#sk', box).setAttribute('aria-invalid', 'true'); return; }
          if (!label) { $('#sl', box).setAttribute('aria-invalid', 'true'); return; }
          const res = await withBusy(e.currentTarget, () => call(kind === 'region' ? 'shipping.set_region' : 'shipping.set_profile', kind === 'region'
            ? { key, label, active: $('#sa', box).checked } : { key, name: label, active: $('#sa', box).checked }));
          if (res.outcome === 'saved') { closeLayer(); done(); load(); } else fail(res);
        };
      };
      $$('[data-new]', el).forEach((b) => b.onclick = () => form(b.dataset.new));
      $$('[data-edit-region]', el).forEach((b) => b.onclick = () => form('region', regions.find((g) => g.key === b.dataset.editRegion)));
      $$('[data-edit-profile]', el).forEach((b) => b.onclick = () => form('profile', profiles.find((p) => p.key === b.dataset.editProfile)));
    };
  if (edit) el.addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-rate]'); if (!inp) return;
      const v = inp.value.trim();
      const previous = Number(inp.dataset.lastAmount || 0);
      // The database requires a positive retained amount even when a rate is disabled.
      // Empty new fields need no write; clearing an existing field turns that rate off.
      if (!v && !previous) return;
      const minor = v ? toMinor(v) : previous;
      if (minor === null || minor <= 0) { inp.setAttribute('aria-invalid', 'true'); return; }
      inp.disabled = true;
      try {
        const res = await call('shipping.set_rate', { profile_key: inp.dataset.rate, region_key: inp.closest('tr').dataset.region, amount_minor: minor, active: !!v });
        if (res.outcome === 'saved') {
          inp.dataset.lastAmount = String(minor);
          inp.dataset.lastActive = v ? '1' : '0';
          inp.removeAttribute('aria-invalid'); done();
        } else {
          inp.value = inp.dataset.lastActive === '1' ? String(previous / 100) : '';
          fail(res);
        }
      } finally { inp.disabled = false; }
  });
    await load();
  },
};
