# EightyTwenty Customer API: Proposed Contracts

> **Status: PROPOSED.** None of these endpoints exist yet. There is no EightyTwenty customer API, and nothing in this document describes a live service. This is the contract the mobile app is already coded against (`EXPO_PUBLIC_DATA_SOURCE=api`), written down so a backend can be built to match it. Paths, payloads and status codes can still change. If they do, update `src/services/api/*` in the same change.

| | |
|---|---|
| Base URL | `EXPO_PUBLIC_API_BASE_URL`. Placeholder only, e.g. `https://<api-host>/v1`. The value has no default; in `api` mode `createRepositories` throws if it is empty. |
| Request timeout | `EXPO_PUBLIC_API_TIMEOUT_MS` (default `15000`). After it, the client aborts and raises `TIMEOUT`. |
| Data source switch | `EXPO_PUBLIC_DATA_SOURCE=mock` (default, local simulated backend) or `api` (HTTP). |
| Companion documents | [`DATA_MODELS.md`](./DATA_MODELS.md) has the domain types, field tables and domain ↔ wire mapping. [`BACKEND_HANDOFF.md`](./BACKEND_HANDOFF.md) covers the wider backend handoff, and [`ASSET_AUDIT.md`](./ASSET_AUDIT.md) covers the image assets. |

**Source of truth in the app** (if this document and the code disagree, the code wins and this document is out of date):

| File | What it defines |
|---|---|
| `src/repositories/contracts.ts` | Repository interfaces the UI depends on |
| `src/services/api/endpoints.ts` | Proposed paths |
| `src/services/api/dto.ts` | Proposed wire shapes |
| `src/services/api/mappers.ts` | DTO → domain conversion |
| `src/services/api/repositories.ts` | Method, path, body, public/auth and idempotency for each call |
| `src/services/api/client.ts` | Auth header, refresh, error parsing, timeouts |
| `src/services/errors.ts` | `AppError` codes |
| `src/domain/*.ts`, `src/utils/validation.ts`, `src/constants/business.ts` | Business rules the server must enforce |
| `src/services/mock/repositories/*.ts` | Reference behaviour the backend should replicate |

---

## Contents

