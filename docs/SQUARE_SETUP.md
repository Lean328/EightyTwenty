# Thanh toán Square cho app điện thoại

Chủ dự án chọn Square ngày 27/10/2026, theo nội dung app của khách ("eGift cards are issued and redeemed through Square"). Tài liệu này gồm:

- những gì cần xin khách,
- những gì code đã có,
- các bước bật lên và cách thử.

## 0. Cách xin khách (đã chốt 28/10/2026): khách mời mình vào team Square

App vẫn build và phát hành dưới tài khoản Apple Developer của chủ dự án (team `988D5VKVXS`); chỉ Square là của khách. Thay vì khách tự lấy từng mã rồi gửi, khách **mời chủ dự án vào team Square của họ** — không phải gửi token qua chat, và bước chứng chỉ Apple Pay (phải giữ nguyên hộp thoại Square trong lúc tạo chứng chỉ bên Apple) do mình tự làm.

**Khách chỉ cần:**

1. Có tài khoản **Square Úc** của EightyTwenty, đã xác minh doanh nghiệp và bật nhận thanh toán online.
2. Square Dashboard → **Team** → mời email của chủ dự án, cho quyền dùng **Developer Console**.
3. Trả lời 4 câu nghiệp vụ (trong tin nhắn bên dưới; chi tiết ở mục 1, câu 6–9).

**Sau đó mình tự làm** (Developer Console của khách, chế độ **Production**):

