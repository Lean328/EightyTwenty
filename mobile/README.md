# EightyTwenty — mobile app

The EightyTwenty customer app (order ahead, coffee card, table bookings, catering, gift cards),
rebuilt from the approved design prototype as a production-structured
**React Native + Expo + TypeScript** project.

The app runs today against a **local simulated backend** that behaves consistently across every
screen. Every screen reaches data through repository interfaces, so switching to the real API is
a configuration change plus the server work described in
[docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md).

> **What is real and what is simulated**
>
> | Area | Status |
> |---|---|
> | UI, navigation, animations, form rules, pricing, loyalty and booking rules | Implemented |
> | Data (menu, cafés, account, orders, bookings…) | **Mock backend** (`src/services/mock`); HTTP layer written against a *proposed* API |
> | Sign in / sign up | **Demo only** — no real accounts or passwords |
> | Apple Pay, card payments, Square eGift cards | **Demo only** — no payment is ever taken |
> | Apple Wallet pass | **Demo only** — no pass is generated or installed |
> | Push notifications | Not implemented (in-app feed only) |
>
> The app labels each demo surface on screen ("Preview only", "Demo mode — no payment is taken").

> **In the BOS repo (`mobile/`, since 2026-10-26):** the app talks to the real backend in
> `../backend` (`/api/v1/app`) by default. The table above describes the `mock` data source;
> with `api` it is:
>
> | Area | Status (`api`) |
> |---|---|
> | Sign up / in / out, profile, change password, delete account ("Close my account") | Live |
> | Cafés, menu (per café, sold-out items hidden), catering packages, offers, FAQs | Live, edited in BOS |
> | Orders (server pricing, status updates from the café), coffee card, gift card balance | Live — but **card / Apple Pay is not connected**: orders with money to pay answer 501 in production |
> | Table bookings, catering enquiries | Live — saved in BOS, the café is emailed (no email draft in the app) |
> | Notification feed + **push notifications** | Live once the EAS project id is set (see below) |
> | Member barcode | Real Code 128 of the member number (scannable into BOS/POS search) |
> | Saved cards, sending eGift cards, Apple Wallet pass | Need a payment provider / Apple pass signing — not connected |

## Push notifications

The app registers the phone after sign-in (`POST /me/push-tokens`), removes it on sign-out, and
opens the matching screen when a push is tapped (an order update opens that order). The server
pushes every feed item, following Profile → Notifications.

1. Done (2026-10-26): the project is `@my-an-lien/eightytwenty` (`owner` and
   `extra.eas.projectId` in `app.json`).
2. **iPhone, Expo Go:** works — verified 2026-10-26 on a real iPhone: the token registers after
   sign-in, a counter stamp and an order status change arrive as banners, and tapping the order
   push opens that order's status screen. To test against a backend on this computer, run the
   `backend-lan-push` launch config (runserver on `0.0.0.0:8010` with push on), point
   `EXPO_PUBLIC_API_BASE_URL` at `http://<computer-LAN-IP>:8010/api/v1/app` and restart with
   `npx expo start --clear`.
3. **Android:** Expo Go has no remote push since SDK 53 — use a development build
   (`npx eas-cli@latest build --profile development --platform android`) with Firebase (FCM)
   credentials added through `eas credentials`.
4. **Store builds:** EAS creates the Apple push key when you build for iOS; Android needs the
   FCM credentials from step 3. Optional `EXPO_ACCESS_TOKEN` on the server if "enhanced push
   security" is turned on in the Expo account.

---

## Quick start

Requirements: Node 20+ and npm. Expo SDK 58 (React Native 0.88, React 19.3). Expo Go from the
App Store / Google Play supports only SDK 58.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with **Expo Go** (phone and computer on the same Wi-Fi; add `--tunnel` if
they are not), or press `i` / `a` / `w` for a simulator, emulator or the web build.
`.env` points at the production API on Render; to use a backend on this computer set
`EXPO_PUBLIC_API_BASE_URL=http://<computer-LAN-IP>:8000/api/v1/app`, run
`manage.py runserver 0.0.0.0:8000`, and restart with `npx expo start --clear`.

**Mock data instead:** set `EXPO_PUBLIC_DATA_SOURCE=mock`, then sign in with the demo account
email defined as `DEMO_EMAIL` in
[`src/services/mock/fixtures/demoCustomer.ts`](src/services/mock/fixtures/demoCustomer.ts) and
**any password of 6+ characters**. With the real API, sign up needs a password of 10+ characters.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Start and open a platform |
| `npm run typecheck` | `tsc` for the app, then for the test suite (`tests/tsconfig.json`) |
| `npm run lint` | ESLint (Expo flat config + `import/no-cycle`) |
| `npm test` | Jest (`jest-expo` preset) |
| `npm run check` | typecheck + lint + tests |
| `npm run doctor` | `expo-doctor` |
| `npm run images:registry` | Regenerate `src/assets/imageRegistry.ts` after adding images under `assets/images` |

## Configuration

Copy [`.env.example`](.env.example) to `.env` and restart the dev server.

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_DATA_SOURCE` | `mock` | `mock` = local simulated backend · `api` = HTTP repositories |
| `EXPO_PUBLIC_API_BASE_URL` | — | Customer API base URL (required for `api`) |
| `EXPO_PUBLIC_API_TIMEOUT_MS` | `15000` | HTTP timeout |
| `EXPO_PUBLIC_WEBSITE_URL` | `https://eightytwenty.pages.dev` | Privacy policy (`/privacy`) and Terms of use (`/terms`) links |
| `EXPO_PUBLIC_MOCK_LATENCY_MS` | `350` | Simulated latency per mock call |
| `EXPO_PUBLIC_MOCK_PERSIST` | `true` | Keep mock data across restarts (AsyncStorage) |
| `EXPO_PUBLIC_MOCK_ORDER_OUTCOME` | `normal` | `declined` demonstrates the declined-order screen |

