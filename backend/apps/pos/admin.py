from django import forms
from django.contrib import admin

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, ReadOnlyAdmin
from apps.core.admin_forms import AUDField
from apps.core.bos_access import ALL, OWNERS

from .models import CashShift, Promotion, TillTable, TillTransaction


def aud(cents):
    return "—" if cents is None else f"${cents / 100:,.2f}"


@admin.register(CashShift)
class CashShiftAdmin(ReadOnlyAdmin):
    view_roles = OWNERS
    location_lookup = "location"
    list_display = (
        "opened_label",
        "location",
        "terminal_id",
        "staff_name",
        "status",
        "float_amount",
        "counted",
        "variance",
    )
    list_filter = ("status", "location", "created_at")
    search_fields = ("reference", "staff_name", "terminal_id")
    date_hierarchy = "created_at"
    description = "Cash drawers opened and closed at the tills, with the count at close."
    fieldsets = [
        ("Shift", {"fields": ("reference", "location", "terminal_id", "staff_name", "status")}),
        (
            "Cash",
            {"fields": ("float_amount", "cash_sales", "cash_refunds", "moves", "opened_label")},
        ),
        (
            "Close",
            {
                "fields": (
                    "closed_label",
                    "closed_by",
                    "counted",
                    "expected",
                    "variance",
                    "approved_by",
                    "note",
                )
            },
        ),
    ]

    def get_readonly_fields(self, request, obj=None):
        return (
            *super().get_readonly_fields(request, obj),
            "float_amount",
            "cash_sales",
            "cash_refunds",
            "counted",
            "expected",
            "variance",
        )

    @admin.display(description="Float")
    def float_amount(self, obj):
        return aud(obj.float_cents)

    @admin.display(description="Cash sales")
    def cash_sales(self, obj):
        return aud(obj.cash_sales_cents)

    @admin.display(description="Cash refunds")
    def cash_refunds(self, obj):
        return aud(obj.cash_refunds_cents)

    @admin.display(description="Counted")
    def counted(self, obj):
        return aud(obj.counted_cents)

    @admin.display(description="Expected")
    def expected(self, obj):
        return aud(obj.expected_cents)

    @admin.display(description="Variance")
    def variance(self, obj):
        return aud(obj.variance_cents)


@admin.register(TillTransaction)
class TillTransactionAdmin(ReadOnlyAdmin):
    view_roles = OWNERS
    location_lookup = "location"
    list_display = ("occurred_at", "location", "kind", "amount", "order_number", "staff_name")
    list_filter = ("kind", "location", "occurred_at")
    search_fields = ("order_number", "reference", "staff_name")
    date_hierarchy = "occurred_at"
    description = "Every amount taken or returned at the tills, as the till recorded it."
    fields = (
        "occurred_at",
        "location",
        "kind",
        "amount",
        "gst",
        "order_number",
        "terminal_id",
        "staff_name",
        "reference",
    )

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "amount", "gst")

    @admin.display(description="Amount", ordering="amount_cents")
    def amount(self, obj):
        return aud(obj.amount_cents)

    @admin.display(description="GST")
    def gst(self, obj):
        return aud(obj.gst_cents)


@admin.register(TillTable)
class TillTableAdmin(OperationsAdmin):
    # Everyone sees their café's floor plan; café owners and the chain owner edit it.
    view_roles = ALL
    add_roles = change_roles = OWNERS
    location_lookup = "location"
    list_display = ("label", "location", "zone", "seats", "is_active", "sort_order")
    list_filter = ("location", "zone", "is_active")
    search_fields = ("label", "zone")
    list_editable = ("seats", "is_active", "sort_order")
    description = "The tables the tills offer for dine-in orders, per café."
    fieldsets = [
        ("Table", {"fields": ("location", "label", "zone", "seats", "sort_order", "is_active")}),
        RECORD_FIELDS,
    ]


class PromotionForm(forms.ModelForm):
    amount_cents = AUDField(label="Amount off (AUD)", min_value=0, required=False)

    class Meta:
        model = Promotion
        fields = "__all__"


@admin.register(Promotion)
class PromotionAdmin(OperationsAdmin):
    view_roles = OWNERS
    form = PromotionForm
    list_display = (
        "code",
        "label",
        "kind",
        "value",
        "location",
        "starts_on",
        "ends_on",
        "is_active",
    )
    list_filter = ("is_active", "kind", "location")
    search_fields = ("code", "label")
    description = (
        "Codes staff type at the till for a discount. Empty café = every café; "
        "leave the dates empty for no limit."
    )
    fieldsets = [
        ("Code", {"fields": ("code", "label", "is_active")}),
        ("Discount", {"fields": ("kind", "percent", "amount_cents")}),
        ("Where and when", {"fields": ("location", "starts_on", "ends_on")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="Off")
    def value(self, obj):
        return f"{obj.percent}%" if obj.kind == "pct" else aud(obj.amount_cents)
