The REST API behind the **EightyTwenty till** (repo `EightyTwenty-POS-Frontend-KDS`: front counter POS and
kitchen display). It implements the till's own seam, `src/services/contracts.ts` (`PosBackend`) and the
shapes in `src/domain/types.ts`. The endpoint paths in the till's `src/services/http/httpBackend.ts` were
proposals; **the paths on this page replace them** (section 2 maps every method to its path).

**How to read this page:** the guide below covers set-up and the rules shared by every call. Every endpoint
underneath has its own description, request/response schema, examples and errors. Use **Try it out**: run
`POST /api/v1/auth/login` with a café team account, copy `access`, press **Authorize** and paste it.

Other formats: [readable version](/api/docs/pos/redoc/) · [OpenAPI schema (YAML)](/api/docs/pos/schema/)

## 1. Connect the till

```bash
VITE_DATA_PROVIDER=http
VITE_API_BASE_URL=https://eightytwenty-api.onrender.com
VITE_TERMINAL_ID=BRADDON-TILL-1
```

- Every path starts with `/api/v1/pos` (plus `/api/v1/auth/login` and `/api/v1/auth/refresh`). No trailing
  slash. Local backend: `http://127.0.0.1:8000`.
- Send `X-Terminal-Id` on every request (the till already does). It identifies the till's cash shift and is
  stored on every order, payment and record.
- CORS is open to every origin (`Access-Control-Allow-Origin: *`) and any host name is accepted, so the
  till can call the API from `localhost`, a LAN IP or any preview domain without asking first.

### Two sign-ins: the device, then the person

1. **The device** signs in once with a café team account (email + password of a café owner or staff
   member, or a chain-wide account), exactly like the till's `src/services/http/authSession.ts`:
   `POST /api/v1/auth/login {email, password}` → `{access, refresh}`. Send `Authorization: Bearer <access>`
   on every call. The account decides **which cafés** the till can trade for (`GET /api/v1/pos/locations`).
2. **The person at the till** signs in with a 4-digit PIN: `POST /api/v1/pos/staff/verify-pin {pin}` →
   `{staff, permissions}`, or `204` when the PIN is not recognised. PINs are set in the BOS workspace
   (People → Users → Till PIN), unique across the chain.

**Tokens:** `access` lives 15 minutes, `refresh` 30 days and is single use — every
`POST /api/v1/auth/refresh {refresh}` returns a new pair. **Refresh before the access token expires, and on
any `401` refresh and resend the same command with the same Idempotency-Key.** The outbox treats `401` as a
rejection, so without this a command queued over an expired token would be moved to `rejected`. Keep the
refresh token in device storage so a reload does not ask for the password again.

**Server-side permissions:** the server checks the device account (role and cafés) on every call. The
per-person permissions returned by verify-pin are applied by the till's UI; commands do not carry a staff
token, so the server records who did what from the names in the payload (`by`, `approver`, `staff`).

## 2. `PosBackend` → endpoints

