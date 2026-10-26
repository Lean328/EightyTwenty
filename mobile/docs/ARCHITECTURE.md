# Architecture

This document explains how the EightyTwenty app is structured, how data moves through it, and
where to make common changes. For the server side see [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md)
and [API_CONTRACTS.md](API_CONTRACTS.md).

## Stack

| Concern | Choice |
|---|---|
| Runtime | Expo SDK 57 · React Native 0.86 (New Architecture) · React 19.2 |
| Language | TypeScript 6, `strict` + `noUncheckedIndexedAccess` |
| Routing | Expo Router (file-based, typed routes, `Stack.Protected` auth guard) |
| Server state | TanStack Query v5 (caching, polling, optimistic updates, infinite lists) |
| Client state | zustand (session, cart + order context, transient UI) |
| Animation | Reanimated 4 (+ worklets); respects the OS Reduce Motion setting |
| Graphics | react-native-svg (tab bar notch, stamps, icons), expo-image |
| Storage | expo-secure-store (session tokens), AsyncStorage (mock data only) |
| Tests | Jest (`jest-expo`) + React Native Testing Library 14 |

## Layers

```
 app/ (routes)            thin: export the feature screen, set route options
        │
 features/*/screens       render + local UI state; call feature hooks
 features/*/components
        │
 features/*/hooks.ts      TanStack Query queries/mutations, cache invalidation
        │                 (no fetch calls, no business maths)
        ▼
 repositories/contracts   interfaces: AuthRepository, OrderRepository, …
        │  (RepositoryProvider picks one implementation set at start-up)
   ┌────┴─────────────────────────┐
 services/mock                services/api
 simulated backend            HttpClient → REST (proposed contracts)
   │                              │
   └──────── domain/ ─────────────┘   pure rules shared by UI, mock and tests
             (pricing, loyalty, hours, reservations, catering, cart, calendar)

 services/integrations   payment provider · Apple Wallet · secure storage · device links
 store/                  session · cart & order context · UI (sheets, toasts, tab reselect)
 theme/ constants/ types/ utils/
```

Rules the code follows (and lint enforces where it can):

- **Screens never import `services/*` data code.** They use feature hooks, which use
  `useRepositories()`. Swapping mock ↔ HTTP needs no screen changes.
- **Business rules live in `src/domain`** as pure functions with tests. The mock backend uses
  the same functions server-side (re-pricing, booking checks), so mock and UI always agree.
- **One error type.** Every repository rejects with `AppError` (`src/services/errors.ts`), with a
  `code` (`VALIDATION`, `PRICE_CHANGED`, `PAYMENT_DECLINED`, `SESSION_EXPIRED`, …), optional
  `fieldErrors`, and `errorMessage(e)` for customer-facing text.
- **No business data in screens.** Café details, menu, packages, offers and FAQs come from
  repositories; fixed rules (surcharge 2.95%, delivery 10%, 9 stamps, 12-hour booking notice,
  gift card amounts, contact details) are in `src/constants/business.ts`.
- `import/no-cycle` is an error.

## Data sources

`src/repositories/createRepositories.ts` reads `EXPO_PUBLIC_DATA_SOURCE`:

- **`mock` (default)** — `createMockRepositories()`. A per-customer in-memory database
  (`services/mock/db.ts`) seeded from the design export's demo data, optionally persisted to
  AsyncStorage. It simulates latency, auth, server-side pricing, live order progress (one stage
  every 4.2 s), stamps, gift card spend, idempotent retries, validation errors and a declined-order
  mode. Catalogue fixtures (`services/mock/fixtures`) are the approved snapshot of the menu,
  cafés, catering packages and content.
- **`api`** — `createApiRepositories()`. `HttpClient` (`services/api/client.ts`) adds the bearer
  token, refreshes once on 401 (single-flight; offline refreshes keep the session), times out,
  maps error bodies to `AppError`, and sends `Idempotency-Key` on charges. DTOs (`dto.ts`) are
  converted by `mappers.ts` (cents ↔ dollars, snake_case enums ↔ display values).

Both implement the same contracts, and `tests/services/*` covers each one.

## Navigation

The prototype has **one navigation history** with a floating tab bar, and the app keeps that model:

- `app/_layout.tsx` loads fonts, holds the splash screen, restores the session from secure
  storage and guards the route groups with `Stack.Protected`: `(auth)` when signed out,
  `(app)` when signed in. Signing in or out switches groups automatically.
- `app/(app)/_layout.tsx` is a single native stack. Its `layout` wraps the navigator in
  `AppChrome` (`src/navigation/AppChrome.tsx`), which renders:
  - the floating **TabBar** (SVG notch, gliding bubble, hidden with the keyboard),
  - the **MiniCart** bar,
  - app-wide sheets: item, café picker, order settings, Wallet pass, member card, avatar,
  - the paid overlay and toasts.
- `src/navigation/routeMeta.ts` declares, per route, which tab is highlighted (`owner`),
  whether the tab bar shows (`tabs`) and whether the mini cart may show (`mini`), as in the
  prototype's `NO_TABS` / `MINI` lists.
- Tapping a tab **resets** the stack to that tab's root (`useGoToTab`). Tapping the active tab
  scrolls it to the top (`useTabReselect`).
- Deep links work for every route (`eightytwenty://cafes/braddon`, `…/account/activity?segment=reservations`).

