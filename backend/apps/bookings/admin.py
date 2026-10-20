from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils import timezone
from django.utils.dateformat import format as date_format
from django.utils.dateformat import time_format
from django.utils.html import format_html
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from apps.core import admin_summary as ui
from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, ReadOnlyAdmin, RoleAccessMixin
from apps.core.bos_access import ALL, CHAIN, OWNERS, bos_role
from apps.core.exceptions import DomainError
from apps.core.templatetags.bos_admin import status_badge

from .models import Booking, BookingRule
from .services import TRANSITIONS, update_booking


@admin.register(BookingRule)
class BookingRuleAdmin(OperationsAdmin):
    view_roles = add_roles = change_roles = OWNERS
    location_lookup = "location"
    list_display = (
        "location",
        "is_enabled",
        "slot_minutes",
        "max_party_size",
        "max_covers_per_slot",
    )
    list_filter = ("is_enabled", "location")
    autocomplete_fields = ("location",)
    fieldsets = [
        (
            "Reservation rules",
            {
                "fields": (
                    "location",
                    "is_enabled",
                    "slot_minutes",
                    "max_party_size",
                    "max_covers_per_slot",
                    "min_lead_minutes",
                    "max_days_ahead",
                )
            },
        ),
        RECORD_FIELDS,
    ]


class WhenFilter(admin.SimpleListFilter):
    """Opening Bookings shows today and what is coming; any search, filter or link shows all."""

    title = "When"
    parameter_name = "when"
    QUIET = {"o", "p", "_changelist_filters"}

    def lookups(self, request, model_admin):
        return [
            ("upcoming", "Today & upcoming"),
            ("today", "Today"),
            ("past", "Past"),
            ("all", "All dates"),
        ]

    def value(self):
        return super().value() or ("upcoming" if self.landing else "all")

    def __init__(self, request, params, model, model_admin):
        self.landing = not (set(request.GET) - self.QUIET)
        super().__init__(request, params, model, model_admin)

    def choices(self, changelist):
        for lookup, title in self.lookup_choices:
            yield {
                "selected": self.value() == lookup,
                "query_string": changelist.get_query_string({self.parameter_name: lookup}),
                "display": title,
            }

    def queryset(self, request, queryset):
        today = timezone.localdate()
        return {
            "upcoming": queryset.filter(date__gte=today),
            "today": queryset.filter(date=today),
            "past": queryset.filter(date__lt=today),
        }.get(self.value(), queryset)


