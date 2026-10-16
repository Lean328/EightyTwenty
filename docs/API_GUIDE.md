# Hợp đồng API cho website, mobile và BOS

Nguồn chính xác về từng field và response: [openapi.yaml](openapi.yaml), hoặc `/api/docs/` khi chạy server. Tài liệu này giải thích cách ghép các endpoint thành luồng nghiệp vụ.

> **App điện thoại (Expo `EightyTwentyMobile`) dùng API riêng `/api/v1/app/...`** theo đúng hợp đồng app đã code sẵn (camelCase, mã lỗi `VALIDATION`/`PRICE_CHANGED`…): xem trang publish `/api/docs/app/` ([APP_API.md](APP_API.md)). **Máy POS + màn hình bếp dùng API riêng `/api/v1/pos/...`** theo `contracts.ts` của repo POS: xem trang publish `/api/docs/pos/` ([POS_API.md](POS_API.md)). Tài liệu dưới đây là API cho website và BOS.

## Quy ước

- Base local: `http://127.0.0.1:8000/api/v1`. Endpoint API **không có dấu `/` cuối**. Riêng `/api/docs/`, `/api/schema/` và các trang BOS workspace (Django Admin ở gốc `/`) có dấu `/`.
- Gửi JSON với `Content-Type: application/json`. API có auth dùng `Authorization: Bearer <access>`.
- BOS dùng UUID cho quan hệ và ID. Public dùng slug ổn định; endpoint BOS chi nhánh dùng slug trong URL.
- Tiền chuẩn là integer cent AUD: `1295` nghĩa là A$12.95. Public compatibility chuyển riêng thành số AUD, ví dụ `12.95`. Giá client không được dùng để tạo order; Phase 1 chưa có order.
- `date` dạng `YYYY-MM-DD`, `time` dạng `HH:mm` hoặc `HH:mm:ss`, theo giờ **Australia/Sydney**, không dùng timezone điện thoại để đổi giờ booking. Timestamp trả ISO 8601 có offset.
- BOS list và `/me/bookings`: `{count,next,previous,results}`, `?page=1&page_size=50`, tối đa 100. Public list trả array trực tiếp.
- Gửi field không tồn tại hoặc chỉ đọc bị từ chối. Cập nhật bằng PATCH; slug không thay đổi sau khi tạo. Deactivate/unpublish bằng cờ; không có DELETE dữ liệu kinh doanh.
- 401: thiếu/hết hạn token; 403: không có quyền; 404: không tồn tại hoặc ngoài chi nhánh được giao; 409: conflict/sai chuyển trạng thái/hết chỗ; 429: bị giới hạn tần suất; 503: dịch vụ ngoài chưa sẵn sàng.

```json
{"error":{"code":"booking_slot_full","message":"This time slot is full.","fields":{}}}
```

Lỗi field có `error.code = "invalid"` và `fields` là object/list lỗi DRF. Không dựa vào câu `message` để viết logic, dùng HTTP status + code/field. Với 429, đọc `Retry-After`.

## Website/app: đọc dữ liệu

| Method | Endpoint | Nội dung |
|---|---|---|
| GET | `/public/bootstrap?location=demo-branch` | Version, LOCATIONS, CATEGORIES, MENU, CATERING, ORDER_RULES, SETTINGS |
| GET | `/public/version` | `{version}` để polling khi focus/mở menu |
| GET | `/public/locations` | Chi nhánh đã publish |
| GET | `/public/locations/{slug}` | Một chi nhánh |
| GET | `/public/categories` | Danh mục active |
| GET | `/public/menu?location={slug}` | Giá/còn-hết/ẩn của từng chi nhánh |
| GET | `/public/catering-packages` | Gói catering dạng compatibility |
| GET | `/public/pages/{slug}` | Page published + block active |
| GET | `/public/settings` | Thương hiệu, banner, social links, navigation |

Bootstrap giữ shape trong kiến trúc: `MENU[].mods[].options` là tuple `[name, priceAUD]`, `CATERING[].id` là tên gói cũ. Không dùng UUID BOS để thay slug website. `available:false` chỉ xuất hiện khi món hết; món ẩn không xuất hiện. Không có override thì dùng giá gốc. Khi không truyền location, API trả menu toàn chuỗi.

