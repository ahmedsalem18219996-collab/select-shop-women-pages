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
  const allowed = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "code", "gclid", "fbclid"]);
  for (const key of [...cleanUrl.searchParams.keys()]) {
    if (!allowed.has(key)) cleanUrl.searchParams.delete(key);
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
