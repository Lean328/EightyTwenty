The REST API behind the **EightyTwenty customer app** (Expo project `EightyTwentyMobile`). It implements
the contract the app is already coded against (`src/services/api/endpoints.ts`, `dto.ts`, `mappers.ts`,
`client.ts`): same paths, same camelCase fields, same error codes. Where this server behaves
differently from the app's `docs/API_CONTRACTS.md`, the difference is listed in section 4 below.

**How to read this page:** the guide below covers set-up and the rules shared by every call. Every
endpoint underneath, grouped by topic, has its own description, request/response schema, examples
and errors. Use **Try it out** to call the live API: run `POST /api/v1/app/auth/sign-in`, copy the
`accessToken`, press **Authorize** (top right) and paste it — the other calls then run as that customer.

Other formats: [readable version](/api/docs/app/redoc/) · [OpenAPI schema (YAML, import into Postman/Insomnia)](/api/docs/app/schema/)

## 1. Connect the app in 2 minutes

In the app's build profile / `.env`:

```bash
EXPO_PUBLIC_DATA_SOURCE=api
EXPO_PUBLIC_API_BASE_URL=https://eightytwenty-api.onrender.com/api/v1/app
EXPO_PUBLIC_API_TIMEOUT_MS=60000
```

- **No trailing slash** on the base URL; every path in `endpoints.ts` is appended as is
  (`/auth/sign-in` → `https://eightytwenty-api.onrender.com/api/v1/app/auth/sign-in`).
- **Timeout 60 s, not 15 s.** The server runs on Render's free plan, which sleeps after 15 minutes
  without traffic. The first request after a sleep takes about 30–50 s while it wakes up; later
  requests are fast. With the default 15 s the very first call fails with `TIMEOUT`.
- Local development: run the backend (`python manage.py runserver`) and use
  `http://<your-computer-LAN-IP>:8000/api/v1/app` from a phone, or `http://127.0.0.1:8000/api/v1/app`
  from a simulator on the same machine.
- No API key is needed. Public calls (cafés, menu, catering packages, offers, FAQs) need no token;
  everything else uses the bearer token from sign-in.

Quick check from a terminal:

```bash
curl https://eightytwenty-api.onrender.com/api/v1/app/locations
```

## 2. What works today

| Area | Status |
|---|---|
| Sign up, sign in, refresh, sign out, password reset | ✅ Live. Reset emails a link to a page on this server where the customer sets a new password. |
| Profile, preferences, favourites, saved addresses | ✅ Live. |
| Change password, delete account | ✅ `POST /me/password` returns a new session and signs out every other one. `DELETE /me` deletes the account at once (personal data removed, orders kept for the books, coffee card and gift card balance lost) — the app's "Close my account". The older `POST /me/closure-request` (email to the team) still works. |
| Cafés, opening hours, menu, categories, item detail | ✅ Live, from the same data as the website (edited in BOS). Sold-out items are left out per café. |
| Catering packages and enquiries | ✅ Live. Enquiries land in BOS → Enquiries and the customer gets an email. |
| Table booking requests (create, list, cancel) | ✅ Live. Saved in BOS → Bookings; the café inbox and the guest are emailed; the café confirms. |
| Coffee card (stamps, history, free coffee) | ✅ Live. Stamps are earned on app orders and can be added at the counter in BOS. |
| Gift card balance and activity | ✅ Live. Balance is topped up by the chain owner in BOS; spent on app orders. |
| In-app notification feed (bell) | ✅ Live. Filled by order status changes, stamps, booking decisions, gift card top-ups and offers the team sends from BOS (App offers → tick → "Send to the app"). |
| Offers and FAQs | ✅ Live, editable in BOS → Website. |
| **Orders** | ✅ Pricing, validation, status tracking, stamps, gift card spend, café workflow. ⚠️ **Card / Apple Pay payment is not connected** (no payment provider chosen yet): any order with money to pay answers `501 NOT_IMPLEMENTED`. Orders fully covered by the gift card go through. A demo mode exists for testing (section 3.8). |
| Order quote (`POST /orders/quote`) | ✅ Live (optional for the app; returns server-priced totals). |
| Saved cards | ⚠️ `GET` returns `[]`, `POST` answers `501`, `DELETE` is a no-op `204` (needs the payment provider). |
| Send an eGift card | ⚠️ `501` until a payment provider is connected (demo mode records it without sending anything). |
| Apple Wallet pass | ⚠️ `GET /me/loyalty/wallet-pass` answers `404` (no pass signing yet), which the app already treats as "not available". |
| Push notifications | ✅ Expo push: register the phone with `POST /me/push-tokens` after sign-in, remove it with `DELETE /me/push-tokens/{token}` before sign-out. Every feed item is pushed too, following the notification toggles in preferences. Push `data` = `{kind, notificationId, url}`; `url` is the app screen to open (`/orders/<id>` for order updates, `/offers` for offers, empty otherwise). |

