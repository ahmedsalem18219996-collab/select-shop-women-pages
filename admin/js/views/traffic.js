import { html, render } from '../ui.js';

const analyticsUrl = 'https://analytics.google.com/analytics/web/';

export default {
  title: () => 'المحافظات والزيارات',
  render({ el }) {
    render(el, html`<div class="page">
      <div class="page-head"><h2>المحافظات والزيارات</h2></div>
      <section class="card">
        <a class="btn btn-soft" href="${analyticsUrl}" target="_blank" rel="noopener noreferrer">افتح Google Analytics 4</a>
      </section>
    </div>`);
  },
};
