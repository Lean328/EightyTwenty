import json

from django.contrib import admin
from django.shortcuts import redirect
from django.utils.html import format_html

from apps.cms.serializers import SiteSettingsSerializer

from .admin_base import RECORD_FIELDS, OperationsAdmin, ReadOnlyAdmin
from .admin_forms import ValidatedAdminForm
from .models import AuditLog, SiteSettings


class SiteSettingsForm(ValidatedAdminForm):
    serializer_class = SiteSettingsSerializer


@admin.register(SiteSettings)
class SiteSettingsAdmin(OperationsAdmin):
    form = SiteSettingsForm
    readonly_fields = (*OperationsAdmin.readonly_fields, "menu_version")
    description = "Brand details and shared content used by the website and mobile app."
    fieldsets = [
        ("Brand & contact", {"fields": ("brand_name", "contact_email", "announcement", "footer")}),
        ("Links & ordering", {"fields": ("social_links", "order_rules", "menu_version")}),
        RECORD_FIELDS,
    ]

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not SiteSettings.objects.exists()

    def changelist_view(self, request, extra_context=None):
        if not self.has_view_permission(request):
            return super().changelist_view(request, extra_context)
        obj = SiteSettings.objects.first()
        return (
            redirect("admin:core_sitesettings_change", obj.pk)
            if obj
            else redirect("admin:core_sitesettings_add")
        )


@admin.register(AuditLog)
class AuditLogAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "actor", "action", "entity_type", "entity_id")
    list_filter = ("action", "entity_type", "created_at")
    search_fields = ("actor__email", "entity_id", "entity_type")
    ordering = ("-created_at",)
    fieldsets = [
        (
            "Activity",
            {"fields": ("actor", "action", "entity_type", "entity_id", "created_at", "ip")},
        ),
        ("Change details", {"fields": ("before_detail", "after_detail")}),
    ]

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "before_detail", "after_detail")

    @admin.display(description="Before")
    def before_detail(self, obj):
        return format_html(
            '<pre class="bos-json-preview">{}</pre>',
            json.dumps(obj.before, indent=2, ensure_ascii=False),
        )

    @admin.display(description="After")
    def after_detail(self, obj):
        return format_html(
            '<pre class="bos-json-preview">{}</pre>',
            json.dumps(obj.after, indent=2, ensure_ascii=False),
        )
