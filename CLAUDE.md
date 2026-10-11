# CLAUDE.md — EightyTwenty BOS

Hướng dẫn cho Claude (và AI agent khác) khi làm việc trong repo này. Đọc file này trước, sau đó đọc các tài liệu liên quan trong mục "Tài liệu nguồn".

> ⚠️ **QUY TẮC BẮT BUỘC: sau mỗi lần viết/sửa code, phải cập nhật lại file CLAUDE.md này** (mục "Nhật ký thay đổi" ở cuối file và mọi mục bị ảnh hưởng: cấu trúc, lệnh, quy ước, trạng thái). Mục đích: phiên làm việc sau đọc CLAUDE.md là nắm đúng ngữ cảnh hiện tại, không phải đoán lại từ code. Nếu thay đổi chạm tới quyết định kiến trúc thì cập nhật thêm `ARCHITECTURE.md`; nếu đổi trạng thái/giới hạn thì cập nhật `docs/IMPLEMENTATION_STATUS.md`.

## 1. Dự án là gì

- EightyTwenty: chuỗi café healthy ở Canberra (ACT, Úc), ~9–10 chi nhánh.
- Repo chứa **BOS Backend** (Django, `backend/`) và **Website** (static, `website/`, clone từ github johnthinh2009-coder/EightyTwenty, đã bỏ `.git`). Backend là nguồn dữ liệu duy nhất cho Website (Vercel), App (Expo, Phase 3) và BOS Admin (React SPA, chưa làm). Client **chỉ** đi qua REST API, không bao giờ chạm DB.
- Đã xong Phase 1 backend + một phần Phase 1.5 (auth, profile khách, availability). Website đã nối API (bootstrap + form booking/enquiry). **Chưa có**: mobile/React BOS, order/thanh toán, loyalty, gift card, báo cáo doanh thu, kho.
- Hạ tầng: Render (API, Singapore) + Supabase (Postgres + Storage) + Vercel. Supabase project `eightytwenty-bos` (Singapore, ref `wlceafmmujlinshwtgow`): đã `migrate` đủ (10/10/2026, 38 bảng, RLS bật hết, anon/authenticated không có quyền), đã seed 1 lần từ `website/mock-data.js` (10/10/2026: 10 chi nhánh, 12 danh mục, 84 món, 3 gói catering, 23 modifier group; bootstrap khớp 100% bản local) + `fill_opening_hours --apply` (9 quán, Akuna TBC). **Không chạy lại `seed_from_mock` trên production** (sẽ ghi đè giá/nội dung đã sửa trong admin). Chưa có superuser (chủ dự án tự tạo), chưa có booking; BookingRule đều tắt. Bucket `media` public, ≤2 MiB, chỉ `image/webp` — đã thử upload ký sẵn/đọc public/chặn PNG/chặn >2 MiB/chặn ghi ẩn danh. Data API vẫn bật nhưng bị chặn bởi grants. Chưa deploy Render.
- **Định hướng của chủ dự án: "mì ăn liền" — chạy được trên Render free là đủ.** Tính năng mới làm theo cách đơn giản nhất chạy được; không thêm hardening/tầng kiến trúc nếu không làm hỏng trải nghiệm thật của khách.
- Ngôn ngữ: tài liệu tiếng Việt; **code, tên biến, API, commit message tiếng Anh**.

## 2. Tài liệu nguồn (đọc khi cần)

| File | Nội dung |
|---|---|
| `ARCHITECTURE.md` | Nguồn sự thật về kiến trúc, model, API, phase, câu hỏi mở (mục 14), quyết định bổ sung (mục 15) |
| `README.md` | Cách chạy local, phần đã có, Django Admin |
| `docs/API_GUIDE.md` | Hợp đồng API cho web/mobile/BOS, JSON mẫu, mã lỗi |
| `docs/openapi.yaml` | OpenAPI sinh từ code — CI kiểm tra file này khớp code |
| `docs/CONTRIBUTING.md` | Ranh giới module, cấu trúc app, quy trình thay đổi |
| `docs/OPERATIONS.md` | Env, Supabase, Render, email/job, backup/restore |
| `docs/IMPLEMENTATION_STATUS.md` | Đã kiểm thử gì, giới hạn có chủ đích |

## 3. Cấu trúc repo

