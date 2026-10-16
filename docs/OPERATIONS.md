# Chạy và vận hành

## Cấu hình môi trường

`backend/.env.example` liệt kê toàn bộ biến. Dev hiện dùng chung database Supabase production qua `backend/.env` (lựa chọn của chủ dự án); không có DATABASE_URL thì rơi về SQLite. Test luôn dùng SQLite trong RAM hoặc PostgreSQL localhost. `seed_from_mock` từ chối chạy khi database đã có dữ liệu (cần `--update-existing`). Production đặt `DJANGO_SETTINGS_MODULE=config.settings.prod` bằng biến môi trường của process/Render, PostgreSQL, SECRET_KEY ngẫu nhiên tối thiểu 40 ký tự, JOB_TOKEN ngẫu nhiên tối thiểu 32 ký tự. Không dùng secret mặc định dev. Turnstile không bắt buộc (website chưa có widget; `render.yaml` đặt `TURNSTILE_ENABLED=False`) — muốn bật thì thêm widget vào website rồi đặt `TURNSTILE_ENABLED=True` + `TURNSTILE_SECRET_KEY`. `ALLOWED_HOSTS = ["*"]` và `CORS_ALLOW_ALL_ORIGINS = True` cố định trong `config/settings.py` (chủ dự án chọn 16/10/2026 cho dev POS/app gọi từ localhost, IP LAN, domain preview); biến `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` trên Render không còn tác dụng. `CLIENT_BASE_URL` đã điền sẵn trong `render.yaml`. `MEDIA_PREVIEW_BASE_URL` (tùy chọn) là nơi Admin tải ảnh xem trước cho đường dẫn kiểu `img/...`; mặc định bằng `CLIENT_BASE_URL` (website). Trang `/admin/system/` hiển thị nhanh dịch vụ nào đã cấu hình (không lộ secret).

Host và CORS mở cho mọi nơi (xem trên). Nếu dùng Django Admin trên domain custom, thêm origin HTTPS vào `CSRF_TRUSTED_ORIGINS`.

Push cho app: `PUSH_ENABLED` (mặc định `True`) bật gửi qua Expo Push API — không cần key; `EXPO_ACCESS_TOKEN` chỉ cần khi bật "enhanced push security" trong tài khoản Expo của app. Máy đăng ký xem ở BOS → System → Push devices.

`PAYMENT_PROVIDER` (app điện thoại): để trống (mặc định, production) → đơn có tiền phải trả và gửi eGift trả `501 NOT_IMPLEMENTED` vì chưa chọn cổng thanh toán; đơn được gift card trả hết vẫn chạy. `PAYMENT_PROVIDER=demo` chỉ dùng trên server test: nhận token `demo_…` của app, **không thu tiền** — đừng bật ở nơi khách thật đặt đơn (quán sẽ nhận đơn chưa trả tiền). Chi tiết: trang `/api/docs/app/`, mục 3.8.

`TRUSTED_PROXY_COUNT=0` mặc định lấy REMOTE_ADDR (dùng cho local). `render.yaml` đặt sẵn `TRUSTED_PROXY_COUNT=1` vì sau proxy Render, REMOTE_ADDR là IP proxy — để 0 thì mọi khách dùng chung một bucket rate limit (cả site chỉ 10 form/giờ). Sau lần deploy đầu, gửi thử vài form từ hai mạng khác nhau để xác nhận rate limit tính riêng từng IP. Không lấy tùy ý phần tử đầu X-Forwarded-For vì header có thể giả mạo. Throttle lưu DB, chia sẻ giữa worker, fixed window; đây không phải lớp chống DDoS ở edge.

## Supabase

1. Tạo project Singapore. Lấy transaction pooler URL cổng 6543 cho DATABASE_URL; session pooler URL cổng 5432 cho DATABASE_URL_MIGRATIONS. URL-encode mật khẩu trong URL. Host pooler của project hiện tại: `aws-0-ap-southeast-1.pooler.supabase.com`, user `postgres.<project-ref>`. Không dùng host trực tiếp `db.<ref>.supabase.co` cho Render (gói free chỉ có IPv6). Key `sb_secret_…` (API key kiểu mới) điền vào `SUPABASE_SERVICE_ROLE_KEY`. Khi tạo project nên tắt Data API (backend không dùng PostgREST).
2. `CONN_MAX_AGE=0`, server-side cursor tắt và psycopg prepared statements tắt để phù hợp transaction pooler. `manage.py migrate` tự chọn URL migration nếu đã có.
3. Migration khóa RLS + thu hồi quyền anon/authenticated trên bảng Django và default grants. Hook post_migrate áp dụng lại cho bảng mới. Django dùng role chủ sở hữu/Postgres có quyền phù hợp; không dùng anon key làm DB credential.
4. Bucket `media`: public read, chỉ `image/webp`, giới hạn 2 MiB/object, không public write/update/delete. Service role chỉ ở backend. Cấp đúng SUPABASE_PUBLIC_MEDIA_BASE như `https://PROJECT.supabase.co/storage/v1/object/public/media`.
5. Metadata PostgreSQL và file Storage là hai phần khác nhau. Backup database không chứa byte ảnh; cần kế hoạch sao lưu Storage riêng khi có dữ liệu thật.

## Render

Có Blueprint `backend/render.yaml`; chọn đường dẫn này khi tạo Blueprint từ repo. Chưa có service nào được deploy từ lần triển khai code này.

