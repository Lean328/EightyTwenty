from .base import *  # noqa: F403

DEBUG = True
# Let the static website preview (any local port) call the API.
CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"]
# The static website preview (see CLAUDE.md) serves the legacy img/ paths.
MEDIA_PREVIEW_BASE_URL = env("MEDIA_PREVIEW_BASE_URL", default="http://127.0.0.1:8123")  # noqa: F405
