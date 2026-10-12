from django.contrib import admin

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin
from apps.core.bos_access import ALL, CHAIN, bos_locations

from . import services
from .models import GiftCard, GiftCardActivity, LoyaltyActivity, LoyaltyCard


class ActivityInline(admin.TabularInline):
    extra = 0
    can_delete = False
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True


class LoyaltyActivityInline(ActivityInline):
    model = LoyaltyActivity
    fields = readonly_fields = ("created_at", "type", "description", "location_name")


class GiftCardActivityInline(ActivityInline):
    model = GiftCardActivity
    fields = readonly_fields = (
        "created_at",
        "kind",
        "description",
        "amount_cents",
        "recipient_email",
    )


@admin.register(LoyaltyCard)
class LoyaltyCardAdmin(OperationsAdmin):
    # Any team member can stamp a card at the counter: search the member number, change stamps.
    view_roles = change_roles = ALL
    add_roles = ()
    list_display = ("member_number", "customer", "stamps", "wallet_pass_added", "updated_at")
    search_fields = ("member_number", "user__email", "user__first_name", "user__last_name")
    inlines = (LoyaltyActivityInline,)
    description = "Coffee cards from the mobile app: one stamp per coffee, nine stamps and the 10th coffee is free. Set stamps to 0 when the free coffee is redeemed at the counter."
    fieldsets = [
        ("Coffee card", {"fields": ("member_number", "user", "stamps", "wallet_pass_added")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="Customer", ordering="user__email")
    def customer(self, obj):
        return obj.user.email

    def get_readonly_fields(self, request, obj=None):
        return (
            *super().get_readonly_fields(request, obj),
            "member_number",
            "user",
            "wallet_pass_added",
        )

    def save_model(self, request, obj, form, change):
        before = LoyaltyCard.objects.get(pk=obj.pk).stamps if change else 0
        super().save_model(request, obj, form, change)
        cafe = bos_locations(request.user).first() if self.bos_role(request) != CHAIN else None
        services.record_stamp_change(obj, before, cafe.name if cafe else "In store")


@admin.register(GiftCard)
class GiftCardAdmin(OperationsAdmin):
    # Money: only the chain owner may change a balance.
    view_roles = ALL
    add_roles = ()
    list_display = ("customer", "last4", "balance", "updated_at")
    search_fields = ("last4", "user__email", "user__first_name", "user__last_name")
    inlines = (GiftCardActivityInline,)
    description = "Mobile app gift card balances, in cents (2500 = $25.00). Raising a balance records a top-up the customer sees in the app."
    fieldsets = [("Gift card", {"fields": ("user", "last4", "balance_cents")}), RECORD_FIELDS]

    @admin.display(description="Customer", ordering="user__email")
    def customer(self, obj):
        return obj.user.email

    @admin.display(description="Balance", ordering="balance_cents")
    def balance(self, obj):
        return f"${obj.balance_cents / 100:,.2f}"

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "user", "last4")

    def save_model(self, request, obj, form, change):
        before = GiftCard.objects.get(pk=obj.pk).balance_cents if change else 0
        super().save_model(request, obj, form, change)
        services.record_balance_change(obj, before)
