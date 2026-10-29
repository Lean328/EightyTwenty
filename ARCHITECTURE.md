# EightyTwenty — Kiến trúc hệ thống (Website · App · BOS)

> Tài liệu này là **nguồn sự thật về kiến trúc** của dự án. Bất kỳ ai (người hoặc AI agent) bắt đầu code phải đọc hết file này trước, làm đúng theo các quyết định ở đây, và cập nhật file này khi một quyết định thay đổi.
>
> Ngôn ngữ: tài liệu viết tiếng Việt, **code / tên biến / commit / API viết tiếng Anh**.

---

## 0. Tóm tắt 30 giây

- EightyTwenty là chuỗi café healthy ở Canberra (ACT, Úc), ~9–10 chi nhánh.
- Hệ sinh thái gồm 3 client + 1 backend:
  1. **Website khách hàng** (đã có, static, deploy Vercel).
  2. **App khách hàng** (chưa có — Expo/React Native).
  3. **BOS Admin** (chưa có — React SPA cho chủ/quản lý/nhân viên, gồm cả CMS).
  4. **BOS Backend** (chưa có — Django + DRF, một service duy nhất trên Render).
- **Nguyên tắc số 1:** BOS Backend là **nguồn dữ liệu duy nhất (single source of truth)**. Website, App, BOS Admin **chỉ** đọc/ghi qua REST API của BOS Backend. Không client nào kết nối thẳng vào database.
- Hạ tầng giai đoạn đầu chạy **free tier**: Render (API) + Supabase (Postgres + Storage) + Vercel (Website + BOS Admin).

---

## 1. Sơ đồ tổng thể

```
                         ┌───────────────────────────────────────────────┐
                         │                  CLIENTS                      │
                         │                                               │
   Khách hàng ──────────►│  Website (static, Vercel)                     │
                         │  App (Expo iOS/Android)        ── Phase 3     │
   Chủ / QL / NV ───────►│  BOS Admin (React SPA, Vercel)                │
                         └───────────────┬───────────────────────────────┘
                                         │ HTTPS · JSON · JWT
                                         ▼
                ┌─────────────────────────────────────────────────┐
                │  BOS Backend — Django 5 + DRF (Render, Singapore)│
                │  /api/v1/public/*  /api/v1/auth/*               │
                │  /api/v1/me/*      /api/v1/bos/*                │
                │  /api/v1/webhooks/* /health  / (BOS, Django)    │
                └──────┬───────────────────────────┬──────────────┘
                       │ SQL (Supavisor pooler)     │ Storage API (service key)
                       ▼                            ▼
          ┌────────────────────────┐   ┌──────────────────────────────┐
          │ Supabase Postgres      │   │ Supabase Storage (bucket     │
          │ (ap-southeast-1)       │   │ "media", public read)        │
          │ CHỈ lưu text/số/JSON   │   │ Ảnh WebP nhiều kích cỡ       │
          └────────────────────────┘   └──────────────▲───────────────┘
                                                      │ GET ảnh trực tiếp (CDN)
                                         Website / App / BOS Admin

   Phụ trợ (free):
   - UptimeRobot / cron-job.org  → GET /health mỗi 5 phút (giữ Render free không ngủ)
   - GitHub Actions cron         → pg_dump backup hằng đêm, gọi job định kỳ
   - Email transactional (Resend/Brevo free tier) → xác nhận booking/enquiry
   - Phase 2+: Stripe (hoặc TapTouch — CHƯA CHỐT), Expo Push, Apple Wallet (PassKit)
```

---

## 2. Hiện trạng code (đã khảo sát repo `johnthinh2009-coder/EightyTwenty`)

**Website hiện tại KHÔNG dùng framework / build step.** Cấu trúc:

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ template, CSS, state UI, điều hướng `go(view, patch)`, class `Component` (chạy trên runtime `support.js`). |
| `support.js` | Runtime "DC" hiện có. **Không thay thế.** |
| `mock-data.js` | Nguồn dữ liệu duy nhất hiện tại: `LOCATIONS`, `CATEGORIES`, `MENU` (84 món), `CATERING`. |
| `eightytwenty-data.js` | **Adapter ổn định**: re-export dữ liệu từ `mock-data.js` + `ORDER_RULES`. Đây là điểm cắm API. |
| `img/`, `assets/`, `lumi-lane-original/` | Ảnh, font, icon, hero iframe. |
| `FRONTEND_HANDOFF.md` | Ghi chú bàn giao frontend — đọc kèm tài liệu này. |

Các ràng buộc từ handoff phải tôn trọng:
- **Không viết lại UI, không thêm framework vào website.** Chỉ thay nguồn dữ liệu sau adapter `eightytwenty-data.js`.
- Order/Cart/Checkout đang ẩn bằng `[data-public-order]`. **Không bật** cho đến khi order, giá, tồn kho, thanh toán, xác nhận đều chạy thật ở server.
- Booking (`bkSubmit()`) và enquiry (`submitEnquiry(kind)`) hiện chỉ mở email draft → sẽ đổi sang POST API thật, **chỉ báo thành công khi server trả về OK**.
- Auth (`auSubmit()`, `auResetSubmit()`) hiện là preview giả → sẽ nối vào auth thật.
- Hiện từng chi nhánh có link đặt món ngoài `*.lifeintouch.net` và `ORDER_RULES` ghi "TapTouch" (phụ phí thẻ 2.95%). → Khách **đang dùng TapTouch** cho POS/online order. Xem mục 14 (câu hỏi mở).

### Hình dạng dữ liệu hiện tại (API public phải trả đúng shape này — xem 7.2)

```js
// LOCATIONS[i]
{ id:'braddon', name, sub, address, phone, hours, hoursShort, open:true,
  methods:['Pickup','Delivery','Dine In'], note, wait, img, img2, img3,
  order:'https://…lifeintouch.net/', email, booking:'Braddon - Lonsdale St',
  flagship?:true, limited?:true, gf?:true, tbc?:true }

// CATEGORIES[i]
{ id:'allday', name:'All Day Meals', note:'Monday – Sunday, 6am–3pm' }

// MENU[i]
{ id:'mighty', cat:'allday', name, price:35 /* AUD, số thực */, priceSource?:'web',
  diet:['GF*','DF*'], img:'img/…jpg', desc, featured?:true,
  mods:[ { id:'add', name:'Add ons', required:false, max:0 /* 0 = không giới hạn */,
           options:[ ['Poached Egg', 3], ['Smoked Bacon', 6] ] } ] }

// CATERING[i]
{ id:'Breakfast', price:'$22', unit:'per person', img, imagePosition:'50% 50%',
  blurb, items:['…','…'] }
```

Lưu ý: nhiều modifier group dùng chung giữa các món (`HOT_DRINK`, `VARIATION`, `ADDONS`, `SMOOTHIE_ADD`, `ACAI_ADD`, `GFO`) → trong DB phải là **bảng dùng chung**, không copy theo từng món.

---

