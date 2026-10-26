# Asset audit

How the design export's files were brought into the app. **The original export folder was not
modified or deleted**; all clean-up happened inside `EightyTwentyMobile/`.

> **Update 2026-10-26 (moved into the BOS repo as `mobile/`):** every in-app PNG (logos,
> wordmark, catering icons, grain texture, `branding/source/logo-circle-brown`) is now WebP, and
> photos with a long edge over 1200 px (cafés, catering, lifestyle, promo) were resized to 1200 px
> at quality 80. Only the four files Expo/the stores require as PNG stay PNG: `app-icon`,
> `adaptive-icon`, `splash-icon`, `favicon`. `assets/` went from 8.9 MB to 7.7 MB. The tables
> below still show the original `.png` names.

## Summary

| | Files | Size |
|---|---|---|
| Design export (excluding this project) | 133 | 23.5 MB |
| Referenced by the approved prototype | 107 (all migrated) | — |
| In the app's `assets/` | 112 | 8.9 MB |
| — copied byte-for-byte (mobile WebP photography) | 99 | |
| — resized from oversized PNGs | 8 | 1.9 MB → 0.33 MB |
| — generated (app icon, adaptive icon, splash, favicon, paper grain) | 5 | |
| Not migrated (kept in the export, reasons below) | 26 | 12.6 MB |

**Method.** Every image path referenced by `EightyTwenty App.dc.html`, `app-data.js` and
`mock-data.js` was extracted; each referenced file was migrated, and every other file in the
export was opened and classified by hand. Images are referenced in code by key through the
generated `src/assets/imageRegistry.ts` (`npm run images:registry`), so there are no loose
`require()` paths in screens and a missing file fails at build time.

## Migrated

### Photography (copied unchanged)

The export's `img-m/` folder already holds mobile-optimised WebP. Files were copied without
re-encoding and renamed (version suffixes like `-01` dropped; folders regrouped).

