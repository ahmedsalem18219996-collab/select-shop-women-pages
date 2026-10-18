/* SELECT SHOP WOMEN · Claude design v2 · store configuration
   Everything here is a placeholder until the real WOMEN values are confirmed. */
window.SELECT_CONFIG = {
  /* true = the page is showing the demo catalog from js/data.js.
     Shows a small "معاينة · بيانات تجريبية" label and keeps ordering local-only.
     Set to false ONLY after js/store-adapter.js returns the real WOMEN public catalog. */
  demo: false,

  currencyShort: 'ج',        /* used next to prices on cards and looks */
  currencyLong: 'جنيه',      /* used in the size sheet and stories */

  /* PLACEHOLDER: replace with the store's real WhatsApp number (international format, no +). */
  whatsapp: '',

  /* PLACEHOLDER links. Relative paths work on GitHub Pages sub-paths such as /preview/women/. */
  links: {
    shipping: '#',
    exchange: '#',
    sizeGuide: '#',
    instagram: '#',
    account: '#',
    bag: '#'
  }
};
