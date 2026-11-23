// SELECT SHOP WOMEN — campaign motion kit (stack reveal, scroll hint, fly-to-bag, accent, colour media).
// Vanilla ES module, no dependencies. Reference look: D:\Website-Design-AG\select-shop-landing\index.html
// Animates transform / opacity / filter only, in one shared requestAnimationFrame loop.

const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));
const easeOut = (/** @type {number} */ t) => 1 - Math.pow(1 - t, 3);

export function reducedMotion() {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/* ===================== product data helpers (API product shape) ===================== */

/** Index of the colour option ("اللون"), or -1. */
export function colourOptionIndex(/** @type {any} */ product) {
  const opts = Array.isArray(product?.options) ? product.options : [];
  return opts.findIndex((/** @type {any} */ o) => /^(اللون|لون|color|colour)$/i.test(String(o?.name || "").trim()));
}

/** Index of the size option ("المقاس"), or -1. */
export function sizeOptionIndex(/** @type {any} */ product) {
  const opts = Array.isArray(product?.options) ? product.options : [];
  return opts.findIndex((/** @type {any} */ o) => /^(المقاس|مقاس|size)$/i.test(String(o?.name || "").trim()));
}

/** True when the product needs no size choice: no size option, one value only, or every value is "One Size". */
export function isOneSize(/** @type {any} */ product) {
  const i = sizeOptionIndex(product);
  if (i < 0) return true;
  const values = product.options[i]?.values || [];
  return values.length <= 1 || values.every((/** @type {any} */ v) => /one\s*size|مقاس واحد|فري ?سايز|free ?size/i.test(String(v?.value || "")));
}

/**
 * Photos for the stack. `campaign` (owner-uploaded ad creatives) wins; otherwise product media.
 * With a colour chosen, photos targeted to that colour come first, then shared (untargeted / product-wide) photos.
 * @param {any} product
 * @param {{colourValue?: number, campaign?: any[]}} [opts]
 * @returns {{url:string, alt:string, overlays:any[], enter?: string, fit?: string, shade?: string, strip?: {text:string, rot?: number, color?: string}}[]}
 */
export function stackMedia(product, opts = {}) {
  const colourIdx = colourOptionIndex(product);
  const pick = (/** @type {any[]} */ list) => {
    const sorted = [...list].filter(m => typeof m?.url === "string" && m.url)
      .sort((a, b) => (b.isPrimary === true ? 1 : 0) - (a.isPrimary === true ? 1 : 0) || (a.position ?? 0) - (b.position ?? 0));
    if (colourIdx < 0 || opts.colourValue === undefined || opts.colourValue < 0) {
      const shared = sorted.filter(m => !m.target || m.target.kind === "product");
      return shared.length ? shared : sorted;
    }
    const forColour = (/** @type {any} */ m) => {
      const t = m.target;
      if (!t) return false;
      if (t.kind === "value") return t.optionPosition === colourIdx && t.valuePosition === opts.colourValue;
      if (t.kind === "variant") return (t.selection || []).some((/** @type {any} */ s) => s.optionPosition === colourIdx && s.valuePosition === opts.colourValue);
      return false;
    };
    const own = sorted.filter(forColour);
    const shared = sorted.filter(m => !m.target || m.target.kind === "product");
    return own.length ? [...own, ...shared] : (shared.length ? shared : sorted);
  };
  const source = Array.isArray(opts.campaign) && opts.campaign.length ? opts.campaign : (product?.media || []);
  const alt = String(product?.title || "");
  return pick(source).map(m => ({ url: m.url, alt: m.altText || alt, overlays: Array.isArray(m.overlays) ? m.overlays : [], enter: typeof m.enter === "string" ? m.enter : undefined, fit: typeof m.fit === "string" ? m.fit : undefined, shade: typeof m.shade === "string" ? m.shade : undefined, strip: m.strip && typeof m.strip.text === "string" ? { text: m.strip.text, rot: m.strip.rot, color: m.strip.color } : undefined }));
}

/* ===================== accent colour from a photo ===================== */

const hex = (/** @type {number[]} */ rgb) => "#" + rgb.map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("");

/** @param {number} r @param {number} g @param {number} b */
function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

/**
 * Most vivid colour family in raw RGBA pixels, darkened until white text on it stays readable.
 * Pure function so it can be unit-tested without a canvas.
 * @param {Uint8ClampedArray|number[]} data RGBA bytes
 * @param {string} fallback
 */
export function accentFromPixels(data, fallback = "#d0021b") {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [h, s, l] = toHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.38 || l < 0.12 || l > 0.85) continue;
    const bin = bins[Math.floor(h / 15) % 24], w = s * s;
    bin.w += w; bin.r += data[i] * w; bin.g += data[i + 1] * w; bin.b += data[i + 2] * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 2) return fallback;
  let rgb = [best.r / best.w, best.g / best.w, best.b / best.w];
  const lum = (/** @type {number[]} */ c) => {
    const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  for (let k = 0; k < 12 && (1.05 / (lum(rgb) + 0.05)) < 4.5; k++) rgb = rgb.map(c => c * 0.88); // ≥ 4.5:1 with white
  return hex(rgb);
}

