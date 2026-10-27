# Đưa app lên TestFlight và App Store

Cập nhật 27/10/2026 (`main`). Ký hiệu: ✅ xong và đã kiểm · ⛔ chặn bản công khai trên App Store · ⚠️ nên làm. Nội dung để điền App Store Connect: [`APP_STORE_LISTING.md`](APP_STORE_LISTING.md).

## Tóm tắt

- **TestFlight (test nội bộ): làm được ngay.** Mọi thứ chạy với API production, trừ trả tiền bằng thẻ/Apple Pay (app báo "Card payments aren't available" vì chưa có Square). Đặt món trả bằng gift card vẫn chạy.
- **App Store (công khai): còn chặn bởi Square** và vài việc nhập liệu (tài khoản demo, ảnh chụp màn hình).

## Đã xong

- ✅ **Build**: `eas.json` profile `production` gắn API production (`https://eightytwenty-api.onrender.com/api/v1/app`). Bản phát hành **không** dùng `mobile/.env` (gitignore, EAS không tải lên). Số build tự tăng trên EAS (`appVersionSource: remote`). Project EAS `@my-an-lien/eightytwenty`.
- ✅ **`app.json`**: tên `EightyTwenty`, bundle id `au.com.eightytwentyfood.app`, chỉ iPhone, `ITSAppUsesNonExemptEncryption = false`, câu xin quyền Face ID và vị trí, plugin push, icon 1024×1024 không trong suốt.
- ✅ **Backend production** có đủ API của app: xoá tài khoản, đổi mật khẩu, feed có link, Wallet, toạ độ quán, nhắc lịch đặt bàn (job), Square (chưa bật).
- ✅ **Xoá tài khoản trong app** (guideline 5.1.1(v)): Privacy & security → Close my account. Không có đăng nhập Google/Facebook nên không bắt buộc Sign in with Apple.
- ✅ **Push** chạy thật trên iPhone; bấm push / dòng Notifications / đơn trong Activity đều mở trạng thái đơn; Home có viên "Track" khi có đơn đang làm.
- ✅ **Face ID**: bật thì mở app phải quét; có "Use password instead".
- ✅ **Apple Wallet** chạy trên production và đã thử trên iPhone (27/10): thêm thẻ (trang trong app, có "Back to the app"), thẻ có dải dấu, tự cập nhật khi tích dấu ở BOS. Pass Type ID `pass.au.com.eightytwentyfood.loyalty`, chứng chỉ **hết hạn 26/11/2027** (gia hạn: `docs/OPERATIONS.md`).
- ✅ **"Use my location"**: toạ độ 9 quán trên production, quán gần nhất lên đầu, vị trí chỉ dùng trên máy.
- ✅ **Privacy policy + Terms of use** đã đăng: `https://eightytwenty.pages.dev/privacy`, `/terms` (trang CMS, sửa trong BOS → Website → Pages). Nội dung do dev soạn — khách cần đọc duyệt.
- ✅ **Email** gửi qua Brevo trên production.
- ✅ **Ảnh Keep Cups** cho offer đã lên Supabase Storage và gán vào offer (27/10). Đổi ảnh: BOS → App offers → Upload a new photo.
- ✅ **Tài khoản demo** cho Apple review trên production: `eightytwenty-review@gmail.com` (6 dấu, $25 gift card). Mật khẩu đã bị đổi trong BOS — điền mật khẩu mới vào cuối `backend/.env.production`.
- ✅ **QA**: `make qa` (backend + app, bundle iOS/Android), `make api-smoke`, GitHub CI chạy backend (Postgres 17) và app.
- ✅ **Đang ẩn** khi chạy API thật (mock của khách vẫn hiện): gửi eGift, "Add a card" (lưu thẻ). Bật bằng `EXPO_PUBLIC_GIFT_CARD_SALES` / `EXPO_PUBLIC_SAVED_CARDS` = `true` khi server làm xong.

## ⛔ Còn chặn bản công khai

1. **Thanh toán Square** — code đã xong, chờ thông tin khách (`docs/SQUARE_SETUP.md`): Application ID, access token, Location ID, Merchant ID + chứng chỉ Apple Pay; điền `EXPO_PUBLIC_SQUARE_APPLICATION_ID` / `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` vào `eas.json`, bật `PAYMENT_PROVIDER=square` trên Render, thử Sandbox bằng bản TestFlight (Expo Go không chạy Square). Đặt món mà không trả được tiền dễ bị Apple từ chối (guideline 2.1).
2. **Mật khẩu tài khoản demo** để điền App Review Information.
3. **Ảnh chụp màn hình** iPhone 6.9" (1320×2868 hoặc 1290×2796), 3–10 ảnh, chụp từ bản TestFlight bằng tài khoản demo (thứ tự gợi ý trong `APP_STORE_LISTING.md`).
4. **Điền App Store Connect** theo `APP_STORE_LISTING.md` (mô tả, từ khoá, App Privacy, ghi chú cho người duyệt).

## ⚠️ Nên làm

- ✅ **Job định kỳ** (nhắc lịch đặt bàn, gửi lại email lỗi, dọn dẹp) chạy trong server mỗi 15 phút từ 27/10 (`docs/OPERATIONS.md`).
- Báo các quán có thể có đơn thử từ Apple trong lúc duyệt.
- **Android / Google Play**: chưa làm (push Android cần FCM).

## Lên TestFlight

Chạy từ thư mục gốc repo, trong terminal (cần đăng nhập tương tác):

1. Đăng nhập Expo bằng tài khoản `my-an-lien`: `npx eas-cli login` (trong `mobile/`).
2. `make ios-build` — build trên máy chủ EAS (~15–20 phút). Lần đầu EAS hỏi:
   - đăng nhập **Apple ID** của tài khoản developer (team `988D5VKVXS`, có mã 2 bước) → chọn team;
   - cho phép EAS **tạo bundle id** `au.com.eightytwentyfood.app`, **Distribution Certificate**, **Provisioning Profile** → Yes;
   - **Push Notifications key** (APNs) → Yes (không có key thì push trên bản build không chạy).
3. `make ios-submit` — tải bản build mới nhất lên App Store Connect. Nếu chưa có app trên App Store Connect, EAS tạo luôn (hỏi tên app, ngôn ngữ, SKU — dùng `EightyTwenty`, English (Australia), `eightytwenty-ios`). Tên app trên App Store phải là duy nhất toàn cầu; nếu "EightyTwenty" đã có người dùng thì đặt ví dụ "EightyTwenty Café".
   - Muốn tự tạo trước: App Store Connect → Apps → **+** → New App → chọn bundle id (chỉ có trong danh sách sau khi bundle id đã được đăng ký, tức sau bước 2).
4. Chờ Apple xử lý bản build (5–30 phút, có email). App Store Connect → app → **TestFlight** → **Internal Testing** → tạo nhóm, thêm người test (phải là thành viên team trên App Store Connect) → họ cài app **TestFlight** trên iPhone và nhận lời mời. Test nội bộ không cần Apple duyệt; test ngoài (External) cần một lần Beta Review.

Bản build mới sau này: chỉ cần `make ios-build` rồi `make ios-submit` (số build tự tăng). Thử nhanh không cần build: `make mobile-prod` (Expo Go, API production).
