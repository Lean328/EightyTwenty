# EightyTwenty BOS Backend

Backend Python cho website khách hàng, app điện thoại và BOS. Triển khai theo Phase 1 của [ARCHITECTURE.md](ARCHITECTURE.md): Django 5.2, DRF, PostgreSQL, JWT, OpenAPI. Website/app gọi chung API; không truy cập database.

## Chạy trên Windows

Tại thư mục dự án, Python 3.12:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
Copy-Item backend\.env.example backend\.env
Set-Location backend
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py createsuperuser
..\.venv\Scripts\python manage.py runserver
```

Các địa chỉ sau dùng được khi server đang chạy:

- Swagger: http://127.0.0.1:8000/api/docs/
- OpenAPI: http://127.0.0.1:8000/api/schema/
- BOS workspace (Django Admin): http://127.0.0.1:8000/ (link cũ `/admin/...` tự chuyển về đây)
- Dữ liệu website: http://127.0.0.1:8000/api/v1/public/bootstrap
- Health: http://127.0.0.1:8000/health

Không có tài khoản/mật khẩu mặc định. `createsuperuser` tạo owner có quyền dùng Django Admin. Owner/admin tạo qua API có quyền BOS nhưng không tự có quyền vào Django Admin.

Dev dùng **chung database Supabase với production** (cấu hình trong `backend/.env`): sửa ở máy là khách thấy ngay, và `migrate` ở máy đổi schema production ngay — deploy code trước rồi mới migrate. Không có `DATABASE_URL` thì Django rơi về SQLite. `pytest` luôn dùng SQLite trong RAM (hoặc PostgreSQL local qua docker compose), không bao giờ đụng Supabase. Các kiểm thử khóa giao dịch, RLS và concurrency phải chạy PostgreSQL local. Từ `backend/`:

```powershell
docker compose up -d
$env:DATABASE_URL='postgresql://bos:local-development-only@127.0.0.1:54329/eightytwenty'
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python -m pytest -q
```

Linux/macOS dùng `.venv/bin/python` thay cho `.venv\Scripts\python`. File cấu hình nằm tại `backend/.env`; biến môi trường hệ điều hành có ưu tiên cao hơn file này.

## Dữ liệu

Repo ban đầu chỉ có kiến trúc, không có `mock-data.js` hay `FRONTEND_HANDOFF.md`. Vì vậy chưa có bộ dữ liệu thật 10 chi nhánh/84 món và chưa thể xác nhận khớp snapshot website thật. Có snapshot mẫu ghi rõ `Demo` để thử API:

```powershell
# Từ backend/
..\.venv\Scripts\python manage.py seed_from_mock ..\docs\examples\mock-snapshot.json
```

Không nhập demo vào production. Khi nhận code website, chạy từ thư mục gốc:

```powershell
node scripts/export-mock-data.mjs path/to/mock-data.js docs/mock-data.snapshot.json
```

Sau đó dùng `seed_from_mock` với file vừa xuất. Nếu `ORDER_RULES` nằm trong adapter, truyền thêm file JSON chứa object đó làm đối số thứ ba của script. Slug/id được giữ nguyên; nhóm modifier giống hệt nhau được dùng chung. Import chạy trong một transaction, chạy lại cập nhật theo slug. Lệnh không đồng bộ xóa món/chi nhánh vắng trong snapshot; các liên kết modifier/diet của món được nhập sẽ được đối chiếu lại.

### Database dev có dữ liệu mẫu (SQLite)

Từ 20/10/2026 dev dùng file `backend/db.sqlite3` riêng (không còn chung Supabase production). Dựng lại từ đầu (xóa/đổi tên `db.sqlite3` trước), chạy từ `backend/`:

```powershell
node ..\scripts\export-mock-data.mjs ..\website\mock-data.js $env:TEMP\mock.json ..\scripts\order-rules.json
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py seed_from_mock $env:TEMP\mock.json
..\.venv\Scripts\python manage.py fill_opening_hours --apply
..\.venv\Scripts\python manage.py seed_demo
```

`seed_demo` thêm chủ chuỗi `owner@example.com`, chủ quán/nhân viên cho 3 quán đầu (`manager.<slug>@example.com`, `staff.<slug>@example.com`, Till PIN 1001…), 30 khách (thẻ cà phê, gift card), ~600 đơn app + quầy trong 30 ngày, đặt bàn −14…+14 ngày, 15 enquiry, ca két, bàn, mã giảm giá. Mật khẩu mọi tài khoản demo: `eightytwenty-demo` (đổi bằng `--password`). Lệnh **từ chối mọi database không phải SQLite/localhost** và từ chối chạy lần hai. Ảnh món là đường dẫn `img/...` của website → chạy server website (cổng 8123) để thấy ảnh trong admin.

Booking mặc định tắt. Cần cấu hình `OpeningHours`, ngày ngoại lệ `SpecialHours`, `BookingRule` và sức chứa đã được khách xác nhận trước khi bật.

## Phần đã có

- Tài khoản email, Argon2, JWT access/refresh, rotate + blacklist, reset password, verify email, hồ sơ và ẩn danh hóa tài khoản khách.
- Menu/giá cent, modifier dùng chung, tag ăn kiêng có thứ tự, override và còn/hết món từng chi nhánh.
- Chi nhánh, giờ hoạt động, ngày ngoại lệ; booking có kiểm tra giờ Sydney/DST, sức chứa và chuyển trạng thái.
- Enquiry catering/wholesale/contact, gói catering, CMS theo block, navigation, settings.
- Phân quyền owner/admin/manager/staff/customer và lọc chi nhánh; audit mọi ghi qua BOS API.
- Public bootstrap tương thích shape website, ETag/version, signed upload Supabase, outbox email Resend + retry.
- Migrations, khóa PostgREST/RLS, CI, cấu hình Render, backup và job định kỳ có công tắc bật.
- Django Admin là BOS workspace hoàn chỉnh, phân quyền 3 cấp (chủ chuỗi / chủ quán / nhân viên): dashboard vận hành, menu, chi nhánh, booking, enquiry, CMS, media và audit log.

- API cho app điện thoại `/api/v1/app/...` (12/10/2026) theo hợp đồng của app Expo: đăng ký/đăng nhập, hồ sơ, sở thích, món yêu thích, địa chỉ, quán + menu, order (tính giá phía server, idempotency, theo dõi trạng thái), thẻ tích dấu cà phê, gift card, đặt bàn, catering, thông báo trong app, offer/FAQ. BOS có thêm App orders, Coffee cards, Gift cards, App offers/FAQs. Tài liệu: [docs/APP_API.md](docs/APP_API.md).
- API cho máy POS + màn hình bếp `/api/v1/pos/...` (16/10/2026, giai đoạn 1) theo `contracts.ts` của repo POS khách gửi: máy đăng nhập bằng tài khoản nhân viên (JWT), từng người vào bằng PIN 4 số (đặt trong BOS → Team → Till PIN), snapshot khởi động theo quán, tạo đơn tại quầy (kiểm tra tổng, ghi chú lệch giá so với menu thay vì từ chối), ghi nhận thanh toán, hoàn/void/hủy, tiến độ bếp, bàn, feed đơn thay đổi (gồm đơn app), ca két, sổ giao dịch, nhật ký. Mọi lệnh ghi idempotent theo `Idempotency-Key`. BOS có thêm Orders (gộp app + quầy), Till shifts, Till transactions. Tài liệu: [docs/POS_API.md](docs/POS_API.md).

- POS giai đoạn 2: khách hàng + thẻ cà phê dùng chung với app, bật/tắt còn-hết món, đặt bàn và catering từ POS. BOS Reports có doanh thu (theo ngày/quán/món/hình thức thanh toán/kênh, chênh lệch két, CSV). App nhận push notification qua Expo (`/api/v1/app/me/push-tokens`). BOS có Tables (sơ đồ bàn từng quán) và Promo codes cho POS.

Chưa có giao diện React BOS, thanh toán thật (chưa chọn cổng: order có tiền phải trả trả 501), Apple Wallet hay kho nguyên liệu. Những module đó thuộc phần giao diện hoặc phase sau; API không trả dữ liệu giả cho các chức năng chưa triển khai.

## BOS workspace / Django Admin

Mở `http://127.0.0.1:8000/` (production: https://eightytwenty-api.onrender.com/) bằng tài khoản tạo từ `createsuperuser` (chủ chuỗi). Chủ chuỗi vào **Team → Add** chọn role *Café owner* + quán để tạo tài khoản chủ quán; chủ quán tự thêm nhân viên cho quán mình.