@admin.register(Booking)
class BookingAdmin(ReadOnlyAdmin):
    # Owners and staff handle their own cafés' reservations (the record itself stays read-only).
    view_roles = change_roles = ALL
    location_lookup = "location"
    list_display = (
        "guest",
        "when",
        "party",
        "location",
        "phone_link",
        "booking_status",
        "source",
        "reference",
    )
    list_display_links = ("guest",)
    list_filter = (WhenFilter, "status", "location", "source")
    search_fields = ("reference", "name", "email", "phone")
    ordering = ("date", "time")
    date_hierarchy = "date"
    actions = ("confirm_bookings", "decline_bookings")
    change_form_template = "admin/bos_booking_form.html"
    # The page shows a summary (summary() below), not the fields one by one.
    fieldsets = [(None, {"fields": ("reference",)})]

    def has_change_permission(self, request, obj=None):
        return RoleAccessMixin.has_change_permission(self, request, obj)

    @admin.display(description="Status", ordering="status")
    def booking_status(self, obj):
        return status_badge(obj.status)

    def get_ordering(self, request):
        # Today and upcoming: soonest first. Anything else: latest first.
        when = request.GET.get("when") or (
            "" if set(request.GET) - WhenFilter.QUIET else "upcoming"
        )
        return self.ordering if when in ("upcoming", "today") else ("-date", "-time")

    @admin.display(description="Guest", ordering="name")
    def guest(self, obj):
        return obj.name

    @admin.display(description="When", ordering="date")
    def when(self, obj):
        day = ui.relative_day(obj.date)
        label = day if day in ("Today", "Tomorrow", "Yesterday") else date_format(obj.date, "D j M")
        return format_html(
            '<span class="bos-when"><strong>{}</strong> {}</span>',
            label,
            time_format(obj.time, "g:i A"),
        )

    @admin.display(description="Guests", ordering="party_size")
    def party(self, obj):
        return obj.party_size

    @admin.display(description="Phone")
    def phone_link(self, obj):
        return (
            format_html('<a href="{}">{}</a>', ui.tel(obj.phone), obj.phone) if obj.phone else "—"
        )

    def summary(self, request, obj):
        source = {"web": "the website", "app": "the app", "staff": "the team"}[obj.source]
        account = (
            reverse("admin:accounts_customer_change", args=[obj.customer_id])
            if obj.customer_id and bos_role(request.user) == CHAIN
            else ""
        )
        guests = f"{obj.party_size} guest{'s' if obj.party_size != 1 else ''}"
        day = date_format(obj.date, "l j F Y")
        hour = time_format(obj.time, "g:i A")
        return {
            "hero": {
                "eyebrow": f"Booking · {obj.reference}",
                "title": obj.name,
                "chips": [status_badge(obj.status), ui.tag(f"From {source}")],
                "meta": [
                    {"icon": "calendar", "text": f"{day} · {hour}"},
                    {"icon": "users", "text": guests},
                    {"icon": "map-pin", "text": obj.location.name},
                ],
                "stat": {"label": ui.relative_day(obj.date), "value": hour, "sub": guests},
            },
            "contact": ui.contact(
                obj.phone, obj.email, f"Your EightyTwenty booking {obj.reference}"
            ),
            "guest": ui.facts(
                ("Name", obj.name, account),
                ("App account", "Yes" if obj.customer_id else ""),
            ),
            "reservation": ui.facts(
                ("Date", day),
                ("Time", hour),
                ("Party size", guests),
                ("Seating", obj.get_seating_display()),
                ("Café", obj.location.name),
                ("Reference", obj.reference),
            ),
            "notes": obj.notes,
            "timeline": ui.timeline(
                [ui.step(obj.created_at, f"Requested on {source}", obj.name, "warn")],
                ui.audit_steps(obj),
            ),
        }

    def get_urls(self):
        return [
            path(
                "<uuid:object_id>/transition/<str:status>/",
                self.admin_site.admin_view(require_POST(self.transition_view)),
                name="bookings_booking_transition",
            )
        ] + super().get_urls()

    def transition_view(self, request, object_id, status):
        obj = self.get_object(request, str(object_id))
        if obj is None:
            raise Http404
        if not self.has_change_permission(request, obj):
            raise PermissionDenied
        if status not in TRANSITIONS.get(obj.status, set()):
            self.message_user(
                request,
                "This action is no longer available. Review the current status.",
                messages.WARNING,
            )
        else:
            try:
                update_booking(obj, {"status": status}, request)
            except DomainError as exc:
                self.message_user(request, str(exc.detail), messages.ERROR)
            else:
                self.message_user(
                    request, f"Booking {obj.reference} is now {status.replace('_', ' ')}."
                )
        target = request.POST.get("next", "")
        if url_has_allowed_host_and_scheme(target, {request.get_host()}, request.is_secure()):
            return redirect(target)
        return redirect("admin:bookings_booking_change", obj.pk)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id) if object_id else None
        labels = {
            "confirmed": "Confirm booking",
            "declined": "Decline request",
            "cancelled": "Cancel booking",
            "seated": "Mark as seated",
            "no_show": "Mark as no-show",
        }
        actions = [
            {
                "label": label,
                "url": reverse("admin:bookings_booking_transition", args=[obj.pk, status]),
                "primary": status in {"confirmed", "seated"},
                "danger": status in {"declined", "cancelled", "no_show"},
            }
            for status, label in labels.items()
            if obj and status in TRANSITIONS.get(obj.status, set())
        ]
        return super().changeform_view(
            request,
            object_id,
            form_url,
            {
                "booking_actions": actions,
                "summary": self.summary(request, obj) if obj else None,
                "show_save": False,
                "show_save_and_continue": False,
                **(extra_context or {}),
            },
        )

    def _transition_selected(self, request, queryset, status):
        count = 0
        for booking in queryset.filter(status="requested"):
            try:
                update_booking(booking, {"status": status}, request)
                count += 1
            except DomainError as exc:
                self.message_user(request, f"{booking.reference}: {exc.detail}", messages.WARNING)
        self.message_user(request, f"{count} booking(s) {status}.")

    @admin.action(description="Confirm selected requested bookings")
    def confirm_bookings(self, request, queryset):
        self._transition_selected(request, queryset, "confirmed")

    @admin.action(description="Decline selected requested bookings")
    def decline_bookings(self, request, queryset):
        self._transition_selected(request, queryset, "declined")