```
EightyTwenty/
├── backend/
│   ├── manage.py              # mặc định config.settings.dev; lệnh migrate tự dùng DATABASE_URL_MIGRATIONS
│   ├── config/settings/       # base.py · dev.py · prod.py · test.py
│   ├── config/urls.py         # TOÀN BỘ route (public/auth/me/bos router/jobs/schema) — file dùng chung
│   ├── apps/
│   │   ├── core/              # BaseModel/ManagedModel, SiteSettings (singleton, menu_version), AuditLog,
│   │   │                      # RateLimitBucket, permissions, exceptions, ManagedViewSet, public bootstrap,
│   │   │                      # signals (tăng menu_version, khóa PostgREST), Django Admin site/dashboard,
│   │   │                      # command seed_from_mock, jobs (operations.py)
│   │   ├── accounts/          # User (email login, role), StaffAssignment, CustomerProfile, auth/me views
│   │   ├── locations/         # Location, LocationImage, OpeningHours, SpecialHours
│   │   ├── media/             # MediaAsset, signed upload Supabase
│   │   ├── menu/              # Category, DietaryTag, MenuItem, ModifierGroup/Option, LocationMenuItem
│   │   ├── cms/               # Page, ContentBlock, NavigationItem, SiteSettings view
│   │   ├── bookings/          # BookingRule, Booking (state machine, capacity lock)
│   │   ├── enquiries/         # CateringPackage, Enquiry
│   │   └── notifications/     # EmailMessage outbox + Resend + retry
│   ├── templates/admin/       # override toàn bộ shell Admin: base, login, index (dashboard), filter,
│   │                          # app_index, bos_change_form, bos_booking_form, includes/, widgets/,
│   │                          # bos/ (reports, schedule, availability, system)
│   ├── locale/en/             # django.po/.mo: "Home" → "Overview" (compile: scripts/compile_messages.py)
│   ├── templates/registration/ # logged_out.html
│   ├── static/bos/            # css/admin.css (1 file, token màu sáng/tối), js/admin.js + admin-theme.js,
│   │                          # img/icons.svg (sprite), logo-*, favicon, photo-login/hero.webp
│   │                          # (staticfiles/ là output collectstatic, đừng sửa)
│   ├── tests/                 # pytest, factories.py, conftest.py; test_postgres.py chỉ chạy trên Postgres
│   ├── requirements*.txt, constraints.txt, pyproject.toml (ruff + pytest config)
│   ├── compose.yaml           # Postgres 17 local, cổng 54329
│   └── render.yaml            # Render Blueprint
├── website/                   # site static (không build step, runtime support.js). Chỉ sửa:
│   ├── config.js              #   API_BASE (localhost → 127.0.0.1:8000, còn lại → Render URL)
│   ├── eightytwenty-data.js   #   adapter: bootstrap API (chờ ≤4s) → localStorage → mock-data.js; postForm()
│   ├── index.html             #   bkSubmit/submitEnquiry POST API, lỗi thì fallback mở email draft như cũ
│   └── mock-data.js           #   snapshot dự phòng + nguồn seed (scripts/export-mock-data.mjs)
│                              #   Ảnh: chỉ dùng .webp ≤1600px; ảnh mới nén trước khi thêm. Favicon PNG.
├── _image-originals/          # ảnh gốc (backup, không deploy, gitignore)
├── .claude/launch.json        # preview: backend (8000) + website (8123)
├── docs/                      # API_GUIDE, openapi.yaml, OPERATIONS, ... + examples/mock-snapshot.json
├── scripts/                   # export-mock-data.mjs, run_jobs.py, backup_window.py, compile_messages.py
└── .github/workflows/         # ci.yml, db-backup.yml, scheduled-jobs.yml
```

Không phải Git repo ở local (chưa có history/remote). `.venv/` nằm ở thư mục gốc.

## 4. Lệnh thường dùng (Windows, chạy trong `backend/`)

```powershell
..\.venv\Scripts\python manage.py runserver
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py makemigrations
..\.venv\Scripts\python manage.py seed_from_mock <file.json>   # chỉ DB trống; DB có dữ liệu → từ chối (cờ --update-existing ghi đè)
..\.venv\Scripts\python manage.py fill_opening_hours [--apply]   # giờ tuần từ hours_text; chỉ quán chưa có giờ
..\.venv\Scripts\python manage.py upload_legacy_media [--apply]  # ảnh legacy_path img/... → nén WebP → Supabase; bỏ qua ảnh đã lên
..\.venv\Scripts\python manage.py fill_alt_text [--apply]        # alt trống → "<tên món/gói/quán> – EightyTwenty"
..\.venv\Scripts\python -m pytest -q
..\.venv\Scripts\python -m pytest tests/test_auth.py -q -k refresh                    # chạy 1 test
```

Postgres local (bắt buộc cho test khóa/RLS/concurrency):

```powershell
docker compose up -d
$env:DATABASE_URL='postgresql://bos:local-development-only@127.0.0.1:54329/eightytwenty'
```

**Bộ kiểm tra trước khi coi là xong** (giống CI):

```powershell
..\.venv\Scripts\python -m ruff check .
..\.venv\Scripts\python -m ruff format --check .
..\.venv\Scripts\python manage.py check
..\.venv\Scripts\python manage.py makemigrations --check --dry-run
..\.venv\Scripts\python -m pytest -q
..\.venv\Scripts\python manage.py spectacular --file ..\docs\openapi.yaml --validate --fail-on-warn
```

CI (`.github/workflows/ci.yml`) chạy trên Postgres 17 và **fail nếu `docs/openapi.yaml` lệch với code** → đổi API thì phải sinh lại và commit openapi.yaml.

