// App shell: sign-in, session, permission-aware navigation (sidebar on desktop, tab bar + menu sheet on phones),
// hash router, command palette (Ctrl/⌘ K), theme and language. Views live in ./views/*.js.
import { t, getLang, setLang, applyLang } from './i18n.js';
import { html, render, $, $$, icon, sheet, closeLayer, island, initials, debounce, esc } from './ui.js';
// Same specifier as every view ('../api.js'): one module instance, one session. Cache-busting is done on app.js in index.html.
import * as api from './api.js';

const app = document.getElementById('app');
const state = { session: null, route: null, view: null };

// ---------- theme ----------
function applyTheme(next) {
  const theme = next || (() => { try { return localStorage.getItem('wa.theme'); } catch { return null; } })()
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  try { if (next) localStorage.setItem('wa.theme', next); } catch { /* ignore */ }
}
applyTheme(); applyLang();

// ---------- navigation model ----------
const NAV = [
  { group: null, items: [{ path: 'dashboard', icon: 'home', perm: 'dashboard.view' }] },
  { group: 'catalog', items: [{ path: 'products', icon: 'box', perm: 'products.view' }, { path: 'categories', icon: 'tag', perm: 'categories.manage' }] },
  { group: 'sales', items: [{ path: 'orders', icon: 'cart', perm: 'orders.view' }, { path: 'customers', icon: 'users', perm: 'customers.view' }, { path: 'shipping', icon: 'truck', perm: 'shipping.view' }] },
  { group: 'store', items: [{ path: 'storefront', icon: 'layout', perm: 'storefront.manage' }, { path: 'settings', icon: 'gear', perm: 'settings.view' }] },
  { group: 'admin', items: [{ path: 'team', icon: 'shield', perm: 'owner' }, { path: 'activity', icon: 'clock', perm: 'audit.view' }] },
];
const can = (perm) => {
  const s = state.session; if (!s) return false;
  if (s.role === 'owner') return true;
  if (perm === 'owner') return false;
  return !perm || s.permissions.includes(perm);
};
const allowedItems = () => NAV.flatMap((g) => g.items).filter((i) => can(i.perm));
// Same release version as the ?v= on app.js in index.html, so a new release never mixes cached screens.
const V = new URL(import.meta.url).searchParams.get('v') || '0';
const view = (name) => import(`./views/${name}.js?v=${V}`);
const VIEWS = {
  dashboard: () => view('dashboard'), products: () => view('products'), categories: () => view('categories'),
  orders: () => view('orders'), customers: () => view('customers'), shipping: () => view('shipping'),
  storefront: () => view('storefront'), settings: () => view('settings'), team: () => view('team'),
  activity: () => view('activity'),
};

export function go(path) { if (location.hash !== '#/' + path) location.hash = '#/' + path; else route(); }

// ---------- auth screens ----------
function authShell(inner) {
  render(app, html`<div class="auth">
    <aside class="auth-art" aria-hidden="true"><div class="tape-wall"></div>
      <div class="art-copy"><b>${t('auth.artTitle')}</b><span>${t('auth.artText')}</span></div></aside>
    <main class="auth-panel">
      <div class="row"><div class="brand"><b>select</b><small>women admin</small></div><span class="space"></span>
        <div class="auth-tools">
          <button class="icon-btn" data-lang aria-label="${t('nav.language')}">${icon('globe')}</button>
          <button class="icon-btn" data-theme-toggle aria-label="${t('nav.theme')}">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        </div></div>
      ${inner}
    </main></div>`);
  app.classList.remove('boot'); app.removeAttribute('aria-busy');
  $('[data-lang]', app).onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); boot(); };
  $('[data-theme-toggle]', app).onclick = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); boot(); };
}

