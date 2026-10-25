// Markdown table of the representative (median) Lighthouse run per URL: node lh-summary.mjs <lhci outputDir>
import { readFile } from "node:fs/promises";
import path from "node:path";
const dir = process.argv[2] || ".lighthouseci/reports";
const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
const rows = ["| URL | Perf | LCP | FCP | TBT | CLS | Bytes |", "|---|---|---|---|---|---|---|"];
for (const m of manifest.filter(x => x.isRepresentativeRun)) {
  const r = JSON.parse(await readFile(m.jsonPath, "utf8")), a = r.audits;
  rows.push(`| ${new URL(m.url).pathname + new URL(m.url).search} | ${Math.round(r.categories.performance.score * 100)} | ${(a["largest-contentful-paint"].numericValue / 1000).toFixed(2)}s | ${(a["first-contentful-paint"].numericValue / 1000).toFixed(2)}s | ${Math.round(a["total-blocking-time"].numericValue)}ms | ${a["cumulative-layout-shift"].numericValue.toFixed(3)} | ${Math.round(a["total-byte-weight"].numericValue / 1024)} KB |`);
}
console.log(rows.join("\n"));