1. [Conventions](#1-conventions)
2. [Endpoint index](#2-endpoint-index)
3. [Authentication](#3-authentication)
4. [Customers (profile)](#4-customers-profile)
5. [Customer preferences](#5-customer-preferences)
6. [Locations](#6-locations)
7. [Menu](#7-menu)
8. [Carts & pricing](#8-carts--pricing)
9. [Orders](#9-orders)
10. [Payments](#10-payments)
11. [Loyalty & rewards](#11-loyalty--rewards)
12. [Reservations](#12-reservations)
13. [Catering](#13-catering)
14. [Gift cards](#14-gift-cards)
15. [Notifications](#15-notifications)
16. [Content](#16-content)
17. [Incomplete source data and open items](#17-incomplete-source-data-and-open-items)

---

## 1. Conventions

### 1.1 Wire format

| Topic | Convention |
|---|---|
| Body | JSON, UTF-8. The client sends `Accept: application/json` and, when there is a body, `Content-Type: application/json`. |
| Field names | `camelCase`. |
| Money | Integer **cents** (AUD) in fields named `*Cents`, e.g. `priceCents: 650` = $6.50. The app converts to decimal dollars (`Money`) in `mappers.ts`. |
| Timestamps | ISO-8601 **with offset**, e.g. `2026-10-08T08:12:00+11:00`. Prefer the Canberra offset (`+10:00` AEST / `+11:00` AEDT). `Z` is valid but is not preferred. |
| Dates | `YYYY-MM-DD`, a calendar date in the café's local time. |
| Times of day | `HH:MM`, 24-hour, in the café's local time. |
| Business time zone | `Australia/Canberra`. All "today", "tomorrow", opening-hours and notice rules are evaluated in this zone. |
| Enums | `snake_case` lower-case strings on the wire (e.g. `dine_in`, `coming_soon`, `gift_card`). The app maps them to display values. See the exceptions in 1.2. |
| IDs | Opaque strings. The app never parses them. Fixture IDs look like `braddon`, `hotcoffee`, `ord_…`, `pm_…`. |
| Nullable fields | Send `null` explicitly where a DTO says `T \| null`. Optional request fields (`?`) may be absent: `JSON.stringify` drops `undefined`. |
| Unknown fields | The app ignores extra fields in most responses. Some mappers spread the DTO (`customerFromDto`, `loyaltyCardFromDto`, `loyaltyActivityFromDto`, `categoryFromDto`, `cateringEnquiryFromDto`, `sessionFromDto`), so extra fields pass into domain objects harmlessly. Additive changes are therefore safe within a version. |

### 1.2 Known exceptions to the conventions

These are in the current client code. The backend must accept or emit them exactly as listed until the client changes.

| Where | Exception |
|---|---|
| `MenuItemDTO.dietary` | Display strings, not snake_case: `'GF*' \| 'DF*' \| 'Gluten free' \| 'Dairy free' \| 'Vegan' \| 'Vegetarian'`. The mapper passes them through unchanged. |
| `POST /catering-enquiries` body | Sent in the **domain** shape (no mapper). `dietary` uses display values (`'Gluten free'`, …), not the snake_case values used by `PreferencesDTO.dietary`. |
| `POST /orders` body `payment.choice` | Already snake_case in the domain (`apple_pay`, `saved_card`, `new_card`) and sent as-is. |
| Status / kind enums | `OrderDTO.status`, `GiftCardActivityDTO.kind` and `LoyaltyActivityDTO.type` are lower-case on the wire and identical in the domain. |

### 1.3 Versioning

- Put the major version in the base URL (`…/v1`), not in each path. `endpoints.ts` holds only version-less paths.
- Within `v1`, only make additive changes: new optional fields and new endpoints. Removing or renaming a field, changing a type, or adding a new enum value the app cannot map requires `/v2`.
- **New enum values break the app.** The mappers use lookup tables (e.g. `KIND[dto.kind]`, `BRAND[dto.brand]`), so an unknown value becomes `undefined`. Treat every enum in this document as closed.

### 1.4 Authentication and session refresh

- Authenticated calls send `Authorization: Bearer <accessToken>`.
- Calls marked **Auth: No** are sent without the header, even when a customer is signed in. These are sign-in, sign-up, refresh, password reset, locations, menu, catering packages, offers and FAQs.
- `SessionDTO` is the response to sign-in, sign-up and refresh:

```ts
interface SessionDTO {
  customerId: string;
  accessToken: string;
  refreshToken: string | null; // null = no refresh possible; the client cannot recover from a 401
  expiresAt: string | null;    // access-token expiry (ISO-8601 with offset); informational only
}
```

**Refresh flow (implemented in `HttpClient.request`):**

1. An authenticated request returns **401**, the stored session has a `refreshToken`, and this is not already a retry.
2. The client calls `POST /auth/refresh` with `{ "refreshToken": "…" }`. This is **single-flight**: concurrent 401s share one refresh promise.
3. On success, the new session is stored (`onSessionRefreshed`) and the original request is **retried once**, with the same body and the same `Idempotency-Key`.
4. On failure, what happens depends on the kind of error (`isTransientError` in `src/services/errors.ts`):
   - **Transient** (`NETWORK`, `TIMEOUT`, `SERVER`, i.e. offline, timed out or 5xx): the session is **kept**, and the original call rejects with that same error. The customer can retry once the connection or server recovers. `HttpAuthRepository.refresh` passes these errors through unchanged.
   - **Anything else** (e.g. 401 from `/auth/refresh`): the client signs the customer out (`onSessionExpired`), and the original call rejects with `SESSION_EXPIRED`. The welcome screen then shows *"Your session has expired. Please log in again."*
5. If the retried request also returns 401, it fails with `UNAUTHORIZED` and the client does not refresh again.

Recommendations (proposed, not required by the client):

- Use short-lived access tokens (e.g. 15 min) and long-lived refresh tokens that rotate on every use. Return the new `refreshToken` in each `SessionDTO`.
- The client does **not** refresh ahead of time from `expiresAt`. It only refreshes on 401, so a 401 must reliably mean "access token invalid or expired".
- Tokens are stored in the device keychain/keystore (`src/services/integrations/secureStorage.ts`).

### 1.5 Idempotency

`POST /orders` and `POST /gift-cards/send` send an `Idempotency-Key` header, e.g. `Idempotency-Key: ord_mg1k2x9a4f7h2c` or `gift_mg1k3b0c9d2e1f`.

**How the client chooses the key** (`src/hooks/useIdempotentAttempt.ts`, used by `usePlaceOrder` and `useSendGiftCard`):

- The key is passed to the repository as `MutationOptions.idempotencyKey` (`createOrder(request, options?)`, `sendGiftCard(request, options?)` in `src/repositories/contracts.ts`).
- The client **reuses the same key** when both of these hold:
  - the request payload is unchanged, ignoring the payment token and new-card details, which are fetched fresh on each try;
  - the previous try ended **without a server decision** (`NETWORK`, `TIMEOUT` or `SERVER`).
- It **starts a new key** after a success, after any server decision (`VALIDATION`, `PRICE_CHANGED`, `PAYMENT_DECLINED`, …), or when the payload changes.
- The client's own 401 → refresh → retry (§1.4) also reuses the same key.
- If no key is supplied, the HTTP repository generates one per call (`localId('ord_')` / `localId('gift_')`).

Proposed server behaviour:

- Scope keys per customer. Keep them for at least 24 hours.
- Same key, and the same body apart from `payment.token` / `paymentToken`: return the **original** response (status and body). Do not charge again, do not charge the new token, and do not create another record. A retry carries a **new** Apple Pay or card token, so leave those fields out of the body comparison.
- Same key with any other difference in the body: return `409 CONFLICT`.
- A request still being processed under the same key: return `409 CONFLICT`, or wait for it and replay the result.

The mock does the same: it stores key → created order id or gift activity id (`MockCustomerRecord.idempotency`) and returns the original record for a repeated key, without re-checking the body.

### 1.6 Pagination

List endpoints that can grow use cursor pagination:

```ts
// query: ?cursor=<opaque>&limit=<n>   (both optional; empty values are not sent)
interface PageDTO<T> {
  items: T[];
  nextCursor: string | null; // null = no more pages
}
```

- Used by `GET /me/orders` and `GET /me/loyalty/activity`.
- Proposed limits: default 20 (the mock default), maximum 50. The app requests `limit=20` for order history.
- The cursor is opaque to the client. The mock uses a stringified offset; a real server should use a keyset cursor.
- All other lists return a plain JSON array and are not paginated.

### 1.7 Errors

Every non-2xx response should carry this body:

```json
{ "error": { "code": "VALIDATION", "message": "Enter a valid email address.", "fields": { "email": "invalid" } } }
```

```ts
interface ErrorBody {
  error: {
    code: AppErrorCode;              // one of the codes below
    message: string;                 // customer-facing; the app shows it verbatim
    fields?: Record<string, string>; // request field name → short machine reason: "required" | "invalid" | "too_short" | "taken" | …
  };
}
```

How the client resolves the code (`HttpClient.toError`):

1. Use `error.code` from the body if it is one of the codes in the table below (`KNOWN_CODES`). An unrecognised code is ignored and the client falls through to step 2.
2. Otherwise map the HTTP status: `400 → VALIDATION`, `401 → UNAUTHORIZED`, `403 → FORBIDDEN`, `404 → NOT_FOUND`, `409 → CONFLICT`, `422 → VALIDATION`.
3. Otherwise any `5xx → SERVER`, and anything else (e.g. `405`, `429`) → `UNKNOWN`.

`message` is shown to the customer as-is, except for `NETWORK`, `TIMEOUT` and `SESSION_EXPIRED`, which use fixed client copy. Write messages as short, polite sentences in Australian English. The mock's messages, quoted throughout this document, are the approved copy.

| `AppErrorCode` | HTTP status | Meaning / when |
|---|---|---|
| `NETWORK` | — (client only) | `fetch` failed: offline, DNS, TLS. |
| `TIMEOUT` | — (client only) | No response within `EXPO_PUBLIC_API_TIMEOUT_MS`. |
| `VALIDATION` | `422` (`400` for malformed JSON) | Field or business-rule validation failed. Include `fields` where a specific field is at fault. |
| `UNAUTHORIZED` | `401` | Missing or invalid access token, or wrong credentials on sign-in. |
| `SESSION_EXPIRED` | `401` on `/auth/refresh` | Raised by the client when refresh is rejected. The server just returns 401. A transient refresh failure (offline, timeout, 5xx) surfaces as `NETWORK` / `TIMEOUT` / `SERVER` instead and keeps the session. |
| `FORBIDDEN` | `403` | Authenticated but not allowed. |
| `NOT_FOUND` | `404` | Unknown resource, or a resource owned by another customer. Use 404 rather than 403 so ownership is not revealed. |
| `CONFLICT` | `409` | Duplicate sign-up email (`fields.email: "taken"`), idempotency-key reuse with a different body. |
| `PRICE_CHANGED` | `409` | Server total ≠ `expectedTotalCents` on `POST /orders`. **Must include `code`**, otherwise 409 is read as `CONFLICT`. |
| `LOCATION_UNAVAILABLE` | `422` (proposed) | Café is "coming soon" or has no confirmed hours, so it takes no orders or bookings. Must include `code`. |
| `PAYMENT_DECLINED` | `402` (proposed) | Payment provider declined, or the payment token is missing or invalid. Must include `code`. |
| `NOT_IMPLEMENTED` | `501` (proposed) | Feature not available yet. Must include `code`, otherwise 501 is read as `SERVER`. |
| `SERVER` | `5xx` | Unexpected server failure. |
| `UNKNOWN` | other | Any status not listed above with no `code`. |

### 1.8 Success responses

- `200` with a JSON body, or `201` for creates. The client accepts any 2xx.
- `204 No Content` is fine where the repository method returns `void`. **Exception:** `PUT`/`DELETE /me/favourites/{itemId}` must return `200` with a body (§5).
- An empty 2xx body is read as `undefined`. Do not send an empty body where a response type is listed.

---

## 2. Endpoint index

| # | Method | Path | Auth | Repository method (`src/repositories/contracts.ts`) |
|---|---|---|---|---|
| 3.1 | POST | `/auth/sign-in` | No | `AuthRepository.signIn` |
| 3.2 | POST | `/auth/sign-up` | No | `AuthRepository.signUp` |
| 3.3 | POST | `/auth/sign-out` | Yes | `AuthRepository.signOut` |
| 3.4 | POST | `/auth/refresh` | No | `AuthRepository.refresh` (and the HTTP client's 401 handler) |
| 3.5 | POST | `/auth/password-reset` | No | `AuthRepository.requestPasswordReset` |
| 4.1 | GET | `/me` | Yes | `CustomerRepository.getProfile` |
| 4.2 | PATCH | `/me` | Yes | `CustomerRepository.updateProfile` |
| 4.3 | POST | `/me/closure-request` | Yes | `CustomerRepository.requestAccountClosure` |
| 5.1 | GET | `/me/preferences` | Yes | `PreferencesRepository.getPreferences` |
| 5.2 | PATCH | `/me/preferences` | Yes | `PreferencesRepository.updatePreferences` |
| 5.3 | GET | `/me/favourites` | Yes | `PreferencesRepository.getFavourites` |
| 5.4 | PUT | `/me/favourites/{itemId}` | Yes | `PreferencesRepository.setFavourite(id, true)` |
| 5.5 | DELETE | `/me/favourites/{itemId}` | Yes | `PreferencesRepository.setFavourite(id, false)` |
| 5.6 | GET | `/me/addresses` | Yes | `PreferencesRepository.getAddresses` |
| 5.7 | POST | `/me/addresses` | Yes | `PreferencesRepository.addAddress` |
| 5.8 | DELETE | `/me/addresses/{id}` | Yes | `PreferencesRepository.removeAddress` |
| 6.1 | GET | `/locations` | No | `LocationRepository.getLocations` |
| 6.2 | GET | `/locations/{id}` | No | `LocationRepository.getLocation` |
| 7.1 | GET | `/menu/categories` | No | `MenuRepository.getCategories` |
| 7.2 | GET | `/locations/{id}/menu` | No | `MenuRepository.getMenuItems` |
| 7.3 | GET | `/menu/items/{id}` | No | `MenuRepository.getItemById` |
| 8.4 | POST | `/orders/quote` | Yes | *Optional / not used by the app yet* |
| 9.1 | POST | `/orders` | Yes | `OrderRepository.createOrder` (Idempotency-Key) |
| 9.2 | GET | `/orders/{id}` | Yes | `OrderRepository.getOrder` |
| 9.3 | GET | `/me/orders` | Yes | `OrderRepository.getOrderHistory` (paginated) |
| 10.1 | GET | `/me/payment-methods` | Yes | `PaymentRepository.getPaymentMethods` |
| 10.2 | POST | `/me/payment-methods` | Yes | `PaymentRepository.addCard` |
| 10.3 | DELETE | `/me/payment-methods/{id}` | Yes | `PaymentRepository.removePaymentMethod` |
| 11.1 | GET | `/me/loyalty` | Yes | `LoyaltyRepository.getCard` |
| 11.2 | GET | `/me/loyalty/activity` | Yes | `LoyaltyRepository.getActivity` (paginated) |
| 11.3 | GET | `/me/loyalty/wallet-pass` | Yes | `LoyaltyRepository.getWalletPassUrl` |
| 11.4 | POST | `/me/loyalty/wallet-pass/added` | Yes | `LoyaltyRepository.markWalletPassAdded` |
| 12.1 | GET | `/me/reservations` | Yes | `ReservationRepository.getReservations` |
| 12.2 | POST | `/reservations` | Yes | `ReservationRepository.createReservation` |
| 12.3 | DELETE | `/reservations/{id}` | Yes | `ReservationRepository.cancelReservation` |
| 13.1 | GET | `/catering/packages` | No | `CateringRepository.getPackages` |
| 13.2 | GET | `/me/catering-enquiries` | Yes | `CateringRepository.getEnquiries` |
| 13.3 | POST | `/catering-enquiries` | Yes | `CateringRepository.createEnquiry` |
| 14.1 | GET | `/me/gift-card` | Yes | `GiftCardRepository.getGiftCard` |
| 14.2 | GET | `/me/gift-card/activity` | Yes | `GiftCardRepository.getActivity` |
| 14.3 | POST | `/gift-cards/send` | Yes | `GiftCardRepository.sendGiftCard` (Idempotency-Key) |
| 15.1 | GET | `/me/notifications` | Yes | `NotificationRepository.getFeed` |
| 15.2 | POST | `/me/notifications/seen` | Yes | `NotificationRepository.markSeen` |
| 15.3 | POST | `/me/notifications/read-all` | Yes | `NotificationRepository.markAllRead` |
| 15.4 | DELETE | `/me/notifications` | Yes | `NotificationRepository.clearAll` |
| 16.1 | GET | `/content/offers` | No | `ContentRepository.getOffers` |
| 16.2 | GET | `/content/faqs` | No | `ContentRepository.getFaqs` |

Path parameters are URL-encoded by the client (`encodeURIComponent`). Root-level resources (`/orders/{id}`, `/reservations/{id}`, `/catering-enquiries`, `/gift-cards/send`) are customer-scoped exactly like `/me/*`. The server must only ever read or act on the caller's own records.

---

## 3. Authentication

### 3.1 `POST /auth/sign-in`

**Auth:** No · **Called by:** `AuthRepository.signIn(request)` · **Domain:** `Session`

```ts
// Request — SignInRequest (contracts.ts). The app trims the email first.
interface SignInRequest {
  email: string;
  password: string;
}
// Response 200 — SessionDTO (see §1.4)
```

**Validation** (mirrors `MockAuthRepository.signIn`)
- `email` matches `/^\S+@\S+\.\S+$/` after trim (`isEmail`, the "loose" pattern used by account forms). Treat email case-insensitively.
- `password` has at least 6 characters (`PASSWORD_MIN_LENGTH`).

**Errors**
- `422 VALIDATION` · `fields.email: "invalid"` · "Enter a valid email address."
- `422 VALIDATION` · `fields.password: "too_short"` · "Your password needs at least 6 characters."
- `401 UNAUTHORIZED` for wrong email or password (proposed; the mock accepts any well-formed pair). The call is public, so the client does not try a refresh. The `message` is shown as-is.

After a successful sign-in the app immediately calls `GET /me`.

**Example response**

```json
{
  "customerId": "cus_demo_sophie",
  "accessToken": "eyJhbGciOiJIUzI1NiJ9.placeholder.signature",
  "refreshToken": "rt_9b2f4c7e1a5d",
  "expiresAt": "2026-10-09T08:27:00+11:00"
}
```

### 3.2 `POST /auth/sign-up`

**Auth:** No · **Called by:** `AuthRepository.signUp(request)` · **Domain:** `Session`, `Customer`

```ts
// Request — SignUpRequest (contracts.ts)
interface SignUpRequest {
  name: string;
  phone: string;
  email: string;
  password: string;
}
// Response 201 — SessionDTO
```

**Validation** (in this order, as in the mock)
- `name` is not blank → `fields.name: "required"` · "Add your full name."
- `phone` has at least 8 digits (`isPhone`) → `fields.phone: "invalid"` · "Add a mobile number."
- `email` is a loose email → `fields.email: "invalid"` · "Enter a valid email address."
- `password` has at least 6 characters → `fields.password: "too_short"` · "Your password needs at least 6 characters."

**Errors**
- `422 VALIDATION` as above.
- `409 CONFLICT` · `fields.email: "taken"` · "An account with this email already exists. Log in instead."

**Side effects** (`createNewCustomer` in the mock)
- Create the customer with trimmed name, email and phone, and `memberSince` = today (Canberra).
- Default preferences: `homeCafeId: "phillip"`, `dietary: []`, every notification category `true` except Offers & news (`false`), all security toggles `true`, `avatar: 0`.
- Create a loyalty card with 0 stamps and a member number formatted `8020 NNNN NNNN`.
- Create a gift card with a balance of $0, so `GET /me/gift-card` never 404s.
- Start with empty favourites, addresses, cards, orders, reservations, enquiries and notifications.
- The app calls `GET /me` straight after sign-up, so the new profile must be readable immediately.

### 3.3 `POST /auth/sign-out`

**Auth:** Yes · **Called by:** `AuthRepository.signOut(session)` · **Domain:** `Session`

```ts
// Request
interface SignOutBody {
  refreshToken: string | null;
}
// Response 204
```

- Revoke the refresh token. Return 204 even if the token is unknown or already revoked.
- The app clears its local session whatever the result.
- The call is authenticated, so an expired access token causes a refresh before sign-out. That works, but the server may also accept sign-out without a valid access token.

### 3.4 `POST /auth/refresh`

**Auth:** No · **Called by:** `AuthRepository.refresh(refreshToken)`; used by the HTTP client's 401 handler · **Domain:** `Session`

```ts
// Request
interface RefreshBody {
  refreshToken: string;
}
// Response 200 — SessionDTO (new accessToken; rotated refreshToken recommended)
```

**Errors**
- `401 UNAUTHORIZED` when the token is invalid, expired or revoked. The client turns this (and any other non-transient failure) into `SESSION_EXPIRED` ("Your session has expired. Please log in again.") and signs the customer out.
- `NETWORK`, `TIMEOUT` and `5xx` (`SERVER`) are treated as transient. The client keeps the session and passes the error back to the caller unchanged. Only send 401 when the refresh token is genuinely unusable.

### 3.5 `POST /auth/password-reset`

**Auth:** No · **Called by:** `AuthRepository.requestPasswordReset(email)` · **Domain:** none

```ts
// Request
interface PasswordResetBody {
  email: string;
}
// Response 204 (or 202)
```

- Proposed: return 204 whether or not an account exists, so the endpoint cannot be used to discover accounts. Email a reset link.
- On success the app shows "Check your email for a reset link".
- `422 VALIDATION` · `fields.email: "invalid"` for a malformed email.
- **Not implemented in the mock.** It throws `NOT_IMPLEMENTED` · "Password reset isn’t connected in this preview". The reset-link landing page and the set-new-password flow are not designed yet.

---

## 4. Customers (profile)

### 4.1 `GET /me`

**Auth:** Yes · **Called by:** `CustomerRepository.getProfile()` · **Domain:** `Customer`

```ts
// Response 200 — CustomerDTO
interface CustomerDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string; // YYYY-MM-DD
}
```

### 4.2 `PATCH /me`

**Auth:** Yes · **Called by:** `CustomerRepository.updateProfile(update)` · **Domain:** `CustomerUpdate`, `Customer`

```ts
// Request — CustomerUpdate, sent unmapped; only present keys change
interface UpdateProfileBody {
  name?: string;
  email?: string;
  phone?: string;
}
// Response 200 — CustomerDTO (full, updated)
```

**Validation** (mock)
- `name`, if present, is not blank → `fields.name: "required"` · "Add your name."
- `email`, if present, is a loose email → `fields.email: "invalid"` · "Enter a valid email address."
- `email`, if it differs (case-insensitively) from the current one, is not used by another account → `409 CONFLICT` · `fields.email: "taken"` · "Another account already uses this email." Compare case-insensitively. Changing only the letter case of your own email is allowed.
- Store trimmed values.

**Proposed addition** (the mock does not do this)
- `phone`, if present, has at least 8 digits → `fields.phone: "invalid"`.

The app calls this from profile editing and also from checkout when the contact name or phone is edited.

### 4.3 `POST /me/closure-request`

**Auth:** Yes · **Called by:** `CustomerRepository.requestAccountClosure()` · **Domain:** none

```ts
// Request: no body
// Response 202 or 204
```

- Records a request for the team to close the account. The contract comment says "Account closure is handled by the team".
- On success the app shows "Account closure requested".
- **Not implemented in the mock.** It throws `NOT_IMPLEMENTED` · "Contact us to close your account". The closure process, data retention and how this interacts with the gift card balance are not defined yet.

---

## 5. Customer preferences

Covers preferences, favourites and saved addresses (`PreferencesRepository`).

### 5.1 `GET /me/preferences`

**Auth:** Yes · **Called by:** `PreferencesRepository.getPreferences()` · **Domain:** `CustomerPreferences`

```ts
// Response 200 — PreferencesDTO
interface PreferencesDTO {
  homeCafeId: string; // a Location id
  dietary: ('gluten_free' | 'dairy_free' | 'vegan' | 'vegetarian')[];
  notifications: {
    orderUpdates: boolean;
    bookings: boolean;
    coffeeCard: boolean;
    offersAndNews: boolean;
    giftCardActivity: boolean;
  };
  security: { biometricSignIn: boolean; useLocation: boolean; rememberOrderSettings: boolean };
  avatar: number; // index into the app's avatar palette (6 entries: 0–5)
}
```

### 5.2 `PATCH /me/preferences`

**Auth:** Yes · **Called by:** `PreferencesRepository.updatePreferences(patch)` · **Domain:** `CustomerPreferences`

```ts
// Request — Partial<PreferencesDTO> (built by preferencesToDto)
type UpdatePreferencesBody = Partial<PreferencesDTO>;
// Response 200 — PreferencesDTO (full, updated)
```

- Merge at the top level only. When `notifications` or `security` is present, the client sends the **complete** sub-object (all keys), so replace it whole. This matches the mock's shallow merge.
- Called for: home café change, dietary preferences, notification toggles, privacy and security toggles, avatar.
- Proposed validation (the mock does none):
  - `homeCafeId` is a known location id → `fields.homeCafeId: "invalid"`.
  - `dietary` values are in the enum.
  - `avatar` is an integer from 0 to 5.
- `security.biometricSignIn` is a UI preference only. Biometric sign-in is not implemented.

### 5.3 `GET /me/favourites`

**Auth:** Yes · **Called by:** `PreferencesRepository.getFavourites()` · **Domain:** `ID[]` (menu item ids)

```ts
// Response 200
interface FavouritesDTO {
  itemIds: string[]; // in the order they were added
}
```

### 5.4 `PUT /me/favourites/{itemId}` and 5.5 `DELETE /me/favourites/{itemId}`

**Auth:** Yes · **Called by:** `PreferencesRepository.setFavourite(itemId, favourite)`. `PUT` when `favourite = true`, `DELETE` when `false`. · **Domain:** `ID[]`

```ts
// Request: no body
// Response 200 — FavouritesDTO (the full list after the change)
```

- Both calls are idempotent. `PUT` on an existing favourite and `DELETE` on a missing one still return 200 with the current list. `PUT` appends new ids at the end.
- **Must return 200 with a body.** The client reads `res.itemIds`, so a 204 would throw on the device.
- Proposed: return `404 NOT_FOUND` for an `itemId` not on the menu. The mock does not check.

### 5.6 `GET /me/addresses`

**Auth:** Yes · **Called by:** `PreferencesRepository.getAddresses()` · **Domain:** `SavedAddress`

```ts
// Response 200 — AddressDTO[]
interface AddressDTO {
  id: string;
  label: 'home' | 'work' | 'other';
  line: string; // single free-text address line
}
```

### 5.7 `POST /me/addresses`

**Auth:** Yes · **Called by:** `PreferencesRepository.addAddress(address)` · **Domain:** `SavedAddress`

```ts
// Request (repositories.ts: label lower-cased by the client)
interface AddAddressBody {
  label: 'home' | 'work' | 'other';
  line: string;
}
// Response 201 — AddressDTO
```

- `line` is not blank → `422 VALIDATION` · `fields.line: "required"` · "Add an address." Store it trimmed.
- `label` is in the enum → `fields.label: "invalid"` (proposed).
- Addresses are not geocoded or validated against a delivery area. Delivery zones are not in the source data.

### 5.8 `DELETE /me/addresses/{id}`

**Auth:** Yes · **Called by:** `PreferencesRepository.removeAddress(id)` · **Domain:** `SavedAddress`

- Response `204`. An unknown id is a no-op in the mock; proposed 204 (idempotent) or 404.

---

## 6. Locations

### 6.1 `GET /locations`

**Auth:** No · **Called by:** `LocationRepository.getLocations()` · **Domain:** `Location`, `WeeklyHours`, `OpeningWindow`, `FulfilmentMethod`

```ts
// Response 200 — LocationDTO[] (array order = display order; include "coming soon" venues)
type MethodDTO = 'pickup' | 'delivery' | 'dine_in';
type WeekdayKeyDTO = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

interface LocationDTO {
  id: string;
  name: string;              // "Braddon"
  subtitle: string;          // "Lonsdale St"
  area: string;              // short card label
  headline: string;          // editorial line for the Home featured card
  address: string;
  phone: string | null;
  email: string | null;      // café booking inbox
  hoursLabel: string;        // published text, shown verbatim: "Mon–Fri 7:00am – 3:00pm · Sat–Sun closed"
  hoursShort: string;        // "7am – 3pm, weekdays"
  weeklyHours: Record<WeekdayKeyDTO, { open: string; close: string } | null> | null; // HH:MM Canberra; null day = closed; null = hours TBC
  status: 'open' | 'coming_soon';
  fulfilmentMethods: MethodDTO[];
  note: string;
  waitLabel: string | null;  // typical ASAP wait, e.g. "20–25 min"; null → app shows "15–20 min"
  imageUrl: string | null;
  galleryUrls: string[];
  externalOrderUrl: string | null; // existing third-party ordering (TapTouch / lifeintouch)
  bookingLabel: string;      // name used by the café's booking inbox
  flags: { flagship?: boolean; limitedMenu?: boolean; glutenFree?: boolean };
}
```

Rules the app applies, which the server must keep consistent:
- A café is treated as **"Opening soon"** (no ordering, no bookings) when `status = "coming_soon"` **or** `weeklyHours = null` (`isComingSoon`). An open café must therefore send structured `weeklyHours`.
- `weeklyHours` must contain all seven keys. A missing key is read as closed that day.
- `fulfilmentMethods` limits the order methods offered at checkout. `POST /orders` re-checks it.
- `hoursLabel` is display-only. The app no longer parses it (the mock does, via `parseHoursLabel`). Send structured hours.
- Any `status` value other than `coming_soon` maps to `open`.

### 6.2 `GET /locations/{id}`

**Auth:** No · **Called by:** `LocationRepository.getLocation(id)` · **Domain:** `Location`

- Response `200` — `LocationDTO`.
- `404 NOT_FOUND` · "That café could not be found."

---

## 7. Menu

### 7.1 `GET /menu/categories`

**Auth:** No · **Called by:** `MenuRepository.getCategories()` · **Domain:** `MenuCategory`

```ts
// Response 200 — MenuCategoryDTO[] (array order = category rail order)
interface MenuCategoryDTO {
  id: string;        // "allday", "coffee", "cold", …
  name: string;      // "Coffee & Hot Drinks"
  shortName: string; // compact rail label, "Coffee"
  note: string;      // service note, "" when none
}
```

> The category ids `coffee` and `cold` drive loyalty stamp eligibility (§11.5). Keep these ids, or add an explicit flag in `v2`.

### 7.2 `GET /locations/{id}/menu`

**Auth:** No · **Called by:** `MenuRepository.getMenuItems(locationId)` · **Domain:** `MenuItem`, `ModifierGroup`, `ModifierOption`, `DietaryMarker`

```ts
// Response 200 — MenuItemDTO[]
interface MenuItemDTO {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  dietary: ('GF*' | 'DF*' | 'Gluten free' | 'Dairy free' | 'Vegan' | 'Vegetarian')[]; // display strings (see §1.2)
  imageUrl: string | null;
  featured: boolean;            // shown in the Home "From the kitchen" rail
  modifierGroups: ModifierGroupDTO[];
}

interface ModifierGroupDTO {
  id: string;                   // key in order `selections`
  name: string;
  required: boolean;            // at least one option must be chosen
  maxSelections: number;        // 1 = single choice, 0 = any number
  options: { name: string; priceCents: number }[]; // name is the option's identity within the group
}
```

- `404 NOT_FOUND` · "That café could not be found." when the location id is unknown.
- **Incomplete data:** the source has one shared menu. The mock returns the same 84 items for every café. Per-café availability (e.g. Civic's "limited menu", Phillip's 100% gluten-free kitchen) is not in the source data.

Modifier rules (`src/domain/pricing.ts`):
- Order `selections` are `Record<groupId, optionName[]>`. Option **names** are identifiers, so they must be unique within a group and stable while carts may hold them.
- Unit price = `priceCents` + the sum of selected options' `priceCents`.
- `modifiersLabel` = selected option names across groups, in menu order, joined with `", "` (e.g. `"Flat White, OAT ADC"`).
- When a required single-choice group has exactly one option, the app pre-selects it.
- `GF*` / `DF*` mean "gluten / dairy free option on request".

**Example: one item from `GET /locations/braddon/menu`** (options shortened; the fixture has 13 drink options and 22 variations)

```json
{
  "id": "hotcoffee",
  "categoryId": "coffee",
  "name": "Milk Based Coffee",
  "description": "",
  "priceCents": 500,
  "dietary": [],
  "imageUrl": "https://cdn.example.com/menu/coffee/milk-based-coffee.jpg",
  "featured": true,
  "modifierGroups": [
    {
      "id": "drink",
      "name": "Choose your drink",
      "required": true,
      "maxSelections": 1,
      "options": [
        { "name": "Flat White", "priceCents": 50 },
        { "name": "Latte", "priceCents": 50 },
        { "name": "Macchiato", "priceCents": 0 },
        { "name": "Affogato", "priceCents": 200 }
      ]
    },
    {
      "id": "var",
      "name": "Drink variation",
      "required": false,
      "maxSelections": 0,
      "options": [
        { "name": "Large", "priceCents": 100 },
        { "name": "OAT ADC", "priceCents": 80 },
        { "name": "Extra Shot", "priceCents": 80 }
      ]
    }
  ]
}
```

### 7.3 `GET /menu/items/{id}`

**Auth:** No · **Called by:** `MenuRepository.getItemById(id)` · **Domain:** `MenuItem`

- Response `200` — `MenuItemDTO`.
- `404 NOT_FOUND` · "That item is no longer on the menu."
- This path is not location-scoped, so it returns the catalogue item whatever the café.

---

## 8. Carts & pricing

### 8.1 The cart is client-side

There are **no cart endpoints**. The cart lives in the app (`src/store/cart.ts`, `src/domain/cart.ts`) as `CartLine[]` plus an `OrderContext` (café, method, timing, address, table). Each `CartLine` holds a `unitPrice` snapshot (item plus modifiers) and an `isCoffee` flag computed on the device.

At checkout the app shows totals from `computeTotals` (`src/domain/pricing.ts`) using:
- the cart lines,
- the fulfilment method and payment choice,
- `stamps` / `stampsPerReward` from `GET /me/loyalty`,
- the gift card balance from `GET /me/gift-card`,
- the customer's "use reward" and "use gift card" toggles.

### 8.2 The server is authoritative

`POST /orders` sends only item ids, quantities, selections and notes, plus `expectedTotalCents` (the total the customer saw). The server must:

1. Re-price every line from its own catalogue. Never trust client prices.
2. Recompute totals with the algorithm in 8.3, using the customer's **server-side** stamps and gift card balance.
3. Reject with `409 PRICE_CHANGED` if the result differs from `expectedTotalCents`. The mock's test is `|total − expectedTotal| > 0.009` dollars, which in integer cents means **any difference of 1 cent or more**. Message: "Your total changed to $X.XX. Please review your order." The app shows it and leaves the customer on checkout.

Typical causes of `PRICE_CHANGED`: a menu price changed, stamps were spent in store, or the gift card balance changed.

### 8.3 Pricing algorithm (port of `computeTotals`)

Rates: `ORDER_RULES.deliveryRate = 0.10`, `ORDER_RULES.cardSurchargeRate = 0.0295`, `LOYALTY_RULES.stampsPerReward = 9`.

The whole calculation is done in **integer cents** (`src/domain/pricing.ts`).

```ts
// Inputs resolved server-side:
//   line.unitPrice = item.price + Σ selected option prices   (from the catalogue, dollars)
//   line.isCoffee  = isCoffeeItem(item)                       (§11.5)
//   stamps         = customer's current stamps
//   balance        = customer's current gift card balance (dollars)

/** Dollars → whole cents. Exact, because prices have at most two decimals. */
const toCents = (dollars: number) => Math.round(dollars * 100);

/** cents × rate, half-up to a whole cent. The rate is applied in basis points (0.10 → 1000, 0.0295 → 295). */
const applyRate = (cents: number, rate: number) => Math.round((cents * Math.round(rate * 10_000)) / 10_000);

const subtotal  = Σ(toCents(line.unitPrice) × line.qty);
const delivery  = method === 'delivery' ? applyRate(subtotal, 0.10) : 0;
const coffees   = lines.filter(l => l.isCoffee);
const rewardAvailable = stamps >= 9 && coffees.length > 0;
const reward    = rewardAvailable && useReward ? Math.min(...coffees.map(l => toCents(l.unitPrice))) : 0; // one unit of the cheapest coffee line
const isCard    = choice === 'saved_card' || choice === 'new_card';
const surcharge = isCard ? applyRate(Math.max(0, subtotal + delivery - reward), 0.0295) : 0;
const preGift   = subtotal + delivery - reward + surcharge;
const giftCard  = useGiftCard ? Math.max(0, Math.min(toCents(balance), preGift)) : 0;
const total     = Math.max(0, preGift - giftCard);

// Wire: these integers ARE the *Cents fields. (The client divides each by 100 for its Money values.)
totals = { subtotalCents: subtotal, deliveryCents: delivery, rewardCents: reward,
           surchargeCents: surcharge, giftCardCents: giftCard, totalCents: total };
```

Rules to keep exactly:
- The order is fixed: subtotal → **+10% delivery** → **− reward** → **+2.95% card surcharge** on `(subtotal + delivery − reward)` → **− gift card** (`min(balance, remaining)`) → total.
- The reward is the unit price, including modifiers, of the **cheapest coffee line**. It is one unit only, whatever the quantity. It applies only when `stamps ≥ 9`, the order contains at least one coffee, **and** `useReward` is true. If `useReward` is true but no reward is available, the reward is silently 0; the total check catches any mismatch.
- The surcharge applies to `saved_card` and `new_card`, never to `apple_pay`. It is calculated before the gift card, so a card payer is surcharged even when the gift card covers the whole order (see §17).
- **Integer cents throughout.** Only the two rate steps (delivery and surcharge) can produce a fraction of a cent. Those are rounded **half up** to a whole cent, e.g. 10% of 2365¢ = 236.5 → **237¢**, and 2.95% of 11000¢ = 324.5 → **325¢**. Everything else is integer addition and subtraction. So `total = subtotal + delivery − reward + surcharge − giftCard` exactly, and the lines shown at checkout always add up.
- **Server rule:** do the same integer-cent maths, or exact decimal arithmetic with half-up rounding at the same two steps. The two approaches agree in every case. `tests/domain/pricing.test.ts` checks every subtotal in 5-cent steps up to $200 against an integer reference, plus the 23.65 → $2.37 delivery and 110 → $3.25 surcharge cases. Do **not** multiply dollar amounts in floating point before rounding.
- `rewardRedeemed` on the order is `totals.reward > 0`.

**Worked example** (delivery, reward, card surcharge and gift card together; verified against the client code):

| Input | Value |
|---|---|
| Lines | 2 × Milk Based Coffee (Flat White + OAT ADC) @ $6.30, 1 × Breakfast Burger (Original) @ $23.00 |
| Method / payment | `delivery` / `saved_card` |
| Stamps / useReward | 9 / true |
| Gift card balance / useGiftCard | $10.00 / true |

| Step | Integer-cent calculation | Returned |
|---|---|---|
| subtotal = 2 × 630 + 2300 | 3560 | `subtotalCents: 3560` |
| delivery = applyRate(3560, 0.10) = 3560 × 1000 / 10000 | 356.0 → 356 | `deliveryCents: 356` |
| reward = cheapest coffee | 630 | `rewardCents: 630` |
| surcharge = applyRate(3560 + 356 − 630, 0.0295) = 3286 × 295 / 10000 | 96.937 → 97 | `surchargeCents: 97` |
| preGift = 3560 + 356 − 630 + 97 | 3383 | — |
| giftCard = min(1000, 3383) | 1000 | `giftCardCents: 1000` |
| total = 3383 − 1000 | 2383 | `totalCents: 2383` ($23.83) |

Check: 3560 + 356 − 630 + 97 − 1000 = 2383, which equals the total.

Stamps: `stampsAfterOrder({ stamps: 9, coffeeCount: 2, rewardRedeemed: true })` gives `{ stamps: 1, earned: 1 }` (§11.5).

### 8.4 `POST /orders/quote`: optional / not used by the app yet

> **Optional / not used by the app yet.** It is not in `endpoints.ts` and no repository calls it. Proposed so checkout could show server-priced totals before payment and remove most `PRICE_CHANGED` round trips.

**Auth:** Yes · **Called by:** nothing yet · **Domain:** `OrderTotals`

```ts
// Request — the POST /orders body without contact, payment tokens or expectedTotalCents
interface QuoteBody {
  locationId: string;
  method: 'pickup' | 'delivery' | 'dine_in';
  lines: { itemId: string; qty: number; selections: Record<string, string[]>; note: string }[];
  payment: { choice: 'apple_pay' | 'saved_card' | 'new_card' };
  useGiftCard: boolean;
  useReward: boolean;
}
// Response 200
interface QuoteDTO {
  lines: { itemId: string; name: string; qty: number; unitPriceCents: number; modifiersLabel: string }[];
  totals: OrderTotalsDTO;
  rewardAvailable: boolean;
  coffeeCount: number;
  itemCount: number;
}
```

It uses the same validation and errors as `POST /orders`, except `PRICE_CHANGED` and payment errors.

---

## 9. Orders

### 9.1 `POST /orders`

**Auth:** Yes · **Header:** `Idempotency-Key` (from `MutationOptions`, §1.5) · **Called by:** `OrderRepository.createOrder(request, options?)` · **Domain:** `CreateOrderRequest` → `Order`

The repository comment says the server prices the order, charges payment, applies the gift card and reward, and awards stamps.

```ts
// Request (derived from HttpOrderRepository.createOrder; not declared in dto.ts)
interface CreateOrderBody {
  locationId: string;
  method: 'pickup' | 'delivery' | 'dine_in';
  timing: { type: 'asap' } | { type: 'scheduled'; time: string }; // HH:MM, today, Canberra
  deliveryAddress: string | null; // required when method = 'delivery'
  tableNumber: string | null;     // required when method = 'dine_in'
  lines: {
    itemId: string;
    qty: number;
    selections: Record<string, string[]>; // modifier group id → option names
    note: string;                          // "" when none
  }[];
  payment: {
    choice: 'apple_pay' | 'saved_card' | 'new_card';
    paymentMethodId?: string; // present when choice = 'saved_card'
    token?: string;           // single-use provider token; present for apple_pay and new_card when total > 0
  };
  useGiftCard: boolean;
  useReward: boolean;          // the app only sends true when it computed rewardAvailable
  contact: { name: string; phone: string };
  expectedTotalCents: number;  // Math.round(expectedTotal × 100)
}

// Response 201 — OrderDTO
interface OrderDTO {
  id: string;
  number: string;              // customer-facing, "#8020-4417"
  locationId: string;
  locationName: string;
  method: 'pickup' | 'delivery' | 'dine_in';
  status: 'received' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'declined';
  createdAt: string;           // ISO-8601 with offset
  timing: { type: 'asap' } | { type: 'scheduled'; time: string };
  deliveryAddress: string | null;
  tableNumber: string | null;
  lines: {
    itemId: string;
    name: string;              // snapshot at order time
    qty: number;
    unitPriceCents: number;    // snapshot incl. modifiers
    selections: Record<string, string[]>;
    modifiersLabel: string;
    note: string;
  }[];
  totals: OrderTotalsDTO;
  paymentLabel: string;        // "Apple Pay", "Visa ·· 4021", "Card", "… + gift card", "Gift card"
  stampsEarned: number;
  rewardRedeemed: boolean;
  estimatedWait: string;       // "20–25 min"
}

interface OrderTotalsDTO {
  subtotalCents: number;
  deliveryCents: number;
  rewardCents: number;
  surchargeCents: number;
  giftCardCents: number;
  totalCents: number;
}
```

**Validation and checks, in the mock's order** (`MockOrderRepository.createOrder`)

| # | Check | Error |
|---|---|---|
| 1 | Location exists and is not "coming soon" (`status = open` and `weeklyHours` not null) | `422 LOCATION_UNAVAILABLE` · "This café isn’t taking orders yet." |
| 2 | `method` is in the location's `fulfilmentMethods` | `422 VALIDATION` · "`<Method>` isn’t offered at `<Café>`." (method in display form: Pickup / Delivery / Dine In) |
| 3 | `delivery` → `deliveryAddress` not blank | `422 VALIDATION` · `fields.deliveryAddress: "required"` · "Add a delivery address first." |
| 4 | `dine_in` → `tableNumber` not blank | `422 VALIDATION` · `fields.tableNumber: "required"` · "Add your table number first." |
| 5 | At least one line | `422 VALIDATION` · "Your order is empty." |
| 6 | Every `itemId` exists | `422 VALIDATION` · "An item in your order is no longer available." |
| 7 | Every required modifier group has at least one selection | `422 VALIDATION` · "Choose options for `<Item>`." |
| 8 | Recomputed total = `expectedTotalCents` (§8.2) | `409 PRICE_CHANGED` · "Your total changed to $X.XX. Please review your order." |
| 9 | `saved_card` → `paymentMethodId` is one of the caller's saved cards. Checked whatever the total. There is no fallback to another card. | `422 VALIDATION` · `fields.paymentMethodId: "invalid"` · "Choose a saved card." |
| 10 | Total > 0 and `choice` is `apple_pay` or `new_card` → `payment.token` present | `402 PAYMENT_DECLINED` · "Payment was not completed." |
| 11 | Provider authorises the token or saved card (proposed; the mock does not charge) | `402 PAYMENT_DECLINED` · customer-safe reason |

When the total is $0 (the gift card covers everything), `apple_pay` and `new_card` orders carry no token and must be accepted.

A repeated `Idempotency-Key` is checked **before** all of the above, and the original order is returned (§1.5).

Proposed extra checks (stricter than the mock; the app never sends data that fails them in normal use):
- `qty` is an integer ≥ 1. The app caps quantity at 20 in the item sheet and 99 in the cart stepper (`ORDER_RULES.maxItemQty`, `maxLineQtyInput`, matching the prototype). Agree a server maximum.
- Selections only use known group ids and option names, and single-choice groups (`maxSelections = 1`) have at most one selection. The mock ignores unknown options when pricing but still includes them in `modifiersLabel`.
- `scheduled.time` is `HH:MM`, later than now and within the café's hours today. The app offers 30-minute slots from 07:00 to 14:30 (`ORDER_RULES.scheduleFromHour` / `scheduleToHour`) whatever the café's hours. The mock does not validate timing.
- Allow ASAP orders while the café is closed? The app allows them and shows "Opens 7am". This is a business decision.

**How the app obtains `payment.token`** (`usePlaceOrder`, only when `expectedTotal > 0`):
- `apple_pay`: the payment provider's Apple Pay sheet returns a single-use token.
- `new_card`: the card number and expiry entered at checkout are passed to `paymentProvider.tokenizeCard()`, and only the resulting token is sent. The **CVC never leaves the card-entry component**, and the card number and expiry are never sent to the EightyTwenty backend. Missing card details fail on the device with "Add your card details." before any request is made.
- Both are demo tokens today (`demo_applepay_…`, `demo_card_…`), see §10.

**Response fields the server derives**
- `number`: the mock uses `#8020-` followed by 4 random digits. Any customer-facing format works.
- `estimatedWait` = `location.waitLabel`, or `"15–20 min"` (`ORDER_RULES.defaultWait`).
- `deliveryAddress` / `tableNumber` are trimmed, and `null` unless the method needs them.
- `paymentLabel`:
  - `"Gift card"` when the gift card covered everything (`giftCard > 0` and `total = 0`);
  - otherwise the base label, plus `" + gift card"` when `giftCard > 0`. Base labels: `"Apple Pay"`, `"<Brand> ·· <last4>"` for a saved card, `"Card"` for a new card.
- `stampsEarned`, `rewardRedeemed`: §11.5. The app animates `stampsEarned` straight after this call.

**Side effects** (only when the order is not declined; `applySideEffects`)
1. If `rewardRedeemed`: set stamps to 0 and add a loyalty activity `{ type: "redeem", description: "Free coffee redeemed" }`.
2. If `stampsEarned > 0`: set stamps to `min(9, stamps + stampsEarned)` and add `{ type: "earn", description: "+N stamp(s) · order #8020-…" }`.
3. If `giftCard > 0`: set the balance to `max(0, balance − giftCard)` and add a gift card activity `{ kind: "spent", description: "Used on order #8020-…", amount }`.
4. Charge the payment method for `total` (proposed: authorise at create, capture on `confirmed`).
5. Add the order to the customer's history. Declined orders are also stored, with status `declined`.

**Declined orders have no side effects.** No stamps, no reward redemption, no gift card spend, no charge. In the mock, a declined order (`EXPO_PUBLIC_MOCK_ORDER_OUTCOME=declined`) is decided at creation and still appears in history with `status: "declined"`, `stampsEarned: 0` and `rewardRedeemed: false`. In production a café will usually decline **after** `received`, so the server must reverse anything it has already applied (void or refund the payment, restore stamps, restore the gift card balance) or delay those effects until `confirmed`.

**Example request** (customer with 6 stamps and a $10.00 gift card balance)

```http
POST /orders
Authorization: Bearer <accessToken>
Idempotency-Key: ord_mg1k2x9a4f7h2c
Content-Type: application/json
```

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
  "payment": { "choice": "saved_card", "paymentMethodId": "pm_demo_visa" },
  "useGiftCard": true,
  "useReward": false,
  "contact": { "name": "Sophie Nguyen", "phone": "0400 123 456" },
  "expectedTotalCents": 2016
}
```

**Example response `201`** (in cents: subtotal 2930; surcharge 2930 × 295 / 10000 = 86.435 → 86; gift card 1000; total 2930 + 86 − 1000 = 2016)

```json
{
  "id": "ord_mg1k2xb7q1",
  "number": "#8020-5127",
  "locationId": "braddon",
  "locationName": "Braddon",
  "method": "pickup",
  "status": "received",
  "createdAt": "2026-10-09T08:12:40+11:00",
  "timing": { "type": "asap" },
  "deliveryAddress": null,
  "tableNumber": null,
  "lines": [
    {
      "itemId": "hotcoffee",
      "name": "Milk Based Coffee",
      "qty": 1,
      "unitPriceCents": 630,
      "selections": { "drink": ["Flat White"], "var": ["OAT ADC"] },
      "modifiersLabel": "Flat White, OAT ADC",
      "note": ""
    },
    {
      "itemId": "bburger",
      "name": "Breakfast Burger",
      "qty": 1,
      "unitPriceCents": 2300,
      "selections": { "style": ["Original"] },
      "modifiersLabel": "Original",
      "note": "No beetroot relish"
    }
  ],
  "totals": {
    "subtotalCents": 2930,
    "deliveryCents": 0,
    "rewardCents": 0,
    "surchargeCents": 86,
    "giftCardCents": 1000,
    "totalCents": 2016
  },
  "paymentLabel": "Visa ·· 4021 + gift card",
  "stampsEarned": 1,
  "rewardRedeemed": false,
  "estimatedWait": "20–25 min"
}
```

### 9.2 `GET /orders/{id}`

**Auth:** Yes · **Called by:** `OrderRepository.getOrder(id)` · **Domain:** `Order`

- Response `200` — `OrderDTO`.
- `404 NOT_FOUND` · "Order not found." Also return 404 for another customer's order.
- **Polling:** while the status is live (not `completed` and not `declined`), the status screen calls this endpoint **every 2 seconds** (`useOrder`, `refetchInterval: 2000`). Size the endpoint for that load, and recommend push notifications or a WebSocket/SSE channel later so polling can be removed.

**Status lifecycle**

```
received ──► confirmed ──► preparing ──► ready ──► completed
    │
    └──► declined   (terminal; "Not accepted" in the app)
```

| Status | App stage | Live (polled) |
|---|---|---|
| `received` | Received (0) | yes |
| `confirmed` | Confirmed (1) | yes |
| `preparing` | Preparing (2) | yes |
| `ready` | Ready (3) | yes |
| `completed` | "Enjoy." (4) | no |
| `declined` | "We couldn’t take this one" (−1) | no |

- Statuses only move forward. `completed` and `declined` are terminal.
- In the mock, `declined` happens only at creation, and live orders advance one stage every 4.2 s (`MOCK_ORDER_STAGE_INTERVAL_MS`). Real transitions come from the café or POS.
- Orders cannot be changed or cancelled by the customer after submission (FAQ: "orders cannot be changed or cancelled"). There is no cancel endpoint.

### 9.3 `GET /me/orders`

**Auth:** Yes · **Called by:** `OrderRepository.getOrderHistory(page)` · **Domain:** `Page<Order>`

```ts
// Query: ?cursor=<opaque>&limit=<n>   (the app sends limit=20)
// Response 200 — PageDTO<OrderDTO>, newest first, including declined orders
```

Each item must show its current status, as `GET /orders/{id}` would.

---

## 10. Payments

Principles (from `src/services/integrations/payments.ts` and `contracts.ts`):
- The app **never** sends raw card numbers (PAN), expiry or CVC to the EightyTwenty backend. Card entry must use the payment provider's PCI-compliant UI (Square In-App Payments, per the source copy "eGift cards are issued and redeemed through Square"). That UI returns a single-use token.
- Apple Pay produces a single-use token that the app sends as `payment.token` on `POST /orders` and as `paymentToken` on `POST /gift-cards/send`. The server charges it through the provider.
- Saved cards are stored at the provider. The API returns display data only: brand, last 4 digits and expiry.
- **The current app is demo-only.** `demoPaymentProvider` returns fake tokens (`demo_applepay_…`, `demo_card_…`) and no payment is taken anywhere. Apple Pay needs a Merchant ID, a processing certificate, the entitlement and a native module, so it does not work in Expo Go.

### 10.1 `GET /me/payment-methods`

**Auth:** Yes · **Called by:** `PaymentRepository.getPaymentMethods()` · **Domain:** `SavedCard`

```ts
// Response 200 — SavedCardDTO[]
interface SavedCardDTO {
  id: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'jcb' | 'other';
  last4: string;
  expMonth: number; // 1–12
  expYear: number;  // four digits, e.g. 2028 (app shows MM/YY)
}
```

Checkout currently offers only the **first** saved card (`cards[0]`).

### 10.2 `POST /me/payment-methods`

**Auth:** Yes · **Called by:** `PaymentRepository.addCard(card)` · **Domain:** `CardTokenResult` → `SavedCard`

```ts
// Request — only the provider's single-use token is sent (brand/last4/expiry stay on the device)
interface AddCardBody {
  sourceToken: string; // e.g. a Square card nonce
}
// Response 201 — SavedCardDTO (brand, last4, expiry read from the provider)
```

- Exchange the token for a stored card at the provider (card-on-file), linked to the customer.
- Errors: `402 PAYMENT_DECLINED` if the provider rejects the card; `422 VALIDATION` · `fields.sourceToken: "invalid"` for a missing or expired token.

### 10.3 `DELETE /me/payment-methods/{id}`

**Auth:** Yes · **Called by:** `PaymentRepository.removePaymentMethod(id)` · **Domain:** `SavedCard`

- Response `204`. Disable the card at the provider as well. An unknown id is a no-op in the mock; proposed 204 or 404.

---

## 11. Loyalty & rewards

Programme: one stamp per coffee. Nine stamps, and the **10th coffee is free**. Eligibility copy: "Any coffee or hot drink, any size, at any EightyTwenty café." Rewards are redeemed in the app through `useReward` on `POST /orders` (§8.3, §9.1). There is no separate redeem endpoint. Earning stamps in store by scanning the member number is not part of this API.

### 11.1 `GET /me/loyalty`

**Auth:** Yes · **Called by:** `LoyaltyRepository.getCard()` · **Domain:** `LoyaltyCard`

```ts
// Response 200 — LoyaltyCardDTO
interface LoyaltyCardDTO {
  stamps: number;            // 0…stampsPerReward
  stampsPerReward: number;   // 9
  memberNumber: string;      // printed under the barcode, scanned at the counter
  eligibility: string;       // programme copy
  rewardDescription: string; // programme copy
  walletPassAdded: boolean;
}
```

**Example**

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

### 11.2 `GET /me/loyalty/activity`

**Auth:** Yes · **Called by:** `LoyaltyRepository.getActivity(page)` · **Domain:** `Page<LoyaltyActivity>`

```ts
// Query: ?cursor=&limit=
// Response 200 — PageDTO<LoyaltyActivityDTO>, newest first
interface LoyaltyActivityDTO {
  id: string;
  type: 'earn' | 'redeem';
  description: string;  // "+1 stamp · Flat White", "+2 stamps · order #8020-5127", "Free coffee redeemed"
  locationName: string;
  occurredAt: string;   // ISO-8601 with offset
}
```

### 11.3 `GET /me/loyalty/wallet-pass`

**Auth:** Yes · **Called by:** `LoyaltyRepository.getWalletPassUrl()` · **Domain:** `string | null`

```ts
// Response 200
interface WalletPassDTO {
  url: string; // URL of a signed .pkpass for this member
}
// 404 NOT_FOUND → HttpLoyaltyRepository returns null (no pass issued for this member yet)
```

- Any error other than 404 is passed on to the app.
- **What the app does with `null`** (`useAddWalletPass` + `walletPassService.addPass`):
  - **API mode:** `addPass(null)` returns `'unavailable'`. The app shows `NOT_IMPLEMENTED` · "Wallet passes aren’t available yet." and does **not** call `POST /me/loyalty/wallet-pass/added`.
  - **Mock mode** (`EXPO_PUBLIC_DATA_SOURCE=mock`): the add is simulated and 11.4 is called. The sheet labels it a preview ("Preview — Apple Wallet passes aren’t issued yet.") and the toast reads "Wallet preview — no pass was installed".
- With a URL, the app opens it, which starts the system "Add to Wallet" flow, then calls 11.4.
- Production needs an Apple Pass Type ID and signing certificate on the backend, a signed `.pkpass` per member, and the PassKit web service so stamp changes reach the pass. Google Wallet would need a separate Loyalty Class/Object integration.
- The mock always returns `null`.

### 11.4 `POST /me/loyalty/wallet-pass/added`

**Auth:** Yes · **Called by:** `LoyaltyRepository.markWalletPassAdded()` · **Domain:** `LoyaltyCard`

```ts
// Request: no body
// Response 200 — LoyaltyCardDTO with walletPassAdded = true
```

The app calls this only after the "Add to Wallet" step reports `'added'`. Against the API, that requires a pass URL from 11.3; only mock mode simulates it without a pass.

### 11.5 Stamp rules (port of `src/domain/loyalty.ts`)

**Which items earn a stamp** (`isCoffeeItem`). This is also the set of items that can be the free coffee.

```ts
function isCoffeeItem(item: { categoryId: string; name: string }): boolean {
  if (item.categoryId === 'coffee') return !/puppychino|add ons/i.test(item.name);
  return item.categoryId === 'cold' && /coffee|latte|long black|mocha|cold brew/i.test(item.name);
}
```

- Everything in Coffee & Hot Drinks counts **except** Puppychino and the "Add Ons" line, plus coffee-based cold drinks (e.g. Iced Latte, Cold Brew).
- On the current menu this includes Babychino, Hot Chocolate, Sticky Chai, Matcha Latte, Turmeric Latte and the Chamellia Organic Teapot.
- `coffeeCount` = the sum of `qty` over coffee lines.

**Stamps after an order** (`stampsAfterOrder`)

```ts
function stampsAfterOrder(p: { stamps: number; stampsPerReward: number; coffeeCount: number; rewardRedeemed: boolean }) {
  const base = p.rewardRedeemed ? 0 : p.stamps;                                  // redeeming resets the card
  const earnedRaw = Math.max(0, p.coffeeCount - (p.rewardRedeemed ? 1 : 0));     // the free coffee earns nothing
  const stamps = Math.min(p.stampsPerReward, base + earnedRaw);                  // capped at 9; extra stamps are lost
  return { stamps, earned: Math.max(0, stamps - base) };
}
```

| Before | Coffees | Reward redeemed | After | `stampsEarned` |
|---|---|---|---|---|
| 6 | 1 | no | 7 | 1 |
| 8 | 3 | no | 9 (capped) | 1 |
| 9 | 2 | yes | 1 | 1 |
| 9 | 1 | yes | 0 | 0 |

Declined orders earn nothing and redeem nothing.

---

## 12. Reservations

Bookings are **requests**. The café confirms by email, and the current business process emails the café's booking inbox (`location.email`, or `info@eightytwentyfood.com.au` as a fallback). **There is no real-time availability**: no table inventory or slot capacity exists in the source data. Same-day bookings are by SMS to `0422 573 102` (`CONTACT.sameDaySms`).

### 12.1 `GET /me/reservations`

**Auth:** Yes · **Called by:** `ReservationRepository.getReservations()` · **Domain:** `Reservation`

```ts
// Response 200 — ReservationDTO[] (not paginated; the app sorts and splits into upcoming / past)
interface ReservationDTO {
  id: string;
  locationId: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  guests: number;
  seating: 'indoor' | 'outdoor';
  status: 'requested' | 'confirmed' | 'cancelled';
  createdAt: string;
}
```

The Activity screen handles each status:
- `requested`: shows a pending chip and a "Cancel request" action.
- `confirmed`: shows a success chip and "Call café".
- `cancelled`: shows a danger chip and no actions.

The server may therefore return cancelled bookings. The mock removes them instead (prototype behaviour).

### 12.2 `POST /reservations`

**Auth:** Yes · **Called by:** `ReservationRepository.createReservation(request)` · **Domain:** `ReservationRequest` → `Reservation`

```ts
// Request — ReservationRequest with seating lower-cased
interface CreateReservationBody {
  locationId: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM
  guests: number;
  seating: 'indoor' | 'outdoor';
  name: string;
  phone: string;
  email: string;
  notes: string;     // special requests, "" when none
}
// Response 201 — ReservationDTO with status "requested"
```

**Validation** (`validateReservation` + `checkBookingTime`, evaluated in Australia/Canberra)

| Field | Rule | Message (app copy) |
|---|---|---|
| `locationId` | Café exists and is not "coming soon" | `422 LOCATION_UNAVAILABLE` · "Bookings open when hours are confirmed." |
| `guests` | Integer ≥ 1 | `fields.guests` |
| `date` | Present and **≥ tomorrow** (Canberra). Checked before the hours and notice rules. | `fields.date: "invalid"` · "Choose a date from tomorrow onwards." |
| `date` | Café has hours that weekday | "Café is closed on this date" |
| `time` | Present, `HH:MM` | `fields.time` |
| `time` | `open ≤ time ≤ close − 30 min` (`BOOKING_RULES.lastBookingBeforeCloseMinutes`) | "Café is closed at this time" |
| `date` + `time` | At least **12 hours** after now (`BOOKING_RULES.minNoticeHours`) | "Bookings need at least 12 hours’ notice" |
| `name` | Not blank | `fields.name` |
| `phone` | At least **8 digits** (`isPhone`) | `fields.phone` |
| `email` | **Strict** pattern `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` after trim (`isEmailStrict`) | `fields.email` |

The mock enforces these rules in this order:
1. **Location.** Unknown or coming soon → `422 LOCATION_UNAVAILABLE`.
2. **Date.** Missing, or not after today → `422 VALIDATION` · `fields.date: "invalid"` · "Choose a date from tomorrow onwards."
3. **Everything else.** The mock re-runs `checkBookingTime` and `validateReservation`, the same functions the form uses. Any failure → `422 VALIDATION`:
   - `fields`: each failing field (`guests | date | time | name | phone | email`) set to `"invalid"`.
   - `message`: the time-check message ("Café is closed on this date", "Café is closed at this time", "Bookings need at least 12 hours’ notice") when there is one, otherwise "Please check the highlighted fields." The message is never empty.

The server must enforce the same rules, evaluated in Canberra time.
- Proposed side effect: email the request (café, guests, date, time, table preference, name, phone, email, special requests) to the café inbox, as `bookingEmailDraft` does now.

### 12.3 `DELETE /reservations/{id}`

**Auth:** Yes · **Called by:** `ReservationRepository.cancelReservation(id)` · **Domain:** `Reservation`

- Response `204`. Set the status to `cancelled` (or delete), and tell the café. The app shows "Request cancelled".
- The app offers "Cancel request" only for `requested` bookings. Proposed: `409 CONFLICT` with a "call the café" message for a `confirmed` booking, and 204 (idempotent) for one that is already cancelled.
- The mock deletes the record, so it disappears from `GET /me/reservations`.
- `404 NOT_FOUND` for an unknown id or another customer's booking.

---

## 13. Catering

Catering is **quoted per event**. Package prices are "from" prices per person, and the in-app estimate is explicitly not a quote. The current business process is an email to `info@eightytwentyfood.com.au` (`cateringEmailDraft`).

### 13.1 `GET /catering/packages`

**Auth:** No · **Called by:** `CateringRepository.getPackages()` · **Domain:** `CateringPackage`

```ts
// Response 200 — CateringPackageDTO[]
interface CateringPackageDTO {
  id: string;                  // currently doubles as the display name: "Breakfast", "Lunch", "Afternoon Tea"
  name: string;
  pricePerPersonCents: number; // "from" price
  priceLabel: string;          // published text, "$27.50"
  unit: string;                // "per person"
  imageUrl: string | null;
  imagePosition: string;       // CSS-style focal point, "50% 50%"
  blurb: string;
  inclusions: string[];
}
```

### 13.2 `GET /me/catering-enquiries`

**Auth:** Yes · **Called by:** `CateringRepository.getEnquiries()` · **Domain:** `CateringEnquiry`

```ts
// Response 200 — CateringEnquiryDTO[] (newest first; not paginated)
interface CateringEnquiryDTO {
  id: string;
  packageId: string;
  packageName: string;
  guests: number | null;
  date: string | null;       // YYYY-MM-DD
  occasion: string;
  status: 'enquiry_sent' | 'quoted' | 'confirmed' | 'closed';
  createdAt: string;
}
```

### 13.3 `POST /catering-enquiries`

**Auth:** Yes · **Called by:** `CateringRepository.createEnquiry(request)` · **Domain:** `CateringEnquiryRequest` → `CateringEnquiry`

```ts
// Request — CateringEnquiryRequest sent unmapped (domain shape; see §1.2)
interface CreateCateringEnquiryBody {
  packageId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;          // "" when none
  occasion: string;         // "" when none
  date: string | null;      // YYYY-MM-DD
  time: string | null;      // HH:MM
  guests: number | null;
  location: string;         // free text: where the event is
  dietary: ('Gluten free' | 'Dairy free' | 'Vegan' | 'Vegetarian')[]; // display values
  notes: string;            // the enquiry text
}
// Response 201 — CateringEnquiryDTO with status "enquiry_sent"
```

**Validation** (`validateCateringEnquiry` and the mock)

| Field | Rule | Error |
|---|---|---|
| `packageId` | Known package | `422 VALIDATION` · `fields.packageId: "invalid"` · "Choose a catering menu." |
| `firstName`, `lastName` | Not blank | `fields.firstName` / `fields.lastName: "invalid"` |
| `email` | Strict email pattern (as for reservations) | `fields.email: "invalid"` |
| `phone` | At least 8 digits | `fields.phone: "invalid"` |
| `notes` | Not blank | `fields.notes: "invalid"` |
| `date` | Optional; when present, ≥ tomorrow (shared calendar rule) | `fields.date: "invalid"` (proposed) |
| `guests` | Optional; when present, an integer ≥ 1 | `fields.guests: "invalid"` (proposed) |

- The mock checks `packageId` first, then re-runs `validateCateringEnquiry`. Failures give `422 VALIDATION` · "Please check the highlighted fields." with each failing field set to `"invalid"`. The `date` and `guests` rules are proposed; neither the mock nor the form validator checks them.
- Derived fields: `packageName` comes from the package; `occasion` is the trimmed value, or `"Catering"` when blank.
- Proposed side effect: forward the full enquiry to `info@eightytwentyfood.com.au`.

---

## 14. Gift cards

Every customer has one gift card (`last4` and balance), created at sign-up. eGift cards are issued and redeemed through Square. Physical cards are sold in store, and linking them to an account is not in scope.

### 14.1 `GET /me/gift-card`

**Auth:** Yes · **Called by:** `GiftCardRepository.getGiftCard()` · **Domain:** `GiftCard`

```ts
// Response 200 — GiftCardDTO
interface GiftCardDTO {
  last4: string;
  balanceCents: number;
}
```

### 14.2 `GET /me/gift-card/activity`

**Auth:** Yes · **Called by:** `GiftCardRepository.getActivity()` · **Domain:** `GiftCardActivity`

```ts
// Response 200 — GiftCardActivityDTO[] (newest first; not paginated)
interface GiftCardActivityDTO {
  id: string;
  kind: 'added' | 'spent' | 'sent'; // added = credited to this card; spent = used on an order; sent = eGift bought for someone else
  description: string;              // "Added to your balance", "Used on order #8020-5127", "Sent to Alex"
  amountCents: number;              // always positive; kind gives the direction
  occurredAt: string;
}
```

### 14.3 `POST /gift-cards/send`

**Auth:** Yes · **Header:** `Idempotency-Key` (from `MutationOptions`, §1.5) · **Called by:** `GiftCardRepository.sendGiftCard(request, options?)` · **Domain:** `SendGiftCardRequest` → `GiftCardActivity`

```ts
// Request (derived from HttpGiftCardRepository.sendGiftCard)
interface SendGiftCardBody {
  amountCents: number;     // the app offers 2500, 5000, 7500, 10000 (GIFT_CARD_AMOUNTS)
  recipientName: string;
  recipientEmail: string;
  message: string;         // "" when none
  paymentToken: string;    // Apple Pay single-use token
}
// Response 201 — GiftCardActivityDTO with kind "sent", description "Sent to <recipientName>", amountCents = amount
```

**Validation** (mock)
- `recipientName` not blank and `recipientEmail` a loose email → `422 VALIDATION` · "Add their name and a valid email." (proposed `fields.recipientName` / `fields.recipientEmail`).
- `paymentToken` present → otherwise `402 PAYMENT_DECLINED` · "Payment was not completed."
- Proposed: `amountCents` in the allowed set, or within the provider's limits → `fields.amountCents: "invalid"`.

**Behaviour**
- Charge `amountCents` to the Apple Pay token, issue the eGift through the provider and email it to the recipient with the message.
- The **sender's** balance does not change. Only a `sent` activity is recorded.
- A repeated `Idempotency-Key` returns the original `sent` activity without charging the new Apple Pay token (§1.5). The mock does this before any validation.

---

## 15. Notifications

The in-app feed only. Push notification delivery is not covered here; the per-category opt-ins are in `PreferencesDTO.notifications`.

### 15.1 `GET /me/notifications`

**Auth:** Yes · **Called by:** `NotificationRepository.getFeed()` · **Domain:** `AppNotification`, `NotificationFeed`

```ts
// Response 200 — NotificationFeedDTO
interface NotificationFeedDTO {
  items: NotificationDTO[];  // newest first
  unseenIds: string[];       // ids of unread items created after the feed was last opened (bell badge)
}
interface NotificationDTO {
  id: string;
  kind: 'order' | 'loyalty' | 'booking' | 'offer' | 'gift_card';
  text: string;
  createdAt: string;
  unread: boolean;
}
```

- `unseenIds` = items where `unread = true` and `createdAt > lastSeenAt`. Before the first `seen` call, every unread item counts.
- The app polls this endpoint every **60 seconds**.

### 15.2 `POST /me/notifications/seen`

**Auth:** Yes · **Called by:** `NotificationRepository.markSeen()` · **Response:** `204`

Called when the feed is opened. Set `lastSeenAt = now`. This clears the badge (`unseenIds` becomes empty) but **keeps** the unread dots.

### 15.3 `POST /me/notifications/read-all`

**Auth:** Yes · **Called by:** `NotificationRepository.markAllRead()` · **Response:** `204`

Sets `unread = false` on every item ("Mark all read").

### 15.4 `DELETE /me/notifications`

**Auth:** Yes · **Called by:** `NotificationRepository.clearAll()` · **Response:** `204`

Removes every item from the customer's feed ("Clear all").

---

## 16. Content

### 16.1 `GET /content/offers`

**Auth:** No · **Called by:** `ContentRepository.getOffers()` · **Domain:** `Offer`

```ts
// Response 200 — OfferDTO[]
interface OfferDTO {
  id: string;
  name: string;      // "Keep Cups"
  tag: string;       // "In store · all cafés"
  line: string;      // headline sentence
  fine: string;      // fine print, "Ongoing · redeemed at the counter"
  imageUrl: string | null;
}
```

Offers are informational only. Nothing is redeemed through the API.

### 16.2 `GET /content/faqs`

**Auth:** No · **Called by:** `ContentRepository.getFaqs()` · **Domain:** `Faq`

```ts
// Response 200 — FaqDTO[] (array order = display order; passed through without a mapper)
interface FaqDTO {
  question: string;
  answer: string;
}
```

Some FAQ answers state business rules: the 2.95% card surcharge, 12 hours' notice for bookings, and that orders cannot be changed after submission. Keep them in step with the rules in this document.

---

## 17. Incomplete source data and open items

### Business data not in the source

| Area | Gap |
|---|---|
| Menu | **Per-café availability is unknown.** The mock returns one shared menu for every café. The ranges at the limited-menu café (Civic, `flags.limitedMenu`) and the gluten-free cafés (Phillip, Belconnen, `flags.glutenFree`) are not modelled. The menu taxonomy and the 84 items are an approved snapshot, not the POS. |
| Stamp eligibility | Derived from category id and name patterns (§11.5). There is no explicit `earnsStamp` flag. Whether Babychino and teapots should count needs confirming. |
| Reservations | **No real-time availability.** There is no table inventory, capacity or slot data; bookings are requests confirmed by email. |
| Locations | Akuna St has no confirmed hours (`coming_soon`). Delivery zones and fees beyond the flat 10% are not defined. |
| Auth | **Password reset is not implemented in the mock** (`NOT_IMPLEMENTED`). The reset email and link flow are not designed. |
| Account | **Account closure is not implemented in the mock** (`NOT_IMPLEMENTED` · "Contact us to close your account"). Retention and gift card handling are undefined. |
| Payments | Demo provider only. No merchant account, Apple Pay certificates or Square credentials exist yet. |
| Wallet | No `.pkpass` signing exists yet. `GET /me/loyalty/wallet-pass` is expected to return 404 until it does. |
| Configuration | `ORDER_RULES`, `LOYALTY_RULES`, `BOOKING_RULES`, `CONTACT` and `GIFT_CARD_AMOUNTS` are hard-coded in `src/constants/business.ts`. A future config endpoint could serve them, but none is proposed in `endpoints.ts`. |
| Tax | GST is not represented anywhere in the model or the totals. |

### Still open in the client and mock

| Item | Where | Impact / decision needed |
|---|---|---|
| Enum spelling of dietary values: `MenuItemDTO.dietary` and the catering enquiry body use display strings, not snake_case (§1.2). | `dto.ts`, `HttpCateringRepository.createEnquiry` | The backend must emit and accept these exact strings until the client maps them. |
| The card surcharge is applied before the gift card. | `computeTotals` | A card payer is surcharged even when the gift card covers the full amount and no card is charged. Business decision. |
| Date and hours rules run in the **device** time zone. This includes the mock's "from tomorrow" check, which uses the device date. | `checkBookingTime`, `windowForDate`, `monthGrid`, `isOpenNow`, `MockReservationRepository` | Devices outside Australia/Canberra may pass client checks the server rejects. The server is authoritative. |
| Scheduled pickup slots are fixed at 07:00–14:30, whatever the café's hours. The mock does not validate `timing`. | `scheduleSlots`, `ORDER_RULES` | Decide server validation of scheduled times (§9.1). |
| Quantity caps: 20 in the item sheet, 99 when typed in the cart (these match the prototype exactly). Merged lines can exceed 20. | `ORDER_RULES.maxItemQty`, `maxLineQtyInput` | Agree a server maximum. |
| A café declining **after** `received` is not modelled; the mock only declines at creation. | `MockOrderRepository` | The server must void or refund payment and restore stamps and gift card balance, or delay side effects until `confirmed` (§9.1). |
| Path layout: lists live under `/me/...`, but create, get and delete use root paths (`/orders/{id}`, `/reservations/{id}`, `/catering-enquiries`, `/gift-cards/send`). | `endpoints.ts` | Root resources must still be scoped to the caller. |
| `PUT` / `DELETE /me/favourites/{itemId}` must return 200 with `{ itemIds }`. | `HttpPreferencesRepository.setFavourite` | A 204 response would throw on the device. |
| Mock timestamps: fixtures use `+11:00`, new mock records use UTC `Z` (`toISOString()`). | `fixtures/demoCustomer.ts`, `mock/repositories/shared.ts` | Both are valid ISO-8601. The server should prefer the Canberra offset (§1.1). |
| Checkout offers only the first saved card (`cards[0]`). | `CheckoutScreen.tsx` | No API impact; `paymentMethodId` is still validated (§9.1). |

Resolved since the first draft and now documented above: integer-cent pricing with half-up rate rounding, which agrees with exact decimal maths (§8.3), retry-safe idempotency keys (§1.5), transient refresh failures keep the session (§1.4), `new_card` tokenisation and payment-proof checks (§9.1), unique profile email (§4.2), the "from tomorrow" booking date and non-empty error messages (§12.2), reservation status actions (§12.1, §12.3), and the wallet pass `null` handling (§11.3).