## State

| State | Where | Notes |
|---|---|---|
| Session tokens | `store/session.ts` + secure storage | `restoring → signedIn / signedOut`; `expired` flag shows a notice |
| Server data | TanStack Query cache | keys in `repositories/queryKeys.ts`; mutations invalidate what they affect |
| Cart + order context | `store/cart.ts` | client-side until checkout; the server re-prices |
| Transient UI | `store/ui.ts` | open sheets, toasts, paid overlay, new-stamp animation, tab reselect |
| Screen-local | `useState` | form edits use an "edits over server value" pattern so data loading never overwrites typing |

Optimistic updates: preferences, favourites and notification read state. Live order status polls
every 2 s while an order is in progress (swap for push or websocket in production).

Signing out revokes the session server-side, clears secure storage, the query cache, the cart and
transient UI.

## Payments, Wallet and other integrations

Everything external sits behind an interface in `src/services/integrations` so it can be
swapped without touching screens:

- **`payments.ts`** — `PaymentProvider` with `requestApplePay()` and `tokenizeCard()`. The shipped
  `demoPaymentProvider` returns fake single-use tokens and never contacts a payment service.
  The app only ever sends **tokens** to the backend, never card numbers. New-card entry at
  checkout is a demo stand-in for the provider's PCI-compliant card UI.
- **`wallet.ts`** — Apple Wallet pass (distinct from Apple Pay). Demo with mock data; with the API
  it adds a signed `.pkpass` from the backend, or reports that passes aren't available.
- **`secureStorage.ts`** — keychain/keystore (web falls back to `localStorage` for QA builds).
- **`links.ts`** — `mailto:` (booking and catering requests go to café inboxes today), `tel:`, `sms:`, maps.

Charges use `useIdempotentAttempt` (`src/hooks`): the same `Idempotency-Key` is reused when the
customer retries after a timeout or dropped connection, so a retry can't double-charge.

## Design system

`src/theme` translates the prototype's CSS into tokens:

- `colors.ts` — palette (cream, ivory, espresso, caramel, sand…) plus alpha helpers (`inkA(0.6)`).
- `typography.ts` — `serif()` (Newsreader) and `sans()` (Figtree) style builders with the
  prototype's sizes, weights, line heights and tracking; Dynamic Type is capped at 1.3×
  (`MAX_FONT_SCALE`) so layouts hold.
- `layout.ts` — radii, spacing, shadows (New Architecture `boxShadow`), 44-pt touch target.
- `motion.ts` — the prototype's cubic-bezier curves and durations.

UI primitives live in `src/components/ui` (Text, Button, TextField, Touchable with press scale,
SegmentedControl, Switch, Chip, Icon, …); layout pieces in `src/components/layout` (Screen with
paper grain, ScreenHeader, BottomSheet with drag-to-close, StickyFooter, TabBar, Rise/Reveal/
FadeIn/ScaleIn/DropIn entrance animations).

**Animations** run on the UI thread with Reanimated shared values. In-flow entrance animations
use shared values rather than layout `entering` props (on web those switch elements to absolute
positioning). The welcome hero's food orbit is a worklet port of the prototype's timeline and
pauses when the screen is unfocused, the app is backgrounded, or Reduce Motion is on.

## Accessibility

- Roles and labels on every control (`button`, `tab`, `radio`, `header`, `alert`, `link`);
  decorative SVG/text is hidden from assistive tech; the hidden tab bar is `aria-hidden`.
- Form errors are announced (`accessibilityRole="alert"`).
- 44-pt minimum touch targets via `hitSlop`; font scaling capped rather than disabled.
- Reduce Motion: Reanimated's default `ReduceMotion.System` plus explicit checks for long-running loops.

Screen-reader testing on devices is still outstanding (see INTEGRATION_CHECKLIST).

## Testing

```
tests/
  domain/       pricing, cart, loyalty, hours, reservations, catering, calendar, time formats
  services/     mock backend (auth, orders, payment proof, idempotency, bookings, catering,
                gift cards, notifications, profile) and HttpClient (auth header, refresh,
                single-flight, error mapping, timeouts)
  hooks/        idempotent retry keys
  components/   AuthSheet log-in / sign-up behaviour with the mock backend
  setup.ts      mock data source, zero latency, Reanimated/worklets/secure-store mocks
```

Tests type-check through `tests/tsconfig.json` so Jest globals don't leak into app code.

## Common changes

**Add a screen** — create `src/features/<f>/screens/XScreen.tsx`, add a route file in `app/(app)/`
that re-exports it, register it in `app/(app)/_layout.tsx` if it needs options, and add its entry
to `ROUTE_META`.

**Add an endpoint** — add the method to the contract in `repositories/contracts.ts`; implement it
in `services/mock/repositories` *and* `services/api/repositories.ts` (path in `endpoints.ts`,
DTO in `dto.ts`, mapping in `mappers.ts`); expose it through a feature hook with a key from
`queryKeys.ts`; document it in `API_CONTRACTS.md`.

**Change a business rule** — edit `src/domain/*` or `src/constants/business.ts`, update the tests,
and tell the backend team (the server must apply the same rule).

**Add images** — put files under `assets/images/<group>/` and run `npm run images:registry`;
reference them by key (e.g. `'menu/food/mighty-breakfast'`) from data.

**Connect the real backend** — follow [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md).