## 3. Conventions

### 3.1 Format

| Topic | Rule |
|---|---|
| Body | JSON, UTF-8. Send `Content-Type: application/json` with a body. |
| Field names | `camelCase`, exactly as in the app's `dto.ts`. |
| Money | Integer **cents** (AUD, GST included), fields named `…Cents`: `priceCents: 650` = $6.50. |
| Timestamps | ISO-8601 with the Canberra offset, seconds precision: `2026-10-12T08:12:40+11:00`. |
| Dates | `YYYY-MM-DD`, café local date. |
| Times of day | `HH:MM`, 24-hour, café local time (`Australia/Sydney` = Canberra). |
| IDs | Opaque strings. Cafés, menu items, categories, catering packages and offers use stable slugs (`braddon`, `hotcoffee`, `lunch`, `keepcups`). Orders, bookings, addresses, enquiries, notifications use UUIDs. |
| Nulls | Fields typed `T \| null` are always present and sent as `null` when empty. |
| Trailing slash | Never: `/me/orders`, not `/me/orders/`. |

### 3.2 Authentication

- `POST /auth/sign-in` and `POST /auth/sign-up` return a **session**:

  ```json
  {
    "customerId": "6f0c2c3e-5f8b-4a3e-9d55-1d2b7f0a9e10",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "expiresAt": "2026-10-12T08:27:40+11:00"
  }
  ```

- Send `Authorization: Bearer <accessToken>` on every call marked **Auth: yes**.
- The **access token lasts 15 minutes**. When it expires the API answers `401`; the app's
  `HttpClient` then calls `POST /auth/refresh` once and retries — this is already built into the app.