## 3. Quyết định công nghệ (đã chốt)

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Backend | **Python 3.12, Django 5.x, Django REST Framework** | ORM + migrations + auth + permission + Django Admin có sẵn; đúng sở trường team. |
| Auth | **Django auth + `djangorestframework-simplejwt`** (access 15 phút, refresh 30 ngày, rotate + blacklist) | Một hệ user duy nhất cho khách & nhân viên. **Không dùng Supabase Auth.** |
| API docs | **`drf-spectacular`** (OpenAPI 3) → sinh TypeScript types bằng `openapi-typescript` cho BOS Admin & App | Một hợp đồng API, không lệch type. |
| DB | **Supabase Postgres**, region **Singapore (ap-southeast-1)** | Free tier; gần Úc. |
| File/ảnh | **Supabase Storage**, bucket `media` (public read) | Không lưu file trên Render (ổ đĩa Render tạm thời, mất khi redeploy). |
| API hosting | **Render Web Service, region Singapore**, 1 service duy nhất | Free tier chỉ đủ giờ chạy cho đúng 1 service 24/7. |
| Website | Giữ nguyên static site trên **Vercel** | Theo handoff. |
| BOS Admin | **React 18 + Vite + TypeScript + TanStack Query + React Router + Ant Design** trên **Vercel** | AntD mạnh về bảng/form cho admin. |
| App | **Expo (React Native) + TypeScript + expo-router**, build bằng EAS | Tái dùng kiến thức React. Phase 3. |
| Tests | `pytest` + `pytest-django` + `factory_boy` | Bắt buộc cho logic tiền (giá, order, gift card, loyalty). |
| Lint/format | `ruff` + `ruff format` (Python), `eslint` + `prettier` (TS) | |
| Package Python | `uv` (hoặc pip + `requirements.txt` nếu Render cần) | |

Thư viện backend chính: `djangorestframework`, `djangorestframework-simplejwt`, `drf-spectacular`, `django-cors-headers`, `django-environ`, `dj-database-url`, `psycopg[binary]`, `gunicorn`, `whitenoise` (static cho Django Admin), `argon2-cffi`, `django-filter`, `httpx` (gọi Supabase Storage / email API).

---

## 4. Cấu trúc repo (monorepo)

```
eightytwenty/
├── backend/                     # Django — BOS Backend
│   ├── config/                  # settings/, urls.py, wsgi.py
│   │   └── settings.py (một file cho mọi môi trường)
│   ├── apps/
│   │   ├── core/                # base models (UUID, timestamps), SiteSettings, audit log, health
│   │   ├── accounts/            # User, roles, staff↔location, customer profile, auth endpoints
│   │   ├── locations/           # Location, OpeningHours, SpecialHours
│   │   ├── media/               # MediaAsset, signed upload
│   │   ├── menu/                # Category, MenuItem, ModifierGroup/Option, DietaryTag, LocationMenuItem
│   │   ├── cms/                 # Page, ContentBlock, NavigationItem
│   │   ├── bookings/            # Booking, BookingRule
│   │   ├── enquiries/           # Enquiry (catering / wholesale / contact), CateringPackage
│   │   ├── orders/              # Phase 2: Order, OrderItem, Payment, status events
│   │   ├── giftcards/           # Phase 4
│   │   ├── loyalty/             # Phase 4
│   │   ├── promotions/          # Phase 4
│   │   ├── inventory/           # Phase 3+
│   │   ├── notifications/       # email + push
│   │   └── reports/             # aggregate queries, DailySales
│   ├── tests/
│   ├── manage.py
│   ├── pyproject.toml
│   └── render.yaml              # (tùy chọn) Blueprint
├── web/                         # Website hiện tại (static) — chuyển nguyên trạng vào đây
├── bos/                         # React BOS Admin
├── mobile/                      # Expo app (Phase 3)
├── scripts/
│   └── export-mock-data.mjs     # xuất mock-data.js → JSON để seed DB
├── docs/
│   └── ARCHITECTURE.md          # file này
└── .github/workflows/
    ├── ci.yml                   # lint + test
    ├── db-backup.yml            # pg_dump hằng đêm
    └── (job định kỳ chạy trong server: apps/core/jobs.py)
```

⚠️ Khi chuyển website vào `web/`, phải đổi **Root Directory = `web`** trong Vercel project settings, nếu không bản production sẽ hỏng. Bước này cần người dùng xác nhận trước khi làm.

---

## 5. Quy ước chung (áp dụng cho mọi model & API)

- **ID:** mọi bảng dùng `id UUID` làm khóa chính. Thực thể khách nhìn thấy có thêm `slug` ổn định (vd. `braddon`, `mighty`) — **giữ nguyên slug từ `mock-data.js`** để frontend không đổi.
- **Thời gian:** lưu UTC (`USE_TZ=True`), `TIME_ZONE='Australia/Sydney'` (Canberra dùng múi giờ này, có DST). Giờ mở cửa lưu dạng giờ địa phương (`TimeField`) + weekday.
- **Tiền:** lưu **số nguyên cent AUD** (`price_cents`). Không bao giờ dùng float cho tiền ở backend. Giá **đã gồm GST 10%**; GST trên hóa đơn = `round(total_cents / 11)`.
- **Soft state:** dùng cờ `is_active` / `is_published` thay vì xóa cứng với dữ liệu kinh doanh.
- **Timestamps:** `created_at`, `updated_at` trên mọi bảng; `created_by` / `updated_by` trên dữ liệu do BOS sửa.
- **Audit log:** mọi thao tác ghi từ `/api/v1/bos/*` ghi `AuditLog(actor, action, entity_type, entity_id, before, after, ip, created_at)`.
- **Sổ cái (ledger):** số dư Gift Card, điểm Loyalty, tồn kho **không lưu trực tiếp rồi sửa đè** — luôn là bảng giao dịch append-only; số dư = tổng giao dịch (có thể cache vào cột `balance_cents` nhưng cập nhật trong cùng transaction với `select_for_update`).
- **Phân trang:** cursor hoặc page-number, `page_size` mặc định 50.
- **Lỗi API:** `{ "error": { "code": "booking_slot_full", "message": "…", "fields": { … } } }`.

---

## 6. Mô hình dữ liệu (theo app Django)

### 6.1 `accounts`
- **User** (custom, đăng nhập bằng email): `email` (unique), `password` (argon2), `first_name`, `last_name`, `phone`, `is_active`, `role` ∈ {`owner`, `admin`, `manager`, `staff`, `customer`}, `date_joined`, `marketing_opt_in`.
- **StaffAssignment**: `user` ↔ `location` (M2M qua bảng), quyết định nhân viên/manager thấy dữ liệu chi nhánh nào. `owner`/`admin` thấy tất cả.
- **CustomerProfile**: `user`, `preferred_location`, `birthday` (tùy chọn, cho ưu đãi sinh nhật), `notes` (nội bộ).
- **DeviceToken** (Phase 3): `user`, `expo_push_token`, `platform`.

Ma trận quyền (tóm tắt):

