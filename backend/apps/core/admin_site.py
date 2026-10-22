from django.conf import settings
from django.contrib.admin import AdminSite
from django.contrib.admin.apps import AdminConfig
from django.db import DatabaseError, connection
from django.template.response import TemplateResponse
from django.urls import path, reverse

from .bos_access import ALL, CHAIN, OWNERS, ROLE_NAMES, bos_role, has_bos_access, scope_filter

# The sidebar, top to bottom, grouped by the job at hand rather than by Django
# app. Inline-only link tables (menu item ↔ modifier/dietary) are reached from
# their parent record and stay out of the menu.
NAVIGATION = (
    (None, (("index", "Overview", "home"), ("view:bos_reports", "Reports", "chart"))),
    (
        "Daily operations",
        (
            ("view:bos_schedule", "Schedule", "clipboard"),
            ("orders.order", "Orders", "bowl"),
            ("pos.cashshift", "Till shifts", "wallet"),
            ("pos.tilltransaction", "Till transactions", "list"),
            ("pos.promotion", "Promo codes", "tag"),
            ("bookings.booking", "Bookings", "calendar"),
            ("enquiries.enquiry", "Enquiries", "inbox"),
            ("bookings.bookingrule", "Booking rules", "settings"),
        ),
    ),
    (
        "Menu",
        (
            ("menu.menuitem", "Menu items", "utensils"),
            ("view:bos_availability", "Availability board", "toggle"),
            ("menu.category", "Categories", "layers"),
            ("menu.locationmenuitem", "Location overrides", "sliders"),
            ("menu.modifiergroup", "Modifier groups", "list"),
            ("menu.modifieroption", "Modifier options", "tag"),
            ("menu.dietarytag", "Dietary labels", "leaf"),
            ("enquiries.cateringpackage", "Catering packages", "package"),
        ),
    ),
    (
        "Locations",
        (
            ("locations.location", "Locations", "map-pin"),
            ("locations.openinghours", "Opening hours", "clock"),
            ("locations.specialhours", "Special hours", "calendar-off"),
            ("locations.locationimage", "Location photos", "camera"),
            ("pos.tilltable", "Tables", "grid"),
        ),
    ),
    (
        "Website",
        (
            ("cms.page", "Pages", "file-text"),
            ("cms.contentblock", "Content blocks", "grid"),
            ("cms.navigationitem", "Navigation", "compass"),
            ("cms.offer", "App offers", "megaphone"),
            ("cms.faq", "App FAQs", "message"),
            ("media.mediaasset", "Media library", "image"),
            ("core.sitesettings", "Site settings", "settings"),
        ),
    ),
    (
        "People",
        (
            ("accounts.user", "Team", "users"),
            ("view:bos_team", "Team by café", "store"),
            ("accounts.customer", "Customers", "star"),
            ("accounts.staffassignment", "Team assignments", "user-check"),
            ("accounts.customerprofile", "Customer profiles", "user"),
            ("loyalty.loyaltycard", "Coffee cards", "coffee"),
            ("loyalty.giftcard", "Gift cards", "wallet"),
        ),
    ),
    (
        "System",
        (
            ("view:bos_system", "System status", "activity"),
            ("notifications.emailmessage", "Email delivery", "mail"),
            ("notifications.pushdevice", "Push devices", "message"),
            ("core.auditlog", "Activity log", "history"),
        ),
    ),
)

# Roles that may open each workspace page (tables use their ModelAdmin rules).
VIEW_ROLES = {
    "bos_reports": OWNERS,
    "bos_schedule": ALL,
    "bos_availability": ALL,
    "bos_system": (CHAIN,),
    "bos_media_picker": OWNERS,
    "bos_profile": ALL,
    "bos_team": OWNERS,
}

# Which items carry a count of work waiting, and the SQL that feeds it.
BADGES = {
    "orders.order": ("orders_order", "status = 'received' AND channel = 'app'"),
    "bookings.booking": ("bookings_booking", "status = 'requested'"),
    "enquiries.enquiry": ("enquiries_enquiry", "status = 'new'"),
    "notifications.emailmessage": ("notifications_emailmessage", "status = 'failed'"),
}


def scoped_badge_counts(user, keys):
    """The same counts for a café owner or staff member, limited to their cafés."""
    from apps.bookings.models import Booking
    from apps.enquiries.models import Enquiry
    from apps.orders.models import Order

    counts = {}
    try:
        if "orders.order" in keys:
            counts["orders.order"] = Order.objects.filter(
                scope_filter(user), status="received", channel="app"
            ).count()
        if "bookings.booking" in keys:
            counts["bookings.booking"] = Booking.objects.filter(
                scope_filter(user), status="requested"
            ).count()
        if "enquiries.enquiry" in keys:
            counts["enquiries.enquiry"] = Enquiry.objects.filter(
                scope_filter(user), status="new"
            ).count()
    except DatabaseError:
        return {}
    return counts