1. Tạo application `EightyTwenty`.
2. Lấy **Application ID** (`sq0idp-…`) → `mobile/eas.json` (`EXPO_PUBLIC_SQUARE_APPLICATION_ID`), build lại app.
3. Lấy **Access token** (`EAAA…`) → Render: `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT=production`; lưu bản sao vào `D:\Data\secrets\eightytwenty-secrets\square\` (ngoài repo).
4. Lấy **Location ID từng quán** → BOS → Locations → Mobile app → Square location ID (và một mã mặc định cho `SQUARE_LOCATION_ID` trên Render).
5. **Apple Pay**: application → Apple Pay → Production → Add certificate → tải CSR → (giữ nguyên hộp thoại) Apple Developer → Merchant ID `merchant.au.com.eightytwentyfood` → Create Certificate bằng CSR đó → tải `.cer` → upload vào đúng hộp thoại Square. Merchant ID giữ nguyên.
6. Đặt một đơn thật nhỏ, quán nhận, rồi hoàn trong Square Dashboard để kiểm tra trọn vòng; xoá `EMAIL_REDIRECT_TO` trên Render trước khi phát hành.

**Tin nhắn gửi khách** (thay `[your email]`):

> Hi, to switch on card and Apple Pay payments in the EightyTwenty app we need access to your Square account. The easiest way:
>
> 1. Make sure EightyTwenty has a verified Square account (Australia) with online payments enabled.
> 2. In Square Dashboard → Team, invite **[your email]** as a team member with access to the Developer Console. We'll set up the app connection and Apple Pay from there, so no passwords or keys need to be sent around.
>
> A few quick decisions from you:
> - Payment flow: the card is authorised when the customer orders, charged when the café accepts the order, and released if the café declines. Is that OK?
> - Should we keep the 2.95% card surcharge (Apple Pay has none)?
> - What name should appear on customers' card statements?
> - For the first release, do you need eGift cards sold in the app, or saved cards for next time? (Both can be added later.)
>
> Thanks!

Nếu khách không muốn mời vào team: xin các mã ở mục 1 bên dưới, và làm bước Apple Pay cùng lúc với khách (chia sẻ màn hình).

## 1. Cần xin khách

Access token là **bí mật**: nhờ khách gửi qua kênh an toàn (ví dụ trình quản lý mật khẩu, link chia sẻ một lần), không gửi qua email/chat thường, và không đưa vào app hay vào git.

**Tài khoản Square (developer.squareup.com, đăng nhập bằng tài khoản Square của EightyTwenty)**

1. Tạo một Application (ví dụ "EightyTwenty App"), rồi gửi:
   - **Application ID**: bản Production (`sq0idp-…`) và bản Sandbox (`sandbox-sq0idb-…`). Hai ID này công khai, nằm trong app.
   - **Access token**: bản Production và bản Sandbox (bí mật, chỉ đặt trên server Render).
2. **Location ID của từng quán** trong Square (Square Dashboard → Account & Settings → Locations), ghép với 10 quán trong BOS. Nếu mọi đơn app vào chung một location thì chỉ cần một ID; khi đó báo cáo doanh thu trong Square không tách theo quán.
3. Xác nhận tài khoản Square (Úc, AUD) **đã bật nhận thanh toán online** (thẻ không quẹt tại quầy).
4. **Tên hiện trên sao kê thẻ** của khách (statement description, đặt trong Square Dashboard).

**Apple Pay**

5. **Tài khoản Apple Developer** của khách (tài khoản tổ chức, cũng dùng để đưa app lên App Store). Trong đó cần làm hai việc (khách tự làm, hoặc cấp quyền Admin cho người làm):
   - Tạo **Merchant ID**, ví dụ `merchant.au.com.eightytwentyfood`.
   - Lấy file CSR ở Square Dashboard → Application → tab **Apple Pay** → Add certificate, dùng nó tạo **Apple Pay Payment Processing Certificate** trên Apple, rồi tải chứng chỉ đó lên lại Square.

**Câu hỏi nghiệp vụ**

6. **Khi nào trừ tiền?** Code hiện tại: lúc đặt đơn chỉ **giữ tiền** (authorize); **trừ thật** khi quán bấm nhận đơn; quán từ chối thì **trả lại khoản giữ** (khách không bị trừ). Nếu không ai xử lý, Square tự huỷ khoản giữ sau 7 ngày. Khách có đồng ý cách này không?
7. **Phụ phí thẻ 2,95%**: app đang cộng khi trả bằng thẻ, không cộng với Apple Pay. Có giữ không, và mức đó có còn đúng với phí Square không?
8. **eGift / gift card**:
   - Gift card hiện bán tại quầy có phải Square Gift Cards không?
   - App có cần bán eGift qua Square (số dư dùng được ở máy Square tại quầy) không? Nếu có, phải làm thêm Square Gift Cards API.
   - Hiện app **chặn** bán eGift khi đang dùng Square, để không thu tiền cho một thẻ chưa được phát hành.
9. **Lưu thẻ cho lần sau** (Saved card): có cần ở bản 1.0 không? Cần làm thêm Square Customers + Cards API.
10. **Ai hoàn tiền tay** khi hoàn tự động lỗi (lỗi được ghi vào log Render), và hoàn trong Square Dashboard theo quy trình nào?

## 2. Code đã có (nhánh `feat/mobile-app`)

**Backend** (`backend/apps/orders/payments.py`, chỗ duy nhất gọi cổng thanh toán):

- `PAYMENT_PROVIDER=square`: gọi Square Payments API bằng nonce mà app gửi lên (từ màn nhập thẻ hoặc Apple Pay của Square).
- Tạo đơn: `autocomplete: false`, tức là chỉ giữ tiền, theo location của quán (`Location.square_location_id`, nếu trống thì dùng `SQUARE_LOCATION_ID`).
- Idempotency key được tính từ key của app cộng với nonce: gửi lại cùng request không giữ tiền hai lần; đổi thẻ thì thành một giao dịch mới.
- Quán nhận đơn (`received` → trạng thái tiếp theo, từ BOS hoặc POS) → `complete` (trừ tiền).
- Quán từ chối / huỷ / hoàn → đọc trạng thái payment: còn đang giữ thì `cancel`, đã trừ thì `refund` đủ số tiền. Lỗi chỉ ghi log, không chặn thao tác của quán.
- Lưu đơn lỗi sau khi đã giữ tiền → huỷ khoản giữ ngay.
- Lỗi thẻ được báo bằng câu dễ hiểu (không đủ tiền, sai CVV, thẻ hết hạn…, mã `PAYMENT_DECLINED`). Square không phản hồi → 502 "you haven't been charged".
- Gửi eGift khi dùng Square → 501 (chờ quyết định ở câu 8). Lưu thẻ → 501 như cũ.
- BOS → Locations → Mobile app: ô **Square location ID** (migration `locations/0007`).
- Test: `backend/tests/test_square_payments.py` (8 test, Square được giả lập).

**App** (`mobile/src/services/integrations/payments.ts`):

- `react-native-square-in-app-payments` 2.1.2 (thư viện chính thức của Square, hỗ trợ kiến trúc mới của React Native, có config plugin Expo).
- "New card" mở **màn nhập thẻ của Square** thay cho các ô nhập thẻ demo, nên số thẻ không bao giờ đi qua code của mình.
- Apple Pay qua Square: chỉ hiện khi máy có Apple Pay và đã cấu hình Merchant ID.
- Đóng màn thanh toán giữa chừng không hiện lỗi.
- **Expo Go không có code native của Square**, nên vẫn dùng thanh toán demo (`make run` + `make mobile` không đổi gì). Bản build EAS có `EXPO_PUBLIC_SQUARE_APPLICATION_ID` mới dùng Square; bản phát hành thiếu ID này thì báo "Card payments aren't available".
- `app.config.js` chỉ thêm entitlement Apple Pay khi có `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`; Merchant ID sai sẽ làm hỏng bước ký app.
- Test: `mobile/tests/services/payments.test.ts`.

**Chưa làm** (cần câu trả lời ở mục 1): eGift qua Square Gift Cards, lưu thẻ, xác minh người mua (3-D Secure; Square không bắt buộc ở Úc), Google Pay (Android).

## 3. Bật lên khi có thông tin

**Bước 1: thử với Sandbox** (không có tiền thật)

1. Trên Render (service API), đặt:
   - `PAYMENT_PROVIDER=square`
   - `SQUARE_ENVIRONMENT=sandbox`
   - `SQUARE_ACCESS_TOKEN=<sandbox token>`
   - `SQUARE_LOCATION_ID=<sandbox location>`

   App chưa phát hành nên chưa có khách thật đặt đơn; nhớ chuyển sang production trước khi phát hành.
2. `mobile/eas.json` (khối `base`): `EXPO_PUBLIC_SQUARE_APPLICATION_ID=<sandbox app id>`, thêm `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=<merchant id>` khi có Apple Pay.
3. `make ios-build` rồi `make ios-submit`, cài qua TestFlight.

**Đang thử (28/10/2026)** bằng tài khoản Square developer cá nhân của chủ dự án (chưa phải tài khoản khách): sandbox test account `EightyTwentyTest` (Úc, AUD, location `LB0YQ3ZBC2WYJ`), Application ID sandbox đã nằm trong `eas.json`; access token + location ở `D:\Data\secrets\eightytwenty-secrets\square\sandbox.env` (ngoài repo) và trên Render. Đã thử trực tiếp với Square: giữ 5,50 AUD → `APPROVED`, huỷ → `CANCELED`. Từ app (TestFlight build 8): đơn $9,27 → Square giữ tiền, quán bấm nhận trong BOS → hiện trong Transactions của Sandbox Dashboard. **Apple Pay**: Merchant ID `merchant.au.com.eightytwentyfood` (team `988D5VKVXS`), App ID bật Apple Pay Payment Processing, chứng chỉ xử lý tạo từ CSR của Square **Sandbox** (hết hạn 26/11/2028; `.cer` + `.csr` ở `D:\Data\secrets\eightytwenty-secrets\apple-pay\`), `eas.json` có `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`. Khi có tài khoản khách: thay Application ID / token / location, build lại app, làm lại chứng chỉ Apple Pay với tài khoản Square của khách.
4. Thử các trường hợp, với số thẻ thử trong [tài liệu Sandbox của Square](https://developer.squareup.com/docs/devtools/sandbox/payments):
   - Đặt đơn bằng thẻ: Square Sandbox Dashboard hiện khoản **Authorized**.
   - BOS bấm Accept: khoản chuyển sang **Completed**.
   - Đặt đơn khác, BOS bấm Decline: khoản bị **Canceled**, app ghi "You haven't been charged".
   - Thẻ bị từ chối: app báo lỗi, không có đơn trong BOS.
   - Apple Pay: phải thử trên máy thật; simulator không chạy Apple Pay Sandbox.

**Bước 2: chuyển sang thật**

5. Render: đổi sang `SQUARE_ENVIRONMENT=production` cùng access token và location production; điền Square location ID cho từng quán trong BOS.
6. `mobile/eas.json`, profile `production`: Application ID production + Merchant ID, rồi `make ios-build` và `make ios-submit`.

**SDK Square trên iOS**: build 6 bị App Store Connect từ chối (ITMS-90035/90205/90206) vì script `setup` của Square (đưa framework lồng ra ngoài, tự xoá, ký lại) chạy *trước* "[CP] Embed Pods Frameworks" nên không làm gì. `mobile/plugins/withSquareSetupAfterEmbed.js` thêm hook `post_integrate` vào Podfile để chuyển bước đó xuống cuối target app. Đừng bỏ plugin này khi còn dùng `react-native-square-in-app-payments`.
7. Đặt một đơn thật nhỏ, cho quán nhận, sau đó tự hoàn trong Square Dashboard để kiểm tra trọn vòng.
