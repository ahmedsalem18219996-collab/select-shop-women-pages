// Real-browser check of Admin photo uploads: big camera files go through the actual product media screen
// (preview tile, progress, compression), the upload request is answered in memory, and the uploaded file is
// compared with the original (size, dimensions, PSNR). No login, nothing reaches Supabase.
//   PORT=4180 node serve.mjs &   node upload-bench.mjs 2mb.jpg 10mb.jpg 20mb.jpg
import { chromium, devices } from "@playwright/test";
import sharp from "sharp";
import { statSync } from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:4180") + "/admin/";
const files = process.argv.slice(2);
if (!files.length) { console.error("usage: node upload-bench.mjs <image>..."); process.exit(1); }

const product = { public_code: "SS-1088", title: "منتج اختبار الصور", status: "draft", category: "بلوفرات", description: "",
  base_price: { amount_minor: 65000 }, structure_version: 1, shipping_profile: { key: "women_standard", name: "شحن عادي" },
  variants: [{ position: 0, active: true, availability: "available", amount_minor: 65000, price_source: "base", selections: [] }], options: [], publish_blockers: [] };
const uploads = [];

function imagePart(body, contentType) {
  const boundary = Buffer.from("--" + /boundary=(.+)$/.exec(contentType)[1]);
  for (let at = body.indexOf(boundary); at !== -1;) {
    const next = body.indexOf(boundary, at + boundary.length);
    if (next === -1) break;
    const part = body.subarray(at + boundary.length + 2, next - 2), head = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, head).toString();
    if (/name="image"/.test(headers)) return { type: /Content-Type: (\S+)/i.exec(headers)?.[1], bytes: part.subarray(head + 4) };
    at = next;
  }
  return null;
}

const browser = await chromium.launch();
for (const [dev, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...opts, bypassCSP: true }), page = await ctx.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem("wa.session", JSON.stringify({ access_token: "local-qa-only", refresh_token: "x", expires_at: Date.now() + 3600000, email: "qa-owner@example.test" }));
    sessionStorage.setItem("wa.ptab", "media");
  });
  await page.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const reply = (payload) => route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (url.pathname.endsWith("/women-admin/media/upload")) {
      const part = imagePart(req.postDataBuffer(), req.headers()["content-type"]);
      uploads.push({ dev, ...part });
      // FAIL_AT=n: the n-th upload of each run is refused, to check that nothing is silently replaced.
      if (Number(process.env.FAIL_AT) === uploads.filter((u) => u.dev === dev).length) return reply({ outcome: "error", message: "storage_unavailable" });
      return reply({ outcome: "saved", data: {} });
    }
    if (url.pathname.endsWith("/women-admin/call")) {
      const { op } = JSON.parse(req.postData() || "{}");
      if (op === "session.get") return reply({ outcome: "ok", data: { email: "qa-owner@example.test", role: "owner", permissions: [] } });
      if (op === "products.get") return reply({ outcome: "ok", data: { product, card: { category: "بلوفرات", is_new: false, image: null }, stock: { 0: { quantity: 20 } },
        media: { media: [], structure_version: 1 }, shipping_profiles: [{ key: "women_standard", name: "شحن عادي" }], views: {}, activity: [] } });
      return reply({ outcome: "ok", data: [] });
    }
    if (url.hostname !== "127.0.0.1") return route.abort("blockedbyclient");
    return route.continue();
  });
  await page.goto(BASE + "#/products/SS-1088", { waitUntil: "domcontentloaded" });
  await page.locator("#file").waitFor({ state: "attached", timeout: 15000 }).catch(async (e) => { await page.screenshot({ path: "upload-bench-error.png" }); console.error(await page.evaluate(() => document.body.innerText.slice(0, 400))); throw e; });
  // The page swaps the preview tiles for the saved photos once a batch succeeds, so tile states are recorded as they change.
  await page.evaluate(() => {
    window.__tiles = [];
    new MutationObserver(() => document.querySelectorAll(".upload-tile").forEach((x, i) => {
      const now = [x.dataset.state, x.querySelector("small").textContent, Math.round(performance.now())];
      if (!window.__tiles[i] || window.__tiles[i][0] !== now[0] || window.__tiles[i][1] !== now[1]) window.__tiles[i] = now;
    })).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const t0 = await page.evaluate(() => performance.now());
  const before = uploads.length;
  await page.locator("#file").setInputFiles(files);
  await page.locator('.upload-tile[data-state="ok"]').first().waitFor({ timeout: 60000 });
  await page.locator('.media-grid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `upload-progress-${dev}.png` });
  // Done = the success or error message is shown (the last tile may be replaced by the saved photo in the same instant).
  for (const end = Date.now() + Number(process.env.WAIT || 180000); uploads.length - before < files.length && Date.now() < end;) await page.waitForTimeout(100);
  if (!process.env.FAIL_AT && uploads.length - before < files.length) throw new Error("not every photo reached the mock store");
  const doneAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(400);
  await page.waitForTimeout(600);
  await page.locator(".media-grid").scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `upload-done-${dev}.png` });
  const states = await page.evaluate(() => window.__tiles);
  console.log(`
[${dev}] ${files.length} photos, ${uploads.length - before} reached the (mock) store`);
  files.forEach((name, i) => { const [st, text, at] = states[i] || []; console.log(`  ${name}: ${st === 'busy' && i === files.length - 1 ? 'ok (saved; tile replaced by the photo)' : st} · ${text} · ${(((st === 'ok' ? at : doneAt) - t0) / 1000).toFixed(1)} s`); });
  await ctx.close();
}
await browser.close();

for (const [i, u] of uploads.entries()) {
  const src = files[i % files.length], out = sharp(u.bytes), m = await out.metadata();
  // PSNR of the uploaded photo against the original scaled to the same size (higher = closer; ≥ 38 dB is visually identical).
  const a = await sharp(src).resize(m.width, m.height).removeAlpha().raw().toBuffer(), b = await out.removeAlpha().raw().toBuffer();
  let se = 0; for (let k = 0; k < a.length; k++) se += (a[k] - b[k]) ** 2;
  const psnr = 10 * Math.log10(255 ** 2 / (se / a.length));
  console.log(`${u.dev} ${src}: ${(statSync(src).size / 1048576).toFixed(1)}MB → ${u.type} ${Math.round(u.bytes.length / 1024)}KB ${m.width}×${m.height} · PSNR ${psnr.toFixed(1)} dB`);
}
