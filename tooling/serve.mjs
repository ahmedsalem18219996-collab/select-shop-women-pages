// Isolated QA server: serves this repo like GitHub Pages and replaces the WOMEN Supabase origin with an
// in-memory mock of the same Edge Function contract (catalog, cart, quote, orders, views). Orders live only in memory;
// only public product photos are still read from the public storage CDN so old and new pages compare fairly.
//   PORT=4173 MOCK_DELAY_MS=0 node serve.mjs      GET /__mock/log  -> what the browser sent
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "tooling", "fixtures");
const PORT = Number(process.env.PORT || 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROD = "https://byluoipdunralsurwebt.supabase.co";
const DELAY = Number(process.env.MOCK_DELAY_MS || 0);
const SHIPPING = 7000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif",
  ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };

export const log = { orders: [], cartAdds: [], views: 0 };
const keys = new Map(); // idempotencyKey -> public order code

const product = async (code) => /^SS-\d{4,19}$/.test(code)
  ? JSON.parse(await readFile(path.join(FIX, code + ".product.json"), "utf8").catch(() => "null")) : null;
const variantOf = (p, line) => p?.variants.find(v => JSON.stringify(v.selection) === JSON.stringify(line.selection));
const money = (amountMinor) => ({ currency: "EGP", amountMinor });

async function quote(lines) {
  let subtotal = 0; const out = [];
  for (const l of lines) {
    const p = (await product(l.publicCode))?.product, v = variantOf(p, l);
    if (!p || !v?.purchasable || l.structureVersion !== p.structureVersion) return null;
    subtotal += v.unitPrice.amountMinor * l.quantity;
    out.push({ title: p.title, quantity: l.quantity, address: { publicCode: l.publicCode } });
  }
  return { lines: out, merchandiseSubtotal: money(subtotal), shippingTotal: money(SHIPPING), grandTotal: money(subtotal + SHIPPING), purchasable: true };
}

async function mockApi(req, url, body) {
  const p = url.pathname.replace(/^\/__mock\/functions\/v1/, "");
  if (p === "/women-store-bridge/catalog") return [200, JSON.parse(await readFile(path.join(FIX, "catalog.json"), "utf8"))];
  if (p === "/women-product-views" && req.method === "POST") { log.views++; return [204, null]; }
  const c = p.replace(/^\/women-checkout/, "");
  if (req.method === "GET" && c.startsWith("/product/")) {
    const data = await product(decodeURIComponent(c.slice(9)));
    return data ? [200, data] : [404, { error: "not_found" }];
  }
  if (c === "/checkout-config") return [200, { enabled: true, mode: "internal" }];
  if (c === "/regions") return [200, { regions: [{ key: "cairo", label: "القاهرة" }, { key: "giza", label: "الجيزة" }] }];
  if (c === "/cart/add" && req.method === "POST") {
    const v = variantOf((await product(body?.publicCode))?.product, body || {});
    log.cartAdds.push(body);
    return v?.purchasable ? [200, { ok: true }] : [409, { error: "unavailable" }];
  }
  if (c === "/cart/resolve" && req.method === "POST") {
    // Cart page contract (js/commerce.js showCart/cartRow): per-line address, title, prices, status, image.
    let subtotal = 0, ready = true; const out = [];
    for (const l of (body?.lines || []).slice(0, 50)) {
      const p = (await product(l.publicCode))?.product, v = variantOf(p, l);
      const ok = !!(p && v?.purchasable && l.structureVersion === p.structureVersion);
      ready &&= ok;
      const unit = ok ? v.unitPrice.amountMinor : 0;
      subtotal += unit * l.quantity;
      const photo = p?.media?.find(m => m.isPrimary) || p?.media?.[0];
      out.push({ address: { publicCode: l.publicCode, structureVersion: l.structureVersion, selection: l.selection }, title: p?.title || l.publicCode,
        quantity: l.quantity, unitPrice: money(unit), lineTotal: money(unit * l.quantity), status: ok ? "ok" : "unavailable",
        options: [], ...(photo ? { image: { url: photo.url, altText: p.title } } : {}) });
    }
    return [200, { lines: out, subtotal: money(subtotal), checkoutReady: ready && out.length > 0 }];
  }
  if (c === "/checkout/quote" && req.method === "POST") {
    const q = await quote(body?.lines || []);
    return q ? [200, q] : [409, { error: "checkout_not_purchasable" }];
  }
  if (c === "/orders" && req.method === "POST") {
    const q = await quote(body?.lines || []);
    if (!q || !/^[0-9a-f]{32}$/.test(body?.idempotencyKey || "") || !body?.buyer?.name || !/^01\d{9}$/.test(body?.buyer?.phone || "")) return [400, { error: "invalid_request" }];
    if (body.confirmedGrandTotalPiastres !== q.grandTotal.amountMinor) return [409, { error: "checkout_changed" }];
    if (!keys.has(body.idempotencyKey)) {
      keys.set(body.idempotencyKey, "ORD-" + String(23456789 + keys.size).replace(/[01]/g, "2"));
      log.orders.push({ lines: body.lines, region: body.deliveryRegionKey, total: q.grandTotal.amountMinor });
    }
    return [200, { publicOrderCode: keys.get(body.idempotencyKey) }];
  }
  return [404, { error: "not_found" }];
}

async function serveFile(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || rel.includes("/tooling/node_modules")) { res.writeHead(403).end(); return; }
  let s = await stat(file).catch(() => null);
  if (s?.isDirectory()) {
    if (!rel.endsWith("/")) { res.writeHead(301, { Location: rel + "/" + url.search }).end(); return; }
    file = path.join(file, "index.html"); s = await stat(file).catch(() => null);
  }
  if (!s?.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); return; }
  const ext = path.extname(file);
  let data = await readFile(file);
  if (/\.(html|js|mjs|css|json)$/.test(ext)) data = Buffer.from(data.toString("utf8").replaceAll(PROD + "/functions/v1", ORIGIN + "/__mock/functions/v1"));
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" };
  // GitHub Pages gzips text responses; do the same so Lighthouse measures realistic transfer sizes.
  if (/\.(html|js|mjs|css|json|svg|txt)$/.test(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    data = gzipSync(data);
    Object.assign(headers, { "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
  }
  res.writeHead(200, headers).end(data);
}

export function start(port = PORT) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, ORIGIN);
      if (url.pathname === "/__mock/log") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(log)); return; }
      if (url.pathname.startsWith("/__mock/")) {
        let raw = ""; for await (const chunk of req) raw += chunk;
        let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        if (DELAY) await new Promise(r => setTimeout(r, DELAY));
        const [code, payload] = url.pathname.startsWith("/__mock/functions/v1/") ? await mockApi(req, url, body) : [404, { error: "not_found" }];
        res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(payload === null ? "" : JSON.stringify(payload));
        return;
      }
      await serveFile(req, res, url);
    } catch (e) { res.writeHead(500).end(String(e?.message || e)); }
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => { console.log(`QA server ${ORIGIN}`); r(server); }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