| Till method | Endpoint | Status |
|---|---|---|
| `loadSnapshot()` | `GET /api/v1/pos/snapshot?cafe={cafe}` | ✅ (send the till's saved café) |
| `orders.listChanged(cafe, since)` | `GET /api/v1/pos/orders?cafe={cafe}&since={cursor}` | ✅ app orders included |
| `orders.create(order)` | `POST /api/v1/pos/orders` | ✅ |
| `orders.setStatus(id, status, note)` | `POST /api/v1/pos/orders/{id}/status` | ✅ |
| `orders.accept(id)` | `POST /api/v1/pos/orders/{id}/accept` | ✅ |
| `orders.setPrep(id, change)` | `PUT /api/v1/pos/orders/{id}/preparation` | ✅ |
| `orders.adjust(id, change)` | `POST /api/v1/pos/orders/{id}/adjustments` | ✅ |
| `orders.setTables(id, tables)` | `PUT /api/v1/pos/orders/{id}/tables` | ✅ |
| `payments.record(id, payment)` | `POST /api/v1/pos/orders/{id}/payments` | ✅ |
| `records.openShift(shift)` | `POST /api/v1/pos/shifts` | ✅ |
| `records.recordCashMove(shiftId, move)` | `POST /api/v1/pos/shifts/{shiftId}/moves` | ✅ |
| `records.closeShift(shift)` | `PUT /api/v1/pos/shifts/{shiftId}` | ✅ |
| `records.submit(record)` | `POST /api/v1/pos/transactions` | ✅ |
| `records.appendAudit(entry)` | `POST /api/v1/pos/audit` | ✅ |
| `staffAuth.verifyPin(pin)` | `POST /api/v1/pos/staff/verify-pin` | ✅ `204` = not recognised → `null` |
| `#backend-check`: locations, categories, menu | `GET /api/v1/pos/locations`, `…/locations/{slug}/categories`, `…/locations/{slug}/menu` | ✅ same shapes as `posCatalog.ts` / `posMapping.ts` |
| `customers.update(id, patch)` | `PUT /api/v1/pos/customers/{id}` | ✅ app customer accounts |
| `loyalty.setBalance(id, balance, reason)` | `PUT /api/v1/pos/customers/{id}/loyalty` | ✅ same card as the app (section 5) |
| `catalog.setSoldOut(itemId, soldOut)` | `PUT /api/v1/pos/items/{itemId}/sold-out` | ✅ every café of this account |
| `catalog.setBranchAvailability(cafe, itemId, available)` | `PUT /api/v1/pos/locations/{cafe}/items/{itemId}/availability` | ✅ |
| `reservations.upsert(r)` | `PUT /api/v1/pos/reservations/{id}` | ✅ same bookings as website/app/BOS |
| `catering.upsert(e)` | `PUT /api/v1/pos/catering/{id}` | ✅ same enquiries as website/app/BOS |
| `catalog.setPrice`, `setModifierAvailability`, `setCategoryOrder`, `adjustStock` | — | ⏳ `404`: prices, options and order are edited in BOS; no stock yet |
| `loyalty.updateSettings` | — | ⏳ `404`: the card rule (9 stamps, 10th free) is fixed, shared with the app |
| `giftCards.issue`, `giftCards.adjustBalance` | — | ⏳ needs the gift card provider (Square) — `404` |
| `staffAuth.createStaff`, `setRole`, `setRoleMatrix`, `settings.update` | — | ⏳ `404`: people, PINs and settings are managed in BOS |
| `records.requestTaxInvoice` | — | ❌ no invoicing service yet (`404`) |

A command without a route answers `404 NOT_FOUND`, which the outbox moves to `rejected`. The adapter should
**not send** the ⏳ commands (resolve them locally) so the rejected list stays meaningful.

## 3. Conventions

- **Ids:** cafés, menu items, categories and modifier groups use the website slugs the till already knows
  (`braddon`, `mighty`, `drink`). Staff ids are UUIDs. Orders are identified by their number (`id`).
- **Order numbers must be unique across all tills and the app.** The till currently issues
  `#8020-<n>` from a per-device counter, so two tills (or a till and an app order, which use `#8020-NNNN`)
  can collide: the second `POST /orders` with an existing id answers `409 CONFLICT`. Prefix the number with
  the terminal, e.g. `BRADDON-TILL-1-0042` (≤ 40 characters). URL-encode the id in paths
  (`encodeURIComponent`, `#` → `%23`).
- **Money:** as in `types.ts` — orders, lines, discounts and catering prices in **AUD dollars** (numbers);
  payments, refunds, shifts, cash moves and transaction records in **integer cents**. Order `total` excludes
  the card surcharge, which travels on the payment.
- **Idempotency:** every write takes an `Idempotency-Key` header (the outbox entry id). A retry with the same
  key and body returns the first answer without doing the work again; the same key with a different body →
  `409 CONFLICT`. Payments are also idempotent on `ref`, adjustments on `key`, cash moves on `id`, records on
  café + kind + reference, audit entries on `id`.
- **Times:** ISO timestamps with the café offset (`2026-10-16T09:41:12+11:00`). Human labels the till makes
  (`at: "16 Oct, 9:41 am"`, `openedAt`) are stored as given.
- **Responses:** writes on an order answer `200`/`201` with the order as stored (same shape as the feed);
  shift writes answer the shift; records and audit answer `{"ok": true}`. The till may ignore the bodies.

## 4. Errors

Same envelope as the rest of the API: `{"error": {"code", "message", "fields"}}`. `message` is written for
staff and can be shown as is. The HTTP status drives the till's `ApiError.kind`:

| HTTP | `code` | Meaning | Outbox |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Access token missing/expired | refresh, then resend (section 1) |
| 403 | `FORBIDDEN` | Not a café team account / no café assigned | rejected |
| 404 | `NOT_FOUND` | Café not on this account, unknown order/shift, command not built yet | rejected |
| 409 | `CONFLICT` | Number already used, order already finished, key reused | rejected |
| 422 | `VALIDATION` | Wrong shape or numbers that do not add up (`fields` names the field) | rejected |
| 429 | `TOO_MANY_REQUESTS` | Too many PIN checks (the only limited call) | wait (`Retry-After`) |
| 5xx | `SERVER` | Server problem | retried with the same key |

## 5. Orders: what the server checks and does

- **Till orders are recorded even when prices changed.** The till trades on the menu it loaded at start-up;
  when a price changed in BOS since then, or an item was sold out, the sale has still happened. The server
  checks that the order adds up (Σ price × qty − discounts + delivery = `total`, to the cent) and compares every
  line with the café's current menu; differences are listed on the order for a manager (BOS → Orders). Load the
  snapshot again at the start of each day so the till trades on current prices.
- **App orders show on the till** with `channel: "app"`, `accepted: false` until the café accepts them,
  `paid: true` (paid in the app; the till sees one card/Apple Pay payment and, if used, one gift card
  payment), contact and delivery address in `note`, the free coffee as a discount. Accepting, kitchen
  progress, ready and completed are sent to the customer's app feed. Cancelling or fully refunding an app
  order through `/adjustments` (as the till sends it: `amount` = what was paid, `total` unchanged) returns
  its payment, stamps and gift card spend; the app order keeps its own total. App orders come with
  `stamped: false` so the till leaves their coffee card alone (the server adds and returns their stamps).
- **Status map:** the server keeps one status per order; the till sees `new` (and `accepted`) for orders that
  are confirmed or waiting, then `preparing`, `ready`, `completed`, `cancelled`, `refunded`, `failed`.
- **Finished orders** (completed, cancelled, refunded) accept no more status or kitchen changes (`409`); a
  completed order can still be refunded.
- **Customers** are the app's customer accounts (one list for the chain, `customers` in the snapshot, newest
  2,000). `customerId` on an order, reservation or enquiry links it when it is a customer's id. The till cannot
  create customers; people sign up in the app.