| Quyền | owner | admin | manager | staff | customer |
|---|---|---|---|---|---|
| Sửa menu/giá toàn chuỗi | ✓ | ✓ | – | – | – |
| Bật/tắt còn món ở chi nhánh mình | ✓ | ✓ | ✓ | ✓ | – |
| Sửa CMS | ✓ | ✓ | – | – | – |
| Xử lý booking/enquiry chi nhánh mình | ✓ | ✓ | ✓ | ✓ | – |
| Báo cáo doanh thu | ✓ | ✓ | chi nhánh mình | – | – |
| Quản lý nhân viên | ✓ | ✓ | – | – | – |

### 6.2 `locations`
- **Location**: `slug` (`braddon`…), `name`, `subtitle` (= `sub`), `address`, `phone`, `email`, `lat`, `lng`, `note`, `wait_text`, `booking_label`, `external_order_url`, `status` ∈ {`open`, `closed`, `tbc`}, `fulfilment_methods` (ArrayField: `pickup`, `delivery`, `dine_in`), cờ `is_flagship`, `is_gluten_free`, `is_limited_menu`, `hours_text`, `hours_short_text` (giữ text hiển thị hiện tại), `images` (FK → MediaAsset, tối đa 3, có thứ tự), `sort_order`, `is_published`.
- **OpeningHours**: `location`, `weekday` (0–6), `opens_at`, `closes_at`, `is_closed`.
- **SpecialHours**: `location`, `date`, `opens_at`, `closes_at`, `is_closed`, `reason` (lễ, Tết…).

### 6.3 `media`
- **MediaAsset**: `storage_path` (gốc), `variants` (JSON: `{ "thumb": "…/400.webp", "md": "…/800.webp", "lg": "…/1600.webp" }`), `width`, `height`, `alt_text`, `mime`, `bytes`, `uploaded_by`, `created_at`.
- Ảnh cũ trong `web/img/…` giai đoạn đầu **vẫn dùng đường dẫn tương đối** (field `legacy_path`) để không phải upload lại ngay.

### 6.4 `menu`
- **Category**: `slug`, `name`, `note`, `sort_order`, `is_active`.
- **DietaryTag**: `code` (`GF*`, `DF*`, `Vegan`, `Vegetarian`, `Gluten free`, `Dairy free`), `label`, `description` (vd. `*` = có tùy chọn).
- **MenuItem**: `slug`, `category` (FK), `name`, `description`, `base_price_cents`, `dietary_tags` (M2M), `image` (FK MediaAsset, nullable), `is_featured`, `is_published`, `sort_order`, `price_source` (giữ metadata cũ, tùy chọn).
- **ModifierGroup** (dùng chung): `code` (`drink`, `var`, `add`, `sadd`, `aadd`, `gfo`, …), `name`, `is_required`, `min_select`, `max_select` (0 = không giới hạn).
- **ModifierOption**: `group`, `name`, `price_delta_cents`, `sort_order`, `is_active`.
- **MenuItemModifierGroup** (bảng nối có thứ tự): `menu_item`, `modifier_group`, `sort_order`.
- **LocationMenuItem** (override theo chi nhánh): `location`, `menu_item`, `price_override_cents` (null = dùng giá gốc), `is_available` (còn/hết món), `is_hidden` (chi nhánh không bán món này — vd. Civic menu giới hạn), `updated_by`, `updated_at`. Unique (`location`, `menu_item`).
- Phase sau: **LocationModifierOption** (hết sữa Bonsoy ở 1 chi nhánh…).

**Quy tắc tính giá hiệu lực:** `effective_price(item, location) = LocationMenuItem.price_override_cents ?? MenuItem.base_price_cents`. Món được bán ở chi nhánh khi: `item.is_published AND category.is_active AND NOT override.is_hidden`. Món "hết" khi `override.is_available = false`.

### 6.5 `cms`
- **SiteSettings** (singleton): tên thương hiệu, email chung (`info@eightytwentyfood.com.au`), mạng xã hội, footer, thông báo banner, `menu_version` (số nguyên tăng mỗi khi menu/giá/tình trạng đổi — dùng cho cache).
- **Page**: `slug` (`home`, `about`, `catering`, `wholesale`, `gift-cards`, `terms`, `privacy`…), `title`, `seo_title`, `seo_description`, `status` (`draft`/`published`), `published_at`.
- **ContentBlock**: `page`, `key`, `type` (`hero`, `rich_text`, `image`, `gallery`, `cta`, `faq`…), `data` (JSON có schema theo `type`), `sort_order`.
- **NavigationItem**: `menu` (`header`/`footer`), `label`, `url` hoặc `page`, `parent`, `sort_order`.
- Lưu ý: hiện copy cố định đang nằm trong `index.html`. Chỉ đưa vào CMS **dần dần** từng khối khách muốn tự sửa; không bắt buộc chuyển hết trong Phase 1.

### 6.6 `bookings`
- **BookingRule** (theo chi nhánh): `location`, `is_enabled`, `slot_minutes`, `max_party_size`, `max_covers_per_slot`, `min_lead_minutes`, `max_days_ahead`.
- **Booking**: `reference` (vd. `BK-7H2K9Q`), `location`, `date`, `time`, `party_size`, `name`, `email`, `phone`, `notes`, `customer` (nullable), `status` ∈ {`requested`, `confirmed`, `declined`, `cancelled`, `seated`, `no_show`}, `source` ∈ {`web`, `app`, `staff`}, `handled_by`, `handled_at`.
- Phase 1: mô hình **yêu cầu → nhân viên xác nhận** (không tự xác nhận). Gửi email khi tạo & khi đổi trạng thái.

### 6.7 `enquiries`
- **CateringPackage**: `slug` (`breakfast`, `lunch`, `afternoon-tea`), `name`, `price_cents`, `unit` (`per person`), `blurb`, `items` (JSON list string), `image`, `image_position`, `sort_order`, `is_active`.
- **Enquiry**: `kind` ∈ {`catering`, `wholesale`, `contact`}, `reference`, `name`, `email`, `phone`, `company`, `location` (nullable), `event_date`, `headcount`, `package` (nullable), `message`, `payload` (JSON cho trường riêng từng loại), `status` ∈ {`new`, `in_progress`, `quoted`, `won`, `lost`, `closed`}, `assigned_to`, `internal_notes`.

### 6.8 `orders` — Phase 2
- **Order**: `number` (theo chi nhánh/ngày, vd. `BRD-0612-042`), `location`, `customer` (nullable cho guest), `channel` ∈ {`web`, `app`, `pos`}, `fulfilment` ∈ {`pickup`, `delivery`, `dine_in`}, `scheduled_for`, `status`, `subtotal_cents`, `surcharge_cents`, `discount_cents`, `gst_cents`, `total_cents`, `notes`, `idempotency_key` (unique).
- **OrderItem**: `order`, `menu_item` (FK nullable), **snapshot** `name`, `unit_price_cents`, `quantity`, `line_total_cents`, `notes`.
- **OrderItemModifier**: `order_item`, snapshot `group_name`, `option_name`, `price_delta_cents`.
- **Payment**: `order`, `provider`, `provider_ref`, `status`, `amount_cents`, `raw` (JSON webhook).
- **OrderStatusEvent**: `order`, `from_status`, `to_status`, `actor`, `created_at`.
- **Máy trạng thái:** `pending_payment → paid → accepted → preparing → ready → completed`; nhánh `cancelled`, `refunded`. Chuyển trạng thái chỉ qua service function, không `save()` trực tiếp.
- **Server luôn tính lại giá** từ DB (giá hiệu lực + modifier + phụ phí), **bỏ qua mọi giá client gửi lên**. Kiểm tra món còn bán, chi nhánh đang mở, khung giờ hợp lệ, modifier required/max.

