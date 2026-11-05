// One-off palette pass (2026-11-05): "Maison" ink/ivory/gold -> "Soft Luxury" ivory/mauve/plum/rose/champagne.
// Mauve carries actions (6.1:1 on ivory, white on it 6.6:1); plum ink carries text; rose/champagne only decorate.
//   node tooling/soft-luxury.mjs css/atelier-site.css ...   (idempotent: re-running changes nothing)
import { readFileSync, writeFileSync } from "node:fs";
export const PAIRS = [
  // text on a dark fill now sits on mauve: plain white reads best
  [/color:#f5f1ea/g, "color:#fff"],
  [/background(-color)?:var\(--ink\)/g, "background$1:var(--accent)"],
  [/border(-color)?:(1px solid )?var\(--ink\)/g, "border$1:$2var(--accent)"],
  [/color:var\(--gold\)/g, "color:var(--accent)"],
  [/#141310/gi, "#302630"], [/#f5f1ea/gi, "#F8F5F2"], [/#ece5d9/gi, "#F3E8EB"], [/#ddd5c7/gi, "#E6D9DD"], [/#6f685c/gi, "#6B5B66"],
  [/#b08d57/gi, "#C3A582"], [/#cfc8bb/gi, "#E6D9DD"], [/#4a453d/gi, "#6B5B66"], [/#f1eadd/gi, "#F3E8EB"], [/#f8f4ed/gi, "#F8F5F2"],
  [/#ede1d0/gi, "#EFDFE4"], [/#faf8f4/gi, "#FBF8F7"], [/#f3eee5/gi, "#F6EEF0"], [/#e9e1d3/gi, "#EEE2E6"], [/#3a362f/gi, "#4A3B47"],
  [/rgba\(245,241,234,/g, "rgba(248,245,242,"], [/rgba\(20,19,16,/g, "rgba(48,38,48,"], [/rgba\(176,141,87,/g, "rgba(195,165,130,"],
];
export const convert = (css) => PAIRS.reduce((s, [a, b]) => s.replace(a, b), css);
if (process.argv[1]?.endsWith("soft-luxury.mjs")) for (const f of process.argv.slice(2)) {
  const before = readFileSync(f, "utf8"), after = convert(before);
  if (after !== before) writeFileSync(f, after);
  console.log(f, after === before ? "unchanged" : "updated");
}
