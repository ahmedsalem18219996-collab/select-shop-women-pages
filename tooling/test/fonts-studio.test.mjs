import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

// The 6 Studio fonts are hosted on this site: every @font-face points at a woff2 file in assets/fonts/studio/.
test("css/fonts-studio.css: 6 families, self-hosted files only, all present, licence shipped", async () => {
  const css = await readFile(new URL("../../css/fonts-studio.css", import.meta.url), "utf8");
  const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 6);
  for (const u of urls) {
    assert.match(u, /^\.\.\/assets\/fonts\/studio\/[\w.-]+\.woff2$/, u);
    await access(new URL("../../css/" + u, import.meta.url));
  }
  const families = new Set([...css.matchAll(/font-family:\s*['"]?([^;'"]+)/g)].map(m => m[1].trim()));
  assert.deepEqual([...families].sort(), ["Aref Ruqaa", "Cairo", "Changa", "El Messiri", "Lalezar", "Marhey"]);
  assert.doesNotMatch(css, /googleapis|gstatic|https?:/);
  await access(new URL("../../assets/fonts/studio/LICENSE-OFL.txt", import.meta.url));
});
