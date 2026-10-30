/* SELECT SHOP WOMEN: GA4 page analytics, production-only.
 * Measurement ID sourced from SELECT SHOP's archived GA4 setup.
 * No user phone, shipping details, order identifiers or form values are sent.
 */
(() => {
  "use strict";
  const measurementId = "G-NB8PZCX35Z";
  const host = location.hostname.toLowerCase();
  if (host !== "selectshopeg.com" && host !== "www.selectshopeg.com") return;
  if (new URLSearchParams(location.search).get("design-preview") === "1") return;

  const cleanUrl = new URL(location.href);
  // Marketing parameters only (never form values or order references). "p" is the product code of /lp/?p=SS-....
  const allowed = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "code", "p", "gclid", "fbclid", "igshid", "lpv",
    "campaign_id", "adset_id", "ad_id", "placement", "site_source_name", "model", "color"]);
  for (const key of [...cleanUrl.searchParams.keys()]) {
    if (!allowed.has(key) ||
      (key === "model" && !/^[a-z][a-z0-9-]{2,63}$/.test(cleanUrl.searchParams.get(key) || "")) ||
      (key === "color" && !/^SS-[0-9]{4,19}$/.test(cleanUrl.searchParams.get(key) || "")))
      cleanUrl.searchParams.delete(key);
  }
  cleanUrl.hash = "";
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { page_location: cleanUrl.toString(), send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  document.head.appendChild(script);
})();

/* Meta Pixel: WOMEN production only. No advanced matching or automatic events.
 * Never load on order-success (its URL contains a private order reference).
 * Explicit product events contain public catalog selectors only.
 */
(() => {
  "use strict";
  if (!["selectshopeg.com", "www.selectshopeg.com"].includes(location.hostname.toLowerCase())) return;
  if (new URLSearchParams(location.search).get("design-preview") === "1") return;
  if (!["/", "/index.html", "/p/", "/p/index.html", "/cart/", "/cart/index.html", "/checkout/", "/checkout/index.html"].includes(location.pathname) && !location.pathname.startsWith("/lp/")) return;
  // Do not expose arbitrary URL parameters to Meta's automatic page context.
  // Same marketing allowlist: before, /lp/?p=SS-... (p) and Meta's URL builder (utm_id) silently disabled the Pixel.
  const permitted = new Set(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id","code","p","fbclid","igshid","lpv",
    "campaign_id","adset_id","ad_id","placement","site_source_name","model","color"]);
  if ([...new URLSearchParams(location.search)].some(([k,v]) =>
    !permitted.has(k) ||
    (k === "model" && !/^[a-z][a-z0-9-]{2,63}$/.test(v)) ||
    (k === "color" && !/^SS-[0-9]{4,19}$/.test(v)))) return;
  const pixelId = "992616030526349";
  const fbq = window.fbq = window.fbq || function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = fbq.queue || [];
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
  fbq("trackSingle", pixelId, "PageView");
  window.womenMetaEvent = function (name, fields, eventId) {
    try {
      if (!["ViewContent","AddToCart","InitiateCheckout","Purchase"].includes(name)) return;
      const items = Array.isArray(fields.items) ? fields.items.filter(i => /^SS-\d{4,19}$/.test(i.item_id || "")) : [];
      if (!items.length) return;
      const params = {currency:"EGP",content_type:"product",
        content_ids:items.map(i=>i.item_id),
        contents:items.map(i=>({id:i.item_id,quantity:Number.isInteger(i.quantity)&&i.quantity>0?i.quantity:1}))};
      if (Number.isFinite(fields.value) && fields.value >= 0) params.value=fields.value;
      fbq("trackSingle", pixelId, name, params, eventId ? {eventID:eventId} : {});
    } catch { /* Analytics must not interrupt checkout. */ }
  };
  const script=document.createElement("script");
  script.async=true; script.src="https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
})();