function loginScreen(message = '') {
  authShell(html`
    <div class="stack"><h1>${t('auth.title')}</h1><p>${t('auth.subtitle')}</p></div>
    ${message ? html`<p class="err" role="alert">${message}</p>` : ''}
    <form class="stack" id="login" novalidate>
      <label class="field"><span>${t('auth.email')}</span><input class="input ltr" id="email" type="email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>${t('auth.password')}</span>
        <div class="input-wrap"><input class="input ltr" id="password" type="password" autocomplete="current-password" required minlength="6">
        <button type="button" class="icon-btn affix" data-peek aria-label="${t('auth.show')}">${icon('eye')}</button></div></label>
      <button class="btn btn-primary btn-block" type="submit">${t('auth.signIn')}</button>
      <button class="btn btn-ghost btn-block" type="button" data-forgot>${t('auth.forgot')}</button>
    </form>
`);
  const pw = $('#password', app);
  $('[data-peek]', app).onclick = (e) => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; render(e.currentTarget, icon(show ? 'eyeOff' : 'eye')); e.currentTarget.setAttribute('aria-label', t(show ? 'auth.hide' : 'auth.show')); };
  $('[data-forgot]', app).onclick = forgotScreen;
  $('#login', app).onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#email', app).value.trim(), password = pw.value;
    if (!email || !password) { $('#email', app).focus(); return; }
    const btn = $('button[type=submit]', app); btn.disabled = true; btn.textContent = t('auth.signingIn');
    const r = await api.signIn(email, password);
    if (!r.ok) { loginScreen(r.reason === 'network' ? t('err.network') : t('auth.wrong')); return; }
    boot();
  };
  setTimeout(() => $('#email', app)?.focus(), 30);
}
function forgotScreen() {
  authShell(html`<div class="stack"><h1>${t('auth.forgot')}</h1></div>
    <form class="stack" id="forgot"><label class="field"><span>${t('auth.email')}</span><input class="input ltr" id="email" type="email" required></label>
      <button class="btn btn-primary btn-block">${t('auth.sendReset')}</button><p id="sent" class="muted" role="status"></p>
      <button type="button" class="btn btn-ghost btn-block" data-back>${t('auth.backToLogin')}</button></form>`);
  $('[data-back]', app).onclick = () => loginScreen();
  $('#forgot', app).onsubmit = async (e) => { e.preventDefault(); await api.requestReset($('#email', app).value.trim()); $('#sent', app).textContent = t('auth.resetSent'); };
}
function setPasswordScreen() {
  authShell(html`<div class="stack"><h1>${t('auth.setPassword')}</h1></div>
    <form class="stack" id="setpw"><label class="field"><span>${t('auth.newPassword')}</span><input class="input ltr" id="np" type="password" autocomplete="new-password" minlength="10" required><small>${t('auth.passwordHint')}</small></label>
      <p class="err" id="pwerr" role="alert"></p><button class="btn btn-primary btn-block">${t('auth.savePassword')}</button></form>`);
  $('#setpw', app).onsubmit = async (e) => {
    e.preventDefault(); const v = $('#np', app).value;
    if (v.length < 10) { $('#pwerr', app).textContent = t('auth.passwordHint'); return; }
    const r = await api.setPassword(v);
    if (!r.ok) { $('#pwerr', app).textContent = r.reason === 'weak' ? t('auth.passwordHint') : t('auth.expired'); return; }
    boot();
  };
}

