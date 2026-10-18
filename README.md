# SELECT SHOP WOMEN — publishing output only

This repository exists solely to publish the **one approved SELECT SHOP WOMEN** customer-facing static site on GitHub Pages when release gates pass. It is **not a second shop, project or design**.

- Private source of truth: `ahmedsalem18219996-collab/select-shop-women-staging` (PR #33 migration under QA).
- Customer design: frozen original Claude WOMEN storefront only; no Lookbook v3 or additional frontend.
- Backend, orders, shipping, products, media and Owner/Staff authentication: Supabase **WOMEN-only** project.
- Public distribution will contain **only compiled static HTML/CSS/JS/fonts/images**. No application server source, build secrets, customer records, credentials or Supabase service-role keys.
- The old `select-shop-sk-landing` repository is kept as an archive/rollback source only.
- `SELECT-SHOP-CLEAN` is unrelated and MUST NEVER be touched.

**Status:** NOT RELEASED. No GitHub Pages hosting, `selectshopeg.com` cutover or Netlify deletion has been requested from this distribution repo. The public site will be enabled only after full quote, COD, rate limiting, Owner/Staff and browser validation.

Do not manually push site source into this repo or use it for staging multiple designs.
