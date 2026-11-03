# SELECT SHOP WOMEN — premium pass (2026-11-04)

Branch `feature/women-premium-polish-20261104`, cut from `origin/release` (live code, includes merged PR #41–#44).
Nothing was deployed, merged, or written to any database. All tests and screenshots ran against the local mock
(`tooling/serve.mjs`), so no GA4 hits, product-view counts, or orders reached production.

## What changed

### Landing pages (all 46 pages + the automatic `/lp/?p=` page, regenerated from `tooling/build-lp.mjs`)
| Problem on live (mobile) | Fix |
|---|---|
| Header broken: «اطلبي إطلالتك» overlapped the logo, the bag counter wrapped as `(0` / `)` | One-line header: logo · jump link · bag, nothing wraps |
| Photo cropped to a 330px strip under a slogan | Product photo first, full width, 4:5 (same image file, so LCP unchanged) |
| «تأكيد الطلب» wrapped to two lines in the sticky bar | Both buttons share the bar and stay on one line |
| Colour picker inside the order form sat at the very bottom (mobile) / above the heading (desktop) | Under «اطلبي دلوقتي», before quantity and fields |
| Photo zoom only on SS-1011 | Every product page: tap a photo → full-size original (loaded only when opened) |
| No reassurance near the price | Trust strip: الدفع عند الاستلام · شحن لكل المحافظات · الإجمالي واضح قبل التأكيد (same promises already in the notes list) |
| Raw description lines («اللون:بني / ONE SIZE») floating at the end | Titled «تفاصيل القطعة» |

Unchanged on purpose: runtime/order logic, both colour pickers (tested behaviour from earlier PRs), cart button,
COD-only flow, A/B snippet, prefetch, GA4/Meta tags, URLs and redirects.

### Admin (products list)
The on-demand note and status counts were two large cards; on a phone, staff scrolled ~1700px before reaching search
and products. Now one compact card: one-line on-demand reminder (full text expands), 4 status tiles in one row.
Search and the first product are on the first screen. Text, links and counts are the same.

## Test results (local, Windows)
| Suite | Before (release) | After |
|---|---|---|
| Unit (`node --test`) | 101/102 (1 = CRLF checkout artifact) | 103/103 (+1 new test) |
| E2E Playwright, mobile + desktop | 142 passed · 14 skipped · 2 failed | 142 passed · 14 skipped · 2 failed |

The 2 e2e failures are the same in both runs: `sweater-campaign.spec.mjs:34` builds a file path with
`new URL().pathname`, which becomes `D:\D:\…` on Windows. Test bug, not a site bug; passes on Linux CI.

Cold ad-link loads (Facebook/Instagram in-app, slow 4G), hero LCP:

| Page | Before | After |
|---|---|---|
| /lp/ballon-suit/ | 1480 ms | 1228 ms |
| /lp/ss-1008/ | 1208 ms | 1272 ms |
| /lp/?p=SS-1099 | 1864 ms (CLS 0.043) | 1576 ms (CLS 0) |

Interaction (INP proxy, Event Timing on the size tap, `lp.spec.mjs`): 24–32 ms before and 24–32 ms after (target ≤ 200 ms).
CLS on every measured cold load: ≤ 0.014 after (target ≤ 0.1).

Lighthouse lab scores: Lighthouse could not launch Chrome on this Windows machine (`spawn UNKNOWN`), so it was not run
locally. The PR's CI (`women-lp-ci.yml`, `women-storefront-perf.yml`) runs Lighthouse on Linux against the same mock
and reports it on the PR.

## Not done / blockers
- **Home page redesign**: not touched. It already passed the premium storefront tests; a redesign needs an approved Figma direction (Figma MCP is not authorised in this session).
- **CLEAN reuse**: CLEAN is Next.js/React with its own database and roles; WOMEN is static HTML + vanilla JS. No component can be copied without a framework migration. The patterns CLEAN uses (one product sheet, colour × size matrix, per-variant photos, status controls) already exist in WOMEN Admin since #42–#44.
- **Live GA4 numbers in Admin**: still via GA4 report import (#44). A live feed needs a backend GA4 Data API service account — a backend change, not in this PR.
- **Production field data** (real-user LCP/INP): needs the deployed site; measure after release.
- Backend draft PRs (#43–#54 in staging) were not touched; nothing here depends on them.
