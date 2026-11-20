// @ts-check
/* Motion modes for landing and campaign pages: presentation only. Loaded on demand (a design with a motion mode,
   or an add to bag), so an ordinary product page never downloads it.
   - Stack: the product photos as stacked sticky cards. The first opens with a circle; the others enter with the
     scroll from the side or from the top (3D turn); older cards shrink and darken; a light sweep passes once.
   - Hint: a capsule at the bottom (main-colour circle with a rising arrow + text); the page gives a short shake every
     5 s until the first scroll.
   - Fly to bag: the product photo flies to the bag link, the bag shakes and its counter grows.
   prefers-reduced-motion: no transforms, no sticky stacking, no shake; content stays fully visible. */

/** @typedef {{ src: string, alt?: string }} Shot */
/** @typedef {{ el: HTMLElement, setImages: (l: Shot[]) => void, measure: () => void, update: () => void, destroy: () => void }} Stack */
/** Per mode: card travel (%), 3D turn (deg), tilt (deg), extra zoom, scroll span (× viewport), dimming, blur (px),
 *  shrink of the older card, circle-open duration (s), white flash on open. */
export const MODES = {
  cinematic: { travel: 105, turn: 55, tilt: 8, zoom: 0.3, span: 0.8, dim: 0.6, blur: 2, shrink: 0.1, open: 1.5, flash: true },
  calm: { travel: 14, turn: 0, tilt: 0, zoom: 0.06, span: 1.1, dim: 0.35, blur: 0, shrink: 0.05, open: 2.2, flash: false },
  bold: { travel: 120, turn: 70, tilt: 12, zoom: 0.4, span: 0.55, dim: 0.7, blur: 3, shrink: 0.14, open: 0.9, flash: true },
};

const CSS_URL = new URL("./motion.css?v=20261120-campaign", import.meta.url).href;

const reduce = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));
const ease = (/** @type {number} */ t) => 1 - Math.pow(1 - t, 3);
/** @type {Set<Stack>} */ const stacks = new Set();
let started = false, userScrolled = false, ticking = false;
/** @type {HTMLElement|null} */ let hint = null;

