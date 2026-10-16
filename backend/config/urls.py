from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter

from apps.accounts import pages as account_pages
from apps.accounts import views as accounts
from apps.bookings import views as bookings
from apps.cms import views as cms
from apps.core import operations
from apps.core import public_views as public
from apps.core import views as core
from apps.enquiries import views as enquiries
from apps.locations import views as locations
from apps.media import views as media
from apps.menu import views as menu

router = SimpleRouter(trailing_slash=False)
handler400 = "apps.core.views.bad_request"
handler403 = "apps.core.views.permission_denied"
handler404 = "apps.core.views.not_found"
handler500 = "apps.core.views.server_error"
for prefix, view in [
    ("locations", locations.LocationViewSet),
    ("location-images", locations.LocationImageViewSet),
    ("opening-hours", locations.OpeningHoursViewSet),
    ("special-hours", locations.SpecialHoursViewSet),
    ("categories", menu.CategoryViewSet),
    ("dietary-tags", menu.DietaryTagViewSet),
    ("menu-items", menu.MenuItemViewSet),
    ("location-menu-items", menu.LocationMenuItemViewSet),
    ("modifier-groups", menu.ModifierGroupViewSet),
    ("modifier-options", menu.ModifierOptionViewSet),
    ("menu-item-modifier-groups", menu.MenuItemModifierGroupViewSet),
    ("booking-rules", bookings.BookingRuleViewSet),
    ("bookings", bookings.BookingViewSet),
    ("catering-packages", enquiries.CateringPackageViewSet),
    ("enquiries", enquiries.EnquiryViewSet),
    ("pages", cms.PageViewSet),
    ("content-blocks", cms.ContentBlockViewSet),
    ("navigation", cms.NavigationViewSet),
    ("media", media.MediaAssetViewSet),
    ("users", accounts.UserViewSet),
    ("staff-assignments", accounts.StaffAssignmentViewSet),
    ("audit-logs", operations.AuditLogViewSet),
    ("email-messages", operations.EmailStatusViewSet),
]:
    router.register(prefix, view, basename=f"bos-{prefix}")

urlpatterns = [
    path("health", core.health, name="health"),
    path("robots.txt", core.robots),
    path("favicon.ico", core.favicon),
    re_path(r"^admin(?:/(?P<rest>.*))?$", core.legacy_admin),
    path("api/v1/public/bootstrap", public.BootstrapView.as_view()),
    path("api/v1/public/locations", public.PublicLocationsView.as_view()),
    path("api/v1/public/locations/<slug:slug>", public.PublicLocationView.as_view()),
    path("api/v1/public/categories", public.PublicCategoriesView.as_view()),
    path("api/v1/public/menu", public.PublicMenuView.as_view()),
    path("api/v1/public/catering-packages", public.PublicCateringView.as_view()),
    path("api/v1/public/settings", public.PublicSettingsView.as_view()),
    path("api/v1/public/version", public.PublicVersionView.as_view()),
    path("api/v1/public/pages/<slug:slug>", public.PublicPageView.as_view()),
    path("api/v1/public/bookings", bookings.PublicBookingView.as_view()),
    path("api/v1/public/bookings/availability", bookings.PublicAvailabilityView.as_view()),
    path("api/v1/public/enquiries", enquiries.PublicEnquiryView.as_view()),
    path("api/v1/auth/register", accounts.RegisterView.as_view()),
    path("api/v1/auth/login", accounts.LoginView.as_view()),
    path("api/v1/auth/refresh", accounts.RefreshView.as_view()),
    path("api/v1/auth/logout", accounts.LogoutView.as_view()),
    path("api/v1/auth/password/reset", accounts.PasswordResetView.as_view()),
    path("api/v1/auth/password/reset/confirm", accounts.ResetConfirmView.as_view()),
    path("api/v1/auth/verify-email", accounts.VerifyEmailView.as_view()),
    path("api/v1/auth/verify-email/request", accounts.VerificationRequestView.as_view()),
    path("api/v1/me", accounts.MeView.as_view()),
    path("api/v1/me/profile", accounts.CustomerProfileView.as_view()),
    path("api/v1/me/bookings", bookings.MyBookingsView.as_view()),
    path("api/v1/bos/settings", cms.SiteSettingsView.as_view()),
    path("api/v1/bos/media/upload-url", media.UploadURLView.as_view()),
    path(
        "api/v1/bos/locations/<slug:slug>/menu-items/bulk-availability",
        menu.BulkAvailabilityView.as_view(),
    ),
    path(
        "api/v1/bos/locations/<slug:slug>/menu-items/<slug:item_slug>",
        menu.AvailabilityView.as_view(),
    ),
    path("api/v1/bos/", include(router.urls)),
    # Customer mobile app (EightyTwentyMobile): its own contract, see docs/APP_API.md.
    path("api/v1/app/", include("apps.mobile.urls")),
    # Till (POS + kitchen display): its own contract, see apps/pos/guide.md.
    path("api/v1/pos/", include("apps.pos.urls")),
    path("account/reset-password", account_pages.reset_password, name="account_reset_password"),
    path("api/v1/jobs/retry-emails", operations.RetryEmailsView.as_view()),
    path("api/v1/jobs/cleanup", operations.CleanupView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
]
if settings.DOCS_ENABLED:
    from apps.mobile import docs as app_docs
    from apps.pos import docs as pos_docs

    urlpatterns += [
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
        # The mobile app developer's page: only /api/v1/app, with the guide on top.
        path("api/docs/app/", app_docs.swagger, name="app-docs"),
        path("api/docs/app/redoc/", app_docs.redoc, name="app-docs-redoc"),
        path("api/docs/app/schema/", app_docs.schema, name="app-schema"),
        # The till developer's page: /api/v1/pos plus login/refresh, with the guide on top.
        path("api/docs/pos/", pos_docs.swagger, name="pos-docs"),
        path("api/docs/pos/redoc/", pos_docs.redoc, name="pos-docs-redoc"),
        path("api/docs/pos/schema/", pos_docs.schema, name="pos-schema"),
    ]
urlpatterns += [
    # Unknown API paths answer in JSON; everything else is the BOS workspace at the root.
    re_path(r"^api/(?P<path>.*)$", core.api_not_found),
    path("", admin.site.urls),
]
