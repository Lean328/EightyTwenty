from django import forms
from django.contrib import admin

from apps.bookings.models import BookingRule
from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, OperationsInline
from apps.core.bos_access import ALL, CHAIN, OWNERS

from .models import Location, LocationImage, OpeningHours, SpecialHours


class LocationForm(forms.ModelForm):
    fulfilment_methods = forms.MultipleChoiceField(
        choices=[("pickup", "Pickup"), ("delivery", "Delivery"), ("dine_in", "Dine in")],
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )


class HoursForm(forms.ModelForm):
    weekday = forms.TypedChoiceField(
        choices=enumerate(
            ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        ),
        coerce=int,
    )


class OpeningHoursInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = OpeningHours
    form = HoursForm
    fields = ("weekday", "opens_at", "closes_at", "is_closed")
    ordering = ("weekday",)
    max_num = 7


class SpecialHoursInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = SpecialHours
    fields = ("date", "opens_at", "closes_at", "is_closed", "reason")
    ordering = ("-date",)


class LocationImageInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = LocationImage
    fields = ("asset", "position", "is_active")
    max_num = 3


class BookingRuleInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = BookingRule
    fields = (
        "is_enabled",
        "slot_minutes",
        "max_party_size",
        "max_covers_per_slot",
        "min_lead_minutes",
        "max_days_ahead",
    )
    max_num = 1


@admin.register(Location)
class LocationAdmin(OperationsAdmin):
    form = LocationForm
    view_roles = ALL
    change_roles = OWNERS
    location_lookup = "pk"
    # What only the chain owner decides: which cafés exist, are listed, and in what order.
    chain_fields = ("name", "status", "is_published", "is_flagship", "sort_order")
    list_display = ("name", "address", "status", "is_published", "is_flagship", "sort_order")
    list_filter = ("status", "is_published", "is_flagship")
    search_fields = ("name", "slug", "address")
    prepopulated_fields = {"slug": ("name",)}
    inlines = (OpeningHoursInline, SpecialHoursInline, BookingRuleInline, LocationImageInline)
    description = "Manage this location's public details, opening hours and reservation settings in one place."

    def get_readonly_fields(self, request, obj=None):
        fields = super().get_readonly_fields(request, obj)
        return fields if self.bos_role(request) == CHAIN else (*fields, *self.chain_fields)

    fieldsets = [
        (
            "Location details",
            {"fields": ("name", "slug", "subtitle", "address", "phone", "email", ("lat", "lng"))},
        ),
        (
            "Service & visibility",
            {
                "fields": (
                    "status",
                    "is_published",
                    "fulfilment_methods",
                    "external_order_url",
                    "is_flagship",
                    "is_gluten_free",
                    "is_limited_menu",
                    "sort_order",
                )
            },
        ),
        (
            "Customer messages",
            {"fields": ("note", "wait_text", "booking_label", "hours_text", "hours_short_text")},
        ),
        (
            "Mobile app",
            {
                "fields": ("area", "headline"),
                "description": "Short card label and the line on the app's Home featured card.",
            },
        ),
        RECORD_FIELDS,
    ]


@admin.register(OpeningHours)
class OpeningHoursAdmin(OperationsAdmin):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    location_lookup = "location"
    form = HoursForm
    list_display = ("location", "day", "opens_at", "closes_at", "is_closed")
    list_filter = ("location", "is_closed")
    autocomplete_fields = ("location",)
    fieldsets = [
        ("Weekly hours", {"fields": ("location", "weekday", "opens_at", "closes_at", "is_closed")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="Day", ordering="weekday")
    def day(self, obj):
        return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
            obj.weekday
        ]


@admin.register(SpecialHours)
class SpecialHoursAdmin(OperationsAdmin):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    location_lookup = "location"
    list_display = ("location", "date", "reason", "opens_at", "closes_at", "is_closed")
    list_filter = ("location", "is_closed", "date")
    autocomplete_fields = ("location",)


@admin.register(LocationImage)
class LocationImageAdmin(OperationsAdmin):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    location_lookup = "location"
    list_display = ("location", "asset", "position", "is_active")
    list_filter = ("location", "is_active")
    autocomplete_fields = ("location",)