### 6.9 `giftcards`, `loyalty`, `promotions` — Phase 4
- **GiftCard**: `code` (lưu hash + 4 số cuối để hiển thị), `initial_cents`, `balance_cents` (cache), `status`, `expires_at`, `purchaser`, `owner`.
- **GiftCardTransaction** (append-only): `gift_card`, `type` (`issue`, `redeem`, `refund`, `adjust`), `amount_cents` (+/−), `order`, `actor`.
- **LoyaltyAccount** / **LoyaltyTransaction** (append-only): tương tự, đơn vị là điểm. Quy tắc tích điểm cấu hình ở **LoyaltyRule** (chờ khách chốt).
- **Promotion** / **Voucher**: loại giảm (%/cố định/tặng món), điều kiện, thời gian, chi nhánh áp dụng, giới hạn lượt.
- **Apple Wallet:** backend sinh file `.pkpass` (ký bằng chứng chỉ Pass Type ID của Apple Developer account **của khách hàng**), cập nhật số dư qua PassKit web service. Phase 4.

### 6.10 `inventory` — Phase 3+
- Giai đoạn đầu **chỉ dùng cờ `LocationMenuItem.is_available`**. Kho thật (nguyên liệu, định lượng, nhập/xuất) chỉ làm khi khách chốt phạm vi: **StockItem**, **StockLevel** (theo chi nhánh), **StockMovement** (ledger), **Recipe** (món ↔ nguyên liệu).

### 6.11 `reports`
- Báo cáo đọc trực tiếp từ `orders` bằng query tổng hợp. Khi dữ liệu lớn: bảng **DailySales** (`location`, `date`, `orders_count`, `gross_cents`, `discount_cents`, `gst_cents`, theo kênh) được tính lại mỗi đêm bởi job định kỳ.

---

## 7. Thiết kế API

### 7.1 Nhóm endpoint

| Prefix | Ai dùng | Auth | Ghi chú |
|---|---|---|---|
| `/health` | Pinger | không | Trả `{"ok":true}`, **không query DB**. |
| `/api/v1/public/*` | Website, App | không | Chỉ đọc + POST form. Cache được. Có rate limit. |
| `/api/v1/auth/*` | Website, App, BOS | – | `register`, `login`, `refresh`, `logout`, `password/reset`, `password/reset/confirm`, `verify-email`. |
| `/api/v1/me/*` | Khách đã đăng nhập | JWT customer | Profile, booking của tôi, order của tôi, loyalty, gift card. |
| `/api/v1/bos/*` | BOS Admin | JWT staff+ | CRUD toàn bộ dữ liệu, lọc theo chi nhánh được giao. |
| `/api/v1/webhooks/*` | Stripe/TapTouch… | chữ ký webhook | Phase 2. |
| `/api/v1/jobs/*` | GitHub Actions cron | header `X-Job-Token` | Chạy job định kỳ (vì free tier không có worker/cron riêng). |
| `/` | BOS workspace (Django Admin ở gốc từ 12/10/2026; `/admin/...` chuyển hướng 301) | Django session | Chủ chuỗi, chủ quán, nhân viên — xem mục 17. |
| `/api/schema/`, `/api/docs/` | Dev | – | OpenAPI (tắt `docs` ở prod nếu muốn). |

### 7.2 Endpoint public quan trọng nhất: `GET /api/v1/public/bootstrap`

Trả **một lần** toàn bộ dữ liệu website cần, **đúng shape của `mock-data.js`** (mục 2) để chỉ phải thay adapter:

```json
{
  "version": 42,
  "generatedAt": "2026-10-06T03:00:00Z",
  "LOCATIONS": [ … ],
  "CATEGORIES": [ … ],
  "MENU": [ … ],          // price là số AUD (35, 10.9), mods.options là [name, price]
  "CATERING": [ … ],
  "ORDER_RULES": { … },
  "SETTINGS": { … }
}
```

- Tham số tùy chọn `?location=braddon` → áp giá override và cờ còn/hết món của chi nhánh đó (thêm field `available:false` vào món hết).
- Header: `Cache-Control: public, max-age=60, stale-while-revalidate=600` + `ETag` dựa trên `menu_version`.
- Serializer "compat" này **tách riêng** khỏi serializer chuẩn của BOS (BOS dùng cents, UUID, field đầy đủ).

Các endpoint public khác:
- `GET /api/v1/public/locations`, `/locations/{slug}`, `/menu?location=`, `/categories`, `/catering-packages`, `/pages/{slug}`, `/settings`, `/version` (chỉ trả `{"version":42}` cho polling rẻ).
- `POST /api/v1/public/bookings` → `201 { reference, status:"requested" }`.
- `POST /api/v1/public/enquiries` (`kind`: catering | wholesale | contact) → `201 { reference }`.
- `GET /api/v1/public/bookings/availability?location=&date=` (Phase 1.5).
- Chống spam form: DRF throttle theo IP (vd. 10/giờ) + **Cloudflare Turnstile** (free) + trường honeypot.

### 7.3 BOS endpoints (ví dụ)
- `GET/POST/PATCH /api/v1/bos/menu-items`, `/categories`, `/modifier-groups`, `/modifier-options`
- `PATCH /api/v1/bos/locations/{slug}/menu-items/{item_slug}` → `{ is_available, price_override_cents, is_hidden }` (nút "Hết món" dùng endpoint này)
- `POST /api/v1/bos/locations/{slug}/menu-items/bulk-availability`
- `GET/PATCH /api/v1/bos/bookings?location=&date=&status=`, `POST /bookings/{id}/confirm|decline`
- `GET/PATCH /api/v1/bos/enquiries`
- `GET/POST/PATCH /api/v1/bos/pages`, `/content-blocks`, `/navigation`, `/settings`
- `POST /api/v1/bos/media/upload-url` → trả signed upload URL; `POST /api/v1/bos/media` → đăng ký asset sau khi upload xong.
- `GET /api/v1/bos/users`, `/staff-assignments`, `/audit-logs`, `/reports/sales?from=&to=&location=`

Mọi thay đổi menu / giá / còn-hết / chi nhánh **phải tăng `SiteSettings.menu_version`** (làm trong service layer hoặc signal).

---

## 8. Luồng dữ liệu hai chiều (yêu cầu cốt lõi của khách)