Website local: `.venv\Scripts\python -m http.server 8123 --bind 127.0.0.1 --directory website` (từ thư mục gốc) → http://localhost:8123 tự gọi API `127.0.0.1:8000` (dev.py cho phép CORS mọi cổng localhost). Seed menu thật: `node scripts/export-mock-data.mjs website/mock-data.js <out.json> scripts/order-rules.json` rồi `seed_from_mock <out.json>`.

Địa chỉ local: `/api/docs/` (Swagger), `/api/schema/`, `/admin/`, `/api/v1/public/bootstrap`, `/health`.

## 5. Quy ước code bắt buộc

### Kiến trúc trong một app
- `models.py`: schema + invariant DB. `serializers.py`: chỉ validate/format. `services.py`: nghiệp vụ + transaction + audit. `views.py`: mỏng, gọi service.
- Không đặt logic tiền, chuyển trạng thái, gọi dịch vụ ngoài trong serializer.
- Lỗi nghiệp vụ: `raise DomainError("snake_code", "Message.", status)` (`apps/core/exceptions.py`). Mọi lỗi API trả dạng `{"error": {"code", "message", "fields"}}`.

### Model & dữ liệu
- Model nghiệp vụ kế thừa `ManagedModel` (UUID pk, `created_at/updated_at`, `created_by/updated_by`). Bảng nội bộ Django/JWT giữ nguyên schema thư viện.
- Entity khách thấy có `slug` ổn định (giữ nguyên slug từ mock-data website); slug không đổi sau khi tạo.
- **Tiền = integer cents AUD** (`*_cents`), không dùng float. Giá đã gồm GST. Chỉ public compatibility endpoint mới đổi sang số AUD (`public_services.aud`). Admin form hiển thị AUD nhưng lưu cents.
- Thời gian: lưu UTC, `TIME_ZONE='Australia/Sydney'`. Giờ booking theo giờ địa phương Sydney, từ chối giờ DST không tồn tại/mơ hồ.
- **Không hard delete** dữ liệu kinh doanh: dùng `is_active` / `is_published` / `status`. Link (menu-modifier, location-image, staff-assignment) có cờ active.
- `fulfilment_methods` là JSONField + enum validation (không phải ArrayField) để chạy được SQLite.

### API
- Đường dẫn API **không có slash cuối** (`APPEND_SLASH=False`, `SimpleRouter(trailing_slash=False)`); chỉ `/admin/`, `/api/docs/`, `/api/schema/` có slash.
- BOS CRUD dùng `ManagedViewSet` (`apps/core/views.py`): chỉ GET/POST/PATCH, transaction, `select_for_update` khi update, tự ghi audit qua `save_managed`. Đăng ký route mới trong vòng lặp router ở `config/urls.py`.
- Phân quyền 2 lớp: role ở permission class (`IsStaff`, `IsGlobalAdmin`, `StaffReadAdminWrite`, `HasJobToken`) **và** scope chi nhánh trong queryset/service qua `scoped_locations(user)`. Ngoài chi nhánh được giao → 404. Roles: `owner`, `admin` (global), `manager`, `staff`, `customer`.
- **Không dùng `is_staff` làm business role** — `is_staff`/`is_superuser` chỉ cho Django Admin. Quyền trong Django Admin theo `bos_role` (superuser = chủ chuỗi; `manager`/`staff` cần `is_staff` + StaffAssignment), không có delete.
- Mọi ghi qua `/api/v1/bos/*` phải ghi `AuditLog` (dùng `audit()` / `snapshot()` / `save_managed()` trong `apps/core/services.py`).
- Endpoint mới phải có trong OpenAPI (`@extend_schema` khi cần) + test happy path và test quyền.
- Giữ `/api/v1` backward compatible: field mới phải optional hoặc có default. Public bootstrap phải giữ **đúng shape `mock-data.js`** (xem ARCHITECTURE mục 2, 7.2).
- Chức năng chưa triển khai trả 404 — **không dựng response giả**.

### Cache / menu_version
- Mọi thay đổi menu/giá/còn-hết/chi nhánh/CMS/media/catering/settings phải tăng `SiteSettings.menu_version` (signal `apps/core/signals.py` làm việc này qua `post_save`/`post_delete`/`m2m_changed`). ETag bootstrap dựa trên version.
- **Không dùng `QuerySet.update`, `bulk_update`, `bulk_create` hay raw SQL** trên catalog vì bỏ qua signal → không invalidate cache và không audit. Bulk service hiện tại cố ý save từng dòng trong một transaction.

### Email / tác vụ ngoài
- Gửi mail qua `enqueue_email(recipient, subject, body, dedup_key)` (outbox, gửi `on_commit`, retry bằng job). Lỗi mail không được rollback nghiệp vụ.
- Job định kỳ: `POST /api/v1/jobs/retry-emails`, `/api/v1/jobs/cleanup`, header `X-Job-Token`.

