from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from apps.core import admin_summary as ui
from apps.core.admin_base import ReadOnlyAdmin, RoleAccessMixin
from apps.core.bos_access import ALL, CHAIN, bos_role
from apps.core.exceptions import DomainError
from apps.core.templatetags.bos_admin import status_badge

from .models import Order
from .services import TRANSITIONS, transition_order

ACTION_LABELS = {
    "confirmed": "Accept order",
    "preparing": "Start preparing",
    "ready": "Mark as ready",
    "completed": "Complete",
    "declined": "Decline order",
}


@admin.register(Order)
class OrderAdmin(ReadOnlyAdmin):
    # Café owners and staff work their own cafés' orders; the order itself stays read-only.
    view_roles = change_roles = ALL
    location_lookup = "location"
    list_display = (
        "number",
        "who",
        "items",
        "location",
        "channel",
        "when",
        "total",
        "order_status",
        "created_at",
    )
    list_filter = ("status", "channel", "location", "method", "created_at")
    search_fields = ("number", "contact_name", "contact_phone", "customer__email", "staff_name")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    change_form_template = "admin/bos_order_form.html"
    # The page shows a summary (summary() below), not the fields one by one.
    fieldsets = [(None, {"fields": ("number",)})]

    def has_change_permission(self, request, obj=None):
        return RoleAccessMixin.has_change_permission(self, request, obj)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("location").prefetch_related("lines")

    @admin.display(description="Customer", ordering="contact_name")
    def who(self, obj):
        if obj.contact_name:
            return obj.contact_name
        return f"Table {obj.table_number}" if obj.table_number else "Walk-in"

    @admin.display(description="Items")
    def items(self, obj):
        lines = [line for line in obj.lines.all() if line.qty]
        shown = ", ".join(
            f"{line.qty}× {line.name}" if line.qty > 1 else line.name for line in lines[:3]
        )
        more = f" +{len(lines) - 3} more" if len(lines) > 3 else ""
        return format_html('<span class="bos-items">{}{}</span>', shown, more) if lines else "—"

    @admin.display(description="Status", ordering="status")
    def order_status(self, obj):
        return status_badge(obj.status)

    @admin.display(description="When")
    def when(self, obj):
        return obj.scheduled_time.strftime("%I:%M %p").lstrip("0") if obj.scheduled_time else "ASAP"

    @admin.display(description="Total", ordering="total_cents")
    def total(self, obj):
        return ui.aud(obj.total_cents)

    def summary(self, request, obj):
        lines = list(obj.lines.order_by("position"))
        payments = list(obj.payments.order_by("created_at"))
        adjustments = list(obj.adjustments.order_by("created_at"))
        till = obj.channel == Order.Channel.POS
        count = sum(line.qty for line in lines)
        where = f"Table {obj.table_number}" if obj.table_number else obj.get_method_display()
        meta = [
            {"icon": "map-pin", "text": obj.location.name},
            {"icon": "clock", "text": f"{where} · {self.when(obj)}"},
            {"icon": "calendar", "text": ui.moment(obj.placed_at or obj.created_at)},
        ]
        totals = [{"label": "Subtotal", "value": ui.aud(obj.subtotal_cents)}]
        for row in obj.discounts or []:
            totals.append(
                {"label": row.get("label") or "Discount", "value": f"−${row.get('amount', 0):,.2f}"}
            )
        if obj.discount_cents and not obj.discounts:
            totals.append({"label": "Discounts", "value": f"−{ui.aud(obj.discount_cents)}"})
        for label, cents, sign in [
            ("Delivery", obj.delivery_cents, ""),
            ("Free coffee", obj.reward_cents, "−"),
            ("Card surcharge", obj.surcharge_cents, ""),
            ("Gift card", obj.gift_card_cents, "−"),
        ]:
            if cents:
                totals.append({"label": label, "value": f"{sign}{ui.aud(cents)}"})
        totals.append({"label": "Total", "value": ui.aud(obj.total_cents), "strong": True})

        customer = obj.customer
        name = obj.contact_name or ui.person(customer)
        account = (
            reverse("admin:accounts_customer_change", args=[customer.pk])
            if customer and bos_role(request.user) == CHAIN
            else ""
        )
        people = ui.facts(
            ("Name", name, account),
            ("Deliver to", obj.delivery_address),
            ("Served by", obj.staff_name),
            ("Till", obj.terminal_id),
        )
        steps = [
            ui.step(
                obj.placed_at or obj.created_at,
                "Rung up at the till" if till else "Placed in the app",
                obj.staff_name if till else name,
                "info",
            )
        ]
        steps += [ui.step(ui.parse_at(row.get("at")), row.get("what", "")) for row in obj.history]
        steps += [
            ui.step(p.created_at, f"Paid {ui.aud(p.amount_cents)} by {p.get_method_display().lower()}",
                    p.staff_name, "good")
            for p in payments
        ]  # fmt: skip
        steps += [
            ui.step(a.created_at, f"{a.get_mode_display()} {ui.aud(a.amount_cents)}", a.staff_name,
                    "bad")
            for a in adjustments
        ]  # fmt: skip
        return {
            "hero": {
                "eyebrow": f"{'Till' if till else 'App'} order",
                "title": obj.number,
                "chips": [status_badge(obj.status), ui.tag(obj.get_method_display())],
                "meta": meta,
                "stat": {
                    "label": "Total",
                    "value": ui.aud(obj.total_cents),
                    "sub": f"{count} item{'s' if count != 1 else ''}",
                },
            },
            "review_note": obj.review_note,
            "item_count": count,
            "lines": [
                {
                    "qty": line.qty,
                    "name": line.name,
                    "options": line.modifiers_label,
                    "note": line.note,
                    "total": ui.aud(line.qty * line.unit_price_cents)
                    if line.qty
                    else ui.aud(line.unit_price_cents),
                    "voided": not line.qty,
                }
                for line in lines
            ],
            "totals": totals,
            "note": obj.note,
            "people_title": "Customer" if name or not till else "At the till",
            "contact": ui.contact(
                obj.contact_phone or getattr(customer, "phone", ""),
                getattr(customer, "email", ""),
                f"Your EightyTwenty order {obj.number}",
            ),
            "people": people,
            "payments": [
                {
                    "title": p.get_method_display()
                    + (f" ·· {p.gift_last4}" if p.gift_last4 else ""),
                    "meta": " · ".join(
                        part
                        for part in (
                            p.taken_at,
                            p.staff_name,
                            f"tip {ui.aud(p.tip_cents)}" if p.tip_cents else "",
                            f"surcharge {ui.aud(p.surcharge_cents)}" if p.surcharge_cents else "",
                        )
                        if part
                    ),
                    "amount": ui.aud(p.amount_cents),
                }
                for p in payments
            ],
            "payment": ui.facts(
                ("Paid with", obj.payment_label or obj.get_payment_choice_display()),
                ("Reference", obj.payment_reference),
                ("Stamps earned", obj.stamps_earned or ""),
                ("Free coffee used", "Yes" if obj.reward_redeemed else ""),
            ),
            "adjustments": [
                {
                    "title": a.get_mode_display() + (f" · {a.reason}" if a.reason else ""),
                    "meta": " · ".join(
                        part
                        for part in (
                            a.made_at,
                            a.staff_name,
                            f"approved by {a.approver_name}" if a.approver_name else "",
                        )
                        if part
                    ),
                    "amount": ui.aud(a.amount_cents),
                }
                for a in adjustments
            ],
            "timeline": ui.timeline(steps, ui.audit_steps(obj)),
        }

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
                "summary": self.summary(request, obj) if obj else None,
                "show_save": False,
                "show_save_and_continue": False,
                **(extra_context or {}),
            },
        )
