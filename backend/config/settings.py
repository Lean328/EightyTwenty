"""
The one settings file for every environment. Everything comes from environment variables
(locally from backend/.env, on Render from the dashboard); DEBUG=True marks a developer's
machine, and the test run (pytest) is isolated from real services at the bottom.
"""

import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)
TESTING = "pytest" in sys.modules
DEBUG = env.bool("DEBUG", default=False)
PUBLIC_DEV_KEY = "development-only-change-before-deploy-8t20"
SECRET_KEY = env("SECRET_KEY", default=PUBLIC_DEV_KEY)
# This fallback key is in the public repository: a live site using it lets anyone forge
# a sign-in. Copy SECRET_KEY from backend/.env to the server instead.
if not DEBUG and not TESTING and SECRET_KEY == PUBLIC_DEV_KEY:
    raise ImproperlyConfigured("SECRET_KEY is missing: copy it from backend/.env to the server.")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
if render_host := env("RENDER_EXTERNAL_HOSTNAME", default=""):
    ALLOWED_HOSTS.append(render_host)
INSTALLED_APPS = [
    "apps.core.admin_site.BOSAdminConfig",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "corsheaders",
    "django_filters",
    "apps.core.apps.CoreConfig",
    "apps.accounts",
    "apps.locations",
    "apps.media",
    "apps.menu",
    "apps.cms",
    "apps.bookings",
    "apps.enquiries",
    "apps.notifications",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
database_url = env("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
if env.bool("USE_MIGRATION_DATABASE", default=False):
    database_url = env("DATABASE_URL_MIGRATIONS", default=database_url)
DATABASES = {"default": dj_database_url.parse(database_url, conn_max_age=0)}
if DATABASES["default"]["ENGINE"].endswith("postgresql"):
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
    DATABASES["default"].setdefault("OPTIONS", {})["prepare_threshold"] = None
    if not DEBUG and not TESTING:
        DATABASES["default"]["OPTIONS"]["sslmode"] = "require"
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
LANGUAGE_CODE = "en-au"
TIME_ZONE = "Australia/Sydney"
USE_I18N = True
LOCALE_PATHS = [BASE_DIR / "locale"]
FORMAT_MODULE_PATH = ["config.formats"]
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
if DEBUG:  # the static website preview on any local port may call the API
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"]
CORS_EXPOSE_HEADERS = ["ETag", "Retry-After"]
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"
REST_FRAMEWORK = {
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": ["apps.core.throttles.PersistentThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "600/min",
        "auth": "10/min",
        "forms": "10/hour",
        "jobs": "30/hour",
    },
    "NUM_PROXIES": env.int("TRUSTED_PROXY_COUNT", default=0),
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=30)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "CHECK_REVOKE_TOKEN": True,
    "TOKEN_OBTAIN_SERIALIZER": "apps.accounts.serializers.LoginSerializer",
    "TOKEN_REFRESH_SERIALIZER": "apps.accounts.serializers.RefreshSerializer",
}
SPECTACULAR_SETTINGS = {
    "TITLE": "EightyTwenty BOS API",
    "VERSION": "1.0.0",
    "DESCRIPTION": "Shared REST API for the website, mobile app and BOS. Money uses integer AUD cents except public compatibility endpoints. No trailing slash.",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "APPEND_COMPONENTS": {
        "securitySchemes": {"JobToken": {"type": "apiKey", "in": "header", "name": "X-Job-Token"}}
    },
    "ENUM_NAME_OVERRIDES": {
        "BookingStatus": [
            (v, v.replace("_", " ").title())
            for v in ["requested", "confirmed", "declined", "cancelled", "seated", "no_show"]
        ],
        "LocationStatus": [("open", "Open"), ("closed", "Closed"), ("tbc", "TBC")],
        "PageStatus": [("draft", "Draft"), ("published", "Published")],
        # Must match Enquiry.status choices (labels included) to keep this name.
        "EnquiryStatus": [
            ("new", "New"),
            ("in_progress", "In progress"),
            ("quoted", "Quoted"),
            ("won", "Won"),
            ("lost", "Lost"),
            ("closed", "Closed"),
        ],
        "EmailDeliveryStatus": [
            ("pending", "Pending"),
            ("sending", "Sending"),
            ("sent", "Sent"),
            ("failed", "Failed"),
        ],
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "apps.core.schema.add_error_responses",
    ],
}
SUPABASE_URL = env("SUPABASE_URL", default="").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", default="")
SUPABASE_STORAGE_BUCKET = env("SUPABASE_STORAGE_BUCKET", default="media")
SUPABASE_PUBLIC_MEDIA_BASE = env("SUPABASE_PUBLIC_MEDIA_BASE", default="").rstrip("/")
EMAIL_PROVIDER_API_KEY = env("EMAIL_PROVIDER_API_KEY", default="")
EMAIL_FROM = env("EMAIL_FROM", default="EightyTwenty <no-reply@eightytwentyfood.com.au>")
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
CLIENT_BASE_URL = env("CLIENT_BASE_URL", default="http://localhost:5173").rstrip("/")
# Where admin previews load images stored as website-relative paths (img/...); locally the
# static website preview serves them.
MEDIA_PREVIEW_BASE_URL = env(
    "MEDIA_PREVIEW_BASE_URL", default="http://127.0.0.1:8123" if DEBUG else CLIENT_BASE_URL
).rstrip("/")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", default="")
TURNSTILE_ENABLED = env.bool("TURNSTILE_ENABLED", default=False)
TURNSTILE_ALLOWED_HOSTNAMES = env.list("TURNSTILE_ALLOWED_HOSTNAMES", default=[])
JOB_TOKEN = env("JOB_TOKEN", default="")
DOCS_ENABLED = env.bool("DOCS_ENABLED", default=True)
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# Live site (Render): HTTPS only.
if not DEBUG and not TESTING:
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r"^health$"]
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Test run: fast, and never touching real services, whatever backend/.env holds.
if TESTING:
    ALLOWED_HOSTS = ["testserver", "localhost"]
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}
    STORAGES = {"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
    MIDDLEWARE = [m for m in MIDDLEWARE if m != "whitenoise.middleware.WhiteNoiseMiddleware"]
    JOB_TOKEN = "test-job-secret-not-for-production"
    SUPABASE_URL = SUPABASE_SERVICE_ROLE_KEY = SUPABASE_PUBLIC_MEDIA_BASE = ""
    EMAIL_PROVIDER_API_KEY = TURNSTILE_SECRET_KEY = ""
    # backend/.env points at the shared Supabase database, so anything that is not a local
    # PostgreSQL (CI, docker compose) becomes an in-memory SQLite database.
    if DATABASES["default"]["ENGINE"].endswith("postgresql") and DATABASES["default"].get(
        "HOST"
    ) not in ("localhost", "127.0.0.1"):
        DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