| Việc | Chủ chuỗi (superuser) | Chủ quán (`manager`) | Nhân viên (`staff`) |
|---|---|---|---|
| Overview, Schedule, Availability board | Mọi quán | Quán của mình | Quán của mình |
| Booking (xem + Confirm/Decline/Seated…) | ✔ | ✔ | ✔ |
| Enquiry | Xem + xử lý | Xem + xử lý | Chỉ xem |
| Menu chung (món, giá, ảnh, category, modifier) | Thêm/sửa | Chỉ xem | Chỉ xem |
| Món riêng của quán (`MenuItem.location`) | ✔ | Thêm/sửa | Chỉ xem |
| Giờ mở cửa, ngày đặc biệt, booking rule, ảnh quán | ✔ | ✔ | Xem |
| Thông tin quán (địa chỉ, liên hệ…) | ✔ + tên/trạng thái/publish | ✔ (trừ tên/trạng thái/publish) | Xem |
| Reports | Mọi quán | Quán của mình | — |
| Team | Cả đội, tạo chủ quán | Chỉ nhân viên quán mình | — |
| Customers | Mọi khách dùng app | — | — |
| Website/CMS, System status, Email, Activity log, tạo quán | ✔ | — | — |

Ô Role khi tạo user chỉ có Café owner / Staff / Customer (role `owner`/`admin` chỉ dùng cho API, không chọn trong admin). "Xóa" = khóa tài khoản / bỏ publish (không hard delete). Người có role `manager`/`staff` phải được gán ít nhất một quán mới đăng nhập được. Quyền REST API `/api/v1/bos/*` không đổi.

