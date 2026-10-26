# Backend handoff

What the EightyTwenty app needs from a backend, which rules the server must own, and which
business questions are still open. Endpoint-level detail is in [API_CONTRACTS.md](API_CONTRACTS.md),
and field-level models are in [DATA_MODELS.md](DATA_MODELS.md).

**Status:** no backend exists yet. The app runs on a local simulated backend
(`src/services/mock`). The HTTP layer (`src/services/api`) is written against *proposed*
contracts. Nothing in this document describes a live service.

---

## 1. How the app talks to the server

- **One switch:** `EXPO_PUBLIC_DATA_SOURCE=api` + `EXPO_PUBLIC_API_BASE_URL`. Screens don't change.
- **Contracts:** `src/repositories/contracts.ts` lists every call the app makes (13 repositories).
  Each method maps to one endpoint in `src/services/api/endpoints.ts`.
- **Wire format:** JSON; money in integer cents (`…Cents`); timestamps ISO-8601 with offset;
  enums snake_case (exceptions are listed in API_CONTRACTS §1.2). Mappers convert to app models.
- **Auth:** bearer access token + refresh token, stored in the device keychain/keystore. On a 401
  the client refreshes once (single-flight) and retries. An offline or 5xx refresh keeps the
  customer signed in; a rejected refresh signs them out with "Your session has expired".
- **Errors:** `{ "error": { "code", "message", "fields" } }`. Codes the app reacts to:
  `VALIDATION` (field errors under inputs), `CONFLICT`, `PRICE_CHANGED`, `PAYMENT_DECLINED`,
  `LOCATION_UNAVAILABLE`, `NOT_FOUND`, `UNAUTHORIZED`/`SESSION_EXPIRED`, `NOT_IMPLEMENTED`.
  `message` is shown to customers, so it must be customer-ready copy.
- **Idempotency:** `POST /orders` and `POST /gift-cards/send` carry an `Idempotency-Key`. The client
  reuses the key when it retries after a timeout or network failure; the server must replay the
  original result for a repeated key instead of charging again.
- **Images:** the mock uses images bundled in the app; the API returns `imageUrl` (CDN). Serve
  WebP/JPEG sized for mobile (≈ 2–3× the on-screen size; see ASSET_AUDIT for current sizes).

## 2. What the server owns

### Accounts and customers
- Sign up, sign in, refresh, sign out (revoke refresh token), password reset (email flow not designed yet).
- Unique email per account (`409 CONFLICT`, `fields.email = "taken"`), including on profile edits.
- Profile (name, email, phone), preferences (home café, dietary, notification categories,
  security toggles), favourites, saved addresses.
- Account closure is a request handled by staff (the prototype says "Contact us to close your account").
- The mock accepts any password of 6+ characters. **Set a real password policy**, rate-limit
  sign-in, and decide on email verification.

### Cafés
- Ten venues (nine trading, plus Akuna St coming soon), with address, phone, email, structured weekly hours, fulfilment methods
  (Pickup/Delivery/Dine In), notes, wait time, flags (flagship, limited menu, gluten free),
  external ordering URL, and a coming-soon state (hours TBC).
- Hours are evaluated in **Canberra time** (`Australia/Sydney`) on the server. The app currently
  evaluates them in the device time zone.

### Menu
- Categories, items, prices, dietary markers, modifier groups (required / single / multi choice,
  option prices), images.
- The source has **one shared menu**. Per-café availability (limited menu at Civic, gluten-free
  cafés) is not in the data and must come from the POS / menu system.

### Orders and pricing — the server is the authority
- `POST /orders` re-prices every line from the catalogue and **rejects** a request whose
  `expectedTotalCents` differs (`409 PRICE_CHANGED`), so customers never pay a total they didn't see.
- Pricing order (port of `src/domain/pricing.ts`, integer cents, rates rounded half-up to a cent):
  subtotal → +10% delivery → −free coffee (cheapest coffee line, one unit) → +2.95% card
  surcharge (saved or new card, not Apple Pay) → −gift card (up to the remaining total) → total.
- Validation: café open for ordering, method offered there, delivery address / table number
  present, required modifiers chosen, payment proof present (provider token, or a saved card
  that belongs to the customer).
- Status lifecycle: `received → confirmed → preparing → ready → completed`, or `declined`.
  The app polls `GET /orders/{id}` every 2 s while live; push or websocket can replace this.
- Side effects only for accepted orders: stamps, reward redemption, gift card spend. If the café
  declines *after* acceptance, the server must reverse payment, stamps and gift card spend (not modelled yet).
- Orders go to the kitchen. The cafés currently take online orders through the
  `*.lifeintouch.net` ordering sites linked on each café; the integration with that system or
  the POS is a backend decision.