`ETag` bootstrap phân biệt version và location; gửi lại `If-None-Match` để nhận 304. Cache: `public,max-age=60,stale-while-revalidate=600`. Stale-while-revalidate có thể tạm hiển thị bản cũ quá 60 giây; nếu UI cần thấy thay đổi trong khoảng 60 giây, poll `/public/version`, đổi version thì fetch bootstrap với `cache:"no-cache"` và thay dữ liệu UI. `generatedAt` là thời điểm tạo response, không phải version dữ liệu.

Adapter website cần timeout, fallback snapshot đã cache và cuối cùng `mock-data.js` để API lỗi không làm trắng trang. Repo này không sửa UI/adapter vì chưa có các file website. Các đường dẫn `img/...` từ legacy được giữ nguyên; app điện thoại phải resolve chúng trên origin website. Ảnh mới là URL Supabase tuyệt đối.

## Booking: tạo yêu cầu và theo dõi

1. `GET /public/bookings/availability?location=demo-branch&date=2026-11-20` trả array `{time, remaining_covers, max_party_size}`. Không có quy tắc/giờ hoạt động hợp lệ sẽ trả array rỗng.
2. Gửi POST `/public/bookings`:

```json
{
  "location": "demo-branch",
  "date": "2026-11-20",
  "time": "10:00",
  "party_size": 2,
  "name": "Example Customer",
  "email": "customer@example.com",
  "phone": "0400000000",
  "notes": "Window seat if available",
  "source": "web",
  "website": "",
  "turnstile_token": "token-from-client-widget"
}
```

Ngày trên chỉ minh họa; chọn ngày trong booking window đã cấu hình. `website` là honeypot, luôn để trống. Turnstile bắt buộc ở production. Mobile cũng cần lấy token Turnstile bằng luồng challenge web; không nhúng secret vào app và không bỏ captcha cho mobile.

3. Thành công: `201 {"reference":"BK-...","status":"requested"}`. UI phải ghi **đã gửi yêu cầu**, chưa phải xác nhận bàn. Lỗi email vẫn trả 201 nếu booking đã lưu; BOS xem trạng thái email riêng.
4. JWT là tùy chọn ở POST này. Gửi token hợp lệ để booking gắn với `/me/bookings`; guest booking không tự được liên kết chỉ vì email trùng.
5. Requested/confirmed/seated cùng chiếm sức chứa trong slot. Declined/cancelled giải phóng chỗ. Không hỗ trợ đặt qua đêm hay duration nhiều slot ở Phase 1. Availability là thông tin tại thời điểm đọc; server kiểm tra lại khi POST.

## Enquiry

POST `/public/enquiries`:

```json
{
  "kind":"catering",
  "name":"Example Customer",
  "email":"customer@example.com",
  "phone":"0400000000",
  "company":"Example Company",
  "location":"demo-branch",
  "event_date":"2026-11-20",
  "headcount":20,
  "package":"sample-breakfast",
  "message":"Please quote for breakfast catering.",
  "payload":{"delivery_address":"Example address"},
  "website":"",
  "turnstile_token":"token-from-widget"
}
```

`kind`: `catering|wholesale|contact`. Chỉ `kind,name,email,message` bắt buộc (và captcha ở prod). Package là slug, chỉ dùng cho catering. `payload` tối đa 20 cặp string; không gửi dữ liệu thẻ. Trả `201 {reference}`. Enquiry không chọn location chỉ owner/admin thấy; staff không được đọc hàng đợi toàn chuỗi.

Hai POST form chưa có idempotency key: khóa nút gửi khi đang gửi, không tự retry mù khi timeout vì request đầu có thể đã được lưu.

## Tài khoản và token