- Trang chủ là dashboard theo múi giờ Australia/Sydney: booking hôm nay, yêu cầu cần duyệt, enquiry, món không khả dụng, lịch trong ngày, hoạt động và lỗi email. Bộ lọc location và 7/14/30 ngày luôn dùng dữ liệu thật, không có doanh thu giả vì order/payment chưa được xây.
- Giá trong form hiển thị AUD (`19.95`) và được lưu/API trả về integer cents (`1995`).
- Booking được duyệt qua các nút Confirm, Decline, Seated, Cancel hoặc No-show. Mỗi chuyển trạng thái vẫn gọi service nghiệp vụ, kiểm tra transition, ghi audit và xếp email gửi khách.
- Chi nhánh quản lý opening hours, special hours, booking rule và ảnh ngay trong một màn hình. Nội dung CMS dùng cùng validation với API.
- Không xóa business data từ Admin; dùng publish/active/availability để ngừng hiển thị an toàn.
- Ảnh: bấm **Upload a new photo** trên form món ăn, gói catering hoặc Media library (JPG/PNG/WebP/AVIF ≤15 MB), hoặc bấm **Choose photo** để chọn ảnh có sẵn từ lưới ảnh thu nhỏ của Media library (có ô tìm kiếm). Hệ thống tự xoay, nén thành WebP 400/800/1600 px và lưu lên Supabase Storage — không cần dán link.
- Trang làm việc: **Reports** (`/reports/` — booking theo thời gian, kết quả, giờ cao điểm, chi nhánh, cỡ bàn, đặt trước bao lâu, enquiry, menu; lọc kỳ/chi nhánh; xuất CSV; không có doanh thu giả), **Schedule** (`/schedule/` — lịch theo ngày, nhóm theo quán và khung giờ, thanh sức chứa, nút Confirm/Decline/Seated/No-show ngay tại chỗ), **Availability board** (`/availability/` — bảng món × chi nhánh, bấm để báo hết/còn, có ghi audit), **System status** (`/system/` — dịch vụ đã cấu hình và dữ liệu cần dọn).
- Giao diện tự viết, không dùng theme/package ngoài (đã gỡ Jazzmin): sidebar nhóm theo công việc có badge việc chờ, Ctrl+K tìm trang, sáng/tối (nhớ theo trình duyệt), menu thu gọn, form chia tab, dropdown tự vẽ, date/time picker gốc của trình duyệt, chạy tốt trên điện thoại. Code nằm ở `backend/templates/admin/`, `backend/static/bos/` và `apps/core/admin_site.py`.