- Root directory: `backend`.
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput`.
- Start: `gunicorn config.wsgi:application --workers 2 --threads 2 --timeout 60 --max-requests 500 --max-requests-jitter 50`.
- Health path: `/health`, không query DB; đây là liveness, không chứng minh DB/Storage/email hoạt động.
- Cấu hình `DATABASE_URL_MIGRATIONS`, credentials Storage/email, CORS, captcha và CLIENT_BASE_URL trước go-live. Không xử lý/ghi ảnh lên disk Render.

Build migration chỉ dùng trong giai đoạn một service. Khi team có thay đổi schema phức tạp, cần migration tương thích phiên bản code cũ/mới và quy trình release có staging; không coi migrate tự động là thay thế review schema.

```sh
DEBUG=False python manage.py check --deploy
python manage.py createsuperuser
```

Chỉ có một file settings (`backend/config/settings.py`); máy dev khác server ở `DEBUG=True` trong `backend/.env`. Server không cần `DJANGO_SETTINGS_MODULE` (manage.py/wsgi luôn dùng `config.settings`). Kiểm tra security deployment có thể nhắc HSTS preload chưa bật. Preload không tự bật vì là quyết định ở cấp domain. Bản này không có Sentry SDK; SENTRY_DSN trong env là chỗ dành cho tích hợp sau.

## Email và job

Tích hợp gửi mail là Resend HTTP API. Cấu hình domain gửi/SPF/DKIM tại nhà cung cấp; EMAIL_FROM dùng domain đã verify. Dev không có key sẽ in mail ra console; test dùng locmem. Production không có key không giả báo email đã gửi: outbox chuyển failed và có thể retry sau khi cấu hình.

Booking/enquiry/account link được lưu cùng transaction với email outbox. Gửi thử sau commit, timeout mỗi lần 5 giây; lỗi mail không rollback nghiệp vụ. Job retry tối đa 10 mail/lần, exponential backoff, tối đa 8 lần; xem `/bos/email-messages` để phát hiện failed. Mail sent không được gửi lại. Khi provider nhận mail nhưng response mất, idempotency key của Resend giảm trùng gửi; không cam kết exactly-once ngoài thời hạn idempotency của provider.

- `POST /api/v1/jobs/retry-emails`, header `X-Job-Token`.
- `POST /api/v1/jobs/cleanup`: xóa blacklist token hết hạn, bucket throttle cũ, bỏ nội dung email đã gửi quá 7 ngày. Không tự xóa audit hay dữ liệu kinh doanh.
- Workflow `.github/workflows/scheduled-jobs.yml` chỉ chạy khi repository variable `ENABLE_BOS_JOBS=true`. Thêm variable `BOS_API_BASE=https://HOST`, secret `BOS_JOB_TOKEN` bằng JOB_TOKEN server.
- GitHub schedule có thể trễ; không dùng nó như SLA gửi mail đúng phút. Health pinger cần cấu hình ngoài repo nếu muốn theo dõi uptime; không giả định pinger bảo đảm free service luôn thức.

## Backup và restore

Workflow backup chỉ bật khi `ENABLE_BOS_BACKUPS=true` và secret `DATABASE_URL_MIGRATIONS` đã cấu hình. Hai trigger UTC được chọn theo Sydney DST để chạy một lần khoảng 02:00; ngày chuyển sang DST bỏ 02:00 thì chạy 03:00. Workflow_dispatch chạy ngay.

Dump **schema public** bằng pg_dump 17 custom format, chứa dữ liệu Django, giữ GitHub artifact 14 ngày. Không chứa ảnh Storage, cấu hình provider, role Supabase hoặc các schema ngoài public. Đảm bảo pg_dump version >= PostgreSQL server; nếu provider nâng major version thì nâng image backup tương ứng. Artifact có dữ liệu khách, chỉ cấp quyền repo cho người cần truy cập.

Restore trước vào một database staging **trống**, không dùng `--clean` trên production:

```sh
pg_restore --list backup.dump
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error backup.dump
DATABASE_URL="$RESTORE_DATABASE_URL" python manage.py migrate
DATABASE_URL="$RESTORE_DATABASE_URL" python manage.py check
```

Kiểm tra số booking/menu/user, API bootstrap, quyền chi nhánh và RLS sau restore. `migrate` kích hoạt lại lockdown hook. Phải diễn tập restore với dump thật; file workflow tồn tại không chứng minh backup production đã chạy.

## Kiểm tra go-live

Nhập snapshot website thật và so sánh output bootstrap; cấu hình chính xác giờ/sức chứa booking; thử một booking → staff đúng chi nhánh thấy → confirm → nhận email thật. Thử upload ba WebP thật, xác nhận URL và metadata. Kiểm tra frontend timeout/fallback và xử lý 401/refresh/429. Kiểm tra quyền manager/staff và dữ liệu chi nhánh khác trả 404. Các bước tích hợp này cần credentials và code client của dự án, chưa được thực hiện trong môi trường local.

## Tài liệu kỹ thuật đã đối chiếu

- [Django 5.2 release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/).
- [Simple JWT settings](https://django-rest-framework-simplejwt.readthedocs.io/en/latest/settings.html).
- [Supabase signed upload API](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl) và [Storage API](https://supabase.github.io/storage/).