| Method | Endpoint | Body / response chính |
|---|---|---|
| POST | `/auth/register` | email, password, first_name/last_name/phone/marketing_opt_in tùy chọn + captcha → 201 profile |
| POST | `/auth/login` | email, password → `{access,refresh}` |
| POST | `/auth/refresh` | refresh → `{access,refresh}` mới; refresh cũ mất hiệu lực |
| POST | `/auth/logout` | refresh + access header của cùng user → 204 |
| POST | `/auth/password/reset` | email + captcha → thông báo chung, tránh lộ tài khoản |
| POST | `/auth/password/reset/confirm` | uid, token, password → message |
| POST | `/auth/verify-email/request` | email + captcha → thông báo chung |
| POST | `/auth/verify-email` | uid, token → message |
| GET/PATCH | `/me` | Profile; PATCH first_name,last_name,phone,marketing_opt_in |
| DELETE | `/me` | Ẩn danh hóa tài khoản customer, vô hiệu hóa token → 204 |
| GET/PATCH | `/me/profile` | preferred_location UUID, birthday |
| GET | `/me/bookings` | Booking gắn với user đang đăng nhập |

Register luôn tạo role customer. Email normalize lowercase. Password tối thiểu 10 ký tự và qua validator Django. Access mặc định 15 phút, refresh 30 ngày. Logout blacklist refresh; access đã phát vẫn còn tối đa 15 phút. Reset password/disable/delete user khiến access bị từ chối ngay và refresh không thể dùng tiếp. Đổi role được kiểm tra từ DB trên mỗi request.

Refresh nên dùng một request duy nhất tại một thời điểm (single-flight) trong client; song song dùng cùng refresh thì chỉ một request được phép thành công. Sau refresh phải lưu **cả hai** token mới. Website giữ access trong memory; mobile giữ refresh trong storage bảo mật của hệ điều hành. Bản này dùng bearer JSON, **chưa có HttpOnly cookie auth**. Nếu website dùng localStorage cho refresh, cần chấp nhận rủi ro XSS; không log token, không đưa token vào URL.

Email link trỏ về `{CLIENT_BASE_URL}/reset-password?uid=...&token=...` và `/verify-email?...`; team frontend cần dựng hai route này rồi POST token vào API. Cấu hình link thuộc frontend, không lấy domain từ request của người dùng.

## BOS: quản trị

Owner/admin ghi catalog/CMS/toàn chuỗi. Manager/staff được đọc catalog, xử lý booking/enquiry ở chi nhánh được giao, và chỉ đổi `is_available` cho món. Các quyền quản trị account/audit/media dành owner/admin. Owner mới được tạo/chỉnh owner khác; không tự hạ quyền hoặc tắt chính mình.

| Resource sau `/bos/` | API |
|---|---|
| `locations` | GET/POST list, GET/PATCH `/{slug}` |
| `location-images`, `opening-hours`, `special-hours` | GET/POST, GET/PATCH `/{uuid}` |
| `categories`, `dietary-tags`, `menu-items` | GET/POST, GET/PATCH `/{uuid}` |
| `modifier-groups`, `modifier-options`, `menu-item-modifier-groups` | GET/POST, GET/PATCH `/{uuid}` |
| `location-menu-items` | GET list/detail, scope theo chi nhánh; chỉ có override thực tế |
| `booking-rules` | GET/POST, GET/PATCH `/{uuid}`; owner/admin cấu hình |
| `bookings` | GET list/detail, PATCH status/notes; POST `/{uuid}/confirm` hoặc `/decline` |
| `enquiries` | GET list/detail, PATCH status/assigned_to/internal_notes |
| `catering-packages`, `pages`, `content-blocks`, `navigation` | GET/POST, GET/PATCH `/{uuid}` |
| `settings` | GET/PATCH singleton, không có list/POST |
| `users`, `staff-assignments` | GET/POST, GET/PATCH `/{uuid}` |
| `audit-logs`, `email-messages` | Chỉ GET list/detail |
| `media` | GET/POST, GET/PATCH `/{uuid}`, luồng upload bên dưới |

Query filter có trong OpenAPI. Booking hỗ trợ `?location={slug}&date=...&status=requested`; enquiry hỗ trợ `?location={slug}&kind=catering&status=new`. Catalog quan hệ dùng UUID. StaffAssignment có `is_active` để thu hồi quyền. Scope được backend áp dụng ngay cả khi client không truyền location.

