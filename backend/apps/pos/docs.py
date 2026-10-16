"""
The published docs page for the till (POS) developer: only /api/v1/pos, with the set-up guide
(guide.md) at the top and every endpoint's description and examples underneath.
"""

from pathlib import Path

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.accounts import views as accounts

TITLE = "EightyTwenty Till (POS) API"
GUIDE = Path(__file__).with_name("guide.md").read_text(encoding="utf-8")
TAGS = [
    {"name": "POS · Device & staff", "description": "The till's cafés and staff PIN sign-in."},
    {
        "name": "POS · Start-up & catalogue",
        "description": "The start-up snapshot, categories and menu.",
    },
    {
        "name": "POS · Orders & kitchen",
        "description": "Till orders, the order feed, status, kitchen display, tables.",
    },
    {"name": "POS · Payments & refunds", "description": "Tenders, refunds, voids, cancellations."},
    {"name": "POS · Cash & records", "description": "Cash shifts, transaction records, audit."},
    {
        "name": "POS · Customers & bookings",
        "description": "Customers, coffee cards, sold out, reservations, catering.",
    },
]

schema = SpectacularAPIView.as_view(
    urlconf=[
        path("api/v1/auth/login", accounts.LoginView.as_view()),
        path("api/v1/auth/refresh", accounts.RefreshView.as_view()),
        path("api/v1/pos/", include("apps.pos.urls")),
    ],
    custom_settings={"TITLE": TITLE, "DESCRIPTION": GUIDE, "VERSION": "1.0.0", "TAGS": TAGS},
)
swagger = SpectacularSwaggerView.as_view(url_name="pos-schema", title=TITLE)
redoc = SpectacularRedocView.as_view(url_name="pos-schema", title=TITLE)