function install() {
  if (started) return;
  started = true;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = CSS_URL; link.dataset.motion = "1";
  document.head.append(link);
  const update = () => {
    ticking = false;
    if (scrollY > 40) userScrolled = true;
    hint?.classList.toggle("hide", userScrolled);
    stacks.forEach(s => s.update());
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", () => { stacks.forEach(s => s.measure()); update(); });
  // A short shake of the first stack every 5 s until the visitor scrolls once, so it is clear there is more below.
  const nudge = () => {
    const first = [...stacks][0]?.el;
    if (userScrolled || reduce() || !first || document.hidden) return;
    first.classList.remove("mo-nudge"); void first.offsetWidth; first.classList.add("mo-nudge");
  };
  setTimeout(nudge, 2600);
  setInterval(nudge, 5000);
}

/** Removes the hint (a design switched back to "no motion" in the Studio preview). */
export function removeHint() { hint?.remove(); hint = null; }

/** The main colour and its readable text colour on an element (CSS variables only). */
export function paintAccent(/** @type {HTMLElement} */ el, /** @type {string} */ accent, /** @type {string} */ ink) {
  if (!accent) return;
  el.style.setProperty("--accent", accent);
  el.style.setProperty("--accent-ink", ink);
}

/**
 * Builds a photo stack before `anchor`. `marquee` = the running band text under the photos ("" = no band).
 * @param {Element} anchor
 * @param {Shot[]} shots
 * @param {{ mode: string, dirs: string[], accent?: string, ink?: string, marquee?: string, caption?: { title: string, price: string, badge?: string } | null }} o
 * @returns {Stack}
 */
export function mountStack(anchor, shots, o) {
  install();
  const mode = MODES[/** @type {keyof typeof MODES} */ (o.mode)] || MODES.cinematic;
  const el = document.createElement("div");
  el.className = "mo-stack";
  el.dataset.mode = o.mode;
  el.style.setProperty("--open", mode.open + "s");
  if (mode.flash) el.dataset.flash = "1";
  paintAccent(el, o.accent || "", o.ink || "#fff");
  const holder = document.createElement("div");
  el.append(holder);
  if (o.marquee) {
    const band = document.createElement("div");
    band.className = "mo-marq"; band.setAttribute("aria-hidden", "true");
    const track = document.createElement("div");
    track.className = "mo-track";
    for (let i = 0; i < 8; i++) { const s = document.createElement("span"); s.textContent = o.marquee + " ✦"; track.append(s); }
    band.append(track);
    el.append(band);
  }
  anchor.before(el);
  /** @type {HTMLElement[]} */ let secs = [];
  let key = "";
  /** @type {Stack} */
  const ctl = {
    el,
    /** @param {Shot[]} list */
    setImages(list) {
      const next = list.filter(s => s && typeof s.src === "string").slice(0, 12);
      const k = next.map(s => s.src).join("|");
      if (!next.length || k === key) return;
      key = k;
      holder.replaceChildren(...next.map((s, i) => {
        const sec = document.createElement("figure");
        sec.className = "mo-sec" + (i === 0 ? " mo-first" : "");
        sec.dataset.dir = i === 0 ? "open" : (o.dirs[i - 1] === "top" ? "top" : "side");
        const wrap = document.createElement("div");
        wrap.className = "mo-wrap";
        const img = document.createElement("img");
        img.src = s.src; img.alt = s.alt || ""; img.decoding = "async";
        if (i) img.loading = "lazy";
        img.addEventListener("load", () => { ctl.measure(); ctl.update(); });
        wrap.append(img);
        if (i === 0) { const f = document.createElement("div"); f.className = "mo-flash"; wrap.append(f); }
        if (i === 0 && o.caption) {
          // Name and price over the first photo (campaign pages without a campaign photo of their own).
          const cap = document.createElement("div"); cap.className = "mo-cap";
          const b = document.createElement("b"), mark = document.createElement("span");
          mark.className = "mo-mark"; mark.textContent = o.caption.title; b.append(mark); cap.append(b);
          if (o.caption.price) { const p = document.createElement("span"); p.className = "mo-price"; p.textContent = o.caption.price; cap.append(p); }
          if (o.caption.badge) { const n = document.createElement("span"); n.className = "mo-badge"; n.textContent = o.caption.badge; wrap.append(n); }
          wrap.append(cap);
        }
        const g = document.createElement("div"); g.className = "mo-glint"; wrap.append(g);
        sec.append(wrap);
        return sec;
      }));
      secs = /** @type {HTMLElement[]} */ ([...holder.children]);
      delete el.dataset.ready; void el.offsetWidth;
      el.dataset.ready = "1"; // replays the circle opening for the new photos (a colour change)
      ctl.measure(); ctl.update();
    },
    measure() {
      const vh = innerHeight;
      secs.forEach(s => s.style.setProperty("--top", reduce() ? "0px" : Math.min(0, vh - s.offsetHeight) + "px"));
    },
    update() {
      if (reduce() || !el.isConnected) return;
      const vh = innerHeight;
      secs.forEach((s, i) => {
        const wrap = /** @type {HTMLElement} */ (s.firstElementChild), r = s.getBoundingClientRect();
        if (i > 0) {
          const p = clamp((vh - r.top) / (vh * mode.span), 0, 1), e = ease(p), k = 1 - e;
          wrap.style.transform = s.dataset.dir === "side"
            ? `translateX(${(k * mode.travel).toFixed(2)}%) rotateY(${(k * -mode.turn).toFixed(2)}deg) scale(${(1 + k * mode.zoom).toFixed(3)})`
            : `translateY(${(k * -mode.travel).toFixed(2)}%) rotateX(${(k * mode.turn).toFixed(2)}deg) rotate(${(k * -mode.tilt).toFixed(2)}deg) scale(${(1 + k * mode.zoom).toFixed(3)})`;
          wrap.style.opacity = (0.3 + e * 0.7).toFixed(3);
          if (p > 0.97 && !s.dataset.shone) { s.dataset.shone = "1"; s.querySelector(".mo-glint")?.classList.add("go"); }
        }
        const next = secs[i + 1] || el.querySelector(".mo-marq") || el.nextElementSibling;
        const t = next ? clamp(1 - next.getBoundingClientRect().top / vh, 0, 1) : 0;
        s.style.transform = `scale(${(1 - t * mode.shrink).toFixed(3)}) rotate(${((i % 2 ? 1 : -1) * t * 2).toFixed(2)}deg)`;
        s.style.filter = `brightness(${(1 - t * mode.dim).toFixed(3)})` + (mode.blur ? ` blur(${(t * mode.blur).toFixed(2)}px)` : "");
      });
    },
    destroy() { stacks.delete(ctl); el.remove(); },
  };
  stacks.add(ctl);
  ctl.setImages(shots);
  return ctl;
}

/** The scroll hint capsule (one per page). Hidden for good after the first scroll. */
export function mountHint(/** @type {string} */ text, /** @type {string} */ accent = "", /** @type {string} */ ink = "#fff") {
  install();
  if (!hint || !hint.isConnected) {
    hint = document.createElement("div");
    hint.className = "mo-hint"; hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<div class="mo-pill"><span class="mo-ico"><svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></span><span class="mo-txt"></span></div>';
    document.body.append(hint);
  }
  /** @type {HTMLElement} */ (hint.querySelector(".mo-txt")).textContent = text;
  paintAccent(hint, accent, ink);
  hint.classList.toggle("hide", userScrolled);
  return hint;
}

/** The product photo flies from the add button to the bag link; then the bag shakes and the counter grows. */
export function flyToBag(/** @type {Element} */ from, /** @type {string|undefined} */ src, /** @type {HTMLElement|null} */ bag, /** @type {HTMLElement|null} */ count) {
  install();
  const done = () => {
    for (const [n, cls] of /** @type {[HTMLElement|null, string][]} */ ([[bag, "mo-shake"], [count, "mo-pop"]])) {
      if (!n) continue;
      n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls);
    }
  };
  if (reduce() || !bag || !src) { done(); return; }
  const a = from.getBoundingClientRect(), b = bag.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "mo-fly"; f.setAttribute("aria-hidden", "true");
  f.style.backgroundImage = `url("${src.replace(/["\\]/g, "")}")`;
  f.style.left = (a.left + a.width / 2 - 32) + "px"; f.style.top = (a.top + a.height / 2 - 32) + "px";
  document.body.append(f);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px,${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.3)`;
    f.style.opacity = ".4";
  }));
  setTimeout(() => { f.remove(); done(); }, 820);
}

/** @type {Stack|null} */ let pageStack = null;
/**
 * Product page: a design with a motion mode replaces the photo carousel with the stack (same photos); "none" undoes it.
 * @param {{ motion: { mode: string, dirs: string[], hint: string }, accent: string }} d
 * @param {typeof import("./studio-design.js")} s the Studio module the page already loaded (main-colour ink, default hint)
 * @param {Shot[]} shots
 */
export function pageMotion(d, s, shots) {
  const root = document.documentElement, ink = s.inkFor(d.accent);
  pageStack?.destroy(); pageStack = null; delete root.dataset.motion;
  const anchor = document.querySelector("main.page .media")?.firstElementChild;
  if (d.motion.mode === "none" || !anchor) { removeHint(); return; }
  const title = String(document.getElementById("lpTitle")?.textContent || "").trim();
  root.dataset.motion = d.motion.mode;
  pageStack = mountStack(anchor, shots, { mode: d.motion.mode, dirs: d.motion.dirs, accent: d.accent, ink,
    marquee: (title ? title + " · " : "") + "الدفع عند الاستلام" });
  mountHint(d.motion.hint || s.DEFAULT_HINT, d.accent, ink);
}
/** The chosen colour's photos go into the product page stack. */
export const pageShots = (/** @type {Shot[]} */ shots) => pageStack?.setImages(shots);
