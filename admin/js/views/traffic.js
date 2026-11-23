import { $, $$, html, render } from '../ui.js';
import { renderAdTracking } from './ad-tracking.js';

const analyticsUrl = 'https://analytics.google.com/analytics/web/';
const trafficTitle = 'المحافظات والزيارات';
const trafficTabs = [
  { id: 'visits', path: 'traffic', label: trafficTitle },
  { id: 'ads', path: 'traffic?tab=ads', label: 'متابعة الإعلانات' },
];
let focusTabOnNavigation;

function bindTabs(el, active, go) {
  const tabs = $$('[role="tab"]', el);
  for (const [index, tab] of tabs.entries()) {
    const item = trafficTabs[index];
    tab.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (active === item.id) return;
      focusTabOnNavigation = item.id;
      go(item.path);
    });
    tab.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        tab.click();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : 1 - index;
      tabs.forEach((target, i) => { target.tabIndex = i === next ? 0 : -1; });
      tabs[next].focus();
    });
  }
  if (focusTabOnNavigation === active) tabs.find((tab) => tab.id === `traffic-tab-${active}`).focus({ preventScroll: true });
  focusTabOnNavigation = undefined;
}

export default {
  title: () => trafficTitle,
  render({ el, query, can, go }) {
    const owner = can('owner');
    const active = owner && query.get('tab') === 'ads' ? 'ads' : 'visits';
    const analytics = html`<section class="card">
      <a class="btn btn-soft" href="${analyticsUrl}" target="_blank" rel="noopener noreferrer">افتح Google Analytics 4</a>
    </section>`;

    render(el, html`<div class="page">
      <div class="page-head"><h2>${trafficTitle}</h2></div>
      ${owner ? html`
        <div class="traffic-tabs" role="tablist" aria-label="تقارير الزيارات والإعلانات">
          ${trafficTabs.map(({ id, path, label }) => html`<a href="#/${path}" id="traffic-tab-${id}"
            role="tab" aria-selected="${String(active === id)}" aria-controls="traffic-panel-${id}"
            tabindex="${active === id ? 0 : -1}">${label}</a>`)}
        </div>
        <div id="traffic-panel-visits" role="tabpanel" aria-labelledby="traffic-tab-visits" ${active !== 'visits' && html`hidden`}>
          ${active === 'visits' && analytics}
        </div>
        <div id="traffic-panel-ads" role="tabpanel" aria-labelledby="traffic-tab-ads" ${active !== 'ads' && html`hidden`}></div>
      ` : analytics}
    </div>`);
    if (owner) bindTabs(el, active, go);
    if (active === 'ads') renderAdTracking($('#traffic-panel-ads', el));
  },
};