`EXPO_PUBLIC_*` values are compiled into the app and readable by anyone. **No secrets belong in
the client** — payment keys, Apple certificates and API secrets live on the backend.

## Project structure

```
app/                      Expo Router routes — thin files that render a feature screen
  _layout.tsx             fonts, splash, QueryClient, session restore, auth guard
  (auth)/welcome.tsx      welcome + log in / sign up
  (app)/_layout.tsx       single native stack + floating tab bar + app-wide sheets
  (app)/(tabs)/           Home · Menu · Loyalty · Profile
  (app)/…                 cart, checkout, orders/[id], cafes, reserve, catering, offers,
                          notifications, account/* (edit, activity, payment methods, gift
                          cards, preferences, favourites, help, privacy)
src/
  features/<feature>/     screens/, components/, hooks.ts (TanStack Query), feature copy
  domain/                 pure business rules: pricing, cart, loyalty, hours, reservations,
                          catering, calendar, schedule, dietary, orders
  repositories/           contracts (interfaces), provider, query keys, data-source switch
  services/
    mock/                 simulated backend: fixtures, per-customer DB, mock repositories
    api/                  HTTP client, endpoints, DTOs, mappers, HTTP repositories
    integrations/         payments (demo provider), Apple Wallet, secure storage, links
    errors.ts             AppError — one error shape for mock and HTTP
  store/                  zustand: session, cart + order context, UI (sheets, toasts)
  navigation/             route metadata, AppChrome (tab bar, mini cart, global sheets)
  components/             ui/ primitives, layout/ (Screen, BottomSheet, TabBar, Rise…), shared/
  theme/                  colors, typography, spacing/radii/shadows, motion tokens
  constants/              business rules (surcharge, delivery, stamps, booking notice), config
  types/                  domain models
  assets/imageRegistry.ts generated map of image keys → require()
assets/                   fonts are npm packages; images, icons and branding live here
tests/                    Jest: domain, mock backend, HTTP client, hooks, components
docs/                     architecture, backend handoff, API contracts, data models,
                          integration checklist, asset audit
```

## Documentation

| Document | For |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is put together; how to add screens, endpoints and features |
| [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) | What the backend must provide, business rules it owns, open questions |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Proposed REST contracts for every repository method |
| [docs/DATA_MODELS.md](docs/DATA_MODELS.md) | Domain models, field tables, app ↔ JSON mapping |
| [docs/INTEGRATION_CHECKLIST.md](docs/INTEGRATION_CHECKLIST.md) | Everything needed before release (payments, Wallet, push, store setup…) |
| [docs/ASSET_AUDIT.md](docs/ASSET_AUDIT.md) | Which design-export assets were kept, resized, generated or left out, and why |

## Verification status

Run on Windows 11 in this workspace:

| Check | Result |
|---|---|
| `tsc --noEmit` (app, strict) | Passes |
| `tsc --noEmit -p tests` | Passes |
| `eslint . --max-warnings 0` | Passes |
| `jest` | 10 suites, 98 tests pass |
| `expo-doctor` | 21/21 checks pass |
| `expo install --check` | Dependencies up to date |
| Web build (Metro, `expo start --web`) | Every flow exercised by hand at 375 × 812 (see below) |

Flows exercised in the web preview with mock data: auth guard and redirects; log-in validation;
sign in / sign up / sign out; Home (all sections, both rails); Menu add/step/typed quantity;
required-option item sheet and pricing; cart; checkout (surcharge, gift card, Apple Pay and
new-card paths); live order status → completed; stamp award and loyalty activity; order
history; reservations (closed days, hours, 12-hour notice, success, cancel); catering
(validation, estimate, enquiry list); gift card send; Wallet sheet; profile edit; notifications.

**Not verified here:** iOS/Android builds on simulators or devices, Expo Go, native keyboard
avoidance, native date/time pickers, haptics, real screen readers (VoiceOver/TalkBack), and
on-device animation smoothness. Run these on hardware before release —
see [docs/INTEGRATION_CHECKLIST.md](docs/INTEGRATION_CHECKLIST.md).

## Differences from the prototype

The rebuild keeps the approved design, copy and behaviour. Deliberate differences:

- **Navigation** — one native stack with a floating tab bar (as the prototype had a single
  history), with native push/pop transitions and swipe-back instead of the prototype's CSS slides.
- **Fonts** — Newsreader/Figtree via `@expo-google-fonts` static weights; Newsreader's optical
  sizing axis is not available, so very large headings can look slightly different.
- **Times** use the device time zone (the prototype assumed Canberra).
- **Totals** are computed in whole cents (half-up at each rate), so the lines shown always add up
  to the total and match exact decimal maths on the server; the prototype's floating-point totals
  could be a cent off.
- **Sign up** creates a new empty account (the prototype reused the demo profile), so new
  accounts show empty states — including a new "No orders yet" state that the prototype never reached.
- **New-card payments** validate the card number and expiry (via the demo tokeniser) instead of
  accepting empty fields.
- **Declined orders** (mock `declined` outcome) have no side effects: no stamps, no gift card spend.
- **Demo labels** — demo surfaces say so on screen (sign-in, checkout, gift cards, Wallet, saved cards).
- **Home café** — the prototype opens on Phillip while `app-data.js` lists Braddon; the app follows
  the prototype (see `src/services/mock/fixtures/demoCustomer.ts`).
- The **web build** is for QA only; the product targets iOS and Android.
