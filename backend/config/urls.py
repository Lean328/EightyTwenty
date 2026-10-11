from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter

from apps.accounts import views as accounts
from apps.bookings import views as bookings
from apps.cms import views as cms
from apps.core import operations
from apps.core import public_views as public
from apps.core.views import health
from apps.enquiries import views as enquiries
from apps.locations import views as locations
from apps.media import views as media
from apps.menu import views as menu

router = SimpleRouter(trailing_slash=False)
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
    path("health", health, name="health"),
    path("admin/", admin.site.urls),
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
    path("api/v1/jobs/retry-emails", operations.RetryEmailsView.as_view()),
    path("api/v1/jobs/cleanup", operations.CleanupView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
]
if settings.DOCS_ENABLED:
    urlpatterns.append(
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui")
    )