Ví dụ owner/admin đổi giá: `PATCH /bos/menu-items/{uuid}` với `{"base_price_cents":1295}`. Public sau đó trả `price:12.95`.

Ví dụ nhân viên báo hết món: `PATCH /bos/locations/demo-branch/menu-items/demo-breakfast` với `{"is_available":false}`. Owner/admin có thể thêm `price_override_cents` (null để bỏ override), `is_hidden`. Bulk: POST `/bos/locations/demo-branch/menu-items/bulk-availability` với `{"items":["demo-breakfast","demo-lunch"],"is_available":true}`. Một item sai làm toàn bộ bulk rollback.

Tạo menu theo thứ tự category → menu-item → modifier-group → modifier-option → menu-item-modifier-group. `menu-items.dietary_tags` là array UUID theo thứ tự muốn hiển thị. `modifier_groups` chỉ đọc; dùng bảng nối để cấu hình thứ tự/bật tắt. `max_select:0` là không giới hạn, required group phải có `min_select>=1`. Mã group như `add` không unique vì nhiều định nghĩa có thể trùng mã; UUID mới định danh group BOS.

Booking chỉ chuyển `requested → confirmed|declined|cancelled`, `confirmed → seated|no_show|cancelled`; trạng thái cuối không mở lại. POST confirm/decline lặp lại cùng trạng thái không tạo thêm email. Không sửa location/ngày/giờ/party_size bằng PATCH để tránh vượt sức chứa.

## CMS

`Page.status = draft|published`; published_at tương lai làm page chỉ xuất hiện từ thời điểm đó. `ContentBlock.data` có schema tùy type:

| Type | JSON data |
|---|---|
| hero | `{title}`, thêm subtitle/image_url tùy chọn |
| rich_text | `{text}` (text thuần, chưa hỗ trợ HTML) |
| image | `{url,alt}` |
| gallery | `{images:[{url,alt}]}` |
| cta | `{label,url}` |
| faq | `{items:[{question,answer}]}` |

URL phải là HTTPS hoặc đường dẫn cùng site `/about`. Frontend render text có escape, không dùng `innerHTML` với nội dung CMS. Navigation dùng một trong `url` hoặc `page` UUID; parent phải cùng menu và không được tạo vòng lặp. Link tới page draft và con của navigation inactive không xuất hiện public.

## Ảnh Supabase

1. BOS tạo WebP thumb 400px, md 800px, lg 1600px trên client. Bucket phải giới hạn MIME `image/webp`, tối đa 2 MiB/file.
2. POST `/bos/media/upload-url` với `{"folder":"menu","content_hash":"<64 ký tự SHA-256 hex>"}`.
3. Nhận `{receipt,expires_in:7200,variants:{thumb:{path,upload_url,public_url},md:...,lg:...}}`. Dùng **PUT bytes WebP** tới từng `upload_url`, header `Content-Type:image/webp`, `Cache-Control:max-age=31536000`. Không gửi BOS JWT hoặc Supabase service key tới client.
4. POST `/bos/media` với `{"upload_receipt":"...","width":1600,"height":1000,"alt_text":"Mô tả ảnh"}`. Backend HEAD kiểm tra đủ ba file, MIME/kích thước và người được cấp receipt; trả asset UUID. Width/height là metadata do client khai báo, backend không decode ảnh.
5. PATCH `menu-items.image` hoặc tạo `location-images` dùng UUID asset. Chỉ metadata/cờ active của asset được PATCH, thay ảnh thì tạo asset mới. Khi upload lỗi trước khi đăng ký có thể còn object mồ côi trong Storage; xử lý dọn riêng sau khi đối chiếu tham chiếu, không xóa tự động.

Các integration đã được kiểm thử bằng mock; cần smoke test với Supabase/Resend/Turnstile của dự án trước khi go-live.

## Sinh TypeScript types

Từ workspace frontend có Node:

```sh
npx openapi-typescript ../docs/openapi.yaml -o src/api/schema.d.ts
```

Swagger/OpenAPI là nguồn để sinh type. Khi backend thay đổi hợp đồng, cập nhật schema trong cùng PR rồi thông báo team frontend. Không viết lại API interface thủ công cho từng client.