/**
 * Suggest an accent from a product photo. Resolves to `fallback` if the image can't be read (CORS, network).
 * @param {string} url
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
export function accentFromImage(url, fallback = "#d0021b") {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (/** @type {string} */ v) => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(fallback), 6000);
    img.onerror = () => done(fallback);
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 48; c.height = 64;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return done(fallback);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        done(accentFromPixels(ctx.getImageData(0, 0, c.width, c.height).data, fallback));
      } catch { done(fallback); }
    };
    img.src = url;
  });
}

/** Apply the accent to a page / section: sets --ssm-accent (+ a soft glow variant). */
export function applyAccent(/** @type {HTMLElement} */ el, /** @type {string} */ colour) {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
  el.style.setProperty("--ssm-accent", colour);
  el.style.setProperty("--ssm-accent-glow", colour + "73");
  el.style.setProperty("--ssm-accent-ink", isLight(colour) ? "#111" : "#fff");
}


/* ===================== overlay library (studio elements on photos) ===================== */
// Each element is plain data, positioned in % of the photo, so it fits every screen and every model:
// { type: "dot"|"callout"|"arrow"|"text"|"badge"|"circle", x, y, x2?, y2?, text?, color?, size?, anim?, rot? (degrees) }
// in: entrance, anim: loop after it, delay: seconds after the card arrives (null = automatic order).

export const OVERLAY_TYPES = ["dot", "callout", "arrow", "text", "badge", "circle", "icon"];
/** Text effects (like the red marker stroke under the Gemini headline). fxc = effect colour ("" = page accent). */
/** Text shadows (work together with any effect). */
export const TEXT_SHADOWS = ["", "soft", "strong", "long", "edge"];
/** Darkening over a photo so text stays readable on plain photos. */
export const PHOTO_SHADES = ["", "bottom", "top", "both", "full"];
export const TEXT_FX = ["", "marker", "block", "underline", "outline", "gradient", "neon", "3d", "sticker", "ribbon", "split", "glow", "box", "pop", "shiny", "aurora", "lines", "glitch", "sparkle", "comic"];
/** Icon library: simple 24×24 line icons drawn for SELECT SHOP (currentColor). */
export const ICONS = {
  truck: "M2 6h12v10H2zM14 10h4.5L22 13.5V16h-8zM6 18.5a1.8 1.8 0 1 0 0 .01M17 18.5a1.8 1.8 0 1 0 0 .01",
  cash: "M2.5 6.5h19v11h-19zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M5.5 9v6M18.5 9v6",
  star: "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z",
  heart: "M12 20.5S3.5 15.3 3.5 9.2A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.6c0 6.1-8.5 11.3-8.5 11.3z",
  fire: "M12 21.5c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.4 3.6-9.3 2.7 1.4 3.9 3.7 3.9 5.6 1-.6 1.6-1.8 1.8-3 2.4 1.9 3.7 4.3 3.7 6.7 0 3.5-2.5 6.2-6.5 6.2z",
  check: "M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19M7.5 12.3l3 3 6-6.3",
  gift: "M3.5 9h17v4h-17zM5 13h14v8H5zM12 9v12M12 9C9 9 7 7.8 7.5 6 8 4.2 11 5.5 12 9c1-3.5 4-4.8 4.5-3 .5 1.8-1.5 3-4.5 3",
  sparkle: "M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9-1.9 6.1-1.9-6.1L4 10.5l6.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14",
  tag: "M3 12V3.5h8.5L21 13l-8.5 8.5zM7.5 7.5a1 1 0 1 0 0 .01",
  bolt: "M13.5 2.5L5 13.5h6l-1.5 8 8.5-11h-6z",
  shirt: "M8 3.5L3 6.5l2 4 2-1V20.5h10V9.5l2 1 2-4-5-3c-.5 1.6-2 2.5-4 2.5S8.5 5.1 8 3.5z",
  ruler: "M3.5 15.5L15.5 3.5l5 5-12 12zM7 12l2 2M9.5 9.5l2 2M12 7l2 2",
  percent: "M19 5L5 19M7 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M17 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
  bag: "M5 7.5h14l-1 13H6zM9 7.5V6a3 3 0 0 1 6 0v1.5",
  pin: "M12 21.5s-6.5-6.6-6.5-11.5a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11.5-6.5 11.5zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
  phone: "M5 3.5h4l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5l1.5-2.5 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z",
  smile: "M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19M8 14.5c1 1.5 2.3 2.2 4 2.2s3-.7 4-2.2M9 9.5v.5M15 9.5v.5",
  diamond: "M6.5 3.5h11l4 5.5L12 21 2.5 9zM2.5 9h19M9 3.5L12 21l3-17.5",
  hanger: "M12 7a2 2 0 1 1 2-2c0 1.2-2 1.5-2 3L3 17h18z",
};
/** Entrance (how an element arrives) and loop (what it keeps doing after). */
export const OVERLAY_INS = ["pop", "slide", "zoom", "spin", "drop", "type", "blur", "flip"];
/**
 * Arabic fonts the Studio offers (Google Fonts). weights: what to request; heavy: display faces that are
 * already bold, so they render at 400 instead of a faked bold. "" = page font.
 */