### Payments
- Source copy: eGift cards are issued and redeemed through **Square**. The app expects a provider
  SDK on the device that returns **single-use tokens** (Apple Pay sheet, card entry UI). The
  backend charges with the token; the app never sees or sends card numbers.
- Saved cards are provider card-on-file references (brand, last four, expiry for display only).
- Surcharge applies to card payments only (2.95%).

### Loyalty
- 9 stamps → the 10th coffee is free. One stamp per eligible coffee; the card caps at 9; redeeming
  resets the card, and the free coffee itself earns nothing (`src/domain/loyalty.ts`, tests in
  `tests/domain/loyalty.test.ts`).
- Eligibility is currently derived from category and item name. The server should own an explicit
  `earnsStamp` flag per item.
- Member number and a scannable barcode (the app shows a decorative barcode until a real code is provided).
- **Apple Wallet pass**: a signed `.pkpass` per member (Pass Type ID + certificate on the
  server), the PassKit web service to push stamp updates, and `GET /me/loyalty/wallet-pass`.
  Google Wallet would be a separate integration.

### Reservations
- Today's process: **booking requests by email** to the café inbox, confirmed by the café;
  same-day bookings by SMS. The app keeps that: it records a request and opens a pre-filled email.
- Rules: open hours only, last booking 30 min before close, ≥ 12 hours' notice, dates from
  tomorrow, café must have confirmed hours. The server must re-check them in Canberra time.
- Statuses `Requested → Confirmed` (or `Cancelled`). Customers can cancel only `Requested`.
- There is no table inventory or availability data in the source.

### Catering
- Packages (Breakfast / Lunch / Afternoon tea) with from-prices per person; the estimate is
  "From $X for N people", not a quote.
- Enquiries go to `info@`; statuses `Enquiry sent → Quoted → Confirmed → Closed`.

### Gift cards
- Balance, activity (added, spent, sent), send an eGift card ($25/$50/$75/$100) paid with Apple Pay,
  issued through Square. Gift card spend at checkout is applied by the server.

### Notifications
- In-app feed with unread state, "seen" marker for the bell badge, mark all read, clear.
- **Push notifications are not implemented**: device token registration, APNs/FCM and the
  per-category preferences (Order updates, Bookings, Coffee card, Offers & news, Gift card
  activity) still need a backend.

### Content
- Offers (Keep Cups, catering, gift cards…), FAQs, and Home "What's on" tiles. Editorial copy such
  as the Kingston tile should come from a CMS.

### Configuration
`src/constants/business.ts` hard-codes rules from the prototype and website: surcharge, delivery
rate, scheduled-pickup window (7:00 am–2:30 pm), quantity caps (20 per item from the sheet, 99
typed), stamps per reward, booking notice, gift card amounts, contact details. A config endpoint
could serve these later; until then, changing one needs an app release **and** the same change on the server.

## 3. Security and privacy

- No secrets in the app; `EXPO_PUBLIC_*` values are public.
- Tokens in secure storage; the session is cleared on sign-out and on a rejected refresh.
- PII held by the server: name, email, phone, addresses, order history, bookings. A privacy
  policy, data retention rules and account-deletion handling are needed for the App Store and
  Google Play.
- The mock database is device-local demo data and holds no real customer information.

## 4. Open business questions

| # | Question |
|---|---|
| 1 | Should the 2.95% surcharge apply when the gift card covers the whole order? (Today: surcharge is calculated before the gift card, as in the prototype.) |
| 2 | Which drinks earn stamps (babychino, hot chocolate, teas, teapots)? |
| 3 | Per-café menus and availability (Civic limited menu, gluten-free cafés). |
| 4 | Scheduled pickup times: fixed 7:00 am–2:30 pm today, regardless of each café's hours. |
| 5 | Delivery zones and fees beyond the flat 10%. |
| 6 | Reservations: keep email requests, or move to a booking system with availability? |
| 7 | GST display on receipts / totals. |
| 8 | Password reset, email verification and account deletion flows. |
| 9 | Akuna St opening hours and details. |
| 10 | Who handles declined-after-accepted orders and refunds? |

## 5. Switching the app to the real API

1. Implement the endpoints in API_CONTRACTS.md (start with auth, locations, menu, orders).
2. Set `EXPO_PUBLIC_DATA_SOURCE=api` and `EXPO_PUBLIC_API_BASE_URL` in the build profile.
3. Replace `demoPaymentProvider` with the Square In-App Payments (or equivalent) implementation of
   `PaymentProvider`, and add the Apple Pay merchant configuration.
4. Implement Wallet passes, push notifications and the remaining items in
   [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md).
5. Run the app against staging and repeat the flows listed in the README's verification section.
