from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.safestring import mark_safe
from django.views.decorators.http import require_POST

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin
from apps.core.bos_access import ALL, CHAIN, bos_locations
from apps.core.exceptions import DomainError

from . import services
from .models import STAMPS_PER_REWARD, GiftCard, GiftCardActivity, LoyaltyActivity, LoyaltyCard


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


def stamp_dots(card):
    dots = format_html_join(
        "",
        '<span class="{}"></span>',
        ((("is-on" if i < card.stamps else ""),) for i in range(STAMPS_PER_REWARD)),
    )
    ready = card.stamps >= STAMPS_PER_REWARD
    return format_html(
        '<span class="bos-dots" title="{} of {} stamps">{}</span> <span class="bos-dots-count">'
        "{}/{}</span>{}",
        card.stamps,
        STAMPS_PER_REWARD,
        dots,
        card.stamps,
        STAMPS_PER_REWARD,
        mark_safe(' <span class="bos-tag bos-tone-good">Free coffee ready</span>') if ready else "",
    )


@admin.register(LoyaltyCard)
class LoyaltyCardAdmin(OperationsAdmin):
    # Any team member stamps a card at the counter (+1 stamp / Redeem); only the chain owner
    # types a number, to correct a card.
    view_roles = change_roles = ALL
    add_roles = ()
    list_display = (
        "customer",
        "counter",
        "card",
        "member_number",
        "wallet_pass_added",
        "updated_at",
    )
    list_display_links = ("customer",)
    search_fields = ("member_number", "user__email", "user__first_name", "user__last_name")
    inlines = (LoyaltyActivityInline,)
    change_form_template = "admin/bos_loyalty_form.html"
    description = (
        "One stamp per coffee: nine stamps and the 10th coffee is free. Use +1 stamp for each "
        "coffee and Redeem when the customer has their free one; the app updates straight away."
    )
    fieldsets = [
        (
            "Coffee card",
            {"fields": ("member_number", "user", "card", "stamps", "wallet_pass_added")},
        ),
        RECORD_FIELDS,
    ]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user")

    @admin.display(description="Customer", ordering="user__first_name")
    def customer(self, obj):
        name = obj.user.get_full_name()
        return (
            format_html('{}<br><small class="bos-muted">{}</small>', name, obj.user.email)
            if name
            else obj.user.email
        )

    @admin.display(description="Stamps", ordering="stamps")
    def card(self, obj):
        return stamp_dots(obj)

    @admin.display(description="At the counter")
    def counter(self, obj):
        full = obj.stamps >= STAMPS_PER_REWARD
        url = reverse(f"admin:loyalty_loyaltycard_{'redeem' if full else 'stamp'}", args=[obj.pk])
        return format_html(
            '<button type="submit" class="bos-btn bos-btn-sm{}" formaction="{}" formmethod="post"'
            " formnovalidate>{}</button>",
            " bos-btn-primary" if full else "",
            url,
            "Redeem free coffee" if full else "+1 stamp",
        )

    def get_fieldsets(self, request, obj=None):
        sets = super().get_fieldsets(request, obj)
        if self.bos_role(request) == CHAIN:
            return sets
        return [
            (name, {**opts, "fields": [f for f in opts["fields"] if f != "stamps"]})
            for name, opts in sets
        ]

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if "stamps" in form.base_fields:
            form.base_fields["stamps"].label = "Correct the count"
            form.base_fields[
                "stamps"
            ].help_text = "Only to fix a mistake (0–9). For a coffee bought, use +1 stamp below."
        return form

    def get_readonly_fields(self, request, obj=None):
        return (
            *super().get_readonly_fields(request, obj),
            "member_number",
            "user",
            "card",
            "wallet_pass_added",
        )

    def save_model(self, request, obj, form, change):
        before = LoyaltyCard.objects.get(pk=obj.pk).stamps if change else 0
        super().save_model(request, obj, form, change)
        services.record_stamp_change(obj, before, self.cafe_name(request))

    def cafe_name(self, request):
        cafe = bos_locations(request.user).first() if self.bos_role(request) != CHAIN else None
        return cafe.name if cafe else "In store"

    def get_urls(self):
        view = self.admin_site.admin_view
        return [
            path(
                "<uuid:object_id>/stamp/",
                view(require_POST(self.counter_view(services.add_stamp, "Stamp added"))),
                name="loyalty_loyaltycard_stamp",
            ),
            path(
                "<uuid:object_id>/redeem/",
                view(
                    require_POST(self.counter_view(services.redeem_reward, "Free coffee redeemed"))
                ),
                name="loyalty_loyaltycard_redeem",
            ),
        ] + super().get_urls()

    def counter_view(self, action, done):
        def view(request, object_id):
            card = self.get_object(request, str(object_id))
            if card is None:
                raise Http404
            if not self.has_change_permission(request, card):
                raise PermissionDenied
            try:
                card = action(card, request, self.cafe_name(request))
            except DomainError as exc:
                self.message_user(request, str(exc.detail), messages.WARNING)
            else:
                name = card.user.get_full_name() or card.user.email
                self.message_user(
                    request, f"{done} for {name}: {card.stamps} of {STAMPS_PER_REWARD} stamps."
                )
            back = request.POST.get("next") or request.META.get("HTTP_REFERER", "")
            if url_has_allowed_host_and_scheme(back, {request.get_host()}, request.is_secure()):
                return redirect(back)
            return redirect("admin:loyalty_loyaltycard_change", card.pk)

        return view

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id) if object_id else None
        chain = self.bos_role(request) == CHAIN
        context = {
            "card": obj,
            "full": obj is not None and obj.stamps >= STAMPS_PER_REWARD,
            "show_save": chain,
            "show_save_and_continue": chain,
        }
        return super().changeform_view(
            request, object_id, form_url, {**context, **(extra_context or {})}
        )


@admin.register(GiftCard)
class GiftCardAdmin(OperationsAdmin):
    # Money: only the chain owner may change a balance.
    view_roles = ALL
    add_roles = ()
    list_display = ("customer", "last4", "balance", "updated_at")
    list_display_links = ("customer",)
    search_fields = ("last4", "user__email", "user__first_name", "user__last_name")
    inlines = (GiftCardActivityInline,)
    description = "Mobile app gift card balances, in cents (2500 = $25.00). Raising a balance records a top-up the customer sees in the app."
    fieldsets = [("Gift card", {"fields": ("user", "last4", "balance_cents")}), RECORD_FIELDS]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user")

    customer = LoyaltyCardAdmin.customer

    @admin.display(description="Balance", ordering="balance_cents")
    def balance(self, obj):
        return f"${obj.balance_cents / 100:,.2f}"

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "user", "last4")

    def save_model(self, request, obj, form, change):
        before = GiftCard.objects.get(pk=obj.pk).balance_cents if change else 0
        super().save_model(request, obj, form, change)
        services.record_balance_change(obj, before)