export const FONT_LIBRARY = [
  { name: "Cairo", weights: "400;700;900" }, { name: "Tajawal", weights: "400;700;900" },
  { name: "Almarai", weights: "400;700;800" }, { name: "Changa", weights: "400;700;800" },
  { name: "Alexandria", weights: "400;700;900" }, { name: "Readex Pro", weights: "400;700" },
  { name: "Noto Kufi Arabic", weights: "400;700;900" }, { name: "Kufam", weights: "400;700;900" },
  { name: "Mada", weights: "400;700;900" }, { name: "IBM Plex Sans Arabic", weights: "400;700" },
  { name: "El Messiri", weights: "400;700" }, { name: "Reem Kufi", weights: "400;700" },
  { name: "Reem Kufi Fun", weights: "400;700" }, { name: "Lemonada", weights: "400;700" },
  { name: "Marhey", weights: "400;700" }, { name: "Baloo Bhaijaan 2", weights: "400;800" },
  { name: "Amiri", weights: "400;700" }, { name: "Aref Ruqaa", weights: "400;700" },
  { name: "Mirza", weights: "400;700" }, { name: "Lalezar", weights: "", heavy: true },
  { name: "Rakkas", weights: "", heavy: true }, { name: "Jomhuria", weights: "", heavy: true },
  { name: "Katibeh", weights: "", heavy: true }, { name: "Blaka", weights: "", heavy: true },
  { name: "Vibes", weights: "", heavy: true },
];
export const OVERLAY_FONTS = ["", ...FONT_LIBRARY.map(f => f.name)];
const fontInfo = (/** @type {string} */ n) => FONT_LIBRARY.find(f => f.name === n);
/** Google Fonts stylesheet URL for one family. */
export const OVERLAY_LOOPS = ["none", "pulse", "float", "shake", "neon", "heart", "swing", "bounce"];
/** @deprecated kept so older saved designs still load ("pop" = no loop). */
export const OVERLAY_ANIMS = ["pop", ...OVERLAY_LOOPS];

/** Keep only valid, safe overlay data (Studio input is untrusted). */
export function sanitizeOverlays(/** @type {any} */ list) {
  if (!Array.isArray(list)) return [];
  const pct = (/** @type {any} */ v, d = 50) => (Number.isFinite(+v) ? clamp(+v, 0, 100) : d);
  return list.slice(0, 24).filter(o => o && OVERLAY_TYPES.includes(o.type)).map(o => ({
    type: o.type,
    x: pct(o.x), y: pct(o.y), x2: pct(o.x2, pct(o.x) + 15), y2: pct(o.y2, pct(o.y)),
    text: typeof o.text === "string" ? [...o.text].slice(0, 80).join("") : "",
    color: /^#[0-9a-f]{6}$/i.test(o.color || "") ? o.color : "",
    size: clamp(Number.isFinite(+o.size) ? +o.size : 1, 0.6, 2.5),
    anim: OVERLAY_LOOPS.includes(o.anim) ? o.anim : "none",
    in: OVERLAY_INS.includes(o.in) ? (o.in === "type" && !["text", "badge", "callout"].includes(o.type) ? "pop" : o.in) : "pop",
    delay: o.delay === null || o.delay === undefined || o.delay === "" || !Number.isFinite(+o.delay) ? null : Math.round(clamp(+o.delay, 0, 6) * 10) / 10,
    rot: Math.round(clamp(Number.isFinite(+o.rot) ? +o.rot : 0, -180, 180)),
    font: OVERLAY_FONTS.includes(o.font) ? o.font : "",
    lock: o.lock === true, // Studio only: stops accidental dragging
    fx: TEXT_FX.includes(o.fx) || (o.type === "icon" && o.fx === "plain") ? o.fx : "",
    fxc: /^#[0-9a-f]{6}$/i.test(o.fxc || "") ? o.fxc : "",
    sh: TEXT_SHADOWS.includes(o.sh) ? o.sh : ["text", "badge", "callout"].includes(o.type) ? "soft" : "",
    icon: Object.prototype.hasOwnProperty.call(ICONS, o.icon) ? o.icon : "star",
  }));
}

