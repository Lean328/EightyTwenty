# Trạng thái triển khai — 06/10/2026

Đã xây dựng backend Phase 1 + auth/customer profile/availability thuộc Phase 1.5, đầy đủ file Python, migration, Django Admin, OpenAPI, seed, CI và cấu hình vận hành. Django Admin nay là một BOS workspace hoàn chỉnh với giao diện tự viết (không còn Jazzmin, 09/10/2026) và dashboard dữ liệu thật. Không thay đổi quyết định payment/POS và không triển khai phase tài chính sau.

Lần kiểm tra gần nhất (10/10/2026): **154 test pass trên PostgreSQL 17**; **187 pass, 3 skip trên SQLite** (12/10/2026, gồm 29 test API app `tests/test_mobile_api.py`) (ba test cần PostgreSQL). Ruff check/format, Django check, migration drift và OpenAPI validate đều qua. `check --deploy` chỉ còn W021 về HSTS preload chưa bật có chủ đích.

## Đã xác minh local

- Django system check và migration graph.
- pytest trên SQLite và PostgreSQL 17 thực tế qua Docker.
- PostgreSQL: hai request tranh slot chỉ một booking được tạo khi hết sức chứa; hai request refresh cùng token chỉ một thành công; RLS bật trên bảng Django.
- Các API BOS được test đọc/ghi hợp lệ, từ chối khách/nhân viên không đủ quyền và audit.
- Snapshot mẫu round-trip qua seed → bootstrap; modifier dùng chung và thứ tự dietary tag được giữ.
- OpenAPI validate, không có schema warnings; lint và formatter.
- Schema sinh từ SQLite/PostgreSQL có cùng checksum. Đã chạy HTTP server local thật và nhận 200 cho health, bootstrap, Swagger, schema, trang đăng nhập Admin; server thử nghiệm đã dừng.
- Script Node export mock-data đã chạy thử và đối chiếu JSON với snapshot mẫu.
- BOS Admin được kiểm tra trực tiếp ở desktop và mobile trên cơ sở dữ liệu preview tách biệt: dashboard, danh sách, form AUD, inline, sidebar responsive và trang login.
- `tests/test_bos_roles.py` xác minh phân quyền 3 cấp trong Admin (scope quán, menu chung vs món riêng, quản lý nhân viên, reports/system theo role).
- Test admin xác minh quyền superuser, scope dashboard, Australia/Sydney, mã trạng thái booking + CSRF + audit/email, cents/AUD, inline audit và CMS validation.

Số test chính xác xem lần chạy CI/pytest gần nhất; các test PostgreSQL được skip có chủ đích khi chỉ chạy SQLite.

## Chưa thể xác minh bằng dữ liệu thật

- Repo đầu vào không có mock-data.js, frontend handoff hoặc code website/app; sample không đại diện menu/giá thật.
- Supabase Storage, Resend và Turnstile được mock trong test, chưa có credentials để chạy end-to-end với nhà cung cấp.
- Chưa deploy Render/Vercel/Supabase; backup/job workflow chưa được chạy trên production.
- Chưa có BOS React SPA. Django Admin hiện là BOS cho cả chủ chuỗi, chủ quán và nhân viên (phân quyền theo quán).
- Chưa chốt chi nhánh nhận booking, sức chứa, các câu hỏi mục 14. Booking rule default disabled.
- API app điện thoại (12/10/2026): đã so khớp với dữ liệu app dùng (DB SQLite tạm seed từ `mock-data.js`: 10 quán gồm giờ/cờ/area/headline, 12 danh mục, 84 món gồm giá/modifier/thứ tự, 3 gói catering, FAQ, offer — 0 lệch) và chạy luồng order mẫu §9.1 của app (2930 + 86 − 1000 = 2016¢). Chưa chạy với app thật, chưa migrate lên Supabase (Render tự migrate khi push).
- Chưa có cổng thanh toán (order có tiền phải trả → 501; `PAYMENT_PROVIDER=demo` để test), thẻ lưu, gửi eGift thật, Apple Wallet, push notification, sales reports, inventory.

## Các giới hạn có chủ đích

- Soft deactivate/unpublish thay delete business data; thời gian đặt bàn không kéo qua ngày hay chiếm nhiều slot.
- Hai form public chưa có idempotency key. Client không tự retry khi không rõ kết quả; đối chiếu reference/hàng đợi khi cần.
- Auth dùng bearer JSON; cookie HttpOnly chưa triển khai. Customer email có thể chưa verify vẫn đăng nhập được; cờ email_verified dùng cho luồng xác nhận và đối chiếu guest records khi ẩn danh hóa.
- Ẩn danh hóa customer xóa PII trong user/profile và booking liên kết. Chỉ khi email verified mới ẩn danh hóa guest booking/enquiry cùng email; audit lịch sử do nhân viên tạo được giữ quyền đọc hạn chế, cần quy trình retention riêng khi có yêu cầu dữ liệu cá nhân.
- API catalogue thay đổi phải đi qua service/save để tăng menu_version. Thao tác SQL tay/bulk update ngoài service không được bảo đảm invalidation.
- Django Admin phân quyền 3 cấp qua `apps/core/bos_access.py` + `RoleAccessMixin`; không có nút xóa (khóa/bỏ publish thay thế). Quyền REST API BOS giữ nguyên (manager/staff vẫn chỉ đọc catalog qua API).
