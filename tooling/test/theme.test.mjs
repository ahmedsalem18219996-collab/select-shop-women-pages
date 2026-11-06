import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { THEME_BOOT, THEME_TOGGLE, SHARED_THEME } from "../build-lp.mjs";

// Dark / Light theme (2026-11-06): one boot script and one switch, identical on every public page, and a Light palette that meets AA.
const source = (p) => readFile(new URL("../../" + p, import.meta.url), "utf8");
const STATIC = ["index.html", "p/index.html", "cart/index.html", "checkout/index.html", "order-success/index.html"];
const BOOT = `<script id="theme-boot">${THEME_BOOT}</script>`;
const count = (s, x) => s.split(x).length - 1;

async function allPages() {
  const lps = (await readdir(new URL("../../lp/", import.meta.url), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => `lp/${d.name}/index.html`);
  const pages = [...STATIC, "lp/index.html"];
  for (const p of lps) if (await source(p).then(() => true, () => false)) pages.push(p);
  return pages;
}

test("every public page sets the theme before any style and carries one Sun/Moon switch", async () => {
  const pages = await allPages();
  assert.ok(pages.length > 40, "landing pages found");
  for (const p of pages) {
    const html = await source(p);
    assert.equal(count(html, BOOT), 1, p + " theme boot");
    assert.equal(count(html, THEME_TOGGLE), 1, p + " theme switch");
    const at = html.indexOf(BOOT);
    assert.ok(at > html.indexOf('<meta name="theme-color" content="#050B1C">'), p + ": boot runs after the theme-color meta it updates");
    for (const css of ["<style", '<link rel="stylesheet"']) {
      const first = html.indexOf(css);
      assert.ok(first === -1 || at < first, p + ": boot runs before " + css + " (no flash of the wrong theme)");
    }
    assert.ok(at < html.indexOf("<body"), p + ": boot in <head>");
  }
});

test("landing pages inline the same Light block as the storefront sheet", async () => {
  const sheet = (await source("css/atelier-site.css")).replace(/\r\n/g, "\n");
  assert.ok(sheet.includes(SHARED_THEME));
  for (const p of await allPages()) if (p.startsWith("lp/")) assert.ok((await source(p)).includes(SHARED_THEME), p + " light block is stale: rebuild with build-lp.mjs");
});

test("boot script: Dark by default, saved Light restored, unknown values and blocked storage fall back to Dark", () => {
  const run = (stored, throws = false) => {
    const root = { dataset: {} }, meta = { content: "#050B1C" }, listeners = {};
    const doc = { documentElement: root, querySelector: () => meta, querySelectorAll: () => [], addEventListener: (t, f) => { listeners[t] = f; } };
    const storage = { getItem: () => { if (throws) throw new Error("blocked"); return stored; }, setItem: (k, v) => { storage.saved = [k, v]; } };
    new Function("document", "localStorage", "addEventListener", "Element", THEME_BOOT)(doc, storage, () => {}, class {});
    return { theme: root.dataset.theme, meta: meta.content };
  };
  assert.deepEqual(run(null), { theme: "dark", meta: "#050B1C" });
  assert.deepEqual(run("light"), { theme: "light", meta: "#F7F3EC" });
  assert.deepEqual(run("dark"), { theme: "dark", meta: "#050B1C" });
  assert.deepEqual(run("<script>"), { theme: "dark", meta: "#050B1C" });
  assert.deepEqual(run("light", true), { theme: "dark", meta: "#050B1C" });
});

test("Light palette meets WCAG AA (text 4.5:1, borders/focus 3:1); Dark tokens unchanged", async () => {
  const light = Object.fromEntries([...SHARED_THEME.match(/:root\[data-theme="light"\]\{([^}]*)\}/)[1].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
  const lum = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const text = [["ink", "bg"], ["ink", "chalk"], ["ink", "elev"], ["muted", "bg"], ["muted", "chalk"], ["muted", "elev"], ["cyan", "bg"], ["cyan", "chalk"], ["cyan", "elev"], ["danger", "bg"], ["danger", "chalk"], ["bg", "cyan"]];
  for (const [f, b] of text) assert.ok(ratio(light[f], light[b]) >= 4.5, `${f} on ${b}: ${ratio(light[f], light[b]).toFixed(2)}`);
  assert.ok(ratio("#FFFFFF", light.accent) >= 4.5, "white on the purple buy button");
  assert.ok(ratio("#FFFFFF", light["accent-hover"]) >= 4.5, "white on the hovered buy button");
  assert.ok(ratio(light.field, light.elev) >= 3, "input border");
  assert.ok(ratio(light.cyan, light.bg) >= 3, "focus ring / selection frame");
  assert.equal(light.accent, "#D100D1"); // same neon purple buy button in both modes
  const sheet = await source("css/atelier-site.css");
  assert.match(sheet, /:root\{\n --bg:#050B1C;--mirror:#050B1C;--chalk:#0B1730;--elev:#111F3A;--surface:#F4F6FA;/); // Dark default untouched
});
