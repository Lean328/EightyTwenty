from .base import *  # noqa: F403

ALLOWED_HOSTS = ["testserver", "localhost"]
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}  # noqa: F405
STORAGES = {"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
MIDDLEWARE = [item for item in MIDDLEWARE if item != "whitenoise.middleware.WhiteNoiseMiddleware"]  # noqa: F405
JOB_TOKEN = "test-job-secret-not-for-production"

# Tests never reach real services, whatever the developer's .env holds.
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""
SUPABASE_PUBLIC_MEDIA_BASE = ""
EMAIL_PROVIDER_API_KEY = ""
TURNSTILE_SECRET_KEY = ""
# ...and never against a remote database: local dev points .env at the shared Supabase
# database, so anything that is not a local PostgreSQL (CI, docker compose) becomes an
# in-memory SQLite database for the test run.
if DATABASES["default"]["ENGINE"].endswith("postgresql") and DATABASES["default"].get(  # noqa: F405
    "HOST"
) not in ("localhost", "127.0.0.1"):
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
