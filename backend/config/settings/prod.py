from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

if SECRET_KEY.startswith("development-only") or len(SECRET_KEY) < 40:  # noqa: F405
    raise ImproperlyConfigured("Set a random SECRET_KEY with at least 40 characters.")
if not DATABASES["default"]["ENGINE"].endswith("postgresql"):  # noqa: F405
    raise ImproperlyConfigured("Production requires PostgreSQL.")
DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = "require"  # noqa: F405
if TURNSTILE_ENABLED and not TURNSTILE_SECRET_KEY:  # noqa: F405
    raise ImproperlyConfigured("Set TURNSTILE_SECRET_KEY or disable Turnstile.")
if render_host := env("RENDER_EXTERNAL_HOSTNAME", default=""):  # noqa: F405
    ALLOWED_HOSTS.append(render_host)  # noqa: F405
if not JOB_TOKEN or len(JOB_TOKEN) < 32:  # noqa: F405
    raise ImproperlyConfigured("Set JOB_TOKEN with at least 32 random characters.")
SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [r"^health$"]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