### Test
- pytest + pytest-django + factory_boy; fixtures chung trong `tests/conftest.py` (`owner_client`, `branch`, `staff`, `dish`, `booking_data`...).
- Logic tiền và cạnh tranh ghi (row lock, capacity) cần test trên PostgreSQL (`tests/test_postgres.py` tự skip trên SQLite).
- Settings test: `config.settings.test` (MD5 hasher, locmem email, tắt throttle).

### Migration & dependency
- Đổi model → tạo migration trong cùng thay đổi. Không sửa migration đã lên môi trường dùng chung. Migration `core/0002_lock_down_postgrest` + hook `post_migrate` khóa RLS/PostgREST — đừng phá.
- Dependency khóa qua `constraints.txt`; cập nhật có chủ đích và chạy lại bộ kiểm tra.

### Style
- Python 3.12, ruff (`line-length = 100`, rules E/F/I/B/UP), `ruff format`. Code ngắn gọn, ít comment, theo phong cách hiện có.
- Commit nhỏ, dạng `feat(menu): ...`, `fix(bookings): ...`.

## 6. Những việc KHÔNG được tự làm (phải hỏi người dùng)

- Commit `.env`, secret, token, DB local (`db.sqlite3`), dump. Không đưa secret vào frontend.
- Deploy production, xóa dữ liệu, di chuyển website / đổi Vercel root directory.
- Chọn cổng thanh toán, viết adapter payment/delivery/loyalty/gift card/kho, bật Order/Cart/Checkout — các câu hỏi ở ARCHITECTURE mục 14 **chưa chốt**, không tự giả định.
- Chạy `seed_from_mock` trên production hoặc đưa seed vào build/deploy (có thể ghi đè giá đã chỉnh).
- Sửa file dùng chung (`config/urls.py`, `core/public_serializers.py`, settings, `openapi.yaml`) mà không nêu rõ trong tóm tắt thay đổi.

## 7. Trạng thái hiện tại (cập nhật khi thay đổi)

