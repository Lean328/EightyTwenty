# Frontend redesign validation — 20 October 2026

## Scope delivered

The existing Django BOS uses a single cream navigation/top-bar frame and warm paper working sheet across every screen. Espresso actions/text, caramel chart colours, the website's Newsreader/Figtree pairing, shared spacing and restrained surface borders provide a consistent brand. Page titles are 28–32px; operational numbers use tabular Figtree; cards/forms use consistent headings, boundaries and controls. Tablet metrics use balanced two-column rows; odd final metrics span the row. Mobile forms stack and wide tables scroll within labelled, keyboard-focusable regions without hiding fields.

Navigation retains every role-filtered destination, count, shortcut and collapsed state. The mobile drawer now has a close button, focus containment, Escape dismissal, focus restoration and an inert background. The page finder also isolates background focus. Focus rings, scroll clearance, chart-bar accessible labels, placeholder/skip-link contrast, numeric column alignment, reduced motion and larger mobile controls improve accessibility. Existing dark mode remains available and remembered.

Website changes remove only the landing-page Phillip introduction and its private styling/binding, retain the existing featured Phillip location layouts, order booking choices with Phillip first and remember explicit café choices. New visitors default to Phillip; valid remembered choices win over preview defaults. Storage denial, stale preferences and choices made while bootstrap is still loading are handled. No ordering, booking, enquiry, authentication or payment implementation was replaced.

## Files modified or added

| File | Purpose |
| --- | --- |
| `backend/static/bos/css/admin.css` | Shared BOS palette/frame/type, forms/tables/cards, responsive layout, control/focus/contrast refinements |
| `backend/static/bos/js/admin.js` | Drawer/page-finder focus management and numeric column alignment |
| `backend/templates/admin/base.html` | Mobile drawer close button and focus-isolation target |
| `backend/templates/admin/change_list_results.html` | Accessible scrolling results region |
| `backend/templates/admin/bos/availability.html` | Accessible scrolling café matrix |
| `backend/templates/admin/includes/bos_columns.html` | Accessible chart-bar labels |
| `website/index.html` | Targeted landing removal, Phillip default/order and explicit preference integration |
| `website/eightytwenty-data.js` | Re-export frontend preference utilities; existing API/data fallback unchanged |
| `website/location-preference.js` | Guarded preference storage, validation and stable Phillip-first sorting |
| `scripts/test-frontend.mjs` | Node built-in regression tests; no new runtime dependencies |
| `docs/FRONTEND_AUDIT.md` | Architecture and feature inventory recorded before implementation |
| `docs/FRONTEND_VALIDATION.md` | Delivery scope, checks and limitations |
| `CLAUDE.md` | Required repository handoff log |

No files in `backend/apps/`, settings, migrations, dependencies, API schema or deployment configuration were changed. No environment/credential files were created or overwritten. Preview databases, snapshots, test data, browser scripts and screenshots remain outside the repository under the task's `work/` directory.

## Automated checks

| Check | Result |
| --- | --- |
| `python -m ruff check .` | Pass |
| `python -m ruff format --check .` | Pass; 166 files formatted |
| `python manage.py check` | Pass; zero issues |
| `python manage.py makemigrations --check --dry-run` | Pass; no changes |
| `python -m pytest -q --basetemp=../../work/pytest-temp` | **260 passed, 3 skipped**, 27.77s |
| `python manage.py spectacular --file ../../work/openapi.yaml --validate --fail-on-warn` | Pass; generated schema SHA-256 exactly matches tracked `docs/openapi.yaml` |
| `python manage.py collectstatic --noinput --verbosity 0` | Pass; includes compressed/hashed static assets |
| `node --test scripts/test-frontend.mjs` | **10 passed**, including preference persistence/fallback/storage denial, stable sorting, embedded app syntax, existing booking API payload and early-choice preservation |
| `node --check` for BOS scripts and website modules | Pass |
| `git diff --check` | Pass |

The first pytest invocation passed 258 tests but two fixtures could not create sandbox temporary directories. Re-running the unchanged suite with a workspace-local `--basetemp` resolved both setup errors. Three PostgreSQL-only tests were skipped on SQLite; no Docker/PostgreSQL runtime is installed here. No application assertion failures remain.

The website is static and has no npm build or package manifest. JavaScript parsing/regression checks, actual browser rendering and Django static collection are the applicable frontend checks/builds.

## Browser verification

Used Edge against a separate local SQLite database populated with the repository's existing snapshot/fixture commands. Push delivery was disabled and no production credentials/data/services were used for writes.

- All **40 BOS navigation destinations**: HTTP 200, visible main title, no traceback and no document-level horizontal overflow at **1440×900, 768×1024 and 390×844**.
- **59 discovered add/change/detail/profile/password screens**, **177 visits** across the same three widths: HTTP 200 and no document-level horizontal overflow. This includes order, booking, enquiry, customer, menu/modifier, café/hours/photos, CMS, team/assignments, loyalty, media and system record families.
- Keyboard drawer: opens with modal semantics, isolates the workspace, contains Tab/Shift+Tab, closes on Escape and returns focus to the toggle.
- Ctrl+K page finder: opens, isolates background, filters and navigates to Availability.
- Availability: original AJAX endpoint saves a toggle and restores its starting state.
- Order acceptance and booking confirmation: existing POST actions succeed and summaries show Confirmed.
- Reports CSV: HTTP 200 and CSV content type.
- Dark theme: saved across reload; settled report control colours checked (`#f2eae0` on `#1f1814`) and screenshot reviewed.
- Customer site: **all seven Explore sections** (Menu, Locations, Bookings, Catering, Gift Cards, Wholesale, About) have no page overflow at 1440, 768 and 390px.
- Customer location checks: Phillip initially selected; Kingston explicitly chosen, stored and retained on reload; Phillip remains first in booking options; landing introduction absent at each width.
- Desktop/tablet/mobile screenshots reviewed for overview, reports, schedule, availability, system, orders, menu, team and representative record forms. The corrected tablet report grid and settled dark controls were rechecked visually.

Design-taste inspector on an authenticated overview HTML snapshot: **0 failures, 0 warnings** after explicit allowances for the required cream brand palette, the existing date-stamp month label, code/keyboard monospace, and functional mobile icon controls. The snapshot cannot display cross-origin SVG sprites; actual-browser screenshots confirm the icons. These are deliberate allowances, not claims of a full accessibility certification. The selected direction is Framed sheet, seed `1725138358`, with no redraws; identity comes from the café palette/type and existing availability/capacity views. No fabricated production metrics or new sample data shipped.

## Existing limitations and validation boundaries

- Public website ordering is deliberately paused by the existing `[data-public-order]` CSS rule. Its checkout/auth/profile code is prototype behaviour. This task preserves that state; it does not enable checkout or claim live payment/auth validation.
- The backend still returns 501 for paid app orders until a real payment provider is configured. No payment business rule changed and no live charge was attempted.
- External media upload/email/push/payment providers were covered by the existing automated contracts/mocks, not live production writes.
- PostgreSQL-specific locking/RLS/concurrency checks require the existing PostgreSQL CI job; the local SQLite run cannot validate them.
- The existing customer runtime emits an initial number-input binding warning for `{{ bk.size }}`; no new website console errors were observed.
- No introduced functional regressions were identified. Local visual/regression evidence does not replace production deployment monitoring.

Commit and remote verification are reported in the task's final delivery report after the normal push to `origin/main`.
