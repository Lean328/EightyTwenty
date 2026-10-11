# Làm việc nhiều người

Mọi thành viên đọc `ARCHITECTURE.md` trước. Code, tên biến, API và commit dùng tiếng Anh; giải thích nghiệp vụ có thể viết tiếng Việt.

## Ranh giới module

| Nhóm | Sở hữu | Phụ thuộc |
|---|---|---|
| Core/auth | config, core, accounts, audit, JWT, permission, CI | Không phụ thuộc frontend |
| Catalog | locations, menu, media | core, accounts |
| Customer operations | bookings, enquiries, notifications | locations, accounts |
| Content | cms, settings | core, media |
| Website | adapter, submit form, auth và giao diện hiện có | API public/auth/me |
| Mobile | màn hình và lưu token trên thiết bị | API public/auth/me |
| BOS frontend | React SPA | API bos/auth; UUID và cent |

Đây là gợi ý chia phần, chưa phân công người cụ thể. `config/urls.py`, `core/public_serializers.py`, settings và OpenAPI là file dùng chung: người sửa cần báo các thành viên liên quan.

## Cấu trúc một app

`models.py` chứa schema và invariant database; `serializers.py` kiểm tra input/format output; `services.py` giữ nghiệp vụ và transaction; `views.py` nối request với service. `migrations/` đi cùng thay đổi model. Tránh đặt logic tiền, chuyển trạng thái hoặc gọi dịch vụ ngoài trực tiếp trong serializer.

Lớp `ManagedViewSet` chỉ cho GET/POST/PATCH, ghi audit và transaction. Dữ liệu được quản lý dùng `ManagedModel`, ID UUID, created/updated timestamps + actor. JWT blacklist và auth/group tables nội bộ Django vẫn theo khóa chuẩn của thư viện, không ép sửa schema thư viện.

Quyền là hai lớp: role ở permission class và scope chi nhánh trong queryset/service. Chặn ở frontend không đủ. Không dùng `is_staff` thay cho business role; `is_staff` chỉ là cờ Django Admin.

Không gọi `QuerySet.update`, `bulk_update` hay raw SQL trên catalog nếu bỏ qua menu_version/audit. Các service bulk hiện tại cố ý save từng override trong một transaction để invariant chạy đủ. Có thể tối ưu sau khi đo, phải giữ transaction + audit + invalidation.

## Quy trình một thay đổi

1. Nhận một module/issue, tạo branch từ code thống nhất của team; repository hiện tại chưa có Git history, cần owner tạo repo/remote.
2. Chốt input/output với người làm client dựa trên OpenAPI. Giữ `/api/v1` backward compatible; thêm field nên tùy chọn hoặc có default.
3. Code service + serializer/view. Migration mới nếu đổi schema; không sửa migration đã lên môi trường dùng chung.
4. Test happy path, quyền, lỗi nghiệp vụ. Tiền và cạnh tranh ghi dữ liệu cần test PostgreSQL.
5. Ruff, pytest, check migrations, sinh lại OpenAPI. Review cả Python lẫn schema diff.
6. Commit nhỏ: `feat(menu): support branch price overrides`, `fix(bookings): enforce slot capacity`.

`seed_from_mock` chỉ dùng cho nhập dữ liệu hoặc môi trường test. Chạy lại snapshot cũ trên production có thể ghi đè giá đã chỉnh trong BOS; không đặt seed vào build/deploy tự động.

## Những phần chưa chốt

Không tự viết adapter thanh toán, phí delivery, ledger loyalty/gift card hoặc kho khi khách chưa trả lời mục 14 của kiến trúc. Đừng bật UI Order/Cart/Checkout. Endpoint chưa triển khai trả 404, không dựng response giả để frontend tưởng đã chạy thật.

Không chuyển vị trí website hay đổi Vercel root trong phần việc backend này. Deploy production, xóa dữ liệu và chọn payment provider vẫn cần owner phê duyệt theo kiến trúc.
