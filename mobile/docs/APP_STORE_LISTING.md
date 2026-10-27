# App Store Connect — nội dung để điền

Soạn ngày 27/10/2026. Phần chữ hiển thị cho khách ở Úc nên để **tiếng Anh**, copy nguyên văn vào App Store Connect (`appstoreconnect.apple.com` → Apps → EightyTwenty). Mật khẩu tài khoản demo **không** ghi ở đây (repo public): xem cuối file `backend/.env.production` (`APP_REVIEW_EMAIL` / `APP_REVIEW_PASSWORD`).

## App Information

| Trường | Giá trị |
|---|---|
| Name | `EightyTwenty` |
| Subtitle (≤30 ký tự) | `Canberra café, coffee & brunch` |
| Bundle ID | `au.com.eightytwentyfood.app` |
| SKU | `eightytwenty-ios` |
| Primary language | English (Australia) |
| Primary category | Food & Drink |
| Secondary category | Lifestyle |
| Content rights | Không dùng nội dung của bên thứ ba |
| Age rating | Trả lời "None" cho mọi câu → **4+** |
| Privacy Policy URL | `https://eightytwenty.pages.dev/privacy` |
| Terms of Use (EULA) | Để EULA chuẩn của Apple, hoặc thêm link `https://eightytwenty.pages.dev/terms` vào cuối Description |

## Pricing and Availability

- Price: **Free**.
- Availability: **Australia** (có thể mở thêm sau).

## Version 1.0 — Description

**Promotional text** (≤170 ký tự, sửa được không cần duyệt lại):

```
Order ahead from your nearest EightyTwenty café, collect stamps on every coffee and book a table — all in one place.
```

**Description**:

```
Wholesome food, great coffee — now in your pocket.

EightyTwenty is a family of healthy cafés across Canberra. The app lets you order ahead, skip the queue and keep your coffee card with you.

ORDER AHEAD
• Browse the full menu of your café, with dietary labels for vegetarian, vegan and gluten-free choices
• Customise your coffee and your meal, add a note for the kitchen
• Pick up, dine in or get it delivered where available
• Follow your order live, from confirmed to ready, with a notification when it's ready

COFFEE CARD
• One stamp for every coffee — your 10th coffee is free
• Show your member barcode at the counter to collect stamps in store
• Add your coffee card to Apple Wallet

GIFT CARDS
• Check your gift card balance and history, and pay with it in the app

BOOK A TABLE AND CATERING
• Request a table at any café and get the café's confirmation
• Plan catering for your next event with our breakfast, lunch and afternoon tea packages

MADE FOR YOU
• Find the nearest café, with opening hours and directions
• Save favourites and delivery addresses
• Sign in with Face ID
• Choose which notifications you get

Terms of use: https://eightytwenty.pages.dev/terms
```

**Keywords** (≤100 ký tự, cách nhau bằng dấu phẩy, không dấu cách thừa):

```
cafe,coffee,canberra,brunch,healthy,order ahead,loyalty,gluten free,vegan,breakfast,pickup
```

| Trường | Giá trị |
|---|---|
| Support URL | `https://eightytwenty.pages.dev` |
| Marketing URL | `https://eightytwenty.pages.dev` |
| Copyright | `2026 EightyTwenty` |
| Version | `1.0.0` (EAS tự tăng build number) |

## Screenshots

Bắt buộc **iPhone 6.9"** (1320 × 2868 hoặc 1290 × 2796), 3–10 ảnh. Chụp từ bản TestFlight bằng tài khoản demo. Thứ tự gợi ý:

1. Home: lời chào, quán của bạn, thông báo.
2. Menu, đang mở chi tiết một món.
3. Checkout.
4. Trạng thái đơn đang làm ("Preparing").
5. Thẻ cà phê (6/9 dấu) + barcode thành viên.
6. Our cafés / đặt bàn.

iPad: không cần (`supportsTablet: false`).

## App Privacy (Data collection)

"Do you or your third-party partners collect data from this app?" → **Yes**. Mọi loại dưới đây: **Linked to the user = Yes**, **Used for tracking = No**.

| Loại dữ liệu | Mục đích |
|---|---|
| Contact Info → Name, Email Address, Phone Number | App Functionality |
| Contact Info → Physical Address (địa chỉ giao hàng) | App Functionality |
| User Content → Other User Content (ghi chú món, lời nhắn) | App Functionality |
| Purchases → Purchase History | App Functionality |
| Identifiers → User ID | App Functionality |
| Identifiers → Device ID (push token) | App Functionality |

**Không khai:**
- **Location**: vị trí chỉ dùng trên máy để sắp quán, không gửi lên server.
- **Financial Info**: Square xử lý thẻ; app không nhận số thẻ.
- **Health / Fitness, Browsing History, Usage Data, Diagnostics**: không thu.

## App Review Information

| Trường | Giá trị |
|---|---|
| Sign-in required | Yes |
| User name / Password | lấy `APP_REVIEW_EMAIL` / `APP_REVIEW_PASSWORD` trong `backend/.env.production` |
| Contact | tên, SĐT, email của người phụ trách nộp app |

**Notes** (dán nguyên văn):

```
EightyTwenty is a group of cafés in Canberra, Australia. The demo account already has a member card with 6 coffee stamps and a $25 gift card balance.

To try ordering: Menu → pick any item → Add → Checkout. Turn on "Use gift card" to pay with the demo balance (no card needed). Orders are sent to a real café, so please choose Pickup.

Account deletion: Profile → Privacy & security → Close my account.
Face ID and location are optional and only used on the device. Card and Apple Pay payments are processed by Square.
```

> Trước khi gửi duyệt: báo các quán là có thể có đơn thử từ Apple trong vài ngày đó.

## Export Compliance

Đã khai trong app (`ITSAppUsesNonExemptEncryption = false`), nên App Store Connect không hỏi lại.
