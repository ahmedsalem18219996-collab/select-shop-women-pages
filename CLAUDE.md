# SELECT SHOP WOMEN — Frontend (select-shop-women-pages)

## What this repo is
Live storefront + admin for SELECT SHOP WOMEN (women's clothing, Egypt, Cash on Delivery).
- Site: https://selectshopeg.com/  — Admin: https://selectshopeg.com/admin/
- Static HTML/CSS/Vanilla JS (ES modules) on GitHub Pages. NOT Next.js, NOT React. Do not introduce frameworks or heavy UI libraries.
- Branch `release` = production. Merging into `release` auto-deploys to GitHub Pages.
- Backend lives in the separate private repo `select-shop-women-staging` + Supabase project `byluoipdunralsurwebt`.
- Background: `docs/HANDOVER-2026-11-05.md` (public summary). The full internal handover is in the private backend repo only.
- This file is the only Claude instruction file for this repo. Do not add a second one (`.claude/CLAUDE.md`) that could conflict with it.

## Roles
- Project manager: ChatGPT — plans tasks and reviews results.
- Executor: Claude Code (you) — the only executor. Implements exactly the task given, then reports.
- Owner (the user) — approves every merge, deploy, DB change, campaign and ad spend.

## Hard rules
1. Never push directly to `release` or `main`. Never merge or deploy without the owner's explicit approval in this session. Work on a feature branch and open a PR.
2. Never touch production data. Supabase `byluoipdunralsurwebt` is named "staging" but IS PRODUCTION with real orders. Read-only queries only, and only when the task says so. Any read from production returns aggregated counts only — never customer rows or personal data. Any exception needs the owner's explicit approval first.
3. Never print, commit or ask for secrets (service role keys, tokens, passwords). Never show customer PII (names, phones, addresses).
4. Never change DNS, CNAME, domain or GitHub workflow permissions.
5. Never rename/renumber SKUs or change old landing-page and ad links (`/lp/<id>/`, `/lp/?p=CODE`, their redirects and UTM parameters). Never merge historical products in the DB.
6. Generated LP pages (`lp/<id>/index.html`) are built by `tooling/build-lp.mjs` from `tooling/pages/*.json` — edit the source, then rebuild; do not hand-edit only the output.
7. Prices, shipping and totals are always computed server-side (Quote API). The browser never invents a price.
8. Supplier cost and profit are Owner-only. Never expose them to Staff or to public pages/APIs.
9. Analytics (GA4 / Meta Pixel) must never block checkout and must never receive PII.
10. Keep projects separate: never mix SELECT-SHOP-CLEAN, SS-DEALS or Petroleum Radar code, data or keys into this repo.
11. Ads: never create, start or resume a campaign, and never change a budget, until a Production end-to-end test has passed and the owner approves. Any new campaign is created Paused.
12. This repo is public. Internal operational or security details (DB internals, permission gaps, troubleshooting of production) go to the private backend repo, not here.

## Design system (Soft Luxury)
Ivory #F8F5F2 · Mauve #765268 · Dusty Rose #D4A4AF · Champagne #C3A582 · Ink Plum #302630 text.
Egyptian Arabic, RTL, mobile-first, tap targets ≥ 44px, readable contrast. Product photos matter more than decoration.

## Quality gate before any PR
```
cd tooling && npm ci
npm run lint && npm run typecheck && npm run test:unit
npx playwright test
npx lhci autorun --config=lighthouserc.json
for f in pages/*.json; do node build-lp.mjs "$(basename "$f" .json)" --check; done; node build-lp.mjs shell --check
```
Report: passed / failed / skipped counts. Skipped is NOT passed — list why each skip happens if relevant.
The 14 skips today are desktop copies of mobile-only tests (cold ad-link throttling, one-pass LP catalog); their mobile runs must pass.

## How to report back (every task)
Write a short report in Arabic with:
- What you changed (files) and why
- Test results (numbers)
- What is proven vs. only tested on Mock vs. not tested
- Anything risky, unclear or needing the owner's decision
Always separate: code written / passed on Mock / deployed / proven on real production.
