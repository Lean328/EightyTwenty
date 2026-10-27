# Đưa app lên App Store — checklist

Rà soát ngày 27/10/2026 (nhánh `feat/mobile-app`). Ký hiệu: ✅ đã xong và đã kiểm · ⛔ chặn, phải xong trước khi nộp · ⚠️ nên làm, rủi ro bị Apple từ chối hoặc khách gặp lỗi.

## Đã sẵn sàng

- ✅ Cấu hình build: `eas.json` profile `production` gắn API production (`https://eightytwenty-api.onrender.com/api/v1/app`). Bản phát hành **không** dùng `mobile/.env` vì file này bị gitignore nên EAS không tải lên. Số build tự tăng trên EAS (`appVersionSource: remote`).
- ✅ `app.json`:
  - bundle id `au.com.eightytwentyfood.app`, iPhone only.
  - `ITSAppUsesNonExemptEncryption = false`, nên không phải khai báo xuất khẩu mã hoá mỗi lần nộp.
  - Lời giải thích quyền Face ID, plugin push.
  - Icon 1024×1024 RGB, không có kênh trong suốt (Apple yêu cầu).
- ✅ Xoá tài khoản ngay trong app (Apple guideline 5.1.1(v)): Privacy & security → Close my account.
- ✅ Không có đăng nhập Google/Facebook, nên không bắt buộc "Sign in with Apple".
- ✅ Push trên iPhone đã chạy thật. Bấm push, bấm dòng trong màn Notifications hoặc bấm đơn trong Activity đều mở màn trạng thái đơn. Home có viên "Preparing · <quán> · Track" khi có đơn đang làm.
- ✅ Face ID: bật "Sign in with Face ID" thì mở app phải quét Face ID. Có nút "Use password instead" để đăng xuất.
- ✅ QA tự động (`make qa`): backend 379 test, app 142 test (gồm test bắt các lỗi chỉ xảy ra trên điện thoại, render mọi màn), bundle iOS/Android build được. `make api-smoke` gọi đủ 50 API của app, 0 lỗi.

## ⛔ Chặn — phải xong trước khi nộp

1. **Thanh toán: đã chọn Square (27/10/2026), code đã xong, đang chờ thông tin của khách.**
   - Đã có:
     - Backend giữ tiền lúc đặt, trừ khi quán nhận, trả lại khi quán từ chối.
     - App dùng màn nhập thẻ và Apple Pay của Square; form thẻ demo không còn xuất hiện trong bản build Square.
     - Chi tiết, danh sách thông tin cần xin khách và các bước thử Sandbox: [`docs/SQUARE_SETUP.md`](../../docs/SQUARE_SETUP.md).
   - Còn chặn: Application ID / access token / Location ID của Square, Merchant ID + chứng chỉ Apple Pay, rồi thử Sandbox trên iPhone thật bằng bản build EAS (Expo Go không chạy Square).
   - Bản phát hành **thiếu** `EXPO_PUBLIC_SQUARE_APPLICATION_ID` thì app báo "Card payments aren't available"; đừng nộp bản như vậy.
   - eGift vẫn 501 khi dùng Square (chờ khách quyết định có dùng Square Gift Cards không); lưu thẻ vẫn 501.
   - Mua đồ ăn/đồ uống dùng ở quán là hàng hoá vật lý nên **không** phải dùng In-App Purchase của Apple.
2. **Deploy backend của nhánh này lên production** (merge `feat/mobile-app` → `main`, Render tự deploy và chạy migration).
   - Production hiện **chưa có** `DELETE /me` (xoá tài khoản, Apple bắt buộc), `POST /me/password`, `url` trong feed thông báo, gửi offer từ BOS.
   - Migration mới: `notifications/0005_appnotification_url` (chỉ thêm cột).
   - Nhánh merge sạch với `main` (đã thử `git merge-tree`).
3. **Tài khoản Apple Developer** của khách (nên là tài khoản tổ chức; tên người bán hiển thị trên App Store), app record trên App Store Connect với bundle id `au.com.eightytwentyfood.app`. Lần chạy `make ios-build` đầu tiên sẽ hỏi đăng nhập Apple để tạo certificate, provisioning profile và push key (APNs).
4. **Tài khoản demo cho Apple review** trên production: email + mật khẩu, có sẵn vài đơn và dấu thẻ cà phê, ghi vào mục App Review Information. Phải tạo trên production nên cần chủ dự án làm hoặc cho phép.
5. **Privacy policy + App Privacy.**
   - Link Privacy policy trong app mở `https://eightytwenty.pages.dev/privacy`. Đây là bản chữ của website, cần thêm phần của app:
     - Tài khoản, SĐT, địa chỉ giao hàng, lịch sử đơn.
     - Push token.
     - Face ID chỉ xử lý trên máy.
     - Xoá tài khoản.
   - Trên App Store Connect, phần App Privacy khai: Contact Info (tên, email, SĐT, địa chỉ), Purchases, User ID, Device ID (push token). Không tracking, không quảng cáo.
6. **Trang Terms of use**: link trong app mở `/terms` nhưng chưa có trang này (CMS page `terms` trả 404 nên website hiện trang trống). Tạo page `terms` trong BOS → Website → Pages với nội dung khách gửi. Hoặc tạm dùng EULA chuẩn của Apple.

## ⚠️ Nên làm

- **Apple Wallet** (thẻ thành viên): chưa phát hành pass (cần Pass Type ID + chứng chỉ ký trên server). Bấm "Add to Apple Wallet" hiện "Wallet passes aren't available yet". Nên ẩn nút hoặc làm luôn trước khi nộp.
- **Email trên production** (Resend: `EMAIL_PROVIDER_API_KEY` + domain gửi đã xác minh): thiếu thì "Forgot password" và email báo quán không gửi được.
- **"Use my location"**: các quán chưa có toạ độ (lat/lng) nên công tắc chưa có tác dụng. Điền toạ độ trong BOS, hoặc ẩn công tắc.
- **Ảnh Keep Cups** (offer): upload trong BOS → App offers.
- **Ảnh chụp màn hình App Store**: iPhone 6.9" (1320×2868) là bắt buộc. Chụp từ simulator hoặc máy thật với tài khoản demo.
- **Android / Google Play**: push Android cần development build + FCM. Chưa làm.
- Nhắc lịch đặt bàn (job) chưa có. Đây không phải điều kiện review.

## Build và nộp

```bash
make ios-build
```

```bash
make ios-submit
```

`ios-build` build trên EAS (khoảng 15–20 phút). `ios-submit` tải bản build mới nhất lên App Store Connect; vào TestFlight thử trước rồi mới gửi duyệt. Cả hai cần `npx eas-cli login` bằng tài khoản Expo `my-an-lien`.

Thử nhanh trên máy thật trước khi build: `make run` + `make mobile` (Expo Go, server dev) hoặc `make mobile-prod` (Expo Go, API production).