**BOS → Website/App (đổi giá, hết món, sửa chi nhánh, sửa nội dung):**
1. Quản lý sửa trong BOS Admin → `PATCH /api/v1/bos/...`.
2. Backend ghi DB trong transaction + ghi AuditLog + tăng `menu_version`.
3. Website/App: lần tải tiếp theo (cache tối đa 60 giây) nhận dữ liệu mới. App có thể poll `/public/version` khi mở màn hình menu; đổi version → tải lại bootstrap.
4. (Tùy chọn Phase 2+) Đẩy realtime bằng Supabase Realtime **Broadcast** trên kênh public `menu` — backend gửi sự kiện `{version}`; client nhận thì tải lại. Không dùng Realtime trên bảng DB (sẽ phải mở RLS cho client).

**Website/App → BOS (đặt bàn, enquiry, order, loyalty):**
1. Client POST → backend validate → ghi DB → trả `reference`.
2. Bản ghi xuất hiện ngay trong hàng đợi BOS Admin của chi nhánh liên quan (BOS poll 15–30 giây hoặc khi focus tab).
3. Nhân viên xử lý → đổi trạng thái → backend gửi email/push cho khách.

---

## 9. Website — cách nối vào API (không đổi UI)

Chỉ sửa `web/eightytwenty-data.js` (+ các hàm submit trong `index.html`):

1. Adapter export một hàm `loadData()`:
   - Gọi `GET {API_BASE}/api/v1/public/bootstrap` với **timeout ~6 giây** (phòng Render cold start).
   - Thành công → lưu bản sao vào `localStorage` (bọc `try/catch`) và trả dữ liệu.
   - Thất bại → dùng bản `localStorage` gần nhất → nếu không có, **fallback về `mock-data.js` (snapshot đóng gói sẵn)**. Website **không bao giờ trắng trang** kể cả khi API chết.
2. `API_BASE` cấu hình ở một chỗ duy nhất (vd. `web/config.js`), không có secret nào trong frontend.
3. `bkSubmit()` → `POST /public/bookings`; `submitEnquiry(kind)` → `POST /public/enquiries`. Hiện trạng thái đang gửi, chỉ báo thành công khi nhận `201`, báo lỗi rõ ràng khi thất bại.
4. Auth & tài khoản → `/auth/*` và `/me/*` (Phase 1.5). Access token để trong bộ nhớ, refresh token theo cách an toàn nhất mà static site cho phép (ưu tiên cookie `HttpOnly` nếu dùng chung domain gốc với API; nếu khác domain thì `localStorage` + rotate refresh — ghi rõ rủi ro).
5. Order/Cart/Checkout giữ ẩn đến hết Phase 2.

---

## 10. Hạ tầng & vận hành (free tier)

