from django.contrib import admin

from apps.core.admin_base import ReadOnlyAdmin
from apps.core.templatetags.bos_admin import status_badge

from .models import EmailMessage


@admin.register(EmailMessage)
class EmailMessageAdmin(ReadOnlyAdmin):
    list_display = ("subject", "recipient", "delivery_status", "attempts", "created_at", "sent_at")
    list_filter = ("status", "created_at")
    search_fields = ("recipient", "subject")
    ordering = ("-created_at",)
    description = "Delivery history for automated customer emails. The background worker handles sending and retries."
    fieldsets = [
        ("Message", {"fields": ("recipient", "subject", "body")}),
        (
            "Delivery",
            {
                "fields": (
                    "status",
                    "attempts",
                    "next_attempt_at",
                    "sent_at",
                    "last_error",
                    "dedup_key",
                    "created_at",
                )
            },
        ),
    ]

    @admin.display(description="Delivery", ordering="status")
    def delivery_status(self, obj):
        return status_badge(obj.status)