- The **refresh token lasts 30 days and is single use**: every refresh returns a new pair; reusing
  an old refresh token answers `401` (the app then signs the customer out with "Your session has
  expired"). Changing the password revokes every session.
- A `401` from refresh only happens when the token is really unusable. Server or network trouble
  answers `5xx`, so the app keeps the customer signed in (as `client.ts` expects).

### 3.3 Errors

Every error has the same body. `message` is customer-ready Australian English — show it as is.

```json
{ "error": { "code": "VALIDATION", "message": "Enter a valid email address.", "fields": { "email": "invalid" } } }
```

| `code` | HTTP | When |
|---|---|---|
| `VALIDATION` | 422 (400 for unreadable JSON) | A field or business rule failed. `fields` names the field(s). |
| `UNAUTHORIZED` | 401 | Missing/expired access token, wrong email or password, unusable refresh token. |
| `FORBIDDEN` | 403 | Signed in but not allowed (rare in the app). |
| `NOT_FOUND` | 404 | Unknown id, or a record that belongs to another customer (never 403, so ownership is not revealed). |
| `CONFLICT` | 409 | Email already taken; Idempotency-Key reused with a different body; confirmed booking cancel. |
| `PRICE_CHANGED` | 409 | The server total differs from `expectedTotalCents` (see `POST /orders`). |
| `PAYMENT_DECLINED` | 402 | Payment token missing or refused. |
| `LOCATION_UNAVAILABLE` | 422 | The café is "coming soon" / has no confirmed hours: no orders or bookings. |
| `NOT_IMPLEMENTED` | 501 | Feature waiting on a provider (payments, saved cards, eGift). |
| `TOO_MANY_REQUESTS` | 429 | Rate limit (section 3.6). Not in the app's code list, so the app shows it as `UNKNOWN` with this message. |
| `SERVER` | 5xx | Unexpected failure ("Something went wrong on our side. Please try again."). |

`fields` values are short machine reasons: `required`, `invalid`, `too_short`, `too_long`, `taken`.
When several fields fail at once, `message` is "Please check the highlighted fields." When one field
fails, `message` is that field's message.

### 3.4 Idempotency (orders and eGift cards)

`POST /orders` and `POST /gift-cards/send` accept an `Idempotency-Key` header (up to 100 characters;
the app already sends `ord_…` / `gift_…`). Keys are kept per customer:

- Same key + same body (ignoring `payment.token` / `paymentToken`, which are new on every try) →
  the **original result** is returned with `201`; nothing is charged or created twice.
- Same key + a different body → `409 CONFLICT`.
- No key → no replay protection (each call is a new order).

### 3.5 Paging

`GET /me/orders` and `GET /me/loyalty/activity` return `{ "items": [...], "nextCursor": "20" | null }`.
Pass `?cursor=<nextCursor>&limit=<1–50>` (default 20). Treat the cursor as opaque. All other lists
are plain arrays (newest first where it matters, capped at 100 rows).

### 3.6 Rate limits

| Calls | Limit |
|---|---|
| sign-in, sign-up, refresh, password reset | 10 per minute per IP **and** per email |
| booking requests, catering enquiries, eGift sends | 10 per hour per customer |
| any other signed-in call | 600 per minute per customer |
| any other public call | 120 per minute per IP |

Polling `GET /orders/{id}` every 2 s (30/min) and the feed every 60 s fit well inside these limits.

### 3.7 Business rules the server owns

The server re-checks everything the app checks, in Canberra time:

- **Order pricing** — the port of the app's `computeTotals`, in integer cents: subtotal → +10%
  delivery → −free coffee (one unit of the cheapest coffee line, only with 9 stamps and
  `useReward: true`) → +2.95% card surcharge (`saved_card`/`new_card`, never Apple Pay) on
  (subtotal + delivery − reward) → −gift card (up to what is left) → total. The two rate steps are
  rounded half-up to a cent (10% of 2365¢ = 237¢; 2.95% of 11000¢ = 325¢). The delivery and
  surcharge rates come from BOS (Site settings → order rules: `deliveryRate`, `cardSurcharge`).
- **Stamps** — the app's `isCoffeeItem` and `stampsAfterOrder`: every item in category `coffee`
  except Puppychino / "Add Ons", plus cold drinks named coffee / latte / long black / mocha / cold
  brew. One stamp per coffee, max 9, redeeming resets the card and the free coffee earns nothing.
- **Bookings** — café open that day, `open ≤ time ≤ close − 30 min`, at least 12 hours' notice,
  dates from tomorrow, café has confirmed hours.

### 3.8 Payment demo mode (testing only)

No payment provider has been chosen yet (the café uses Square for gift cards; the decision is open).
Until one is connected:

- `PAYMENT_PROVIDER` empty (default, production): orders/eGifts with money to pay → `501 NOT_IMPLEMENTED`
  "Card and Apple Pay payments aren't available in the app yet. Please order at the café."
- `PAYMENT_PROVIDER=demo` (set on a test server only): accepts the app's demo tokens
  (`demo_applepay_…`, `demo_card_…`) and charges **nothing**, so the full order flow can be tested.
  Any other token → `402 PAYMENT_DECLINED`. Do not switch demo on where real customers order: it
  would send unpaid orders to the cafés.

When a provider is chosen, only `apps/orders/payments.py` (`charge`, `refund`) and the saved-card
endpoints change; the app contract stays the same.

## 4. Differences from the app's API_CONTRACTS.md

Read these before switching the app to `api` mode.

| # | Topic | This server | What the app may need |
|---|---|---|---|
| 1 | **Password rule** | At least **10 characters**, not too common, not all digits, not similar to the name/email (Django's validators). The app's form allows 6. | Nothing breaks — a weaker password gets `422 VALIDATION` with a clear message under the password field (`fields.password: "too_short"` or `"invalid"`). Updating `PASSWORD_MIN_LENGTH` to 10 in `src/utils/validation.ts` avoids the round trip. |
| 2 | **Catering package ids** | Slugs: `breakfast`, `lunch`, `afternoon-tea`. `name` is still "Breakfast", "Lunch", "Afternoon Tea". | None if the app uses the `id` it received (it does). |
| 3 | **Café status** | `coming_soon` when the café is TBC **or** has no opening hours entered in BOS (same rule the app applies to `weeklyHours: null`). `flags` always has all three booleans. `area` falls back to `subtitle`. | None. |
| 4 | **Menu per café** | `GET /locations/{id}/menu` leaves out items the café marked **sold out** or **hidden** (BOS → Availability board / Location overrides), and includes items only that café sells. Prices include café price overrides. | The app has no sold-out UI; items simply disappear and come back. A cart line that sells out meanwhile gets `422` "An item in your order is no longer available." |
| 5 | **Images** | `imageUrl` / `galleryUrls` are Supabase Storage WebP files, 800 px on the long side. `null` when a photo has not been uploaded. | Use `{ uri }` as the mapper does. |
| 6 | **Orders – payment** | `501 NOT_IMPLEMENTED` whenever card/Apple Pay money is due (section 3.8). `saved_card` always answers `422 fields.paymentMethodId` because there are no saved cards yet. Orders the gift card fully covers (total $0) are accepted with no token. | Show the 501 message (the app already does for `NOT_IMPLEMENTED`). |
| 7 | **Orders – options** | Strict: an unknown group/option, the same option twice, or more choices than `maxSelections` → `422` "Some options for {item} have changed. Please choose them again." A missing required group → "Choose options for {item}." | None in normal use. |
| 8 | **Orders – timing** | `scheduled.time` must be `HH:MM`; it is not checked against the café's hours yet (same as the app's mock). ASAP orders are accepted while the café is closed. | None. |
| 9 | **Orders – status** | Café staff may skip steps (e.g. `received → ready`). A café can decline until the order is `ready`; a decline gives back the gift card amount, the stamps earned and a redeemed free coffee, and adds a feed line. | The status screen must not assume every stage appears. |
| 10 | **Bookings** | Saved as requests even when the website's online booking switch is off for that café (the app's process is "request, the café confirms"). Cancelled and declined bookings stay in the list with `status: "cancelled"`; BOS statuses map `seated → confirmed`, `declined / no_show → cancelled`. Guests 1–100. | None. |
| 11 | **Catering enquiries** | `date`, when sent, must be after today; `guests` 1–10000; `time` `HH:MM`. Occasion defaults to "Catering". | None. |
| 12 | **eGift send** | `501` until a payment provider exists; in demo mode it is recorded only (no email to the recipient). Allowed amounts 2500/5000/7500/10000. | None. |
| 13 | **Password reset** | `204` whether or not the email has an account. The email links to `https://<api-host>/account/reset-password?uid=…&token=…`, a small page on this server where the customer chooses a new password (the link works once, for 3 days). | The app only needs to show "Check your email for a reset link". |
| 14 | **Closing an account** | `DELETE /me` deletes it straight away (`204`); staff accounts → `403`. `POST /me/closure-request` still only emails the team. | Confirm first, then clear the local session. |
| 15 | **Errors on unknown paths** | A path that does not exist answers `404` with a generic body (`code: "not_found"`, lower case). | The app maps the 404 status to `NOT_FOUND` anyway. |

