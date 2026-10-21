# Trạng thái triển khai — 20/10/2026

Backend (Django, `backend/`) đang chạy production trên Render (https://eightytwenty-api.onrender.com) + Supabase (Postgres + Storage). Đã có: BOS workspace (Django Admin ở `/`, 3 cấp quyền), API cho website (`/api/v1/public`), app điện thoại (`/api/v1/app`), máy POS + màn hình bếp (`/api/v1/pos`), báo cáo doanh thu trong BOS và push Expo. Định hướng của chủ dự án: chạy được trên Render free là đủ, làm cách đơn giản nhất.

## Lần kiểm tra gần nhất

- 20/10/2026, SQLite: **260 pass, 3 skip**. Ba test cần PostgreSQL chỉ chạy trên CI (GitHub Actions, Postgres 17), mọi commit gần đây đều xanh. Lần chạy Postgres ở máy gần nhất là 12/10/2026 (195 pass, Docker ở máy hiện không lên).
- Ruff check/format, `manage.py check`, kiểm tra migration drift, OpenAPI validate (CI fail nếu `docs/openapi.yaml` lệch code) đều qua.
- Production sau mỗi lần deploy: `/health`, bootstrap (10 quán / 12 danh mục / 84 món / 3 gói catering), `/api/docs/app/`, `/api/docs/pos/` trả 200; các trang admin chuyển về đăng nhập.

## Đã kiểm thử

- **Website:** bootstrap đúng shape `mock-data.js` (ETag theo `menu_version`), form đặt bàn + enquiry (honeypot, rate limit DB, email outbox). Deploy Cloudflare Pages https://eightytwenty.pages.dev (21/10/2026). Đăng ký / đăng nhập / hồ sơ / đăng xuất dùng `/api/v1/auth` + `/api/v1/me` (`website/account.js`, `scripts/test-frontend.mjs`); quên mật khẩu trên website vẫn chưa nối, đặt món trên website vẫn tạm dừng, đặt bàn tắt cho tới khi bật BookingRule.
- **BOS workspace:** phân quyền 3 cấp chủ chuỗi / chủ quán / nhân viên theo quán (`tests/test_bos_roles.py`), dashboard, Reports (doanh thu, CSV), Schedule, Availability board, System status, My profile, upload ảnh WebP lên Supabase (mock trong test).
  - Trang chi tiết Order / Booking / Enquiry dạng tóm tắt; khối tổng quan khách hàng (`tests/test_record_pages.py`).
  - Danh sách: bấm cả dòng để mở; Bookings mặc định hôm nay + sắp tới; tách Team và Customers; Coffee cards có nút +1 stamp / Redeem; Orders có cột món; Overview đếm đơn app đang chờ (`tests/test_admin_lists.py`).
- **API app:** 41 path theo hợp đồng app Expo; giá tính khớp từng cent với app (`compute_totals`); không N+1 (đếm truy vấn); ẩn danh hóa; push Expo (mock).
- **API POS:** PIN, snapshot, đơn quầy + idempotency, thanh toán, bếp, hoàn/void/hủy, ca két, sổ giao dịch, khách hàng + thẻ cà phê, còn/hết món, đặt bàn, catering, bàn, mã giảm giá. Mã giảm giá được server kiểm lại khi tạo đơn: sai/hết hạn/sai quán/giảm quá mức thì ghi chú "Check prices", không từ chối đơn.
- **PostgreSQL (CI):** khóa slot đặt bàn khi tranh nhau, refresh token dùng một lần, RLS bật trên mọi bảng.
- **Dữ liệu dev:** `seed_demo` dựng DB SQLite local có dữ liệu mẫu và từ chối mọi DB không phải local (`tests/test_seed_demo.py`).

## Chưa chạy với hệ thống thật

- Chưa chạy end-to-end với app Expo và frontend POS thật: dev khác đang nối. Các luồng đã test bằng client giả theo hợp đồng của họ.
- Resend (email) và Expo push mới được mock. Email cần domain có SPF/DKIM (ARCHITECTURE mục 14, câu 10).
- Production chưa có dữ liệu vận hành, chỉ có menu và quán. Chưa có superuser (chủ dự án tự tạo), chưa ai đặt Till PIN.
- Job định kỳ (`scheduled-jobs.yml`) và backup (`db-backup.yml`) chưa được xác nhận là chạy được trên production.

## Chưa làm (chờ khách hoặc bên thứ ba)

- Cổng thanh toán: đơn app có tiền phải trả → 501 (`PAYMENT_PROVIDER=demo` chỉ dùng để thử). Chưa có thẻ lưu, chưa gửi eGift thật.
- Máy quẹt thẻ và máy in nối POS, gift card Square, kho, hóa đơn điện tử, Apple Wallet.
- Bật đặt bàn cho từng quán: cần giờ mở cửa + sức chứa do khách xác nhận (`BookingRule.is_enabled` đang tắt). Quán Akuna St vẫn TBC.
- Website hiển thị món hết hàng theo quán: backend đã có (`?location=`), giao diện chờ khách duyệt.
- React BOS: chưa làm, Django Admin đang là BOS.

## Giới hạn có chủ đích

- Không hard delete dữ liệu kinh doanh: dùng khóa / bỏ publish / trạng thái. Admin không có nút xóa.
- Thời gian đặt bàn không kéo qua ngày hoặc chiếm nhiều slot. Hai form public chưa có idempotency key.
- Auth dùng bearer JSON, chưa có cookie HttpOnly. Khách chưa verify email vẫn đăng nhập được.
- Đơn quầy: server kiểm tổng tiền (lệch ≤ 1¢), giá lệch menu và mã giảm giá chỉ được ghi chú, không từ chối. Server không kiểm quyền từng nhân viên trên máy POS (chỉ kiểm tài khoản máy).
- Thay đổi catalog phải đi qua service/save để tăng `menu_version`. SQL tay hoặc bulk update không được bảo đảm làm mới cache.
- Ẩn danh hóa khách xóa PII trong user/profile, booking, đơn app, địa chỉ, feed. Audit do nhân viên tạo vẫn giữ lại.
- Theo yêu cầu chủ dự án (16/10/2026): host + CORS mở hoàn toàn, không thêm lớp bảo mật nếu không cần.
