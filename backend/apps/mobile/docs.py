"""
The published docs page for the mobile app developer: only /api/v1/app, with the set-up guide
(guide.md) at the top and every endpoint's description and examples underneath.
"""

from pathlib import Path

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

TITLE = "EightyTwenty Mobile App API"
GUIDE = Path(__file__).with_name("guide.md").read_text(encoding="utf-8")
TAGS = [
    {
        "name": "App · Auth",
        "description": "Sign up, sign in, refresh tokens, sign out, password reset.",
    },
    {"name": "App · Account", "description": "Profile, preferences, favourites, saved addresses."},
    {
        "name": "App · Cafés & menu",
        "description": "Public: cafés, opening hours, menus, categories.",
    },
    {
        "name": "App · Orders & payments",
        "description": "Server-priced orders, status tracking, saved cards (payments not connected yet).",
    },
    {
        "name": "App · Loyalty & gift cards",
        "description": "Coffee card stamps, gift card balance, eGifts.",
    },
    {"name": "App · Bookings & catering", "description": "Table requests and catering enquiries."},
    {"name": "App · Notifications & content", "description": "In-app feed, offers, FAQs."},
]

schema = SpectacularAPIView.as_view(
    urlconf=[path("api/v1/app/", include("apps.mobile.urls"))],
    custom_settings={"TITLE": TITLE, "DESCRIPTION": GUIDE, "VERSION": "1.0.0", "TAGS": TAGS},
)
swagger = SpectacularSwaggerView.as_view(url_name="app-schema", title=TITLE)
redoc = SpectacularRedocView.as_view(url_name="app-schema", title=TITLE)
