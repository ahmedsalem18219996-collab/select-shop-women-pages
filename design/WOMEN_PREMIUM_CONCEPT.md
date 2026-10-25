# SELECT SHOP WOMEN — premium minimal, performance-first concept (review stage)

Status: **concept for owner review — not implemented, not deployed.** Independent of PR #18; every PR #18 improvement,
the legacy product links (`/p/?code=`, `/lp/?p=`) and the existing order system stay as they are.
Visual preview (private canvas): https://claude.ai/artifact/6YqyPJP4ed6uK1cUjQRHYY

- Row 1, mobile (390 px): Home · Product · ad Landing Page · Checkout · identity and components · loading plan and speed targets.
- Row 2, desktop (1280 px): Home · Product · Landing Page.
- Both Product artboards have a `multiSizePreview` tweak (S/M/L/XL, a sold-out size, and the "اختاري المقاس" order-button state).
  It is a design preview only; real products are still ONE SIZE and no product data is merged.

## Direction (v2, simplified)

Premium minimal fashion: quiet mauve, off-white, one gold accent, generous spacing, large product photos, no decorative
motion or effects. v1's pinking-shears masks, stitch dividers, Ruqaa display font and Marcellus wordmark were removed.

| Token | Hex | Use |
|---|---|---|
| Off-white | `#F8F5F4` | page ground |
| Mauve light | `#F1EAEE` | surfaces, image placeholders, announcement bar |
| Quiet line | `#E7DCE2` | borders and dividers |
| Mauve | `#7A5C71` | identity colour, "choose size" state (white text 4.7:1) |
| Aubergine | `#2A2129` | text and the order button |
| Gold thread | `#A8894E` | a 1–2 px line only: under the SELECT wordmark and under the selected colour/size; gold text `#7A6236` |

Type: **IBM Plex Sans Arabic only, weights 400 and 600** (tabular numbers for prices). The SELECT wordmark uses the same
font with wide tracking, so it needs no extra font file.

Signature: the **gold thread**, the one gold line under the wordmark and under whatever the shopper has selected.

## Buying flow

- Title and price on one line right under the photo; colour and size as 44 px pills with the colour **name** written
  (never colour alone); one sticky order bar showing price + chosen colour + size.
- Order button states: ready (server-verified price) · needs a choice ("اختاري المقاس", future multi-size) · unavailable ("—").
- Checkout keeps today's fields, logic and server quote; shipping and total show only after the governorate is chosen.
- Only real catalog data and the store's own payment/shipping notes; no ratings or reviews (none exist). Swatch hex values
  approximate the colour names.

## Performance first (ad links are priority 1)

Targets: Lighthouse mobile ≥ 95, LCP ≤ 2.0 s target / ≤ 2.5 s maximum, INP ≤ 200 ms, CLS ≤ 0.1.

1. Pre-rendered HTML (≤ 14 KB gzipped) already contains the hero `<picture>`, title, price and inline critical CSS: nothing waits for JS or the catalog.
2. Hero AVIF/WebP 480/800 w (≤ 45 KB), `fetchpriority="high"` + preload, explicit width/height.
3. One local font family, two subset WOFF2 files, `font-display: swap`, no font preload competing with the hero.
4. `lp/runtime.js` (≤ 10 KB, deferred module) re-checks this one product's price and availability on the server before the order button is enabled.
5. GA4 + Meta load after idle; events are queued and sent exactly once (PR #18 behaviour), so ad measurement stays accurate.
6. Video only on tap. No framework, no UI library, no full catalog download.
7. Ad URLs must be the exact form `https://selectshopeg.com/lp/<code>/`. Measured 25 Oct 2026: `http://` or `www.` adds one redirect (≈ +0.6 s),
   a missing trailing slash adds one (≈ +0.24 s); the exact URL has none.

Measured so far: old live LP 81 / LCP 4.86 s (local Lighthouse); PR #18 LP on GitHub Actions 99 / LCP 1.96–2.18 s.

## Test plan after approval (GitHub Actions only, mock API, no real orders)

- Lighthouse CI: score ≥ 0.95 and LCP ≤ 2000 ms as warnings, ≤ 2500 ms as errors, CLS ≤ 0.1, TBT ≤ 200 ms, on variants A and B.
- Playwright cold load: cache disabled, slow 4G and slow 3G network profiles, 4× CPU, LCP/CLS read from the browser,
  zero redirects on the ad URL.
- Facebook and Instagram in-app browser emulation (their user agents): the page renders, the order button works, events fire once.
- The existing PR #18 tests (price, Meta funnel, A/B attribution, order flow, legacy links) keep passing.
- A live cold-link check on the real domain only after an owner-approved release, read-only, with no submitted order.
