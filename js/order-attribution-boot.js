(() => {
  const load = () => {
    try {
      if (Object.keys(localStorage).some(key => key.startsWith("women.order.attribution.v2:"))) {
        void import("./order-attribution.js").catch(() => {});
      }
    } catch { /* Retry stays optional on non-checkout pages. */ }
  };
  load();
  addEventListener("pageshow", event => { if (event.persisted) load(); });
})();
