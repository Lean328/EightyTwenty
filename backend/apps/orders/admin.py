from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from apps.core.admin_base import ReadOnlyAdmin, RoleAccessMixin
from apps.core.bos_access import ALL
from apps.core.exceptions import DomainError
from apps.core.templatetags.bos_admin import status_badge

from .models import Order, OrderAdjustment, OrderLine, OrderPayment
from .services import TRANSITIONS, transition_order

ACTION_LABELS = {
    "confirmed": "Accept order",
    "preparing": "Start preparing",
    "ready": "Mark as ready",
    "completed": "Complete",
    "declined": "Decline order",
}


def aud(cents):
    return f"${cents / 100:,.2f}"


class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False

    def get_readonly_fields(self, request, obj=None):
        return self.fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True


class OrderLineInline(ReadOnlyInline):
    model = OrderLine
    fields = ("qty", "name", "modifiers_label", "note", "unit_price")

    @admin.display(description="Unit price")
    def unit_price(self, obj):
        return aud(obj.unit_price_cents)


class PaymentInline(ReadOnlyInline):
    model = OrderPayment
    fields = ("method", "paid", "tip", "surcharge", "staff_name", "taken_at", "reference")
    verbose_name_plural = "Payments taken at the till"

    @admin.display(description="Amount")
    def paid(self, obj):
        return aud(obj.amount_cents)

    @admin.display(description="Tip")
    def tip(self, obj):
        return aud(obj.tip_cents)

    @admin.display(description="Surcharge")
    def surcharge(self, obj):
        return aud(obj.surcharge_cents)


class AdjustmentInline(ReadOnlyInline):
    model = OrderAdjustment
    fields = ("mode", "returned", "reason", "staff_name", "approver_name", "made_at")

    @admin.display(description="Returned")
    def returned(self, obj):
        return aud(obj.amount_cents)


@admin.register(Order)
class OrderAdmin(ReadOnlyAdmin):
    # Café owners and staff work their own cafés' orders; the order itself stays read-only.
    view_roles = change_roles = ALL
    location_lookup = "location"
    list_display = (
        "number",
        "channel",
        "contact_name",
        "location",
        "method",
        "when",
        "total",
        "order_status",
        "created_at",
    )
    list_filter = ("status", "channel", "location", "method", "created_at")
    search_fields = ("number", "contact_name", "contact_phone", "customer__email", "staff_name")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    inlines = (OrderLineInline, PaymentInline, AdjustmentInline)
    change_form_template = "admin/bos_order_form.html"
    description = (
        "Orders from the mobile app and the tills. Move app orders along as you work; the "
        "customer sees every step in the app. Till orders show where their prices differed "
        "from the menu."
    )
    fieldsets = [
        (
            "Order",
            {
                "fields": (
                    "number",
                    "channel",
                    "order_status",
                    "location",
                    "method",
                    "when",
                    "delivery_address",
                    "table_number",
                    "note",
                )
            },
        ),
        ("Check prices", {"fields": ("review_note",)}),
        ("Till", {"fields": ("terminal_id", "staff_name", "placed_at")}),
        ("Customer", {"fields": ("contact_name", "contact_phone", "customer")}),
        (
            "Payment",
            {
                "fields": (
                    "payment_label",
                    "money",
                    "stamps_earned",
                    "reward_redeemed",
                    "payment_reference",
                )
            },
        ),
        ("Handling history", {"fields": ("handled_by", "handled_at", "created_at", "updated_at")}),
    ]

    def has_change_permission(self, request, obj=None):
        return RoleAccessMixin.has_change_permission(self, request, obj)

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "order_status", "when", "money")

    def get_fieldsets(self, request, obj=None):
        sets = super().get_fieldsets(request, obj)
        if obj and obj.channel == "app":
            return [row for row in sets if row[0] not in ("Check prices", "Till")]
        if obj and not obj.review_note:
            return [row for row in sets if row[0] != "Check prices"]
        return sets

    @admin.display(description="Status", ordering="status")
    def order_status(self, obj):
        return status_badge(obj.status)

    @admin.display(description="When")
    def when(self, obj):
        return obj.scheduled_time.strftime("%I:%M %p").lstrip("0") if obj.scheduled_time else "ASAP"

    @admin.display(description="Total", ordering="total_cents")
    def total(self, obj):
        return aud(obj.total_cents)

    @admin.display(description="Amounts")
    def money(self, obj):
        parts = [f"Subtotal {aud(obj.subtotal_cents)}"]
        for label, cents, sign in [
            ("Discounts", obj.discount_cents, "−"),
            ("Delivery", obj.delivery_cents, "+"),
            ("Free coffee", obj.reward_cents, "−"),
            ("Card surcharge", obj.surcharge_cents, "+"),
            ("Gift card", obj.gift_card_cents, "−"),
        ]:
            if cents:
                parts.append(f"{label} {sign}{aud(cents)}")
        return " · ".join(parts) + f" · Total {aud(obj.total_cents)}"

    def get_urls(self):
        return [
            path(
                "<uuid:object_id>/transition/<str:status>/",
                self.admin_site.admin_view(require_POST(self.transition_view)),
                name="orders_order_transition",
            )
        ] + super().get_urls()

    def transition_view(self, request, object_id, status):
        obj = self.get_object(request, str(object_id))
        if obj is None:
            raise Http404
        if not self.has_change_permission(request, obj):
            raise PermissionDenied
        try:
            transition_order(obj, status, request)
        except (DomainError, KeyError):
            self.message_user(
                request,
                "This action is no longer available. Review the current status.",
                messages.WARNING,
            )
        else:
            self.message_user(request, f"Order {obj.number} is now {status}.")
        target = request.POST.get("next", "")
        if url_has_allowed_host_and_scheme(target, {request.get_host()}, request.is_secure()):
            return redirect(target)
        return redirect("admin:orders_order_change", obj.pk)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id) if object_id else None
        actions = [
            {
                "label": label,
                "url": reverse("admin:orders_order_transition", args=[obj.pk, status]),
                "primary": status == TRANSITIONS[obj.status][0],
                "danger": status == "declined",
            }
            for status, label in ACTION_LABELS.items()
            if obj and status in TRANSITIONS.get(obj.status, [])
        ]
        return super().changeform_view(
            request,
            object_id,
            form_url,
            {
                "order_actions": actions,
                "show_save": False,
                "show_save_and_continue": False,
                **(extra_context or {}),
            },
        )