def badge_counts(keys):
    """
    Every sidebar count in one round trip, or none at all.

    The chrome is drawn on every admin page, so the counts are scalar subqueries
    in a single SELECT. Not cached: a stale "3" next to an empty queue sends
    people looking. A failure leaves the menu without numbers, never broken.
    """
    keys = [key for key in keys if key in BADGES]
    if not keys:
        return {}
    sql = "SELECT " + ", ".join(
        f"(SELECT COUNT(*) FROM {BADGES[key][0]} WHERE {BADGES[key][1]})" for key in keys
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            row = cursor.fetchone()
    except DatabaseError:
        return {}
    return dict(zip(keys, row, strict=True))


class BOSAdminConfig(AdminConfig):
    default_site = "apps.core.admin_site.BOSAdminSite"


class BOSAdminSite(AdminSite):
    site_header = "EightyTwenty"
    site_title = "EightyTwenty BOS"
    index_title = "Overview"
    login_template = "admin/login.html"
    enable_nav_sidebar = False
    site_url = None

    def get_urls(self):
        from . import admin_views as views

        pages = [
            ("reports/", views.reports_view, "bos_reports"),
            ("schedule/", views.schedule_view, "bos_schedule"),
            ("availability/", views.availability_view, "bos_availability"),
            ("system/", views.system_view, "bos_system"),
            ("media-picker/", views.media_picker_view, "bos_media_picker"),
            ("profile/", views.profile_view, "bos_profile"),
            ("team/", views.team_view, "bos_team"),
        ]
        return [
            path(route, self.admin_view(factory(self)), name=name) for route, factory, name in pages
        ] + super().get_urls()

    def has_permission(self, request):
        return super().has_permission(request) and has_bos_access(request.user)

    def view_allowed(self, request, name):
        return bos_role(request.user) in VIEW_ROLES.get(name, (CHAIN,))

    def build_navigation(self, request):
        """Sections the user may open; an item appears exactly when its page would let them in."""
        allowed = {
            f"{model._meta.app_label}.{model._meta.model_name}": model
            for model, model_admin in self._registry.items()
            if model_admin.has_view_permission(request)
        }
        sections = []
        for title, entries in NAVIGATION:
            items = []
            for key, label, icon in entries:
                if key == "index":
                    url = reverse("admin:index")
                elif key.startswith("view:"):
                    if not self.view_allowed(request, key[5:]):
                        continue
                    url = reverse(f"admin:{key[5:]}")
                elif key in allowed:
                    url = reverse(f"admin:{key.replace('.', '_')}_changelist")
                else:
                    continue
                items.append({"key": key, "name": label, "url": url, "icon": icon})
            if items:
                sections.append({"title": title, "items": items})

        # Longest matching prefix wins, so a record's page lights its own table
        # rather than the overview at /, which prefixes everything.
        flat = [item for section in sections for item in section["items"]]
        matches = [
            item
            for item in flat
            if (
                request.path == item["url"]
                if item["key"] == "index"
                else request.path.startswith(item["url"])
            )
        ]
        active = max(matches, key=lambda item: len(item["url"]), default=None)
        keys = [item["key"] for item in flat]
        counts = (
            badge_counts(keys)
            if bos_role(request.user) == CHAIN
            else scoped_badge_counts(request.user, keys)
        )
        for item in flat:
            item["active"] = item is active
            item["badge"] = counts.get(item["key"]) or 0
        return sections

    def each_context(self, request):
        context = super().each_context(request)
        context["bos_navigation"] = (
            self.build_navigation(request) if self.has_permission(request) else []
        )
        context["bos_docs_url"] = "/api/docs/" if settings.DOCS_ENABLED else None
        role = bos_role(request.user)
        # What the signed-in role may reach, for links drawn outside the menu.
        context["bos_role"] = role
        context["bos_role_name"] = ROLE_NAMES.get(role, "")
        context["bos_can"] = {
            "reports": role in OWNERS,
            "system": role == CHAIN,
            "chain": role == CHAIN,
            "add_menu_item": role in OWNERS,
            "manage_hours": role in OWNERS,
            "team": role in OWNERS,
        }
        return context

    def index(self, request, extra_context=None):
        from .dashboard import dashboard_context

        context = {
            **self.each_context(request),
            **dashboard_context(request),
            "title": "Overview",
            "app_list": self.get_app_list(request),
            **(extra_context or {}),
        }
        request.current_app = self.name
        return TemplateResponse(request, self.index_template or "admin/index.html", context)