// ---------- shell ----------
function shell() {
  const s = state.session, items = allowedItems();
  const navHtml = NAV.map((g) => {
    const its = g.items.filter((i) => can(i.perm)); if (!its.length) return '';
    return html`${g.group ? html`<div class="nav-group">${t('nav.' + g.group)}</div>` : ''}${its.map((i) => html`<a href="#/${i.path}" data-path="${i.path}">${icon(i.icon)}<span>${t('nav.' + i.path)}</span></a>`)}`;
  });
  const tabItems = [];
  if (can('dashboard.view')) tabItems.push({ path: 'dashboard', icon: 'home' });
  if (can('products.view')) tabItems.push({ path: 'products', icon: 'box' });
  if (can('products.edit')) tabItems.push({ path: 'new', icon: 'plus', plus: true });
  if (can('orders.view')) tabItems.push({ path: 'orders', icon: 'cart' });
  for (const i of items) { if (tabItems.length >= 4) break; if (!tabItems.some((x) => x.path === i.path)) tabItems.push(i); }
  render(app, html`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><b>select</b><small>women</small></div>
      <nav class="nav" aria-label="${t('nav.menu')}">${navHtml}</nav>
      <div class="me"><span class="avatar">${initials(s.email)}</span><div><b class="ltr">${s.email || '—'}</b><small>${t('role.' + s.role)}</small></div>
        <button class="icon-btn" data-signout aria-label="${t('nav.signOut')}">${icon('logout')}</button></div>
    </aside>
    <div class="content">
      <header class="topbar"><div class="brand"><b>select</b></div><h1 id="page-title"></h1>
        <button class="search-trigger" data-palette>${icon('search')}<span>${t('nav.commands')}</span><kbd>Ctrl K</kbd></button>
        <button class="icon-btn" data-palette aria-label="${t('app.search')}">${icon('search')}</button>
        <button class="icon-btn" data-lang aria-label="${t('nav.language')}">${icon('globe')}</button>
        <button class="icon-btn" data-theme-toggle aria-label="${t('nav.theme')}">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
      </header>
      <main class="main" id="main" tabindex="-1">
        <div id="view"></div>
      </main>
    </div>
    <nav class="tabbar" aria-label="${t('nav.menu')}">
      ${tabItems.map((i) => i.plus
        ? html`<button class="tab plus" data-new aria-label="${t('nav.newProduct')}"><span>${icon('plus')}</span></button>`
        : html`<a class="tab" href="#/${i.path}" data-path="${i.path}">${icon(i.icon)}<span>${t('nav.' + i.path)}</span></a>`)}
      <button class="tab" data-more>${icon('menu')}<span>${t('app.more')}</span></button>
    </nav></div>`);
  app.classList.remove('boot'); app.removeAttribute('aria-busy');
  $$('[data-signout]', app).forEach((b) => b.onclick = signOut);
  $$('[data-palette]', app).forEach((b) => b.onclick = palette);
  $('[data-lang]', app).onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); shell(); route(); };
  $('[data-theme-toggle]', app).onclick = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); shell(); route(); };
  $('[data-more]', app).onclick = moreSheet;
  $('[data-new]', app)?.addEventListener('click', () => { location.hash = '#/products?new=1'; });
  const top = $('.topbar', app);
  addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 4), { passive: true });
}
function moreSheet() {
  const s = state.session;
  const box = sheet({ title: t('nav.menu'), body: html`
    <nav class="nav">${allowedItems().map((i) => html`<a href="#/${i.path}" data-path="${i.path}">${icon(i.icon)}<span>${t('nav.' + i.path)}</span></a>`)}</nav>
    <div class="me"><span class="avatar">${initials(s.email)}</span><div><b class="ltr">${s.email || '—'}</b><small>${t('role.' + s.role)}</small></div></div>
    <button class="btn btn-ghost btn-block" data-signout>${icon('logout')}${t('nav.signOut')}</button>` });
  $$('a', box).forEach((a) => a.addEventListener('click', closeLayer));
  $('[data-signout]', box).onclick = () => { closeLayer(); signOut(); };
}
async function signOut() { await api.signOut(); state.session = null; location.hash = ''; boot(); }

