# Frontend audit — 20 October 2026

Recorded before implementation against `main` at `09f4c49e4b7c202f3d1911b292d32af1696147ac`.

## Architecture and boundaries

- Verified repository: `maiviet283/EightyTwenty`; cloned its existing `main`, then pulled with `--ff-only`. Local Git account has push permission. No additional branch, worktree, repository or pull request.
- `website/index.html` contains the static customer app, styles and `Component` on the existing `support.js` runtime. There is no npm build step. `config.js` selects the API origin; `eightytwenty-data.js` loads public bootstrap with ETag revalidation, a last-good cache, then the existing bundled snapshot. Booking and enquiry forms POST through that adapter and retain their email fallback.
- The working BOS is Django Admin at `/`, not a separate React project. `backend/templates/admin/`, `templates/registration/` and `static/bos/` provide the frontend. Django model admins, `core/admin_site.py`, `admin_views.py`, `dashboard.py` and summary helpers provide its data and operations. Shared CSS covers every model's list/add/change/history view as well as the custom pages.
- Django/DRF provides public, auth, customer, BOS, mobile and POS APIs. Services enforce business rules, branch scope, transitions, audit, pricing and payment handling. PostgreSQL/Supabase Storage, Resend and Expo integrations stay untouched. No schema, settings, environment, credentials, Python application code or API contract changes are planned.

## Feature inventory and preservation contract

| Area | Existing screens and operations to preserve |
| --- | --- |
| Access and shell | Staff sign-in, password reveal/Caps Lock, sign-out, password change, own profile, light/dark preference, collapsed sidebar, role-filtered groups and waiting counts, breadcrumbs, Ctrl/Cmd+K page finder, permission and error pages, related-record popups |
| Overview | Date, branch and period filters, attention queues, orders/bookings/enquiries/availability counts, trends, today's schedule, café summaries, recent activity, email failures and existing drill-down links |
| Reports | Period/custom dates/branch, sales by date/café/item/payment/channel, refunds and till variance, booking trends/outcomes/day/hour/party size/lead time, enquiry pipeline/type, menu/availability, CSV exports |
| Schedule | Day and café filters, previous/next/today, café/time-slot grouping, capacity and guest details, confirm/decline/seat/cancel/no-show transitions through existing POSTs |
| Orders and till | App/POS orders, item/modifier/notes/totals/payment/refund summaries and timelines, existing order transitions; shifts, transactions, promotions and tables |
| Bookings and enquiries | Search/filter/sort, record summaries, contacts, notes, history, status actions, editable forms and read-only staff access; booking rules |
| Menu | Items and photos, AUD price entry, categories, modifier groups/options, dietary tags, café-specific items, overrides, published/featured/active flags, linked inlines |
| Availability | Item/category search, sticky item-by-café matrix, available/sold-out/hidden states, individual AJAX toggles and all-café POST actions, saved feedback and activity logging |
| Locations | Café details/contact/publishing, regular and special hours, images, booking rules, tables and parent-record inlines |
| Website/CMS | Pages, content blocks, navigation, app offers/FAQs, media library, site settings, image upload/selection/search/clear and previews |
| People/loyalty | Team and branch assignments, till PIN, customers/profiles, recent orders/bookings/enquiries, coffee cards/stamps and gift cards/balances/activity |
| System | Data-health links, email delivery/outbox/retries, service configuration status, push devices, audit/activity history |
| Shared CRUD | Server search/filter/sort/pagination, bulk actions, required fields, validation/help/errors, tabbed fieldsets, foreign-key/autocomplete/multi-select widgets, inlines and sticky save controls |

Permissions remain server-defined: chain owner has global access; café owners manage their assigned cafés and staff; staff retain permitted scoped operations/read-only views. Reports/team are owner-only; customers/CMS/system remain chain-only. Soft deactivation/unpublishing continues instead of deleting business records.

## Website findings before editing

- Landing page contains a standalone Phillip introduction between the preceding content and Extras. Remove only that section and its dedicated CSS/binding.
- Locations already feature Phillip on desktop and mobile and sort it first in the picker/footer. Preserve those layouts. Booking location choices still follow raw API order and should also put Phillip first.
- Initial order location and booking café are Braddon; location-detail state is Phillip. `defaultLocation` metadata also defaults to Braddon. There is no stored explicit café preference. Introduce a guarded, validated preference: remembered customer choice, then valid preview default, then Phillip, then a real available location. Never reset a valid customer preference to Phillip on reload.
- Preserve the menu, modifiers, cart, fulfilment/timing, checkout, booking validation/submission, catering/wholesale/contact enquiries, image reveals, parallax, café marquee, responsive views and all unrelated content.
- Existing website checkout generates a local confirmation; it is not connected to real payment processing. Customer sign-in/profile UI is also prototype functionality. Backend paid app orders return 501 until a provider is configured. These are pre-existing limits, not features to replace or claim as production payment validation.
- The existing `[data-public-order]` rule pauses public ordering; retain that decision.

## Design direction

The current commit already includes an initial café palette. Complete a consistent **Framed sheet** system (design-taste seed `1725138358`, no redraw): cream frame, warm paper working surface, espresso text/actions and caramel data accents; website Newsreader headings and Figtree controls/data. A quieter, labelled navigation and stronger focus/control boundaries suit long operational sessions. Keep genuine status colours with text labels.

The product-specific signature is the existing café availability matrix and day's booking capacity, backed by real server data. No fabricated metrics or new production sample data. The frame and typography provide identity on every page.

Questions by screen: overview—what needs action today; reports—how is the business performing; schedule—who is arriving and what needs confirmation; availability—what can each café sell; lists—which record needs work; details—what happened and what action is allowed; CMS/menu/location forms—what will the customer see; people—who has access and what is their history; system—what requires attention; profile—what are my details and access; sign-in—how do I enter my workspace.

## Validation plan

Run the repository's Ruff lint/format, Django checks, migration drift check, complete pytest suite and OpenAPI validation without changing contracts. Run static JS syntax checks, focused location-preference regression tests, and Django static collection. Use isolated local SQLite and test-only fixture records for browser verification; do not connect previews to production services. Check all permitted navigation destinations, representative add/change/detail/history forms, light/dark, keyboard drawer/page finder, responsive widths 1440/768/390 and important POST journeys. Review the final diff and verify `origin/main` immediately before a normal push.