- **Coffee card = the app's card.** One stamp per coffee, 9 stamps → the 10th coffee is free, one free coffee
  waiting at a time. The till sees it as `stamps` 0–8 and `rewards` 0/1 (`rewards: 1` = the card is full).
  `PUT /customers/{id}/loyalty` with the till's new balance sets the card: `rewards ≥ 1` → full card, else
  `stamps` (capped at 8). Stamps are not added by the server for till orders: the till's own
  `loyalty.balance` command after payment does it (as `awardLoyalty` already sends).
- **Sold out:** the snapshot's `availability.soldOut` lists items sold out at every café of this account,
  `branchOff[cafe]` those sold out only here. Changes reach the website, the app and BOS at once.

- **Tables and promo codes** come from BOS: café owners set their floor plan (BOS → Locations → Tables) and
  the chain owner the promo codes (BOS → Daily operations → Promo codes; a percentage or a dollar amount, for every café or
  one, with optional dates). The snapshot returns this café's active tables and the codes live today. The code
  is checked on the till; the order carries the discount as usual (`discounts`).

## 6. Cash shifts and records

- One open shift per till (`X-Terminal-Id`). The snapshot returns this till's open shift as `currentShift`,
  so a till that reloads mid-shift carries on.
- Closing checks `expected` = float + cashSales − cashRefunds + cash in − cash out and
  `variance` = counted − expected.
- `POST /transactions` keeps the till's `TransactionRecord` (append-only); `POST /audit` keeps its
  `AuditEntry` in the BOS activity log. The snapshot returns the last 100 audit entries for the café.

## 7. Not connected (by design, for now)

Card terminal, printers and cash drawer stay on the device (`DeviceHub`); the server never moves money. Gift
cards (Square), stock, Apple Wallet and tax invoices are not built; the snapshot returns empty lists for them
(`giftCards`, `stock`, `stockLog`).

With `unconnectedDevices` the till refuses card and wallet tenders. Until a terminal SDK is integrated, a café
using a standalone EFTPOS machine needs a "card taken on the EFTPOS machine" tender in the till that records
`method: "card"` with the approved amount; the server accepts it like any other payment.
