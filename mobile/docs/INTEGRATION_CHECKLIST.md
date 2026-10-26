# Integration checklist

Everything between this codebase and a store release. Items are unchecked unless they were done
and verified in this repository.

## Done in this codebase

- [x] Modular Expo Router app, strict TypeScript, ESLint clean, `expo-doctor` 21/21
- [x] Repository contracts with mock and HTTP implementations, switchable by `EXPO_PUBLIC_DATA_SOURCE`
- [x] HTTP client: bearer auth, single-flight refresh, timeouts, error normalisation, idempotency keys
- [x] Session tokens in secure storage; sign-out clears tokens, cache, cart and UI state
- [x] Payment, Wallet, storage and device-link boundaries (`src/services/integrations`)
- [x] Proposed API contracts and data models (`docs/API_CONTRACTS.md`, `docs/DATA_MODELS.md`)
- [x] Automated tests: domain rules, mock backend, HTTP client, retry keys, auth sheet (98 tests)
- [x] Asset audit and optimised, renamed assets (`docs/ASSET_AUDIT.md`)

## Backend

- [ ] Build the endpoints in `docs/API_CONTRACTS.md` (auth, customers, preferences, locations,
      menu, orders, payments, loyalty, reservations, catering, gift cards, notifications, content)
- [ ] Server-side pricing identical to `src/domain/pricing.ts` (integer cents, half-up per rate) and `PRICE_CHANGED` check
- [ ] Idempotency-key storage and replay for orders and gift cards
- [ ] Booking and opening-hours rules evaluated in Canberra time
- [ ] Order routing to the kitchen / POS; decline and refund handling
- [ ] Per-café menu availability
- [ ] Staging and production base URLs; set `EXPO_PUBLIC_DATA_SOURCE=api` and
      `EXPO_PUBLIC_API_BASE_URL` per EAS build profile
- [ ] Answer the open business questions in `docs/BACKEND_HANDOFF.md` §4

## Authentication

- [ ] Real identity provider or auth service; password policy, rate limiting, lockout
- [ ] Password reset flow (the app's "Forgot password?" shows "not connected" today)
- [ ] Email verification (decide whether it's required)
- [ ] Account deletion (required by App Store guideline 5.1.1(v) for apps with account creation)
- [ ] Optional: Sign in with Apple / Google; Face ID sign-in (the toggle exists as a preference only)
- [ ] Remove the "Preview only" note in `AuthSheet` (it only shows with mock data)

## Payments (Square per the source copy, or another provider)

- [ ] Merchant account and API credentials (server-side only)
- [ ] Native payment SDK (e.g. Square In-App Payments) — needs a development build, not Expo Go
- [ ] Implement `PaymentProvider` (`src/services/integrations/payments.ts`) with the SDK and
      replace `demoPaymentProvider`; card entry must use the provider's PCI-compliant UI
- [ ] Replace the demo `NewCardFields` at checkout and the add-card form in Payment methods with the provider UI
- [ ] Apple Pay: Merchant ID, payment processing certificate, Apple Pay capability/entitlement,
      domain/merchant validation as required by the provider
- [ ] Google Pay on Android (the prototype shows Apple Pay only — confirm the Android design)
- [ ] Saved cards as provider card-on-file references
- [ ] Gift cards: Square eGift card issue/redeem/balance
- [ ] Remove demo notices (they hide automatically once `paymentProvider.isDemo` is false)

## Apple Wallet loyalty pass (separate from Apple Pay)

- [ ] Pass Type ID and signing certificate (server-side)
- [ ] Signed `.pkpass` per member at `GET /me/loyalty/wallet-pass`; real scannable barcode
- [ ] PassKit web service so stamps update on the pass
- [ ] Set `walletPassService.isDemo` to false once real passes are issued
- [ ] Optional: Google Wallet loyalty class/object for Android

## Push notifications

- [ ] `expo-notifications`, APNs key / FCM credentials, permission prompt placement
- [ ] Device token registration endpoint; send per the customer's notification categories
- [ ] Order status push (can replace 2-second polling)

## App configuration and store

- [ ] Confirm bundle identifier / package name (`au.com.eightytwentyfood.app` is a **placeholder**)
- [ ] EAS project, `eas.json` build profiles (development, preview, production)
- [ ] App icons and splash reviewed by the brand owner (generated from the circle logo)
- [ ] iOS privacy manifest and App Store privacy labels; Google Play data safety form
- [ ] Terms and Privacy Policy URLs (referenced in the sign-up copy) and in-app links
- [ ] Location permission copy if "Use my location" becomes functional (currently a preference only)
- [ ] Crash reporting and analytics (none included — choose and add, e.g. Sentry)
- [ ] OTA update policy (`expo-updates`) if wanted

## Content and data

- [ ] Real menu, prices and images from the POS / menu system (the fixtures are an approved snapshot)
- [ ] Akuna St hours and details
- [ ] CMS for offers, What's On tiles and FAQs
- [ ] Image CDN with mobile-sized renditions

## QA on devices (not possible in this environment)

- [ ] iOS and Android builds on simulators and physical devices (small and large phones)
- [ ] Expo Go smoke test (all modules are Expo Go compatible; untested)
- [ ] Keyboard behaviour on every form (checkout, reserve, catering, edit profile, auth)
- [ ] Native date and time pickers (reserve, catering), Android back button and predictive back
- [ ] VoiceOver and TalkBack pass; Dynamic Type at the largest sizes (capped at 1.3×)
- [ ] Reduce Motion on (welcome orbit stops, entrance animations skip)
- [ ] Animation smoothness on a low-end Android device; tab bar shadow rendering on Android
- [ ] Offline and slow network (timeouts, retry after a dropped connection doesn't double-charge)
- [ ] Session expiry and refresh against the real auth service
- [ ] Deep links (`eightytwenty://…`) and universal links if configured
- [ ] Time zones: device outside Canberra time
