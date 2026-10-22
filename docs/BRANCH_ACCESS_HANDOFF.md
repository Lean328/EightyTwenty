# Branch-level access — backend handoff checklist

Giao diện quản lý tài khoản theo quán (BOS → Administration → Team, Team by café, trang tài khoản) làm ngày 22/10/2026 chỉ **vẽ lại** những gì server đã cho phép. Mọi nút/ô chỉ hiện khi `ModelAdmin`/`VIEW_ROLES` hiện hành cho phép; UI không thay thế kiểm tra phía server. Checklist dưới đây là những điểm cần backend (anh Việt) xác nhận độc lập trước khi tuyên bố "cách ly theo quán" là chặt.

## Đang được server kiểm (cần xác nhận lại bằng test)

| # | Điểm kiểm | Nơi trong code | Trạng thái |
|---|---|---|---|
| 1 | Chủ quán (`manager`) chỉ thấy/sửa tài khoản `staff` có assignment ở quán mình; không thấy chủ quán khác, chủ chuỗi, khách | `accounts/admin.UserAdmin.get_queryset`, `manages()`, `has_view_permission` | Có test `test_bos_roles.py::test_cafe_owner_manages_only_their_staff` |
| 2 | Chủ quán không thể gán nhân viên vào quán không phải của mình (form tạo + inline Cafés) | `CreateUserForm` queryset `bos_locations`, `AssignmentInline.get_queryset` | Có test (tạo); **inline sửa assignment chưa có test** |
| 3 | Chủ quán không đổi được `role`/`is_superuser` (field bị bỏ khỏi form) | `UserAdmin.get_form` (`del self.fields["role"]`), `get_fieldsets` | Chưa có test POST cố tình gửi `role=manager` |
| 4 | Chủ quán không khóa được người còn làm ở quán khác (`is_active` read-only) | `get_readonly_fields` | Có test |
| 5 | Trang Team by café chỉ mở cho `chain`/`manager`; `staff` → 403; khách → chuyển đăng nhập | `admin_site.VIEW_ROLES["bos_team"]`, `admin_views.team_view` | Có test `test_team_pages.py` |
| 6 | Trang Team by café chỉ liệt kê quán trong `bos_locations(user)`; link mở tài khoản chỉ khi `has_change_permission` | `team_view` | Có test |
| 7 | Filter Role/Café trên danh sách Team chỉ đưa ra quán/role trong phạm vi | `TeamRoleFilter`, `CafeFilter` | Có test |
| 8 | `StaffAssignment` admin (Team assignments) scope theo `location_lookup` | `StaffAssignmentAdmin` (`OperationsAdmin`) | Chưa có test riêng cho POST đổi `location` sang quán khác |

## Cần backend xác minh thêm (UI không chặn được)

1. **POST thẳng vào form** với `role`, `is_superuser`, `locations` ngoài phạm vi (bỏ qua UI): xác nhận `UserAdmin.save_model`/form từ chối, và `AssignmentInline` không nhận `location` ngoài `bos_location_ids`.
2. **Sửa assignment qua Team assignments** (`/accounts/staffassignment/<id>/change/`): chủ quán đổi `location` sang quán khác hoặc đổi `user` sang người của quán khác → phải 404/lỗi form.
3. **Till PIN**: chủ quán đặt/xóa PIN cho nhân viên quán mình — đã có; xác nhận không đặt được cho người ngoài phạm vi (đi qua `manages()`).
4. **REST API `/api/v1/bos/*`** (không phải Django Admin): `IsStaff` + `scoped_locations` — xác nhận endpoint users/assignments (nếu có) scope giống admin; UI mới không gọi API này.
5. **Chủ chuỗi tạo chủ quán nhiều quán**: `CreateUserForm.locations` nhận nhiều quán — kiểm `manager` chỉ thấy đúng giao của các quán đó ở mọi bảng (orders, bookings, enquiries, reports).
6. **Tài khoản bị khóa nhưng còn session**: `is_active=False` → Django chặn đăng nhập; xác nhận session đang mở bị vô hiệu ở request tiếp theo (`AuthenticationMiddleware` kiểm `is_active` qua backend `get_user`).
7. **Người không có assignment active** (`has_bos_access` false): xác nhận mọi URL admin trả về đăng nhập, kể cả `/team/`, `/profile/`.
8. **Nhật ký**: mọi thay đổi role/assignment/is_active ghi `AuditLog` (`audit()` trong `save_model`); xác nhận inline assignment cũng ghi (`OperationsAdmin.save_formset`).

## Không có trong backend hiện tại (UI cố ý không vẽ)

- Mời/đặt lại mật khẩu qua email cho nhân viên (chỉ có "Set a new password" thủ công của Django Admin).
- Chuyển nhân viên sang quán khác bằng một nút — làm qua inline Cafés (tắt dòng cũ, thêm dòng mới).
- Xóa tài khoản — theo quy ước dự án chỉ khóa (`is_active=False`).
- Lịch sử đăng nhập theo quán, phân quyền chi tiết hơn 3 cấp.
