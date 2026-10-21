/* SELECT SHOP WOMEN | anonymous order-channel attribution.
 * Seven-day last non-direct source; no click IDs, referrer URLs, buyer info or identifiers.
 */
(() => {
  "use strict";
  const KEY = "women.order.source.v1";
  const AGE = 7 * 24 * 60 * 60 * 1000;
  const channels = new Set(["facebook", "instagram", "meta", "google", "tiktok", "other", "direct"]);
  const privacy = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  function tag(value) {
    if (typeof value !== "string") return null;
    const str = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 80);
    return str || null;
  }
  function channel(value) {
    const v = (tag(value) || "").toLowerCase();
    if (/^(ig|instagram)$/.test(v)) return "instagram";
    if (/^(fb|facebook|fb_ads)$/.test(v)) return "facebook";
    if (/^(meta|facebook_ads|instagram_ads)$/.test(v)) return "meta";
    if (/^(google|googleads|adwords)$/.test(v)) return "google";
    if (/^(tiktok|tt)$/.test(v)) return "tiktok";
    return v ? "other" : null;
  }
  function referrerChannel() {
    try {
      if (!document.referrer) return null;
      const url = new URL(document.referrer);
      if (url.origin === location.origin) return null;
      const h = url.hostname.toLowerCase();
      if (/(^|\.)(facebook\.com|fb\.com)$/.test(h) || h === "facebook.com" || h === "fb.com") return "facebook";
      if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
      if (/(^|\.)google\.[a-z.]+$/.test(h)) return "google";
      if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
      return "other";
    } catch { return null; }
  }
  function valid(v) {
    return !!v && typeof v === "object" && !Array.isArray(v)
      && channels.has(v.source) && [v.medium, v.campaign, v.content].every(x =>
        x === null || (typeof x === "string" && x.length > 0 && x.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(x)));
  }
  function read() {
    if (privacy()) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && valid(saved.data) && saved.data.source !== "direct"
        && Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at < AGE) return saved.data;
    } catch {}
    return { source: "direct", medium: null, campaign: null, content: null };
  }
  try {
    if (!privacy()) {
      const p = new URLSearchParams(location.search);
      // fbclid alone identifies Meta only; Facebook vs Instagram needs UTMs.
      const source = channel(p.get("utm_source"))
        || (p.has("igshid") ? "instagram" : p.has("fbclid") ? "meta" : p.has("gclid") ? "google" : referrerChannel());
      if (source) {
        const data = { source, medium: tag(p.get("utm_medium")), campaign: tag(p.get("utm_campaign")),
          content: tag(p.get("utm_content")) };
        localStorage.setItem(KEY, JSON.stringify({ data, at: Date.now() }));
      }
    }
  } catch { /* Tracking must never block shopping. */ }
  window.SelectOrderAttribution = Object.freeze({ read });
})();