## 5. What the café team sees (BOS)

Everything above is managed in the BOS workspace (https://eightytwenty-api.onrender.com/):

| Sidebar | What it is for |
|---|---|
| Daily operations → **App orders** | New orders (badge counts "received"). Open one and press **Accept order → Start preparing → Mark as ready → Complete**, or **Decline order**. Each step updates the app at once. Café owners and staff only see their own cafés. The café inbox also gets an email per new order. |
| Daily operations → Bookings | App booking requests (source "App", with the table preference). Confirm/Decline notify the guest by email and in the app feed. |
| Daily operations → Enquiries | App catering enquiries (linked to the customer). |
| Menu → Availability board | Sold-out switches: a sold-out item leaves that café's app menu. |
| Menu → Categories | "Short name" = the label on the app's category rail. |
| Locations → Locations → "Mobile app" | `area` (card label) and `headline` (Home featured card). |
| Website → App offers / App FAQs | The app's Offers and Help content. |
| People → **Coffee cards** | Search a member number (shown under the barcode in the app) and change the stamps: +1 at the counter, 0 when the free coffee is redeemed. History is recorded and the customer sees it. |
| People → **Gift cards** | Chain owner only: raise a balance to top it up (recorded as "Added to your balance", customer notified). |

## 6. Testing checklist

1. `GET /locations`, `/menu/categories`, `/locations/braddon/menu` — 10 cafés, 12 categories, 84 items.
2. Sign up → `GET /me` → `GET /me/preferences` / `/me/loyalty` / `/me/gift-card`.
3. Wait 15 minutes (or force a 401) and check the app refreshes silently; sign out and check the
   old refresh token answers 401.
4. Favourite and unfavourite an item; add and delete an address.
5. Book a table at Braddon for tomorrow 10:00 → appears in BOS → Bookings; cancel it in the app.
6. Send a catering enquiry → appears in BOS → Enquiries.
7. On a test server with `PAYMENT_PROVIDER=demo`: place a pickup order with Apple Pay (demo token),
   watch it in BOS → App orders, press Accept / Ready / Complete and check the app's status screen
   and notification feed follow. Place a second order and decline it: the stamp disappears again.
8. Give the test customer a $10 gift card balance in BOS → Gift cards and pay an order with it.
9. Try `POST /orders` with a wrong `expectedTotalCents` → the app shows "Your total changed to …".

Contact for API questions: the BOS developer. Changes to this contract are additive within
`/api/v1/app`; anything breaking would move to `/api/v2/app`.