| Export folder | → App folder | Files | Used for |
|---|---|---|---|
| `img-m/menu-original/*` | `assets/images/menu/{coffee,drinks,food}` | 64 | Menu items, kitchen rail |
| `img-m/menu-studio/` | `assets/images/menu/smoothies` | 10 | Smoothie items |
| `img-m/loc/` | `assets/images/locations` | 13 | Café cards, café detail, home hero (`phillip-exterior-01` → `phillip.webp`) |
| `img-m/hero/` | `assets/images/hero` | 5 | Welcome orbit dishes and home |
| `img-m/catering/` | `assets/images/catering` | 3 | Catering packages |
| `img-m/promo/` | `assets/images/promo` | 2 | Offers / What's on |
| `img-m/lifestyle/` | `assets/images/lifestyle` | 2 of 5 | `brunch-table`, `table-spread` (What's on tiles) |

### Resized (shown far smaller than their source)

Downscaled with Lanczos to 3× their largest on-screen size, alpha preserved.

| Source | → App file | Before | After |
|---|---|---|---|
| `assets/icons/catering-bestfor.png` (1254 px) | `assets/icons/catering-bestfor.png` (132 px) | 525 KB | 15 KB |
| `assets/icons/catering-dietary.png` | `assets/icons/catering-dietary.png` | 416 KB | 12 KB |
| `assets/icons/catering-enquiry.png` | `assets/icons/catering-enquiry.png` | 298 KB | 9 KB |
| `assets/icons/catering-tailored.png` | `assets/icons/catering-tailored.png` | 640 KB | 15 KB |
| `assets/brand/logo-stacked-brown-trim.png` | `assets/branding/logo-stacked-brown.png` (354 px wide) | 86 KB | 44 KB |
| `assets/brand/logo-stacked-white.png` | `assets/branding/logo-stacked-white.png` (126 px high) | 42 KB | 10 KB |
| `assets/brand/wordmark-white.png` | `assets/branding/wordmark-white.png` (36 px high) | 29 KB | 6 KB |
| `assets/brand/logo-circle-brown.png` | `assets/branding/source/logo-circle-brown.png` (1024 px) | 238 KB | 215 KB |

`branding/source/logo-circle-brown.png` is not shown in the app. It is kept as the master for
regenerating the icons below.

### Generated

| File | From | Why |
|---|---|---|
| `assets/branding/app-icon.png` (1024 px) | circle logo on cream `#F5F0E8` | iOS/Android icon — the export had none |
| `assets/branding/adaptive-icon.png` | circle logo, transparent, Android safe zone | Android adaptive icon foreground |
| `assets/branding/splash-icon.png` | circle logo | Splash screen |
| `assets/branding/favicon.png` (48 px) | app icon | Web QA build |
| `assets/images/textures/grain.png` (180 px tile) | procedural, seeded | Replaces the prototype's CSS `feTurbulence` paper grain (espresso `rgb(64,43,31)` at ≤ 5.5% opacity) |

The generated icons are a reasonable starting point, **not brand-approved artwork** — see Manual review.

### Fonts

Newsreader and Figtree come from the `@expo-google-fonts` packages (the prototype loaded the
same families from Google Fonts), so no font files are stored in `assets/`.

## Not migrated

All of these remain untouched in the design export.

| File(s) | Size | Reason |
|---|---|---|
| `EightyTwenty App.dc.html`, `app-data.js`, `mock-data.js`, `ios-frame.jsx`, `support.js`, `github.md`, `.thumbnail` | 0.5 MB | Prototype source and tooling. Content was ported into code (fixtures, theme tokens, components); the files themselves aren't shipped. |
| `assets/brand/footer-illustration.png` (1203 × 665) | 142 KB | Brand illustration not referenced by the prototype. **Review** — could suit an About page or empty states. |
| `img-m/lifestyle/baristas.webp`, `overhead-hands.webp`, `smoothies-cheers.webp` | 0.33 MB | Brand photography not referenced by the prototype. **Review** — available for future offers/CMS content. |
| `uploads/` (15 files) | 11.95 MB | Design-process references, not app assets (below). |

### `uploads/` classification

None of these are referenced by the prototype. Several are **third-party designs** used as
inspiration; they must not ship in the app.

| File | Content | Notes |
|---|---|---|
| `affa90cf-e6dd-48e8-808c-9ab9bd33f3e2.png`, `affa90cf-…-61484e2b.png`, `pasted-1791452385830-0.png`, `pasted-1791452386982-0.png` | Third-party "Milk Tea Bar" loyalty app mock-up (2400 × 1800) | **Four visually identical copies**; bytes differ (metadata only) |
| `b3039185-5f58-463e-b94c-18bf2b37ed12.png`, `pasted-1791453895578-0.png` | Third-party burger restaurant app mock-up (1080 × 1080) | **Duplicate pair** |
| `cd2b579b-6671-4aec-a4eb-3530a62e00ce.png`, `pasted-1791449553157-0.png` | Third-party magazine spread ("Altero") (1400 × 934) | **Duplicate pair** |
| `pasted-1791447231452-0.png` | Third-party wine bar menu UI ("Le bedeau") | Typographic inspiration |
| `pasted-1791447232604-0.png` | Third-party coffee magazine spread ("Càffe") | Typographic inspiration |
| `pasted-1791455351915-0.png` | Third-party settings / profile UI kit | Layout inspiration |
| `pasted-1791448699487-0.png` | Floating bubble tab bar reference | The behaviour is implemented in code (`TabBar.tsx`) |
| `pasted-1791451792970-0.png` (450 × 153) | Screenshot of the prototype's coffee card row ("6/9") | Prototype screenshot |
| `pasted-1791468790475-0.png`, `pasted-1791468797405-0.png` (1254 × 1254) | Star-badge and cloche icons in the brand browns | Unused icon concepts, different style from the final catering icons. **Review** |

## Data-only assets (kept, not currently displayed)

`locations/braddon-interior.webp`, `locations/braddon-outdoor.webp` and
`locations/kingston-interior.webp` are listed as extra café photos in `mock-data.js` (`img2`/`img3`)
but the prototype never shows them. They are kept in the location `gallery` data so a future
café gallery can use them, and are flagged for review (≈ 0.63 MB).

## Manual review

1. **App icon, adaptive icon and splash** were generated from the circle logo — confirm with the brand owner or replace with supplied artwork.
2. `footer-illustration.png`, the three unused lifestyle photos and the two icon concepts — keep for future use, or drop.
3. The three gallery-only café photos — show them in a café gallery, or remove from the data.
4. Confirm that **no third-party inspiration images** from `uploads/` are used anywhere in marketing material.
5. Photography rights: confirm that the menu, café and lifestyle photos are cleared for app-store use.

## Adding or replacing images

1. Add the file under `assets/images/<group>/` (WebP preferred, ≤ 3× the on-screen size).
2. Run `npm run images:registry`.
3. Reference it by key from fixture data (or by URL from the API). Screens never `require()` images directly.