- Backend Phase 1 hoàn chỉnh; lần kiểm tra gần nhất (10/10/2026): SQLite 151 pass + 3 skip, PostgreSQL 17 (`docker compose` local) 154 pass. Ruff, check, migration drift, OpenAPI validate đều qua.
- Django Admin là BOS workspace: dashboard (Sydney TZ), menu, chi nhánh, booking (nút Confirm/Decline/Seated/Cancel/No-show qua service), enquiry, CMS, media, audit log.
- Django Admin là BOS workspace 3 cấp: **chủ chuỗi** (superuser) toàn quyền, tạo/sửa/khóa chủ quán; **chủ quán** (role `manager` + StaffAssignment) quản lý nhân viên của quán mình, booking, enquiry, giờ mở cửa, booking rule, thông tin quán, báo cáo quán mình, món riêng của quán; **nhân viên** (role `staff`) xem menu/ảnh/giá, bật/tắt còn-hết món, xử lý booking, xem enquiry của quán. Mỗi người chỉ thấy dữ liệu của quán được giao. Chính sách ở `apps/core/bos_access.py`; ModelAdmin khai báo `view_roles/add_roles/change_roles/location_lookup` (`RoleAccessMixin` trong `core/admin_base.py`, mặc định chỉ chủ chuỗi); trang riêng theo `VIEW_ROLES` ở `admin_site.py`; template dùng `bos_can.*`/`bos_role`. ModelAdmin mới phải khai báo role (không thì chỉ superuser thấy). Matrix đầy đủ: README mục BOS workspace. Món riêng quán = `MenuItem.location` (rỗng = món chung, không vào bootstrap). Ô Role chỉ có Café owner/Staff/Customer; `owner`/`admin` (role API) chỉ hiện trên tài khoản đang có role đó (`API_ROLE_LABELS` trong `accounts/admin.py`).
- Giao diện Admin tự viết (đã gỡ Jazzmin), port từ admin của dự án Haven, đổi prefix `hv-` → `bos-`. Palette (10/10/2026): nền trắng/xám lạnh, nút chính xanh lá `#00875A` (AA với chữ trắng), cam `#FF6B2C` cho điểm nhấn/badge, sidebar trắng + logo chữ thật; dark mode xanh mint. Chỉ dùng Figtree (Google Fonts), không serif. Logo/ảnh lấy từ `website/assets/brand` + `website/img/lifestyle` (đã có sẵn, không tải ngoài) → `static/bos/img/` (`logo-wordmark.webp` đen trong suốt, đổi màu bằng CSS filter; `logo-tile.png`, `favicon.png`, `apple-touch-icon.png`, `photo-login.webp` = brunch-table, `photo-hero.webp` = table-spread).
- Trang làm việc riêng (`apps/core/admin_views.py`, template `templates/admin/bos/`, route trong `BOSAdminSite.get_urls`, tên `admin:bos_reports|bos_schedule|bos_availability|bos_system`): Reports (chỉ số từ dữ liệu thật, CSV `?export=bookings`, KHÔNG có doanh thu vì chưa có order/POS), Schedule (lịch ngày + nút chuyển trạng thái, transition view nhận `next` an toàn), Availability board (toggle `LocationMenuItem.is_available` từng ô hoặc cả hàng, save từng dòng + audit, trả JSON khi header `X-Requested-With: fetch`), System status (cấu hình dịch vụ + data health). Helper biểu đồ dùng chung: `apps/core/charts.py`.
- Chữ hiển thị Admin: tên app = nhóm nghiệp vụ (AppConfig `verbose_name` trong `apps/*/apps.py`: Workspace, People, Cafés, Website, Menu, Reservations, Catering & enquiries, System — label/migration không đổi); tên model khớp sidebar (Activity log, Email delivery, Location overrides, Location photos, Dietary labels, Media library, Team assignments). Định dạng giờ chung "10:00 AM" qua `config/formats/en_AU|en/formats.py` (`FORMAT_MODULE_PATH`). Cột/ô Có-Không là chip `bos-bool` (thay `admin_list._boolean_icon` trong `CoreConfig.ready`). Danh sách trống: `templates/admin/change_list_results.html`. 404/500 dưới `/admin/` là trang HTML (`core/views.py` + `templates/admin/404.html|500.html`), API vẫn JSON. JS: nút submit có spinner + chặn gửi 2 lần, toast success/info tự ẩn 6s, tooltip khi sidebar thu gọn, thumbnail lỗi → ô trống. Thanh bulk action chỉ hiện (nổi dưới đáy) khi tick dòng; tiêu đề bảng sticky ở ≥1280px.
- Thêm chuỗi Django vào `locale/en/LC_MESSAGES/django.po` ("Change %s"→"Edit %s", "Password change"→"Change password"…) rồi chạy `compile_messages.py`.
- "Home" → "Overview" bằng catalog dịch `backend/locale/en/LC_MESSAGES/django.po` (+ `.mo` commit sẵn, `LOCALE_PATHS`). Máy không có gettext: sửa `.po` rồi chạy `..\.venv\Scripts\python ..\scripts\compile_messages.py`.
- Upload ảnh trong Admin: ô `upload` (`apps/media/admin.py::ImageUploadForm`) trên Menu item / Catering package / Media library → `apps/media/services.py::store_image` (Pillow: EXIF, cạnh dài 400/800/1600, WebP ≤2 MiB) → Storage `menu|catering|library/<uuid>/<w>.webp` → `MediaAsset` + audit. Upload chạy trong `form.clean()` chỉ khi phần còn lại hợp lệ. Dependency mới: `Pillow` (requirements + constraints). Test: `tests/test_media_upload.py` (mock `upload_object`).
- Ảnh (10/10/2026): cả 91 MediaAsset đã nằm trên Supabase Storage (`website/<uuid>/400|800|1600.webp`, lệnh `upload_legacy_media`; `legacy_path` giữ để biết nguồn). Bootstrap/public menu trả URL bản `lg` (helper `img()` trong `core/public_services.py`, giữ độ nét như ảnh website ≤1600px) → giá trị `img` không còn trùng `mock-data.js` (shape vẫn giữ). Danh sách admin dùng bản `thumb`. Upload chấp nhận JPG/PNG/WebP/AVIF. Alt text kiểu `brand_alt()` (`media/services.py`): "Granola Bowl – EightyTwenty"; cả 91 ảnh đã điền (`fill_alt_text`), upload mới tự đặt theo tên món/gói hoặc tên file. Mọi FK tới MediaAsset trong admin dùng widget `MediaPicker` (`core/admin_widgets.py` + `templates/admin/widgets/bos_media_picker.html`, gắn tự động trong `RoleAccessMixin.formfield_for_foreignkey`, bỏ wrapper +/sửa): ô ảnh thu nhỏ + nút Choose/Change/Remove, admin.js `wireMediaPicker` mở lưới ảnh có tìm kiếm từ JSON `admin:bos_media_picker` (`/admin/media-picker/`, chủ chuỗi + chủ quán, tìm theo alt text) và cập nhật "Current photo" ngay khi chọn. Không dùng autocomplete cho ảnh nữa.
- Thumbnail ảnh trong Admin: ảnh còn đường dẫn kiểu `img/...` (chưa lên Storage) ghép với `MEDIA_PREVIEW_BASE_URL` (mặc định `CLIENT_BASE_URL`; dev = `http://127.0.0.1:8123` — cần chạy server website để thấy ảnh). Sidebar khai báo ở `NAVIGATION` trong `apps/core/admin_site.py` (model mới đăng ký admin phải thêm vào đây mới hiện menu); badge đếm qua `BADGES` (1 query). Widget chuẩn hoá ở `apps/core/admin_widgets.py` (`BOS_FORMFIELD_OVERRIDES`, đã gắn vào `OperationsAdmin`/`OperationsInline`/`UserAdmin`). Template tag `bos_admin`: `icon`, `status_badge` (chip `bos-tone-*`), `initials`, `greeting`. UI Admin tiếng Anh (khách ở Úc).
- Booking mặc định tắt (`BookingRule.is_enabled=False`) cho tới khi khách xác nhận giờ/sức chứa. Chi nhánh chưa bật → website tự mở email draft như cũ. Bật = BookingRule.is_enabled + OpeningHours cho chi nhánh (slot website là mỗi 30 phút).
- **Chờ khách duyệt:** website chưa hiển thị món hết hàng (UI không có nhãn Sold out, menu không theo chi nhánh). Backend đã hỗ trợ (`available:false` với `?location=`). Không sửa UI cho tới khi khách đồng ý; không đổi chữ trên giao diện đã duyệt.
- Turnstile tắt ở prod (website không có widget); chống spam = honeypot + rate limit DB.
- Dữ liệu hiện có = nội dung website (`mock-data.js`), khách chưa gửi dữ liệu chính thức; sửa tiếp trực tiếp trong admin production. Snapshot demo `docs/examples/mock-snapshot.json` chỉ dùng cho dev/test.
- Supabase Storage, Resend, Turnstile mới được mock trong test; chưa chạy end-to-end với provider. Đã thử thật: pooler `aws-0-ap-southeast-1.pooler.supabase.com` (6543 transaction / 5432 session, user `postgres.<ref>`) kết nối được; host trực tiếp `db.<ref>` chỉ IPv6 → Render không dùng được. Key mới `sb_secret_…` dùng được ở `SUPABASE_SERVICE_ROLE_KEY` (Storage trả 200 với header Bearer + apikey của code).
- **Dev dùng chung database Supabase với production** (chủ dự án chọn, 10/10/2026): `backend/.env` có `DATABASE_URL` Supabase → runserver/admin ở máy = dữ liệu thật; `migrate` ở máy đổi schema production ngay (deploy code trước, migrate sau); mỗi request dev ~0,6–0,7 s (mỗi request mở kết nối TLS mới; `CONN_MAX_AGE` không giúp vì runserver mỗi request một thread — đã thử, đã bỏ). Thỉnh thoảng gặp `OperationalError ... SSL error: unexpected eof` = pooler/mạng chập chờn tạm thời, tải lại trang là được. `pytest` tự chuyển SQLite trong RAM khi DB không phải localhost (`config/settings/test.py`); docker compose Postgres local vẫn dùng được. `db.sqlite3` cũ còn trên đĩa, không dùng nữa.
- File env local: `backend/.env` (dev, Supabase) và `backend/.env.production` (giá trị để dán vào Render, có SECRET_KEY/JOB_TOKEN đã sinh). Cả hai bị gitignore; không chép secret vào tài liệu. Hai file dùng **chung** `SECRET_KEY` ngẫu nhiên (64 ký tự) và `JOB_TOKEN` (11/10/2026, chủ dự án muốn prod giống dev). Không bao giờ dùng key `development-only…` cho production: key đó nằm trong repo public (`.env.example`, mặc định `base.py`) và `prod.py` cố ý chặn (build Render fail).

