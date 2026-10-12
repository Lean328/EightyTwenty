# EightyTwenty Mobile App API

The REST API the **EightyTwenty customer app** (Expo project `EightyTwentyMobile`) talks to.
It implements the contract the app is already coded against: `EightyTwentyMobile/docs/API_CONTRACTS.md`,
`src/services/api/endpoints.ts`, `dto.ts`, `mappers.ts` and `client.ts`. The paths, field names and
error codes below match those files. Where this server behaves differently from the app's
proposal, the difference is listed in [§4](#4-differences-from-the-apps-api_contractsmd).

> Written for the developer who connects the app. Live interactive docs (every field, every
> status): **https://eightytwenty-api.onrender.com/api/docs/** → the sections tagged `App · …`.
> Machine-readable schema: `docs/openapi.yaml` (or `/api/schema/`).

## Contents

1. [Connect the app in 2 minutes](#1-connect-the-app-in-2-minutes)
2. [What works today](#2-what-works-today)
3. [Conventions](#3-conventions) (format, auth, errors, idempotency, paging, limits)
4. [Differences from the app's API_CONTRACTS.md](#4-differences-from-the-apps-api_contractsmd)
5. [Endpoint reference](#5-endpoint-reference)
6. [What the café team sees (BOS)](#6-what-the-café-team-sees-bos)
7. [Testing checklist](#7-testing-checklist)

---

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
| Profile, preferences, favourites, saved addresses, account closure request | ✅ Live. Closure emails the team (they close it by hand). |
| Cafés, opening hours, menu, categories, item detail | ✅ Live, from the same data as the website (edited in BOS). Sold-out items are left out per café. |
| Catering packages and enquiries | ✅ Live. Enquiries land in BOS → Enquiries and the customer gets an email. |
| Table booking requests (create, list, cancel) | ✅ Live. Saved in BOS → Bookings; the café inbox and the guest are emailed; the café confirms. |
| Coffee card (stamps, history, free coffee) | ✅ Live. Stamps are earned on app orders and can be added at the counter in BOS. |
| Gift card balance and activity | ✅ Live. Balance is topped up by the chain owner in BOS; spent on app orders. |
| In-app notification feed (bell) | ✅ Live. Filled by order status changes, stamps, booking decisions and gift card top-ups. |
| Offers and FAQs | ✅ Live, editable in BOS → Website. |
| **Orders** | ✅ Pricing, validation, status tracking, stamps, gift card spend, café workflow. ⚠️ **Card / Apple Pay payment is not connected** (no payment provider chosen yet): any order with money to pay answers `501 NOT_IMPLEMENTED`. Orders fully covered by the gift card go through. A demo mode exists for testing (§3.8). |
| Order quote (`POST /orders/quote`) | ✅ Live (optional for the app; returns server-priced totals). |
| Saved cards | ⚠️ `GET` returns `[]`, `POST` answers `501`, `DELETE` is a no-op `204` (needs the payment provider). |
| Send an eGift card | ⚠️ `501` until a payment provider is connected (demo mode records it without sending anything). |
| Apple Wallet pass | ⚠️ `GET /me/loyalty/wallet-pass` answers `404` (no pass signing yet), which the app already treats as "not available". |
| Push notifications | ❌ Not built (the in-app feed works). |

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
| `PRICE_CHANGED` | 409 | The server total differs from `expectedTotalCents` (§5 orders). |
| `PAYMENT_DECLINED` | 402 | Payment token missing or refused. |
| `LOCATION_UNAVAILABLE` | 422 | The café is "coming soon" / has no confirmed hours: no orders or bookings. |
| `NOT_IMPLEMENTED` | 501 | Feature waiting on a provider (payments, saved cards, eGift). |
| `TOO_MANY_REQUESTS` | 429 | Rate limit (§3.6). Not in the app's code list, so the app shows it as `UNKNOWN` with this message. |
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
| 6 | **Orders – payment** | `501 NOT_IMPLEMENTED` whenever card/Apple Pay money is due (§3.8). `saved_card` always answers `422 fields.paymentMethodId` because there are no saved cards yet. Orders the gift card fully covers (total $0) are accepted with no token. | Show the 501 message (the app already does for `NOT_IMPLEMENTED`). |
| 7 | **Orders – options** | Strict: an unknown group/option, the same option twice, or more choices than `maxSelections` → `422` "Some options for {item} have changed. Please choose them again." A missing required group → "Choose options for {item}." | None in normal use. |
| 8 | **Orders – timing** | `scheduled.time` must be `HH:MM`; it is not checked against the café's hours yet (same as the app's mock). ASAP orders are accepted while the café is closed. | None. |
| 9 | **Orders – status** | Café staff may skip steps (e.g. `received → ready`). A café can decline until the order is `ready`; a decline gives back the gift card amount, the stamps earned and a redeemed free coffee, and adds a feed line. | The status screen must not assume every stage appears. |
| 10 | **Bookings** | Saved as requests even when the website's online booking switch is off for that café (the app's process is "request, the café confirms"). Cancelled and declined bookings stay in the list with `status: "cancelled"`; BOS statuses map `seated → confirmed`, `declined / no_show → cancelled`. Guests 1–100. | None. |
| 11 | **Catering enquiries** | `date`, when sent, must be after today; `guests` 1–10000; `time` `HH:MM`. Occasion defaults to "Catering". | None. |
| 12 | **eGift send** | `501` until a payment provider exists; in demo mode it is recorded only (no email to the recipient). Allowed amounts 2500/5000/7500/10000. | None. |
| 13 | **Password reset** | `204` whether or not the email has an account. The email links to `https://<api-host>/account/reset-password?uid=…&token=…`, a small page on this server where the customer chooses a new password (the link works once, for 3 days). | The app only needs to show "Check your email for a reset link". |
| 14 | **Closure request** | `204`; emails the team, who close the account by hand (gift card balance is checked first). | Show "Account closure requested". |
| 15 | **Errors on unknown paths** | A path that does not exist answers `404` with a generic body (`code: "not_found"`, lower case). | The app maps the 404 status to `NOT_FOUND` anyway. |

## 5. Endpoint reference

Base URL: `https://eightytwenty-api.onrender.com/api/v1/app`. "Auth: yes" = bearer token required.
Every endpoint can also return `401` (auth), `429` (rate limit) and `5xx`.

### Auth

#### `POST /auth/sign-in` · Auth: no

```json
{ "email": "sophie@example.com", "password": "my-long-password" }
```

`200` → session (§3.2). Email is trimmed and case-insensitive.
Errors: `422` `fields.email: "invalid"` "Enter a valid email address."; `422` `fields.password: "too_short"`
"Your password needs at least 6 characters."; `401 UNAUTHORIZED` "That email and password don't match.
Try again or reset your password."

#### `POST /auth/sign-up` · Auth: no

```json
{ "name": "Sophie Nguyen", "phone": "0400 123 456", "email": "sophie@example.com", "password": "my-long-password" }
```

`201` → session. Creates the customer with a coffee card (0 stamps, member number `8020 NNNN NNNN`),
a $0 gift card and default preferences (home café Phillip, Offers & news off, everything else on).
Errors (first failing field): `name` "Add your full name.", `phone` (8+ digits) "Add a mobile number.",
`email` "Enter a valid email address.", `password` (§4 #1); `409 CONFLICT` `fields.email: "taken"`
"An account with this email already exists. Log in instead."

#### `POST /auth/refresh` · Auth: no

```json
{ "refreshToken": "eyJ…" }
```

`200` → a new session (new access **and** refresh token). `401` when the token is expired, revoked or
already used.

#### `POST /auth/sign-out` · Auth: optional

```json
{ "refreshToken": "eyJ…" }
```

`204` always (revokes the refresh token if it is valid).

#### `POST /auth/password-reset` · Auth: no

```json
{ "email": "sophie@example.com" }
```

`204` always (see §4 #13). `422` for a malformed email.

### Account

#### `GET /me` · Auth: yes

```json
{ "id": "6f0c2c3e-…", "name": "Sophie Nguyen", "email": "sophie@example.com", "phone": "0400 123 456", "memberSince": "2026-10-12" }
```

#### `PATCH /me` · Auth: yes

Send only what changes: `{ "name"?, "email"?, "phone"? }` → `200` full profile.
Errors: `name` blank "Add your name."; `email` "Enter a valid email address."; `phone` (when not
empty, 8+ digits) "Add a mobile number."; `409` `fields.email: "taken"` "Another account already uses
this email." Changing only the letter case of your own email is fine.

#### `POST /me/closure-request` · Auth: yes

No body → `204`.

#### `GET /me/preferences` · Auth: yes

```json
{
  "homeCafeId": "phillip",
  "dietary": ["vegan"],
  "notifications": { "orderUpdates": true, "bookings": true, "coffeeCard": true, "offersAndNews": false, "giftCardActivity": true },
  "security": { "biometricSignIn": true, "useLocation": true, "rememberOrderSettings": true },
  "avatar": 0
}
```

#### `PATCH /me/preferences` · Auth: yes

Any subset of the object above; top-level merge, and `notifications` / `security` must be sent
complete (all keys) when present — the app already does this. `200` → full preferences.
Errors: `fields.homeCafeId: "invalid"` "Choose one of our cafés."; `dietary` values must be
`gluten_free | dairy_free | vegan | vegetarian`; `avatar` 0–5.

#### `GET /me/favourites` · Auth: yes

`200` → `{ "itemIds": ["hotcoffee", "granola"] }` (order added; items that left the menu are dropped).

#### `PUT /me/favourites/{itemId}` and `DELETE /me/favourites/{itemId}` · Auth: yes

No body. Both are idempotent and return **`200` with the full list** (never 204).
`PUT` on an item not on the menu → `404` "That item is no longer on the menu."

#### `GET /me/addresses` · Auth: yes

`200` → `[{ "id": "uuid", "label": "home", "line": "12 Smith St, Braddon ACT 2612" }]`

#### `POST /me/addresses` · Auth: yes

`{ "label": "home" | "work" | "other", "line": "…" }` → `201` address. Blank line →
`fields.line: "required"` "Add an address."

#### `DELETE /me/addresses/{id}` · Auth: yes

`204`, idempotent.

### Cafés & menu

#### `GET /locations` · Auth: no

`200` → array in display order, coming-soon cafés included. One element:

```json
{
  "id": "braddon",
  "name": "Braddon",
  "subtitle": "Lonsdale St",
  "area": "Lonsdale St",
  "headline": "Wholesome food, great coffee on Lonsdale St.",
  "address": "1/18 Lonsdale St, Braddon ACT 2612",
  "phone": "0451 448 018",
  "email": "braddon@eightytwentyfood.com.au",
  "hoursLabel": "Mon–Sun 6:00am – 3:00pm",
  "hoursShort": "6am – 3pm, 7 days",
  "weeklyHours": {
    "sun": { "open": "06:00", "close": "15:00" }, "mon": { "open": "06:00", "close": "15:00" },
    "tue": { "open": "06:00", "close": "15:00" }, "wed": { "open": "06:00", "close": "15:00" },
    "thu": { "open": "06:00", "close": "15:00" }, "fri": { "open": "06:00", "close": "15:00" },
    "sat": { "open": "06:00", "close": "15:00" }
  },
  "status": "open",
  "fulfilmentMethods": ["pickup", "delivery", "dine_in"],
  "note": "Located right at the Rainbow Roundabout",
  "waitLabel": "20–25 min",
  "imageUrl": "https://<project>.supabase.co/storage/v1/object/public/media/website/<uuid>/800.webp",
  "galleryUrls": ["https://…/800.webp", "https://…/800.webp"],
  "externalOrderUrl": "https://eightytwentybraddon.lifeintouch.net/",
  "bookingLabel": "Braddon - Lonsdale St",
  "flags": { "flagship": true, "limitedMenu": false, "glutenFree": false }
}
```

A closed day is `null` (Civic: `"sat": null, "sun": null`). A TBC café (Akuna St) has
`"weeklyHours": null, "status": "coming_soon"`. `phone`, `email`, `waitLabel`, `imageUrl`,
`externalOrderUrl` are `null` when empty.

#### `GET /locations/{id}` · Auth: no

`200` → one café. `404` "That café could not be found."

#### `GET /locations/{id}/menu` · Auth: no

`200` → the café's items (see §4 #4), in menu order:

```json
{
  "id": "granola",
  "categoryId": "allday",
  "name": "Granola Bowl",
  "description": "Berry Yoghurt, House made Vegan & Gluten Free Granola, …",
  "priceCents": 2200,
  "dietary": ["DF*", "GF*", "Vegan", "Vegetarian"],
  "imageUrl": "https://…/800.webp",
  "featured": false,
  "modifierGroups": [
    {
      "id": "milk",
      "name": "Milk",
      "required": true,
      "maxSelections": 1,
      "options": [ { "name": "Almond Milk", "priceCents": 0 }, { "name": "Soy Milk", "priceCents": 0 } ]
    }
  ]
}
```

`maxSelections`: 1 = single choice, 0 = any number. Option **names** identify options inside a
group (they are what you send back in `selections`). `dietary` uses the display strings
`GF*`, `DF*`, `Gluten free`, `Dairy free`, `Vegan`, `Vegetarian` (`*` = option on request).
`404` for an unknown café.

#### `GET /menu/categories` · Auth: no

`200` → `[{ "id": "coffee", "name": "Coffee & Hot Drinks", "shortName": "Coffee", "note": "" }, …]`
in rail order. Keep the ids `coffee` and `cold`: stamp eligibility depends on them.

#### `GET /menu/items/{id}` · Auth: no

`200` → one item whatever the café. `404` "That item is no longer on the menu."

### Orders & payments

#### `POST /orders` · Auth: yes · Header `Idempotency-Key`

```json
{
  "locationId": "braddon",
  "method": "pickup",
  "timing": { "type": "asap" },
  "deliveryAddress": null,
  "tableNumber": null,
  "lines": [
    { "itemId": "hotcoffee", "qty": 1, "selections": { "drink": ["Flat White"], "var": ["OAT ADC"] }, "note": "" },
    { "itemId": "bburger", "qty": 1, "selections": { "style": ["Original"] }, "note": "No beetroot relish" }
  ],
  "payment": { "choice": "new_card", "token": "<single-use provider token>" },
  "useGiftCard": true,
  "useReward": false,
  "contact": { "name": "Sophie Nguyen", "phone": "0400 123 456" },
  "expectedTotalCents": 2016
}
```

- `method`: `pickup | delivery | dine_in`; `timing`: `{ "type": "asap" }` or `{ "type": "scheduled", "time": "11:30" }`.
- `deliveryAddress` is required for delivery, `tableNumber` for dine-in.
- `qty` 1–99, up to 50 lines, `note` up to 500 characters.
- `payment.choice`: `apple_pay | saved_card | new_card`; `token` is the provider's single-use token
  (never card numbers). Leave it out when the total is $0.
- `expectedTotalCents`: the total the customer saw.

`201` → the order:

```json
{
  "id": "4458a402-6f66-47eb-893a-63faa08137eb",
  "number": "#8020-1197",
  "locationId": "braddon",
  "locationName": "Braddon",
  "method": "pickup",
  "status": "received",
  "createdAt": "2026-10-12T08:12:40+11:00",
  "timing": { "type": "asap" },
  "deliveryAddress": null,
  "tableNumber": null,
  "lines": [
    { "itemId": "hotcoffee", "name": "Milk Based Coffee", "qty": 1, "unitPriceCents": 630,
      "selections": { "drink": ["Flat White"], "var": ["OAT ADC"] }, "modifiersLabel": "Flat White, OAT ADC", "note": "" },
    { "itemId": "bburger", "name": "Breakfast Burger", "qty": 1, "unitPriceCents": 2300,
      "selections": { "style": ["Original"] }, "modifiersLabel": "Original", "note": "No beetroot relish" }
  ],
  "totals": { "subtotalCents": 2930, "deliveryCents": 0, "rewardCents": 0, "surchargeCents": 86, "giftCardCents": 1000, "totalCents": 2016 },
  "paymentLabel": "Card + gift card",
  "stampsEarned": 1,
  "rewardRedeemed": false,
  "estimatedWait": "20–25 min"
}
```

Checks, in this order (the first failure is returned):

| # | Check | Error |
|---|---|---|
| 0 | Repeated `Idempotency-Key` | original order (`201`) or `409 CONFLICT` (§3.4) |
| 1 | Café exists and takes orders | `422 LOCATION_UNAVAILABLE` "This café isn't taking orders yet." |
| 2 | Method offered there | `422` "Delivery isn't offered at Civic." |
| 3–4 | Address / table present | `422` `fields.deliveryAddress` "Add a delivery address first." / `fields.tableNumber` "Add your table number first." |
| 5 | At least one line | `422` "Your order is empty." |
| 6 | Every item on this café's menu and not sold out | `422` "An item in your order is no longer available." |
| 7 | Options valid, required groups chosen | `422` (§4 #7) |
| 8 | Server total = `expectedTotalCents` | `409 PRICE_CHANGED` "Your total changed to $X.XX. Please review your order." |
| 9 | `saved_card` | `422` `fields.paymentMethodId` "Choose a saved card." (§4 #6) |
| 10 | Money due → payment | `402 PAYMENT_DECLINED` "Payment was not completed." (no token) / `501 NOT_IMPLEMENTED` (no provider, §3.8) |

On success the server: saves the order, awards stamps / redeems the free coffee, spends the gift
card, adds feed lines, and emails the café inbox. `paymentLabel` is "Apple Pay", "Card",
"… + gift card", or "Gift card" (gift card paid everything). `estimatedWait` is the café's wait text
or "15–20 min".

#### `POST /orders/quote` · Auth: yes (optional)

Same body as `POST /orders` without `timing`, `contact`, `expectedTotalCents` and payment token
(`payment: { "choice": "apple_pay" }`). `200`:

```json
{
  "lines": [ { "itemId": "hotcoffee", "name": "Milk Based Coffee", "qty": 1, "unitPriceCents": 630, "modifiersLabel": "Flat White, OAT ADC" } ],
  "totals": { "subtotalCents": 630, "deliveryCents": 0, "rewardCents": 0, "surchargeCents": 0, "giftCardCents": 0, "totalCents": 630 },
  "rewardAvailable": false,
  "coffeeCount": 1,
  "itemCount": 1
}
```

Same errors as `POST /orders` checks 1–7. Calling it before checkout removes most `PRICE_CHANGED` trips.

#### `GET /orders/{id}` · Auth: yes

`200` → order. `404` "Order not found." (also for another customer's order).
Status lifecycle: `received → confirmed → preparing → ready → completed`, or `declined` (terminal).
Staff can skip steps (§4 #9). Poll while live (the app polls every 2 s); `completed` and `declined`
never change again.

#### `GET /me/orders` · Auth: yes

`200` → `{ "items": [order…], "nextCursor": "20" | null }`, newest first, declined orders included.

#### `GET /me/payment-methods` · Auth: yes

`200` → `[]` until a payment provider is connected (shape when it is:
`{ "id", "brand": "visa|mastercard|amex|jcb|other", "last4", "expMonth", "expYear" }`).

#### `POST /me/payment-methods` · Auth: yes

`{ "sourceToken": "…" }` → `501 NOT_IMPLEMENTED` "Saving a card isn't available in the app yet."

#### `DELETE /me/payment-methods/{id}` · Auth: yes

`204`.

### Loyalty & gift cards

#### `GET /me/loyalty` · Auth: yes

```json
{
  "stamps": 6,
  "stampsPerReward": 9,
  "memberNumber": "8020 0624 1188",
  "eligibility": "Any coffee or hot drink, any size, at any EightyTwenty café.",
  "rewardDescription": "Your 10th coffee is free.",
  "walletPassAdded": false
}
```

#### `GET /me/loyalty/activity` · Auth: yes · paged

```json
{ "items": [ { "id": "uuid", "type": "earn", "description": "+1 stamp · order #8020-1197", "locationName": "Braddon", "occurredAt": "2026-10-12T08:12:40+11:00" } ], "nextCursor": null }
```

`type` is `earn` or `redeem`. Lines come from app orders ("+N stamps · order #…", "Free coffee
redeemed"), the counter ("+1 stamp · in store") and declined-order reversals.

#### `GET /me/loyalty/wallet-pass` · Auth: yes

`404` "Wallet passes aren't available yet." (the app turns this into "not available").

#### `POST /me/loyalty/wallet-pass/added` · Auth: yes

No body → `200` coffee card with `walletPassAdded: true`.

#### `GET /me/gift-card` · Auth: yes

`200` → `{ "last4": "6451", "balanceCents": 4250 }`

#### `GET /me/gift-card/activity` · Auth: yes

`200` → `[{ "id", "kind": "added|spent|sent", "description", "amountCents", "occurredAt" }]`, newest
first. `amountCents` is always positive; `kind` gives the direction ("Added to your balance",
"Used on order #8020-1197", "Refunded from order #…", "Sent to Alex").

#### `POST /gift-cards/send` · Auth: yes · Header `Idempotency-Key`

```json
{ "amountCents": 5000, "recipientName": "Alex", "recipientEmail": "alex@example.com", "message": "Happy birthday!", "paymentToken": "<Apple Pay token>" }
```

`201` → gift activity (`kind: "sent"`, "Sent to Alex"). Today: `501` (§4 #12).
Errors: `422` "Add their name and a valid email." (`fields.recipientName` / `recipientEmail`);
`422` `fields.amountCents` "Choose $25, $50, $75 or $100."; `402` without a token. The sender's
balance does not change.

### Bookings & catering

#### `POST /reservations` · Auth: yes

```json
{
  "locationId": "braddon", "date": "2026-10-15", "time": "09:30", "guests": 2, "seating": "outdoor",
  "name": "Sophie Nguyen", "phone": "0400 123 456", "email": "sophie@example.com", "notes": "High chair please"
}
```

`201` → `{ "id", "locationId", "date", "time", "guests", "seating", "status": "requested", "createdAt" }`.
The café inbox gets the request (same lines as the app's email draft) and the guest gets a receipt.

Errors, in order:
1. Unknown / coming-soon café → `422 LOCATION_UNAVAILABLE` "Bookings open when hours are confirmed."
2. Missing date or not after today → `422` `fields.date: "invalid"` "Choose a date from tomorrow onwards."
3. Everything else together → `422` with every failing field (`guests | time | name | phone | email`)
   set to `"invalid"`; `message` is the time problem when there is one — "Café is closed on this
   date", "Café is closed at this time", "Bookings need at least 12 hours' notice" — otherwise
   "Please check the highlighted fields." Email uses the strict pattern; phone needs 8+ digits.

#### `GET /me/reservations` · Auth: yes

`200` → array (newest date first): `requested` (show "Cancel request"), `confirmed` (show "Call
café"), `cancelled` (no actions).

#### `DELETE /reservations/{id}` · Auth: yes

`204` and the café is emailed. Already cancelled → `204`. Confirmed → `409 CONFLICT` "This booking
is already confirmed. Please call the café to change it." Unknown / not yours → `404`.

#### `GET /catering/packages` · Auth: no

```json
[{
  "id": "lunch", "name": "Lunch", "pricePerPersonCents": 2750, "priceLabel": "$27.50", "unit": "per person",
  "imageUrl": "https://…/800.webp", "imagePosition": "50% 50%",
  "blurb": "Sliders, burgers or grilled-protein salads, served with fresh juice.",
  "inclusions": ["Option 1: two sliders or a burger per person …", "…"]
}]
```

#### `POST /catering-enquiries` · Auth: yes

```json
{
  "packageId": "lunch", "firstName": "Sophie", "lastName": "Nguyen", "email": "sophie@example.com",
  "phone": "0400 123 456", "company": "", "occasion": "Team lunch", "date": "2026-11-02", "time": "12:00",
  "guests": 30, "location": "Level 3, 10 Moore St, Canberra", "dietary": ["Vegan", "Gluten free"],
  "notes": "Two coeliac guests."
}
```

`201` → `{ "id", "packageId", "packageName", "guests", "date", "occasion", "status": "enquiry_sent", "createdAt" }`.
`dietary` uses the display values `Gluten free | Dairy free | Vegan | Vegetarian`.
Errors: unknown package → `fields.packageId` "Choose a catering menu."; then every failing field
(`firstName`, `lastName`, `email`, `phone`, `notes`, `date`, `guests`, `time`) → "Please check the
highlighted fields."

#### `GET /me/catering-enquiries` · Auth: yes

`200` → enquiries, newest first. `status`: `enquiry_sent → quoted → confirmed`, or `closed`
(mapped from BOS: New/In progress → enquiry_sent, Quoted → quoted, Won → confirmed, Lost/Closed → closed).

### Notifications & content

#### `GET /me/notifications` · Auth: yes

```json
{
  "items": [ { "id": "uuid", "kind": "order", "text": "Order #8020-1197 is ready at the Braddon counter.", "createdAt": "2026-10-12T08:14:00+11:00", "unread": true } ],
  "unseenIds": ["uuid"]
}
```

Latest 50, newest first. `kind`: `order | loyalty | booking | offer | gift_card`. `unseenIds` = unread
items newer than the last `seen` call (drives the bell badge).

#### `POST /me/notifications/seen` · `POST /me/notifications/read-all` · `DELETE /me/notifications` · Auth: yes

`204`. `seen` clears the badge but keeps the unread dots; `read-all` clears the dots; `DELETE` empties the feed.

#### `GET /content/offers` · Auth: no

`200` → `[{ "id": "keepcups", "name": "Keep Cups", "tag": "In store · all cafés", "line": "Buy a keep cup in store and the next two coffees are on us.", "fine": "Ongoing · redeemed at the counter", "imageUrl": "https://…" | null }]`

#### `GET /content/faqs` · Auth: no

`200` → `[{ "question": "How does the coffee card work?", "answer": "…" }]` in display order.

## 6. What the café team sees (BOS)

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

## 7. Testing checklist

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
