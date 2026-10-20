from django.contrib import admin
from django.utils import timezone
from django.utils.dateformat import format as date_format
from django.utils.html import format_html

from apps.core import admin_summary as ui
from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin
from apps.core.admin_forms import AUDField
from apps.core.bos_access import ALL, OWNERS
from apps.core.templatetags.bos_admin import status_badge
from apps.media.admin import ImageUploadForm, attach_upload, preview

from .models import CateringPackage, Enquiry

OPEN_STATUSES = {"new", "in_progress", "quoted"}
# Extra answers the app and the tills send with a catering enquiry (Enquiry.payload).
PAYLOAD_LABELS = {
    "occasion": "Occasion",
    "time": "Time",
    "eventLocation": "Event location",
    "fulfil": "Pickup or delivery",
    "address": "Address",
    "contact": "On-the-day contact",
    "dietary": "Dietary needs",
    "quote": "Quoted (AUD)",
}
SOURCES = {"app": "the app", "pos": "a till", "web": "the website"}


def waited(obj):
    """How long an enquiry has waited, and its tone: anything over two days is flagged."""
    age = timezone.now() - obj.created_at
    text = f"{age.days}d" if age.days else f"{age.seconds // 3600}h"
    return text, "bad" if age.days >= 2 else "warn" if age.days >= 1 else "quiet"


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
    change_form_template = "admin/bos_enquiry_form.html"
    # What the customer sent shows as a summary (summary() below); only follow-up is a form.
    fieldsets = [("Follow-up", {"fields": ("status", "assigned_to", "internal_notes")})]

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id) if object_id else None
        context = {"summary": self.summary(request, obj) if obj else None}
        return super().changeform_view(
            request, object_id, form_url, {**context, **(extra_context or {})}
        )

    def summary(self, request, obj):
        payload = obj.payload or {}
        source = SOURCES.get(payload.get("source"), "the website")
        extra = []
        for key, value in payload.items():
            if key == "source" or value in ("", None, [], 0):
                continue
            if isinstance(value, list):
                value = ", ".join(str(item) for item in value)
            label = PAYLOAD_LABELS.get(key, key.replace("_", " ").capitalize())
            extra.append((label, str(value).capitalize() if key == "fulfil" else value))
        details = ui.facts(
            ("Café", obj.location.name if obj.location else ""),
            ("Event date", date_format(obj.event_date, "D j M Y") if obj.event_date else ""),
            ("Guests", obj.headcount),
            ("Package", obj.package.name if obj.package else ""),
            *extra,
        )
        return {
            "hero": {
                "eyebrow": f"{obj.get_kind_display()} enquiry · {obj.reference}",
                "title": obj.name,
                "chips": [
                    status_badge(obj.status),
                    ui.tag(obj.get_kind_display()),
                    *(
                        [ui.tag("Waiting " + waited(obj)[0], waited(obj)[1])]
                        if obj.status in OPEN_STATUSES
                        else []
                    ),
                ],
                "meta": [
                    *([{"icon": "store", "text": obj.company}] if obj.company else []),
                    {"icon": "calendar", "text": f"Received {ui.moment(obj.created_at)}"},
                ],
                "stat": {
                    "label": "Event",
                    "value": date_format(obj.event_date, "j M"),
                    "sub": f"{obj.headcount} guests" if obj.headcount else "",
                }
                if obj.event_date
                else None,
            },
            "message": obj.message,
            "contact": ui.contact(
                obj.phone, obj.email, f"Re: your EightyTwenty enquiry {obj.reference}"
            ),
            "details_title": "Event" if obj.kind == "catering" else "Details",
            "details": details or ui.facts(("Type", obj.get_kind_display())),
            "people": ui.facts(
                ("Name", obj.name),
                ("Company", obj.company),
                ("Email", obj.email, f"mailto:{obj.email}" if obj.email else ""),
                ("Phone", obj.phone, ui.tel(obj.phone)),
                ("Assigned to", ui.person(obj.assigned_to)),
            ),
            "timeline": ui.timeline(
                [ui.step(obj.created_at, f"Sent from {source}", obj.name, "warn")],
                ui.audit_steps(obj),
            ),
        }

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
        return ui.tag(*waited(obj))