## 8. Nhật ký thay đổi

> Thêm một dòng mỗi khi code thay đổi (mới nhất ở trên): ngày — phạm vi — tóm tắt ngắn + file chính. Giữ ngắn gọn; chi tiết đã có trong code/tài liệu.

- 2026-10-11 — ops — Build Render đầu tiên fail vì `SECRET_KEY` dev bị `prod.py` chặn. Sinh 1 key ngẫu nhiên dùng chung cho `backend/.env` + `.env.production`, đồng bộ `JOB_TOKEN`; không đổi code. Repo: github.com/maiviet283/EightyTwenty (public), CI xanh.
- 2026-10-11 — repo — Viết lại `.gitignore` gốc theo nhóm (secret `.env*`/`*.pem`/`*.key`, Python, Django `staticfiles`/`media`, dump/backup, Node/Vercel, `_image-originals`, log, OS/editor, `.claude/settings.local.json`, `note.txt` ghi chú riêng). Đã thử bằng git tạm: ~369 file/27 MB sẽ commit, không có `.env`, `.env.production`, `db.sqlite3`, `staticfiles`.
- 2026-10-10 — admin — CSS: "Current photo" (`.bos-preview-frame`) thành khung vuông 14rem, ảnh `object-fit: cover` căn giữa (ảnh đầy đủ mở bằng lightbox); ô chọn ảnh 7rem; cửa sổ chọn ảnh: header + ô tìm kiếm `flex: none`, chỉ lưới cuộn (trước đó ô tìm kiếm bị co khi ảnh tải xong).
- 2026-10-10 — media/admin — Bộ chọn ảnh có hình thay autocomplete chữ (Menu item, Catering, Location photos): `MediaPicker` (`core/admin_widgets.py`, template `admin/widgets/bos_media_picker.html`), hook trong `core/admin_base.py`, JSON `media_picker_view` (`core/admin_views.py`, route + `VIEW_ROLES` trong `core/admin_site.py`), `wireMediaPicker` (`static/bos/js/admin.js`) + CSS `.bos-picker*`. Alt text chuẩn "… – EightyTwenty": `brand_alt`/`label_from_filename` (`media/services.py`), lệnh `fill_alt_text` (đã `--apply` 91 ảnh trên Supabase), upload mới tự đặt alt. Test thêm trong `test_media_upload.py`.
- 2026-10-10 — admin — Ô `image` trên form Menu item/Catering đổi nhãn "Or pick from Media library" + help text (`ImageUploadForm.__init__` trong `media/admin.py`); test trong `test_media_upload.py`.
- 2026-10-10 — media/admin — Lệnh `upload_legacy_media` (`apps/media/management/commands/`, mặc định xem trước) đã chạy `--apply`: 91 ảnh website → Supabase Storage (~21 MB tổng 3 cỡ). `core/public_services.py::img()` trả bản `lg` cho website; `media/admin.py` thumbnail dùng `thumb`; nhận thêm AVIF (`media/services.py`). Ẩn role `owner`/`admin` khỏi ô Role (`accounts/admin.py`). Test thêm trong `test_media_upload.py`, `test_bos_roles.py`.
- 2026-10-10 — admin/menu — BOS 3 cấp (chủ chuỗi/chủ quán/nhân viên): `core/bos_access.py` (mới), `RoleAccessMixin` thay superuser-only (`core/admin_base.py`), quyền + scope cho mọi ModelAdmin (`menu|locations|bookings|enquiries|media|accounts/admin.py`), nav/badge/`bos_can` theo role (`core/admin_site.py`), Reports/Schedule/Availability/Overview lọc theo quán (`core/admin_views.py`, `core/dashboard.py`, templates). Users: chủ chuỗi tạo chủ quán (role + quán), chủ quán tạo/khóa nhân viên quán mình (`AssignmentInline`). Món riêng quán: `MenuItem.location` + migration `menu/0006` (đã chạy trên Supabase), public menu `?location=` (`core/public_services.py`, `menu/views.py`), `openapi.yaml` thêm field optional `location`. Test `tests/test_bos_roles.py`.
- 2026-10-10 — media — Upload ảnh thẳng trong admin (server nén WebP 3 cỡ → Supabase), thêm Pillow. Form Menu item/Catering có "Current photo" + "Upload a new photo"; Media library: upload bắt buộc khi thêm mới, các trường lưu trữ thành chỉ đọc. Đã thử thật với Storage (905 KB JPG → 25/82/210 KB, dọn file thử). Cào ảnh cho 9 mục "Add Ons" thiếu ảnh: site cũ chỉ có ảnh giữ chỗ Wix, kho website không có → chưa gán ảnh, cần khách gửi.
- 2026-10-10 — ops — Dev chuyển sang dùng chung DB Supabase (`backend/.env`). `config/settings/test.py`: DB không phải localhost → SQLite in-memory (thay vì báo lỗi). `seed_from_mock` từ chối khi DB đã có Location trừ khi `--update-existing` (+ cập nhật `tests/test_seed.py`). README/OPERATIONS/.env.example cập nhật.
- 2026-10-10 — data — Seed production Supabase từ `mock-data.js` (export → `seed_from_mock`, ~5 phút do chạy từ máy local) + `fill_opening_hours --apply` (63 dòng giờ). Bootstrap production == local (0 khác biệt).
- 2026-10-10 — ops — Migrate DB Supabase production + kiểm tra RLS/grants/Storage end-to-end (dọn file thử). `config/settings/test.py`: xóa trắng credential Supabase/email/Turnstile và chặn chạy test với Postgres không phải localhost (trước đó test media đã gọi Storage thật qua `.env`). `templates/admin/500.html` tự chứa CSS, không dùng `{% static %}` (manifest hỏng làm chính trang 500 lỗi) + test.
- 2026-10-10 — ops — Tạo `backend/.env` (dev) và `backend/.env.production` (cho Render) với Supabase project `eightytwenty-bos`; bucket dự kiến `media` (public, ≤2 MB, `image/webp`). Đã thử kết nối pooler + Storage API. Không đổi code.
- 2026-10-10 — admin — Hoàn thiện UI: chữ Django ("Edit …", tab "Bookings" thay "Select booking to change", "Change password"), AppConfig `verbose_name` cho 8 app (file `apps.py` mới), đổi `verbose_name` 7 model + nhãn trạng thái Enquiry (7 migration chỉ đổi option/choices; `ENUM_NAME_OVERRIDES["EnquiryStatus"]` trong `settings/base.py` cập nhật nhãn để giữ tên enum; `openapi.yaml` chỉ đổi mô tả), `FORMAT_MODULE_PATH` + `config/formats/`, chip Yes/No, empty state danh sách, trang 404/500 admin (`core/views.py`), Enquiries có chip Type + Received + Waiting, spinner/chặn double-submit, toast tự ẩn, tooltip rail, bulk bar nổi, header sticky. Test thêm trong `tests/test_admin_pages.py`.
- 2026-10-10 — data/admin — Lệnh `fill_opening_hours` (`apps/locations/management/commands/`) đọc `Location.hours_text` ("Mon–Fri 7:00am – 3:00pm · Sat–Sun closed") → OpeningHours, chỉ quán chưa có giờ, mặc định xem trước. Đã chạy `--apply` trên DB local: 8 quán (Civic nghỉ T7–CN); Akuna (TBC) bỏ qua. System status không coi quán TBC là thiếu giờ. Ảnh login đổi sang `brunch-table.webp`. Test `tests/test_fill_opening_hours.py`. Booking vẫn tắt (BookingRule.is_enabled=False) — có giờ chưa làm website đổi gì.
- 2026-10-10 — admin — Đổi palette sang trắng/xanh lá/cam (bỏ nâu-kem + serif), sidebar trắng + logo thật, login dùng ảnh thương hiệu, banner Overview có ảnh món. "Home"→"Overview" (`locale/`, `scripts/compile_messages.py`, `LOCALE_PATHS` trong `settings/base.py`). Thêm 4 trang: Reports, Schedule, Availability board, System status (`core/admin_views.py`, `core/charts.py`, `templates/admin/bos/*`, `admin_site.get_urls` + NAVIGATION). Thumbnail ảnh ở Menu items/Media library (`media/admin.py`, setting mới `MEDIA_PREVIEW_BASE_URL` trong `settings/base.py`/`dev.py`). `bookings/admin.py`: transition nhận `next`. Filter `aud`. Test mới `tests/test_admin_pages.py`.
- 2026-10-09 — admin — Làm lại toàn bộ UI/UX Django Admin, gỡ Jazzmin (`settings/base.py`, xóa `settings/jazzmin.py`, requirements/constraints). Shell mới: `templates/admin/{base,base_site,index,login,app_index,filter,bos_*}.html`, `templates/registration/logged_out.html`, `static/bos/{css,js,img}`. Python: `core/admin_site.py` (NAVIGATION + BADGES), `core/admin_widgets.py` (mới), `core/templatetags/bos_admin.py`, `core/dashboard.py` (thêm `chart`, `trend_delta`, giữ key cũ), `accounts/admin.py` (widget mật khẩu), `bookings/admin.py` (status chip, nút danger). Thêm `verbose_name_plural` cho SiteSettings/OpeningHours/SpecialHours/Category/Enquiry + 4 migration chỉ đổi option. Test mới `test_record_pages_render_with_workspace_shell`. Lưu ý: `ruff format` đã vô tình định dạng lại `menu/migrations/0003_*` (chỉ khoảng trắng/xuống dòng, logic không đổi).
- 2026-10-06 — website — Ảnh: chuyển 130 ảnh đang dùng sang WebP (cạnh dài ≤1600px, đã xoay theo EXIF), cập nhật đường dẫn trong `index.html`, `mock-data.js`, `lumi-lane-original/lumi-hero.html`; favicon giữ PNG. Ảnh gốc + 69 ảnh không dùng chuyển sang `_image-originals/` (ngoài website, đã gitignore). Website 251MB → 25MB. Seed lại DB local, bootstrap vẫn khớp mock 100%. Giữ nguyên chữ nút booking cũ ("Prepare booking email").
- 2026-10-06 — data — Đối chiếu bootstrap với `website/mock-data.js`: LOCATIONS/CATEGORIES/MENU/CATERING khớp 100% (trường, giá trị, thứ tự). Thêm `scripts/order-rules.json` để seed ORDER_RULES vào SiteSettings. Map nhãn UI cứng trong index.html (SUBS, SHORT, AREA, CAFE) là copy giao diện, giữ nguyên.
- 2026-10-06 — website+backend — Clone website vào `website/`, nối API: `config.js`, `eightytwenty-data.js` (bootstrap `cache:'no-cache'` để giá đổi hiện ngay, fallback cache/mock), `index.html` (booking/catering/wholesale POST API, fallback email draft; bump `?v=bos-api-20261006`). Backend: dev CORS localhost (`settings/dev.py`); prod bỏ bắt buộc Turnstile + tự thêm `RENDER_EXTERNAL_HOSTNAME` vào ALLOWED_HOSTS (`settings/prod.py`); `render.yaml` điền sẵn CORS/CLIENT_BASE_URL, tắt Turnstile; sửa giá catering `$27.5`→`$27.50` (`core/public_services.py` + test).
- 2026-10-06 — ops — Đặt `TRUSTED_PROXY_COUNT=1` trong `backend/render.yaml` (tránh mọi khách chung 1 bucket rate limit sau proxy Render); cập nhật `docs/OPERATIONS.md`.
- 2026-10-06 — docs — Tạo CLAUDE.md từ ARCHITECTURE.md, README, docs/ và code backend hiện có.