const SVGNS = "http://www.w3.org/2000/svg";
/** True for light colours (white text on them is hard to read). */
export function isLight(/** @type {string} */ hexColour) {
  if (!/^#[0-9a-f]{6}$/i.test(hexColour)) return false;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hexColour.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Shrink ribbon text only when it cannot fit into two lines at its intended size. */
export function fitRibbonLabels(/** @type {HTMLElement} */ root) {
  for (const node of root.querySelectorAll(".ssm-ribbon-label")) {
    const label = /** @type {HTMLElement} */ (node);
    const height = label.parentElement?.clientHeight ?? 0;
    if (!height || !label.clientWidth) continue;
    label.style.removeProperty("--ribbon-fit");
    const fits = () => label.scrollWidth <= label.clientWidth
      && label.scrollHeight <= Math.min(height, 2 * parseFloat(getComputedStyle(label).lineHeight)) + 1;
    if (fits()) continue;
    let low = 0.1, high = 1;
    for (let step = 0; step < 8; step++) {
      const middle = (low + high) / 2;
      label.style.setProperty("--ribbon-fit", String(middle));
      if (fits()) low = middle;
      else high = middle;
    }
    label.style.setProperty("--ribbon-fit", String(low));
  }
}

const IN_CSS = {
  pop: ["ssm-in-pop", 0.55, "cubic-bezier(.2,1.6,.4,1)"],
  slide: ["ssm-in-slide", 0.7, "cubic-bezier(.2,.9,.2,1)"],
  zoom: ["ssm-in-zoom", 0.6, "cubic-bezier(.2,.9,.3,1)"],
  spin: ["ssm-in-spin", 0.8, "cubic-bezier(.2,.9,.3,1.2)"],
  drop: ["ssm-in-drop", 0.75, "cubic-bezier(.3,1.5,.5,1)"],
  type: ["ssm-in-type", 1.1, "steps(18,end)"],
  blur: ["ssm-in-blur", 0.8, "cubic-bezier(.2,.8,.2,1)"],
  flip: ["ssm-in-flip", 0.8, "cubic-bezier(.2,1.3,.4,1)"],
};
const LOOP_CSS = {
  pulse: ["ssm-l-pulse", 1.6, "ease-out"], float: ["ssm-l-float", 2.4, "ease-in-out"], shake: ["ssm-l-shake", 2.2, "linear"],
  neon: ["ssm-l-neon", 2.6, "linear"], heart: ["ssm-l-heart", 1.3, "ease-in-out"], swing: ["ssm-l-swing", 2, "ease-in-out"], bounce: ["ssm-l-bounce", 1.4, "ease-in-out"],
};
/** CSS animation shorthand for one overlay: entrance, then its loop. Exported for tests. */
export function animFor(/** @type {any} */ o, /** @type {number} */ delay) {
  const [n, dur, ease] = IN_CSS[o.in] || IN_CSS.pop;
  let a = `${n} ${dur}s ${ease} ${delay}s both`;
  const loop = LOOP_CSS[o.anim];
  if (loop) a += `, ${loop[0]} ${loop[1]}s ${loop[2]} ${(delay + dur).toFixed(2)}s infinite`;
  return a;
}

/** Draw overlays inside a photo wrapper. Returns the layer element. */
export function renderOverlays(/** @type {HTMLElement} */ wrap, /** @type {any[]} */ raw) {
  wrap.querySelector(".ssm-layer")?.remove();
  const items = sanitizeOverlays(raw);
  const layer = document.createElement("div"); layer.className = "ssm-layer";
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("preserveAspectRatio", "none"); svg.classList.add("ssm-lines");
  layer.append(svg);
  items.forEach((o, i) => {
    const color = o.color || "var(--ssm-accent)";
    const ribbon = o.type === "badge" && o.fx === "ribbon";
    const d = o.delay === null ? 0.15 + i * 0.12 : o.delay;
    const delay = `${d}s`;
    if (o.type === "callout" || o.type === "arrow") {
      const line = document.createElementNS(SVGNS, "line");
      line.setAttribute("x1", String(o.x)); line.setAttribute("y1", String(o.y));
      line.setAttribute("x2", String(o.x2)); line.setAttribute("y2", String(o.y2));
      line.setAttribute("class", "ssm-line" + (o.type === "arrow" ? " ssm-arrowline" : ""));
      line.setAttribute("pathLength", "1");
      line.style.stroke = o.type === "arrow" ? color : "#fff";
      line.style.animationDelay = delay;
      svg.append(line);
    }
    const el = document.createElement("div");
    el.className = `ssm-o ssm-o-${o.type}`;
    el.dataset.i = String(i);
    if (o.type !== "text" || o.color) el.style.setProperty("--c", color); // text is white unless a colour is chosen
    el.style.setProperty("--s", String(o.size));
    if (o.type === "badge" && o.color && isLight(o.color)) el.style.color = "#111"; // white text vanishes on light badges
    if (["text", "badge", "callout", "icon"].includes(o.type)) el.classList.add("ssm-sh-" + (o.sh || "none"));
    if (o.type === "text" && o.fx) {
      el.classList.add("ssm-fx-" + o.fx);
      el.dataset.t = o.text; // effects that draw a second copy of the text (lines, glitch) read it from here
      el.style.setProperty("--fxc", o.fxc || "var(--ssm-accent)");
      el.style.setProperty("--fxd", `${(d + (IN_CSS[o.in] || IN_CSS.pop)[1] * 0.7).toFixed(2)}s`);
    }
    if (o.type === "icon") {
      const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(SVGNS, "path"); path.setAttribute("d", ICONS[/** @type {keyof typeof ICONS} */ (o.icon)]);
      svg.append(path); el.append(svg);
      if (o.fx === "plain") el.classList.add("ssm-icon-plain");
      else if (o.color && isLight(o.color)) el.style.color = "#111";
    }
    if (o.font) { el.style.fontFamily = `"${o.font}", system-ui, sans-serif`; if (fontInfo(o.font)?.heavy) el.style.fontWeight = "400"; }
    el.style.setProperty("--anim", animFor(o, d));
    const at = o.type === "callout" ? [o.x2, o.y2] : o.type === "arrow" ? [o.x2, o.y2] : [o.x, o.y];
    if (ribbon) {
      el.classList.add("ssm-o-ribbon");
      el.style.setProperty("--ribbon-x", at[0] + "%");
      el.style.setProperty("--ribbon-y", at[1] + "%");
      if (o.color) el.style.color = isLight(o.color) ? "#111" : "#fff";
    } else {
      el.style.left = at[0] + "%"; el.style.top = at[1] + "%";
    }
    if (o.type === "arrow") {
      const ang = Math.atan2(o.y2 - o.y, (o.x2 - o.x) * 0.56) * 180 / Math.PI; // photos are ~9:16
      el.style.setProperty("--rot", (ang + o.rot).toFixed(1) + "deg");
    } else {
      el.style.setProperty("--rot", o.rot + "deg");
    }
    if (ribbon) {
      const label = document.createElement("span");
      label.className = "ssm-ribbon-label"; label.dir = "auto"; label.textContent = o.text;
      el.append(label);
    } else if (o.type === "arrow" || o.type === "icon") { /* drawn by CSS / SVG */ } else if (o.type === "text") {
      const t = document.createElement("span"); t.className = "ssm-t"; t.textContent = o.text; el.append(t); // inline, so line effects follow each line
    } else if (o.type !== "dot" && o.type !== "circle") {
      el.textContent = o.text;
    }
    if (o.type === "callout") {
      const pin = document.createElement("i"); pin.className = "ssm-o ssm-o-pin";
      pin.style.left = o.x + "%"; pin.style.top = o.y + "%"; pin.style.setProperty("--anim", `ssm-in-pop .5s cubic-bezier(.2,1.6,.4,1) ${d}s both`);
      layer.append(pin);
    }
    layer.append(el);
  });
  wrap.append(layer);
  if (layer.querySelector(".ssm-ribbon-label")) {
    const fit = () => { if (layer.isConnected) fitRibbonLabels(layer); };
    requestAnimationFrame(fit);
    if (document.fonts.status === "loading") void document.fonts.ready.then(fit);
  }
  return layer;
}


/** Rotated moving strip (between photos or before the buy section). Text is plain, repeated. */
export function makeStrip(/** @type {string} */ text, rot = -3, color = "") {
  const strip = document.createElement("div"); strip.className = "ssm-marq"; strip.setAttribute("aria-hidden", "true");
  strip.style.setProperty("--ssm-strip-rot", clamp(Number.isFinite(+rot) ? +rot : -3, -20, 20) + "deg");
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    strip.style.background = color;
    strip.style.color = (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#111" : "#fff"; // readable text on light or dark strips
  }
  const track = document.createElement("div");
  for (let i = 0; i < 8; i++) { const sp = document.createElement("span"); sp.textContent = String(text).slice(0, 60) + " ✦"; track.append(sp); }
  strip.append(track);
  return strip;
}

/* ===================== photo frame (any photo → 9:16) ===================== */
export const PHOTO_FITS = ["auto", "fill", "cover"];
/**
 * Put a photo into a 9:16 frame. "cover" crops to fill; "fill" keeps the whole photo centred over a blurred,
 * enlarged copy of itself; "auto" picks "fill" for square / landscape photos and "cover" for portrait ones.
 * @param {HTMLElement} wrap @param {{url:string, alt?:string, fit?:string, shade?:string}} photo @param {boolean} [eager]
 */
export function mountPhoto(wrap, photo, eager = false) {
  wrap.classList.add("ssm-frame");
  const shade = /** @type {any} */ (photo).shade;
  if (PHOTO_SHADES.includes(shade) && shade) { const sd = document.createElement("div"); sd.className = "ssm-shade ssm-shade-" + shade; wrap.prepend(sd); }
  const img = document.createElement("img");
  img.className = "ssm-main"; img.src = photo.url; img.alt = photo.alt || ""; img.decoding = "async";
  if (eager) { img.loading = "eager"; img.setAttribute("fetchpriority", "high"); } else img.loading = "lazy";
  const fit = PHOTO_FITS.includes(/** @type {string} */ (photo.fit)) ? photo.fit : "auto";
  const apply = () => {
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.5625;
    const fill = fit === "fill" || (fit === "auto" && ratio > 0.68);
    wrap.classList.toggle("ssm-fill", fill);
    if (fill && !wrap.querySelector(".ssm-bg")) {
      const bg = document.createElement("img"); bg.className = "ssm-bg"; bg.src = photo.url; bg.alt = ""; bg.setAttribute("aria-hidden", "true");
      bg.loading = img.loading; bg.decoding = "async";
      wrap.prepend(bg);
    }
  };
  if (fit === "fill") apply(); else if (img.complete && img.naturalWidth) apply(); else img.addEventListener("load", apply, { once: true });
  wrap.prepend(img);
  return img;
}

/* ===================== photo entrances ===================== */
export const PHOTO_ENTERS = ["side", "top", "zoom", "flip", "curtain", "rise", "blur", "slide", "fade"];

/** Wrapper style for a photo entering, k = 1 (not yet in) … 0 (in place). */
export function enterStyle(/** @type {string} */ dir, /** @type {number} */ k) {
  const f = (/** @type {number} */ n, d = 2) => n.toFixed(d);
  switch (dir) {
    case "": return { transform: "", clip: "", opacity: 1 };
    case "fade": return { transform: "", clip: "", opacity: 1 - k };
    case "blur": return { transform: "", clip: "", filter: "blur(" + f(k * 18) + "px)", opacity: 1 - k };
    case "slide": return { transform: "translateY(" + f(k * 30) + "%)", clip: "", opacity: 1 - k };
    case "top": return { transform: `translateY(${f(k * -105)}%) rotateX(${f(k * 55)}deg) rotate(${f(k * -8)}deg) scale(${f(1 + k * 0.3, 3)})`, clip: "" };
    case "zoom": return { transform: `scale(${f(1 + k * 1.4, 3)}) rotate(${f(k * 6)}deg)`, clip: `circle(${f(150 - k * 120)}% at 50% 50%)` };
    case "flip": return { transform: `rotateY(${f(k * -95)}deg) scale(${f(1 - k * 0.15, 3)})`, clip: "" };
    case "curtain": return { transform: `scale(${f(1 + k * 0.15, 3)})`, clip: `inset(0 ${f(k * 50)}% 0 ${f(k * 50)}%)` };
    case "rise": return { transform: `translateY(${f(k * 60)}%) scale(${f(1 - k * 0.2, 3)})`, clip: "" };
    default: return { transform: `translateX(${f(k * 105)}%) rotateY(${f(k * -55)}deg) scale(${f(1 + k * 0.3, 3)})`, clip: "" };
  }
}

/** Play a photo entrance once (Studio preview). */
export function playEnter(/** @type {HTMLElement} */ wrap, /** @type {string} */ dir, ms = 1000) {
  if (reducedMotion()) return;
  const t0 = performance.now();
  const step = (/** @type {number} */ now) => {
    const p = Math.min(1, (now - t0) / ms), k = 1 - easeOut(p), st = enterStyle(dir, k);
    wrap.style.transform = st.transform; wrap.style.clipPath = st.clip; wrap.style.filter = st.filter || ""; wrap.style.opacity = (st.opacity ?? (0.3 + (1 - k) * 0.7)).toFixed(3);
    if (p < 1) requestAnimationFrame(step); else { wrap.style.transform = ""; wrap.style.clipPath = ""; wrap.style.opacity = ""; wrap.style.filter = ""; }
  };
  requestAnimationFrame(step);
}

/* ===================== shared scroll engine ===================== */

/** @type {Set<() => void>} */
const tickers = new Set();
let ticking = false, wired = false;
function frame() { ticking = false; tickers.forEach(fn => { try { fn(); } catch { /* one bad stack must not stop the rest */ } }); }
function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
function wire() {
  if (wired) return; wired = true;
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", () => { tickers.forEach(fn => /** @type {any} */ (fn).measure?.()); schedule(); });
}

/**
 * Sticky stacked photo cards. First card opens with a circle reveal; the rest enter tied to scroll,
 * alternating from the side and from the top; a covered card shrinks, dims and tilts.
 * @param {HTMLElement} root empty container
 * @param {{url:string, alt:string, overlays?: any[], enter?: string, fit?: string, strip?: {text:string, rot?: number, color?: string}}[]} photos
 * @param {{mode?: "cinematic", next?: () => (Element|null), firstEager?: boolean}} [opts]
 */
export function mountStack(root, photos, opts = {}) {
  const reduce = reducedMotion();
  root.classList.add("ssm-stack");
  /** @type {HTMLElement[]} */ let cards = [];
  let shone = new WeakSet();
  /** @type {IntersectionObserver|null} */ let firstView = null;

  const build = (/** @type {{url:string, alt:string, overlays?: any[], enter?: string, fit?: string}[]} */ list, intro = true) => {
    firstView?.disconnect();
    root.textContent = "";
    shone = new WeakSet();
    cards = list.map((p, i) => {
      const card = document.createElement("section");
      card.className = "ssm-card";
      const enter = /** @type {any} */ (p).enter;
      card.dataset.dir = PHOTO_ENTERS.includes(enter) ? enter : "";
      const wrap = document.createElement("div"); wrap.className = "ssm-wrap";
      wrap.dataset.photoLoop = p.loop || "none";
      const glint = document.createElement("div"); glint.className = "ssm-glint";
      wrap.append(glint);
      const img = mountPhoto(wrap, p, i === 0 && opts.firstEager !== false);
      img.addEventListener("load", () => { measure(); schedule(); }, { once: true });
      if (p.overlays && p.overlays.length) renderOverlays(wrap, p.overlays);
      card.append(wrap);
      return card;
    });
    cards.forEach((card, i) => {
      root.append(card);
      const strip = list[i] && /** @type {any} */ (list[i]).strip;
      if (strip && typeof strip.text === "string" && strip.text.trim()) root.append(makeStrip(strip.text, strip.rot, strip.color));
    });
    const first = cards[0];
    if (reduce) cards.forEach(c => c.classList.add("ssm-in"));
    else if (first) {
      const reveal = () => {
        if (intro && first.dataset.dir) {
          first.classList.add("ssm-starting");
          playEnter(/** @type {HTMLElement} */ (first.firstElementChild), first.dataset.dir);
          setTimeout(() => first.classList.remove("ssm-starting"), 1000);
        }
        first.classList.add("ssm-in");
      };
      if (intro && opts.firstEager === false && typeof IntersectionObserver === "function") {
        firstView = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          firstView?.disconnect();
          reveal();
        }, { threshold: 0.05 });
        firstView.observe(first);
      } else setTimeout(reveal, 0);
    }
    measure(); schedule();
  };

  const measure = () => {
    const vh = innerHeight;
    cards.forEach(c => c.style.setProperty("--ssm-top", reduce ? "0px" : Math.min(0, vh - c.offsetHeight) + "px"));
    fitRibbonLabels(root);
  };

  const tick = () => {
    if (reduce || !cards.length) return;
    const vh = innerHeight;
    cards.forEach((card, i) => {
      const wrap = /** @type {HTMLElement} */ (card.firstElementChild);
      const r = card.getBoundingClientRect();
      if (i > 0) {
        const p = clamp((vh - r.top) / (vh * 0.8), 0, 1), k = 1 - easeOut(p);
        const st = enterStyle(card.dataset.dir || "", k);
        wrap.style.transform = st.transform; wrap.style.clipPath = st.clip;
        wrap.style.filter = st.filter || "";
        wrap.style.opacity = (st.opacity ?? (0.3 + (1 - k) * 0.7)).toFixed(3);
        if (p > 0.97 && !shone.has(card)) { shone.add(card); card.querySelector(".ssm-glint")?.classList.add("ssm-go"); card.classList.add("ssm-in"); }
      } else if (!card.classList.contains("ssm-starting")) {
        wrap.style.transform = `scale(${(1 + clamp(-r.top / vh, 0, 1) * 0.08).toFixed(3)})`;
      }
      const nextEl = (card.nextElementSibling && card.nextElementSibling.classList.contains("ssm-marq") ? card.nextElementSibling : cards[i + 1]) || (opts.next ? opts.next() : null);
      const t = nextEl ? clamp(1 - nextEl.getBoundingClientRect().top / vh, 0, 1) : 0;
      card.style.transform = t ? `scale(${(1 - t * 0.1).toFixed(3)}) rotate(${((i % 2 ? 1 : -1) * t * 2).toFixed(2)}deg)` : "";
      card.style.filter = t ? `brightness(${(1 - t * 0.6).toFixed(3)}) blur(${(t * 2).toFixed(2)}px)` : "";
    });
  };
  /** @type {any} */ (tick).measure = measure;

  wire(); tickers.add(tick); build(photos);
  return {
    /** Swap photos (e.g. colour change) without the intro. */
    setPhotos(/** @type {{url:string, alt:string, overlays?: any[]}[]} */ list) { build(list, false); cards.forEach(c => c.classList.add("ssm-in")); },
    destroy() { firstView?.disconnect(); tickers.delete(tick); root.textContent = ""; },
  };
}