// ---------- command palette ----------
function palette() {
  const base = [
    ...allowedItems().map((i) => ({ label: t('nav.' + i.path), hint: '', run: () => go(i.path) })),
    ...(can('products.edit') ? [{ label: t('nav.newProduct'), hint: '+', run: () => { location.hash = '#/products?new=1'; } }] : []),
  ];
  let items = base, sel = 0;
  const box = sheet({ title: t('nav.commands'), body: html`<input class="input" id="pq" placeholder="${t('nav.commands')}" autocomplete="off"><ul class="list" id="pl" role="listbox"></ul>` });
  const list = $('#pl', box), input = $('#pq', box);
  const paint = () => render(list, html`${items.slice(0, 12).map((it, i) => html`<li><button class="btn btn-ghost btn-block" style="justify-content:flex-start" role="option" aria-selected="${i === sel}" data-i="${i}">${it.label}<span class="space"></span><small class="muted code">${it.hint}</small></button></li>`)}`);
  const searchRemote = debounce(async (q) => {
    if (q.length < 2) return;
    const found = [];
    if (can('products.view')) { const r = await api.call('products.list', { q, limit: 6 }); (r.data || []).forEach((p) => found.push({ label: p.title, hint: p.public_code, run: () => go('products/' + p.public_code) })); }
    if (can('orders.view') && /^ord-/i.test(q)) { const r = await api.call('orders.list', { q, limit: 5 }); (r.data || []).forEach((o) => found.push({ label: o.buyer_name, hint: o.public_order_code, run: () => go('orders/' + o.public_order_code) })); }
    if (input.value.trim() === q) { items = base.filter((x) => x.label.includes(q)).concat(found); sel = 0; paint(); }
  }, 250);
  input.addEventListener('input', () => { const q = input.value.trim(); items = base.filter((x) => !q || x.label.includes(q)); sel = 0; paint(); searchRemote(q); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { closeLayer(); items[sel].run(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { closeLayer(); items[+b.dataset.i].run(); } });
  paint();
}
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.session) { e.preventDefault(); palette(); } });

// ---------- router ----------
async function route() {
  if (!state.session) return;
  const [pathPart, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, ...rest] = pathPart.split('/');
  const allowed = allowedItems();
  const target = VIEWS[name] && allowed.some((i) => i.path === name) ? name : allowed[0]?.path;
  if (!target) { render($('#view', app), html`<div class="empty">${icon('shield')}<b>${t('err.forbidden')}</b></div>`); return; }
  if (target !== name) { location.replace('#/' + target); return; }
  $$('[data-path]', app).forEach((a) => { if (a.dataset.path === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const mod = (await VIEWS[target]()).default;
  // Each navigation renders into its own element. A late async render or reload from the previous screen writes into
  // a detached element and can no longer draw over the current one.
  const el = document.createElement('div');
  $('#view', app).replaceChildren(el);
  const title = mod.title ? mod.title(rest) : t('nav.' + target);
  $('#page-title', app).textContent = title; document.title = `${title} · SELECT WOMEN`;
  state.view?.destroy?.();
  state.view = mod;
  try {
    await mod.render({ el, params: rest, query: new URLSearchParams(query), session: state.session, can, go, setTitle: (x) => { $('#page-title', app).textContent = x; } });
  } catch (err) {
    console.error(err);
    render(el, html`<div class="empty">${icon('alert')}<b>${t('err.server')}</b><button class="btn btn-ghost" data-retry>${t('app.retry')}</button></div>`);
    $('[data-retry]', el).onclick = route;
  }
  if (!rest.length) scrollTo({ top: 0 });
}
addEventListener('hashchange', route);

// ---------- boot ----------
async function boot() {
  applyLang();
  const hashType = api.consumeAuthHash();
  if (hashType === 'invite' || hashType === 'recovery') { setPasswordScreen(); return; }
  if (!api.hasSession()) { loginScreen(); return; }
  const r = await api.call('session.get');
  if (r.outcome === 'network') { loginScreen(t('err.network')); return; }
  if (r.outcome !== 'ok') { await api.signOut(); loginScreen(r.outcome === 'unauthorized' ? t('auth.noAccess') : t('err.server')); return; }
  state.session = { ...r.data, email: r.data.email || api.sessionEmail() };
  shell(); route();
}
api.onSessionExpired(() => { state.session = null; island('error', t('auth.expired')); loginScreen(t('auth.expired')); });
boot();
export { state, esc };
