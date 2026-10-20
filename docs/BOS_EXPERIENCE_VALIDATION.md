# BOS experience delivery — 20 October 2026

## Result and scope

The existing Django BOS now has six primary workspaces: Overview, Operations,
Customers, Finance, Content Studio and Insights. Settings and Administration sit
in a compact utility area. Contextual navigation and a searchable workspace
directory replace the permanent 40-destination sidebar. Global page finding,
original URLs, scoped badges and server-side access checks remain intact.
The complete old-to-new map is in `BOS_EXPERIENCE_AUDIT.md`.

Overview prioritises live attention queues and today's reservations before the
KPI strip, reservation review and supporting analytics. Lists use a common
title/count/action header, denser table headings, aligned numeric fields, real
search/filter/date/sort/pagination and collapsible mobile filters. Existing
fieldsets and inline editors become a section rail on desktop and a scrollable
tab strip on mobile; values and inline management fields stay in their original
forms. Operational record views use readable summaries, receipt/payment columns,
timelines, a prominent next action and disclosed secondary actions. Reports add
section navigation while preserving all metrics, filters, CSVs and printing.

The shared experience stylesheet supplies light ivory surfaces, a restrained
cream navigation area, espresso actions, caramel links, semantic status colours,
Figtree controls/numbers, selected Newsreader headings, consistent spacing and
6/10/12px component radii. Existing dark mode remains available. Drawer, directory,
media picker and lightbox support keyboard dismissal and focus containment/return.
The original menu, native selects and forms remain usable without JavaScript.

No backend Python, configuration, dependency, migration, API, authentication,
permission or customer website source files changed. All data operations use
the original Django forms/endpoints. No mock data was added to production.

## Automated checks

| Check | Result |
|---|---|
| Final pytest suite | 260 passed, 3 PostgreSQL-only tests skipped locally |
| Node frontend/navigation tests | 14 passed |
| JavaScript syntax | Both changed scripts pass `node --check` |
| Ruff lint/format | Pass; 166 Python files unchanged/formatted |
| Django system checks | No issues |
| Migration drift | No changes detected |
| OpenAPI generation/validation | Pass; byte-identical to committed schema |
| Static asset collection | Pass |
| Git whitespace/scope review | Pass; frontend, tests and documentation only |

There is no Node bundle/build pipeline in this Django/static website repository;
`collectstatic` is the applicable frontend asset build. PostgreSQL tests run in
the existing GitHub Actions PostgreSQL 17 job after push.

## Browser regression and visual checks

The real application was authenticated normally against an isolated local
SQLite fixture database. Edge/Chromium browser automation visited:

- All 40 permitted navigation destinations at 1440, 1024, 390 and 360px: 160 visits.
- All 59 available add/change/profile/password forms at those widths: 236 visits.
  Every available editor tab was opened, including inline editors.
- All 396 visits returned 200, with no page overflow or JavaScript exceptions.
  Wide tables retain accessible horizontal scrolling.
- 21 workflow checks passed: directory coverage/search/Escape/focus, global page
  finder, values across tabs, server validation/error section, actual menu save
  with inlines, media picker, original delete prohibition, mobile filter disclosure,
  drawer focus isolation/return, availability POST and restoration, order acceptance,
  booking confirmation, both CSV exports, dark-theme persistence and no-JS links/
  search/add controls. A separate local category creation was verified and its
  disposable fixture record was removed from that local database.
- Seven additional checks passed: manager and staff navigation (28 and 20 permitted
  destinations), forbidden system page remains 403, mobile primary action visible
  without scrolling, secondary booking actions accessible, media modal background
  isolation, focus containment and editor restoration.
- The final operational menus were rechecked at desktop/tablet/mobile, including
  Escape dismissal. Representative screenshots of Overview, Operations/order,
  Finance, Content/editor/directory and Insights were captured and visually reviewed.
  Additional screenshots cover schedule, availability, team, customers, bookings,
  locations and CMS forms. Deliverable screenshots are in the task's `outputs/`.
- The authenticated in-app preview remains open at `http://127.0.0.1:8000/`.

The browser pass exposed a native search-input Escape conflict in the new
directory; explicit dismissal/focus return fixes it. Test assertions were also
corrected to use the existing photo-picker selector, actual action labels and
manager permissions rather than assuming unsupported behaviour.

## Existing limits and verification boundaries

- Shared admin policy intentionally denies deletion to every role. Existing hide/
  deactivate workflows remain; no deletion bypass was introduced.
- Payout/payment-provider settings screens do not exist in this source. Paid app
  ordering still depends on the existing unconfigured provider (501). No fake
  finance screens or estimated metrics were added.
- External payment settlement, email delivery, push delivery and production writes
  were not exercised. Their backend integration tests pass and bindings are intact.
- Local layout verification used Chromium, including responsive viewport emulation;
  physical iOS/Android devices and assistive technology were not exercised.
- Production deployment follows the repository's existing Render auto-deploy;
  deployment readiness is separate from local preview and Git push verification.

## Files changed

| Files | Purpose |
|---|---|
| `backend/static/bos/css/experience.css` (new) | Shared brand tokens/components/responsive layouts |
| `backend/static/bos/js/workspaces.js` (new) | Permission-derived workspaces, contextual links, directory, list enhancements |
| `backend/static/bos/js/admin.js` | Section rail, keyboard arrows, enhanced-nav selection, modal focus |
| `backend/templates/admin/base.html` | New asset loading and permission-filtered navigation metadata |
| `backend/templates/admin/change_list.html` (new) | Shared real-list title/count/action header |
| `backend/templates/admin/index.html` | Action-first live overview composition |
| `backend/templates/admin/bos/record_order.html` | Domain layout hook for receipt/payment hierarchy |
| `backend/templates/admin/bos/record_booking.html` | Domain layout hook for reservations |
| `backend/templates/admin/bos/record_enquiry.html` | Domain layout hook for enquiry details |
| `backend/templates/admin/bos_order_form.html`, `bos_booking_form.html` | Primary/secondary action disclosure, original POST targets |
| `backend/templates/admin/bos/reports.html` | Real-report section links and heading hierarchy |
| `backend/templates/admin/bos/availability.html` | Disclosed integration note and workspace label |
| `backend/templates/admin/login.html`, `backend/templates/registration/logged_out.html` | Shared experience assets on standalone auth screens |
| `scripts/test-bos-workspaces.mjs` (new) | Complete mapping, scoped navigation, deep links, future-entry fallback |
| `docs/BOS_EXPERIENCE_AUDIT.md` (new), this document | Feature/navigation contract and validation evidence |
| `CLAUDE.md` | Frontend structure and required change log |