/**
 * Glass pill at the bottom: accent circle with a rising arrow + editable text, and a gentle page nudge
 * every 5 s until the first real scroll. Hides for good after scrolling.
 * @param {{text: string, nudge?: HTMLElement|null}} opts
 */
export function mountScrollHint(opts) {
  const reduce = reducedMotion();
  const hint = document.createElement("div");
  hint.className = "ssm-hint"; hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = '<div class="ssm-pill"><span class="ssm-ico"><svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></span><span class="ssm-txt"></span></div>';
  /** @type {HTMLElement} */ (hint.querySelector(".ssm-txt")).textContent = opts.text;
  document.body.append(hint);
  let gone = false;
  const nudge = () => {
    if (gone || reduce || !opts.nudge) return;
    const n = opts.nudge; n.classList.remove("ssm-nudge"); void n.offsetWidth; n.classList.add("ssm-nudge");
  };
  const first = setTimeout(nudge, 2600), every = setInterval(nudge, 5000);
  const check = () => { if (!gone && scrollY > 40) stop(); };
  const stop = () => { gone = true; hint.classList.add("ssm-hide"); clearTimeout(first); clearInterval(every); removeEventListener("scroll", check); };
  addEventListener("scroll", check, { passive: true });
  return { destroy() { stop(); hint.remove(); } };
}

/**
 * Product photo flies into the bag icon; the bag shakes. Resolves when done (immediately with reduced motion).
 * @param {Element} from @param {HTMLElement} bag @param {string} imageUrl
 */
export function flyToBag(from, bag, imageUrl) {
  const shake = () => { bag.classList.remove("ssm-shake"); void bag.offsetWidth; bag.classList.add("ssm-shake"); };
  if (reducedMotion()) { shake(); return Promise.resolve(); }
  return new Promise(resolve => {
    const a = from.getBoundingClientRect(), b = bag.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "ssm-fly";
    f.style.backgroundImage = `url("${String(imageUrl).replace(/["\\]/g, "")}")`;
    f.style.left = `${a.left + a.width / 2 - 32}px`; f.style.top = `${a.top + a.height / 2 - 32}px`;
    document.body.append(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px,${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.3)`;
      f.style.opacity = ".4";
    }));
    setTimeout(() => { f.remove(); shake(); resolve(); }, 820);
  });
}