Sau khi cập nhật code, dừng và chạy lại server để Django nạp template và stylesheet mới:

```powershell
Set-Location backend
..\.venv\Scripts\python manage.py runserver
```

Nếu trình duyệt đang giữ stylesheet cũ, nhấn `Ctrl + F5` tại `/`.

Trang lỗi: người đã đăng nhập thấy 403/404 ngay trong workspace (có sidebar, Ctrl+K); khách chưa đăng nhập và lỗi 500 thấy trang độc lập có nút về workspace; form hết hạn (CSRF) có hướng dẫn tải lại. Đường dẫn `/api/...` luôn trả lỗi JSON. `/robots.txt` chặn công cụ tìm kiếm. Ở máy (`DEBUG=True`) Django hiện trang debug thay cho 404/500.

## Tài liệu bàn giao

- [API cho web/mobile/BOS](docs/API_GUIDE.md): quy ước, endpoint, JSON mẫu, auth, lỗi và upload.
- API cho app điện thoại (tiếng Anh, bàn giao cho dev app), publish tại `/api/docs/app/` (Swagger), `/api/docs/app/redoc/`, `/api/docs/app/schema/` — production: https://eightytwenty-api.onrender.com/api/docs/app/ (xem [docs/APP_API.md](docs/APP_API.md)).
- API cho máy POS (tiếng Anh, bàn giao cho dev POS), publish tại `/api/docs/pos/`, `/api/docs/pos/redoc/`, `/api/docs/pos/schema/` (xem [docs/POS_API.md](docs/POS_API.md)).
- [OpenAPI đầy đủ](docs/openapi.yaml): import vào Postman/Insomnia hoặc sinh TypeScript types.
- [Phân chia công việc và quy tắc code](docs/CONTRIBUTING.md).
- [Deploy, vận hành và restore](docs/OPERATIONS.md).
- [Trạng thái và giới hạn đã kiểm thử](docs/IMPLEMENTATION_STATUS.md).

## Kiểm tra trước khi bàn giao code

Chạy trong `backend/`:

```powershell
..\.venv\Scripts\python -m ruff check .
..\.venv\Scripts\python -m ruff format --check .
..\.venv\Scripts\python manage.py check
..\.venv\Scripts\python manage.py makemigrations --check --dry-run
..\.venv\Scripts\python -m pytest -q
..\.venv\Scripts\python manage.py spectacular --file ..\docs\openapi.yaml --validate --fail-on-warn
```

Dependencies được khóa qua `backend/constraints.txt`. Cập nhật dependency có chủ đích, chạy lại bộ kiểm tra và commit constraints cùng thay đổi. Không commit `.env`, database local, dump hoặc token.
