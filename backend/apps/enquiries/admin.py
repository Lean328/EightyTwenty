from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin
from apps.core.admin_forms import AUDField
from apps.core.bos_access import ALL, OWNERS
from apps.core.templatetags.bos_admin import status_badge
from apps.media.admin import ImageUploadForm, attach_upload, preview

from .models import CateringPackage, Enquiry

OPEN_STATUSES = {"new", "in_progress", "quoted"}


class CateringForm(ImageUploadForm):
    price_cents = AUDField(label="Price (AUD)", min_value=0)
    upload_folder = "catering"


@admin.register(CateringPackage)
class CateringAdmin(OperationsAdmin):
    view_roles = ALL
    form = CateringForm
    list_display = ("name", "price", "unit", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    fieldsets = [
        ("Package details", {"fields": ("name", "slug", "blurb", "price_cents", "unit", "items")}),
        ("Photo", {"fields": ("photo", "upload", "image", "image_position")}),
        ("Presentation", {"fields": ("sort_order", "is_active")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="Price · AUD", ordering="price_cents")
    def price(self, obj):
        return f"${obj.price_cents / 100:,.2f}"

    @admin.display(description="Current photo")
    def photo(self, obj):
        return preview(obj.image)

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "photo")

    def save_model(self, request, obj, form, change):
        asset = attach_upload(request, form, obj.name)
        if asset:
            obj.image = asset
        super().save_model(request, obj, form, change)


@admin.register(Enquiry)
class EnquiryAdmin(OperationsAdmin):
    view_roles = ALL
    change_roles = OWNERS
    location_lookup = "location"
    list_display = (
        "reference",
        "name",
        "kind_chip",
        "location",
        "progress",
        "assigned_to",
        "received",
        "waiting",
    )
    list_filter = ("status", "kind", "location")
    search_fields = ("reference", "name", "email", "company")
    ordering = ("-created_at",)
    autocomplete_fields = ("assigned_to",)
    description = (
        "Assign an owner, record follow-up notes and keep the enquiry's progress up to date."
    )
    fieldsets = [
        ("Follow-up", {"fields": ("status", "assigned_to", "internal_notes")}),
        (
            "Customer enquiry",
            {"fields": ("reference", "kind", "name", "email", "phone", "company", "message")},
        ),
        (
            "Event details",
            {"fields": ("location", "event_date", "headcount", "package", "payload")},
        ),
        RECORD_FIELDS,
    ]

    def has_add_permission(self, request):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [
            field.name
            for field in self.model._meta.fields
            if field.name not in {"status", "assigned_to", "internal_notes"}
        ]

    @admin.display(description="Status", ordering="status")
    def progress(self, obj):
        return status_badge(obj.status)

    @admin.display(description="Type", ordering="kind")
    def kind_chip(self, obj):
        tone = {"catering": "warn", "wholesale": "info", "contact": "live"}.get(obj.kind, "quiet")
        return format_html(
            '<span class="bos-tag bos-tone-{}">{}</span>', tone, obj.get_kind_display()
        )

    @admin.display(description="Received", ordering="created_at")
    def received(self, obj):
        return obj.created_at

    @admin.display(description="Waiting", ordering="created_at")
    def waiting(self, obj):
        """How long an open enquiry has waited; anything over two days is flagged."""
        if obj.status not in OPEN_STATUSES:
            return "—"
        age = timezone.now() - obj.created_at
        text = f"{age.days}d" if age.days else f"{age.seconds // 3600}h"
        tone = "bad" if age.days >= 2 else "warn" if age.days >= 1 else "quiet"
        return format_html('<span class="bos-tag bos-tone-{}">{}</span>', tone, text)