### 10.1 Render (BOS Backend)
- 1 Web Service, region **Singapore**, instance **Free** (Phase 1). Lên **Starter ($7/tháng)** khi mở Order/thanh toán — chỉ đổi Instance Type, giữ workspace **Hobby ($0)**.
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput`
- Start: `gunicorn config.wsgi:application --workers 2 --threads 2 --timeout 60 --max-requests 500 --max-requests-jitter 50`
- RAM chỉ 512MB → **không xử lý ảnh nặng trên server**, không load cả bảng vào bộ nhớ.
- Ổ đĩa tạm thời → không ghi file người dùng ra disk.
- Hobby workspace chỉ 5GB bandwidth/tháng → API **chỉ trả JSON**, bật nén gzip (`GZipMiddleware`), ảnh luôn tải thẳng từ Supabase Storage.
- Giữ thức: UptimeRobot/cron-job.org gọi `GET /health` mỗi 5 phút.

### 10.2 Supabase
- Project region **Singapore (ap-southeast-1)** — cùng region với Render.
- Kết nối từ Django qua **Supavisor transaction pooler (cổng 6543)**:
  - `CONN_MAX_AGE = 0`
  - `DISABLE_SERVER_SIDE_CURSORS = True`
  - `sslmode=require`
- Chạy migrations qua **session pooler (cổng 5432)** bằng biến `DATABASE_URL_MIGRATIONS` nếu transaction pooler gây lỗi.
- **Bảo mật PostgREST:** Supabase tự mở REST API cho schema `public` với anon key. Vì client không bao giờ dùng anon key để đọc DB, phải **bật RLS trên mọi bảng và không tạo policy nào** (deny-all) *hoặc* `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` — thêm vào một migration `RunSQL`. Django kết nối bằng role `postgres` nên không bị ảnh hưởng.
- Giới hạn free cần theo dõi: DB 500MB, Storage 1GB, **egress ~5GB/tháng (nút thắt chính — chủ yếu do ảnh)**. Không có backup tự động → xem 10.4.

### 10.3 Ảnh / media
1. BOS Admin nén ảnh **trên trình duyệt** (`browser-image-compression` / canvas) → tạo 3 bản WebP: `thumb` 400px, `md` 800px, `lg` 1600px (chất lượng ~0.8).
2. BOS Admin gọi `POST /bos/media/upload-url` → backend (dùng `SUPABASE_SERVICE_ROLE_KEY`) tạo signed upload URL cho từng bản.
3. Trình duyệt upload thẳng lên Supabase Storage (không đi qua Render).
4. BOS Admin gọi `POST /bos/media` để đăng ký `MediaAsset` với `variants`.
- Tên file có hash nội dung (`menu/mighty-breakfast-3f9a1c.webp`) → set `Cache-Control: public, max-age=31536000, immutable`.
- Client dùng `thumb` cho danh sách, `md` cho modal, `lg` cho banner; `loading="lazy"` cho ảnh dưới màn hình đầu.
- **Service role key chỉ nằm ở backend.** Không bao giờ ở website/App/BOS Admin.
- **Luồng thứ hai — upload từ Django Admin (bổ sung 10/10/2026):** ô "Upload a new photo" trên form Menu item, Catering package và Media library. Server (Pillow) xoay theo EXIF, thu cạnh dài về 400/800/1600 px, mã hoá WebP (q82, giảm dần nếu >2 MiB), POST thẳng lên Storage bằng service key với `cache-control: max-age=31536000`, rồi tạo `MediaAsset` (audit `admin_create`). Ảnh đi qua Render (tốn CPU/RAM instance) — chấp nhận được với lượng ảnh của quán; luồng 1–4 ở trên vẫn giữ cho BOS React/App. Code: `apps/media/services.py` (`encode_variants`, `upload_object`, `store_image`), `apps/media/admin.py` (`ImageUploadForm`, `attach_upload`).

### 10.4 Backup & job định kỳ (GitHub Actions)
- `db-backup.yml`: chạy 02:00 giờ Canberra mỗi ngày → `pg_dump --format=custom` (qua session pooler) → nén → lưu làm artifact (giữ 14 ngày) và/hoặc upload sang storage ngoài (vd. Cloudflare R2 free / Google Drive). Có hướng dẫn restore trong `docs/`.
- Job định kỳ (27/10/2026): không còn `scheduled-jobs.yml`; web process tự chạy `retry-emails`, `booking-reminders`, `cleanup` mỗi 15 phút khi có request (`apps/core/jobs.py`, khóa bằng bảng `JobClock`). Endpoint `POST /api/v1/jobs/{job}` + `X-Job-Token` vẫn dùng để chạy tay.

### 10.5 Email
- Dịch vụ transactional có free tier (Resend hoặc Brevo) qua HTTP API, gọi đồng bộ trong request nhưng có timeout ngắn và **không làm hỏng request nếu email lỗi** (ghi log + đánh dấu để retry bằng job).
- Gửi từ domain của khách (`@eightytwentyfood.com.au`) → cần khách cấu hình SPF/DKIM.

### 10.6 Biến môi trường (backend)

```
SECRET_KEY=
DEBUG=False
DATABASE_URL=postgresql://…pooler.supabase.com:6543/postgres?sslmode=require
DATABASE_URL_MIGRATIONS=postgresql://…pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=media
SUPABASE_PUBLIC_MEDIA_BASE=https://<project>.supabase.co/storage/v1/object/public/media
JWT_ACCESS_MINUTES=15
JWT_REFRESH_DAYS=30
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=EightyTwenty <no-reply@eightytwentyfood.com.au>
TURNSTILE_SECRET_KEY=
JOB_TOKEN=
SENTRY_DSN=            # tùy chọn (Sentry có free tier)
```

Có file `backend/.env.example` liệt kê đủ các biến này (không có giá trị thật). `.env` nằm trong `.gitignore`.

---

## 11. Bảo mật & tuân thủ (Úc)

- HTTPS mọi nơi; HSTS ở prod; `SECURE_PROXY_SSL_HEADER` cho Render.
- CORS chỉ cho phép đúng domain Website + BOS Admin (+ app không cần CORS).
- Password hash argon2; khóa tạm khi đăng nhập sai nhiều lần (throttle).
- Phân quyền ở **mọi** BOS endpoint (role + chi nhánh được giao) — viết test cho quyền.
- Không log thông tin thẻ; thanh toán dùng token/hosted fields của cổng thanh toán (không chạm số thẻ → giảm phạm vi PCI).
- Webhook phải verify chữ ký + idempotent.
- **Privacy Act 1988 (Úc):** chỉ thu thập dữ liệu cần thiết; có trang Privacy Policy; cho khách xem/xóa tài khoản (`DELETE /me` → ẩn danh hóa, giữ order cho kế toán).
- Hóa đơn/biên nhận phải có **ABN** và **GST**; giá niêm yết đã gồm GST.

---

## 12. Lộ trình triển khai (theo phase)

### Phase 1 — BOS lõi + nối Website (free tier)
1. Khởi tạo monorepo, `backend/` Django + settings dev/prod + `/health` + CI (ruff + pytest).
2. Models: `core`, `accounts`, `locations`, `media`, `menu`, `cms`, `bookings`, `enquiries` + migrations + migration khóa PostgREST (10.2).
3. `scripts/export-mock-data.mjs` → JSON; management command `seed_from_mock` nhập 10 locations, 12 categories, 84 món, modifier groups dùng chung, 3 gói catering. **Giữ nguyên slug/id.**
4. `GET /public/bootstrap` trả **đúng shape `mock-data.js`** — viết test so sánh output với snapshot JSON từ bước 3.
5. Public POST bookings & enquiries (+ throttle, Turnstile, email).
6. Auth JWT + phân quyền staff theo chi nhánh.
7. BOS Admin (React): đăng nhập; menu & giá; còn/hết món theo chi nhánh; chi nhánh & giờ mở cửa; hàng đợi booking; enquiries; CMS cơ bản; upload ảnh; người dùng & phân quyền; audit log.
8. Website: adapter `loadData()` với fallback (mục 9), nối form booking/enquiry.
9. Deploy Render + Supabase + pinger + backup workflow.

**Hoàn thành khi:** đổi giá 1 món trong BOS → website hiện giá mới trong ≤ 60 giây; bấm "hết món" ở Braddon → món hiện hết ở Braddon nhưng vẫn còn ở chi nhánh khác; khách gửi booking từ website → xuất hiện trong BOS của đúng chi nhánh và khách nhận email.

### Phase 2 — Order & thanh toán (yêu cầu lên Render Starter + Supabase Pro)
- Chốt TapTouch vs Stripe → module `orders` + `payments` + webhook; màn hình bếp/đơn trong BOS theo chi nhánh; tài khoản khách `/me/orders`; bật Cart/Checkout trên website.

### Phase 3 — App khách hàng
- Expo app: toàn bộ chức năng website + order + lịch sử + thông báo push; dùng chung API & type sinh từ OpenAPI.

### Phase 4 — Loyalty, Gift Card, ưu đãi, Apple Wallet, báo cáo nâng cao, kho
- Ledger gift card & loyalty, promotions, `.pkpass`, DailySales, inventory (nếu khách chốt).

---

## 13. Quy tắc làm việc cho người/AI viết code

1. **Đọc file này + `FRONTEND_HANDOFF.md` trước khi viết code.** Làm theo phase; không nhảy sang phase sau khi phase hiện tại chưa đạt tiêu chí hoàn thành.
2. **Không sửa UI website** ngoài phần adapter và các hàm submit/auth đã nêu. Không thêm framework/build step vào `web/`.
3. Không bao giờ để secret trong frontend hay commit `.env`.
4. Mọi logic tiền dùng **integer cents**; server tự tính giá; có unit test.
5. Business logic đặt trong `services.py` của từng app (views mỏng, serializers chỉ validate/format).
6. Mọi thay đổi schema đi kèm migration; không sửa migration đã deploy.
7. Mỗi endpoint mới phải có trong OpenAPI (dùng `@extend_schema` khi cần) và có test (ít nhất: happy path + quyền).
8. Thay đổi kiến trúc → cập nhật tài liệu này trong cùng PR.
9. Những việc **cần hỏi người dùng trước**: di chuyển file website / đổi cấu hình Vercel, deploy production, xóa dữ liệu, chọn cổng thanh toán, bất cứ câu hỏi nào ở mục 14.
10. Commit nhỏ, message dạng `feat(menu): …`, `fix(bookings): …`.

---

## 14. Câu hỏi mở (cần khách hàng trả lời — chưa được giả định)

1. **POS/TapTouch:** chi nhánh đang dùng TapTouch (`lifeintouch.net`) cho POS & order. BOS sẽ **thay thế** TapTouch hay **tích hợp** (TapTouch có API không)? Ảnh hưởng toàn bộ Phase 2.
2. **Cổng thanh toán:** ~~Stripe / Square / Tyro / giữ TapTouch?~~ **Đã chốt Square cho app điện thoại (27/10/2026)**: thẻ + Apple Pay qua Square In-App Payments SDK, server gọi Square Payments API (`apps/orders/payments.py`, `docs/SQUARE_SETUP.md`). Còn mở: eGift qua Square Gift Cards, lưu thẻ (Cards API), phụ phí thẻ 2.95% còn áp dụng?
3. **Giá & menu theo chi nhánh:** có khác nhau không, hay chỉ khác còn/hết món? (Mô hình đã hỗ trợ override.)
4. **Delivery:** tự giao (phí 10% như `ORDER_RULES`?) hay qua Uber Eats/DoorDash?
5. **Booking:** chi nhánh nào nhận đặt bàn? Sức chứa? Tự xác nhận hay nhân viên duyệt?
6. **Loyalty:** quy tắc tích/đổi điểm? **Gift Card:** mệnh giá, hạn dùng, dùng tại quầy?
7. **Nhân viên:** chỉ cần tài khoản + phân quyền, hay cả xếp ca/chấm công?
8. **Kho:** chỉ còn/hết món, hay quản lý nguyên liệu thật?
9. **Wholesale:** chỉ form enquiry, hay cả đặt hàng sỉ/công nợ?
10. **Apple Developer account** & domain email để gửi mail (SPF/DKIM) thuộc về ai?
11. Chi nhánh **Akuna St** (đang `tbc`) — ẩn hay hiện?
12. Ngân sách hạ tầng từ Phase 2 (~$32/tháng: Render Starter $7 + Supabase Pro $25) đã được duyệt chưa?

---

## 15. Ghi nhận triển khai backend ngày 06/10/2026

Thư mục nhận bàn giao lúc bắt đầu chỉ có tài liệu này; chưa có website, `mock-data.js` hoặc `FRONTEND_HANDOFF.md`. Backend nằm tại `backend/`, tài liệu tích hợp tại `docs/API_GUIDE.md`, OpenAPI sinh từ code tại `docs/openapi.yaml`. Không di chuyển website hoặc đổi cấu hình Vercel.

Các quyết định bổ sung để team triển khai nhất quán:

1. Dùng Django 5.2 thuộc nhánh 5.x đã chốt. Local mặc định SQLite; production và CI dùng PostgreSQL. `fulfilment_methods` dùng JSONField + enum validation thay ArrayField để chạy local; API vẫn chỉ nhận pickup/delivery/dine_in.
2. Tất cả bảng nghiệp vụ dùng UUID; các bảng nội bộ do Django/JWT quản lý giữ schema của thư viện. Tag ăn kiêng có bảng nối `MenuItemDietaryTag` với thứ tự để giữ nguyên output snapshot. ModifierGroup.code không unique: nhóm chỉ dùng chung khi cùng định nghĩa; BOS dùng UUID làm định danh.
3. Bổ sung EmailMessage outbox có retry và RateLimitBucket dùng database để chia sẻ rate limit giữa Gunicorn workers. Resend là adapter email được triển khai; không quyết định payment provider.
4. BookingRule mặc định disabled; thiếu cấu hình giờ mở cửa/sức chứa sẽ từ chối booking. Requested/confirmed/seated giữ sức chứa của slot, xử lý đồng thời bằng row lock PostgreSQL. Slot theo giờ địa phương Sydney; reject thời điểm DST không tồn tại/không rõ ràng.
5. API dùng đường dẫn không có slash cuối; docs/schema/admin giữ slash. Dữ liệu nghiệp vụ chỉ GET/POST/PATCH; soft state thay hard delete. Link menu-modifier, location-image và staff-assignment có cờ active.
6. Auth hiện là bearer JWT trong JSON; chưa có cookie HttpOnly. Có register/login/refresh/logout/reset/verify-email, profile và ẩn danh hóa tài khoản khách. Giao diện khách chưa được nối vì nằm ngoài code được cung cấp.
7. Media dùng upload receipt ký bởi backend và gắn actor. Backend kiểm tra đủ ba object WebP trước đăng ký asset; Storage bucket vẫn phải giới hạn MIME/size ở nhà cung cấp. Không giữ file người dùng trên Render.
8. CMS rich_text ở bản đầu chỉ nhận text thuần; các block khác có schema xác định trong tài liệu API. HSTS preload không tự bật. SENTRY_DSN mới là biến dự trù, chưa cài Sentry.
9. Khóa PostgREST qua migration + post_migrate hook cho bảng Django hiện tại/tương lai. Backup workflow lưu schema public, không chứa file ảnh Storage; job/backup chỉ bật sau khi owner cấu hình repository variables/secrets.
10. Đã có backend và Django Admin nội bộ; chưa có React BOS SPA. Điều kiện hoàn thành Phase 1 end-to-end vẫn cần dữ liệu website thật, cấu hình provider, giao diện client và smoke test production. Không coi backend local đã kiểm thử là đã deploy toàn hệ thống.

Chi tiết bằng chứng kiểm thử và giới hạn: `docs/IMPLEMENTATION_STATUS.md`. Các câu hỏi mục 14 vẫn chưa được giả định hoặc chốt thay khách hàng. Giá và chính sách free tier ghi ở phần kiến trúc là dự kiến ban đầu, cần kiểm tra với nhà cung cấp ở thời điểm deploy.

## 16. Ghi nhận 06/10/2026 — nối website

Website nằm ở `website/` (không phải `web/`), không đổi cấu hình Vercel. Adapter + form submit đã nối API theo mục 9; form lỗi thì fallback email draft. Định hướng chủ dự án: chạy được trên Render free là đủ → Turnstile không bắt buộc ở prod, ưu tiên giải pháp đơn giản.

## 17. Ghi nhận 10/10/2026 — BOS 3 cấp trong Django Admin

- Django Admin không còn chỉ dành superuser: là BOS cho **chủ chuỗi** (superuser), **chủ quán** (`role=manager`, `is_staff=True`) và **nhân viên** (`role=staff`, `is_staff=True`). Không có cấp văn phòng/vùng.
- Chính sách tập trung ở `apps/core/bos_access.py` (`bos_role`, `bos_location_ids`, `scope_filter`, `in_scope`); `RoleAccessMixin` (`apps/core/admin_base.py`) khai báo `view_roles/add_roles/change_roles/location_lookup` cho từng ModelAdmin, lọc queryset và FK Location theo StaffAssignment. Trang riêng (Reports/Schedule/Availability/System) kiểm tra qua `VIEW_ROLES` trong `admin_site.py`.
- Menu = **menu chung + món riêng từng quán**: `MenuItem.location` (nullable FK). Rỗng = món toàn chuỗi (chỉ chủ chuỗi sửa); có giá trị = món chỉ quán đó bán (chủ quán đó sửa). Public bootstrap chỉ chứa món chung (giữ shape mock-data); `/api/v1/public/menu?location=` thêm món riêng của quán đó.
- Chủ quán chỉ quản lý user có role `staff` gán vào quán mình; người làm ở nhiều quán không bị một chủ quán khóa tài khoản.
- Quyền REST API `/api/v1/bos/*` không đổi trong đợt này.

## 18. Ghi nhận 12/10/2026 — API cho app điện thoại

- Khách gửi giao diện + code app Expo (`EightyTwentyMobile`, do dev khác nối API). App đã code sẵn theo hợp đồng riêng (`docs/API_CONTRACTS.md` của app: camelCase, cents, lỗi `{error:{code: VALIDATION|PRICE_CHANGED|…}}`, refresh token xoay vòng, Idempotency-Key). Backend làm **API riêng cho app** ở `/api/v1/app/...` (app `apps/mobile`: chỉ views/serializers/presenters/errors, không model), khớp từng path trong `endpoints.ts`; API website/BOS giữ nguyên. Tài liệu publish: `/api/docs/app/` (hướng dẫn `apps/mobile/guide.md` + docstring từng endpoint).
- Domain mới: `apps/orders` (Order, OrderLine; tính giá phía server = port `computeTotals` của app, integer cents, half-up ở bước phí giao + phụ phí thẻ; trạng thái received→confirmed→preparing→ready→completed | declined, nhân viên được nhảy bước; decline hoàn gift card + stamp), `apps/loyalty` (LoyaltyCard 9 stamp → ly thứ 10 miễn phí, LoyaltyActivity, GiftCard, GiftCardActivity), `AppNotification` (feed trong app), `cms.Offer`/`cms.Faq`, `accounts.SavedAddress` + field app trên CustomerProfile (preferences JSON, favourites, seen-at, closure). Thêm field: `Location.area/headline`, `Category.short_name`, `Booking.seating`, `Enquiry.customer`. `apps/menu/catalog.py` dùng chung cho menu app và tính giá order.
- **Thanh toán = Square (27/10/2026)**: `apps/orders/payments.py` là chỗ duy nhất gọi cổng. `PAYMENT_PROVIDER` rỗng → 501; `demo` → token demo, không thu tiền; `square` → authorize khi đặt đơn, capture khi quán nhận, cancel/refund khi từ chối.
- Booking từ app là *yêu cầu* (quy trình hiện tại của quán): lưu vào BOS + email hộp thư quán, không cần BookingRule bật; rule kiểm tra theo app (giờ mở, trước giờ đóng 30 phút, ≥12 giờ, từ ngày mai).
- Đổi mật khẩu: mật khẩu tối thiểu 10 ký tự (validator Django) — app đang cho 6, server trả 422 rõ ràng. Link reset của app mở trang `/account/reset-password` trên server.

## 19. Ghi nhận 16/10/2026 — API cho máy POS (giai đoạn 1)

- Khách gửi frontend POS + màn hình bếp (`johnthinh2009-coder/EightyTwenty-POS-Frontend-KDS`, React/Vite, web tĩnh) → trả lời câu hỏi 14.1: **tự làm POS thay TapTouch**. Dev khác nối frontend; backend làm API theo `src/services/contracts.ts` (`PosBackend`) và `src/domain/types.ts`. Đường dẫn trong `httpBackend.ts` của POS chỉ là đề xuất → backend chốt tất cả dưới `/api/v1/pos/...` (bảng ánh xạ trong `apps/pos/guide.md`, publish `/api/docs/pos/`).
- App `apps/pos`: views/serializers (`Pos…In/Out`)/presenters/services/pins + model `CashShift`, `TillTransaction`, `CommandReceipt` (lưu câu trả lời theo `Idempotency-Key`, decorator `idempotent` trong `views.py`, job cleanup xóa sau 30 ngày). Lỗi dùng chung format app (`apps/mobile/errors.py`).
- Đăng nhập 2 lớp: **máy** = tài khoản nhóm quán (JWT `/api/v1/auth/login`), quyết định quán nào; **người** = PIN 4 số (`User.pos_pin`, HMAC theo SECRET_KEY + user id, duy nhất toàn chuỗi, rate limit `pin` 20/phút). Role POS: superuser/owner/admin → admin, manager → manager, staff → cashier (ma trận `pins.ROLES` = `DEFAULT_ROLES` của POS). Server chỉ kiểm quyền theo tài khoản máy; quyền từng người do UI POS áp (lệnh không mang token nhân viên) — giới hạn có chủ đích.
- `Order` dùng chung cho app và quầy: thêm `channel` (app/pos), `customer` nullable, method `takeaway`, trạng thái `cancelled/refunded/failed`, field quầy (placed_at, tables, discounts, note, staff_name, terminal_id, history, `review_note`), `OrderLine.key/adjust/prep` (void = qty 0, không xóa dòng), `OrderPayment`, `OrderAdjustment`. Mã đơn POS = `number` (≤40, phải duy nhất toàn hệ thống; khuyến nghị tiền tố terminal). App vẫn chỉ thấy đơn `channel=app`, trạng thái mới hiện thành `declined`.
- **Đơn quầy không bị từ chối vì giá**: quầy bán theo menu đã tải; server chỉ chặn khi tổng không khớp (Σ giá × SL − giảm + phí giao, lệch ≤1¢), còn lệch giá/món lạ/món hết → ghi `review_note` cho quản lý xem trong BOS.
- Host và CORS mở hoàn toàn (`ALLOWED_HOSTS = ["*"]`, `CORS_ALLOW_ALL_ORIGINS = True`, 16/10/2026) theo định hướng "mì ăn liền" của chủ dự án: API dùng bearer token, không dùng cookie, nên không cần danh sách origin.
- Giai đoạn 2 (16/10/2026): khách hàng (= tài khoản khách app), thẻ cà phê dùng chung với app (POS stamps/rewards ↔ tổng dấu; từ 29/10/2026 ly miễn phí cộng dồn — 9 dấu = 1 ly, mỗi đơn dùng 1 ly; trước đó chỉ một ly chờ tại một thời điểm), còn-hết món (qua `set_availability`), đặt bàn (= `Booking`, reference = id POS) và catering (= `Enquiry`, field POS trong `payload`) từ POS.
- Sơ đồ bàn (`pos.TillTable`, chủ quán khai báo) và mã giảm giá (`pos.Promotion`, chủ chuỗi khai báo) nằm trong BOS, POS đọc qua snapshot; mã chỉ kiểm ở POS (đơn mang `discounts`, server không đối chiếu mã).
- Chưa làm: giá/modifier/thứ tự danh mục từ POS (sửa trong BOS), nhân viên/role/settings từ POS, gift card Square, kho, hóa đơn điện tử, máy quẹt thẻ/máy in (ở thiết bị).

## 20. Ghi nhận 16/10/2026 — doanh thu trong BOS và push cho app

- BOS Reports có khối Sales tính từ đơn app + đơn quầy: đơn được tính là doanh thu khi đã nhận và không bị từ chối/hủy/hoàn hết/lỗi; ngày = ngày đặt đơn theo giờ quán; đơn app tính cả phần gift card, không tính phụ phí thẻ; hoàn tiền một phần hiện riêng (không trừ vào doanh thu). Xuất CSV đơn hàng.
- Push: Expo Push API (miễn phí, không cần key). App đăng ký token qua `/api/v1/app/me/push-tokens`; mọi dòng feed (`notify()`) được đẩy kèm, theo toggle thông báo của khách. Gửi đồng bộ sau commit, timeout 5 s, lỗi chỉ ghi log — đủ cho "mì ăn liền", chưa cần hàng đợi riêng.
