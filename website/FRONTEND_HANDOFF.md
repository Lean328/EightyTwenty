# EightyTwenty frontend handoff

## Run locally

Serve this folder over HTTP and open the root URL. For example, from this directory run `python -m http.server 8123 --bind 127.0.0.1`, then open `http://127.0.0.1:8123/`. Do not open `index.html` as a `file://` URL; the page imports a JavaScript module. The public entry point is `index.html`.

## Files and assets

- `index.html` contains the public page template, scoped styles, UI state, navigation, interaction handlers, and the `Component` class. It uses the existing `support.js` DC runtime. Keep this architecture when connecting services; there is no build step or new framework.
- `mock-data.js` is the single source for the current location, category, menu, and catering snapshots, including the approved menu item/image mappings. `eightytwenty-data.js` re-exports them for the public site and retains the existing `ORDER_RULES` configuration.
- Approved fixed page copy and UI behavior remain in `index.html`; they are not duplicated as mock datasets.
- `img/` contains café, menu, location, and lifestyle photography, including the verified `img/menu-studio/` originals. `assets/` holds brand, icon, and font resources. Retain these directories for deployment.
- The Home hero is an iframe at `lumi-lane-original/lumi-hero.html`. Its exact approved Tailwind output is frozen in `lumi-lane-original/hero-tailwind.css`, removing a runtime CDN warning without changing the hero's GSAP motion. Its five referenced dish images remain in `lumi-lane-original/assets/`.
- `.vercel/project.json` preserves the existing EightyTwenty production project link. `.vercelignore` excludes the handoff ZIP from a future deployment. Deploy from this folder with `npx vercel --prod` only when approved.

## Responsive and UI architecture

The public site is one responsive page. The main breakpoint is below 900px (`narrow` state and CSS media queries in `index.html`); 1180px controls a compact desktop header detail. The mobile bottom bar uses safe-area padding. The menu, item modal, locations, reservation calendar, Catering packages, account/auth views, footer, and editorial animations are all driven by the same `Component` state. Reduced-motion CSS disables the continuous café sequence and reveal effects where appropriate. The UI uses the existing fonts, palette, photography, and motion.

Navigation calls `go(view, patch)` in `index.html`. Public views include Home, Menu, Locations, location detail, Reserve, Catering, About, Login, Sign up, Gift cards, Wholesale, and legal pages. Menu categories, sort order, package selection, calendar state, and item detail are local UI state. The item modal locks background scrolling and closes by backdrop, button, or Escape. The menu remains browse-only.

## Current business switches

Online ordering is intentionally hidden with `[data-public-order]` in `index.html`; the underlying cart, checkout, and order code remains for later integration. Do not expose it until order creation, pricing, inventory, payments, and confirmation are backed by real services. Phillip is the first location in the public Locations listing. Reserve remains accessible. Public text uses EightyTwenty/eighty twenty branding; genuine historical café photos may contain older physical branding.

## MOCK DATA

`mock-data.js` in the project root is the only source for the current `LOCATIONS`, `CATEGORIES`, `MENU` (84 items), and `CATERING` datasets. These are approved frontend snapshots, including prices, hours, availability flags, and image paths; they are not live backend records. `eightytwenty-data.js` is the stable import adapter for the site and keeps the separate ordering configuration.

There are no seeded customer, booking, or enquiry records to move: account and form values in `index.html` are empty local UI state. About, hero, footer, legal, and other fixed copy in `index.html` are static content, not mock data. Replace the mock datasets with real service responses behind the adapter during backend integration; the approved UI does not need rebuilding.

## Service boundaries for the next developer

| Domain | Current frontend boundary | Future service responsibility |
| --- | --- | --- |
| Menu and categories | `mock-data.js` via the `eightytwenty-data.js` adapter and `renderVals()` menu mapping | Fetch published items, category order, availability, prices, dietary labels, and approved image URLs. Preserve stable item IDs and exact image selection. |
| Locations | `mock-data.js` `LOCATIONS` via the adapter, `locById()`, `decorate()`, booking/location selection | Fetch café details, contact addresses, opening hours, booking availability, and status. |
| Reservations | `bkSubmit()` validates the form and prepares a prefilled email to the selected café | Submit a real booking request, return a reference/status, and show success only after server acknowledgement. |
| Catering and wholesale | `submitEnquiry(kind)` validates key fields and prepares a prefilled email to `info@eightytwentyfood.com.au` | Submit enquiry data, handle delivery errors, and acknowledge only after acceptance. |
| Authentication and customers | `auSubmit()`, `auResetSubmit()`, and account state are explicitly labelled frontend preview | Authenticate securely, create accounts, reset passwords, load/update profiles, and persist sessions. The current password reset sends nothing and states this plainly. Never treat local `signedIn` as real authentication. |
| Ordering and payments | Cart, checkout, and `placeOrder()` are retained but publicly hidden | Recompute totals on the server, create orders, handle payment tokens/webhooks, and issue real confirmations before enabling the public controls. |

The public `Save changes` control updates only this browser visit and says so. The `Change password` control opens the password-reset UI, which explains that no reset service is connected. Authentication/account screens are UI references, not a live customer system. The booking and enquiry email drafts are only requests once the visitor sends the message from their email app; opening a draft is not a confirmed submission. No private API keys or backend-specific URLs are embedded in the public page.

## Local QA notes

The public root was inspected at 1440×900, 1920×1080, 1366×768, 1024×768, 768×1024, 430×932, 393×852, and 375×812. Check both desktop and mobile after changing UI state or styles. In particular, retest every menu category and modal, each location detail, reservation validation/calendar, Catering tabs and enquiry, auth transitions, footer links, hidden ordering controls, and the safe-area bottom bar. Do not deploy this handoff until the client approves the local preview.

## Backend integration (2026-10-06)

- `config.js` sets `API_BASE` (localhost → `http://127.0.0.1:8000`, otherwise the Render API URL).
- `eightytwenty-data.js` loads `GET /api/v1/public/bootstrap` (waits up to 4s, revalidates by ETag each load), then falls back to the last copy in `localStorage`, then to `mock-data.js`. It also exports `postForm()`.
- `bkSubmit()` and `submitEnquiry(kind)` POST to `/api/v1/public/bookings` and `/api/v1/public/enquiries` and show the server reference. If the API is unreachable or rejects the request (e.g. bookings not enabled for that café), they fall back to the original email draft.
- `mock-data.js` stays as the offline fallback and as the seed source for the backend (`scripts/export-mock-data.mjs`).
