from django import forms
from django.contrib import admin
from django.contrib.admin.views.main import ChangeList
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.db.models import Count, Q, Sum
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.dateformat import format as date_format
from django.utils.html import format_html, format_html_join

from apps.bookings.models import Booking
from apps.core import admin_summary as ui
from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, OperationsInline
from apps.core.admin_widgets import BOS_FORMFIELD_OVERRIDES
from apps.core.bos_access import CHAIN, MANAGER, OWNERS, bos_location_ids, bos_locations, bos_role
from apps.core.services import audit, snapshot
from apps.enquiries.models import Enquiry
from apps.locations.models import Location
from apps.loyalty.models import STAMPS_PER_REWARD, GiftCard, LoyaltyCard
from apps.orders.models import Order
from apps.pos import pins

from .models import Customer, CustomerProfile, StaffAssignment, User

TEAM_ROLES = ("manager", "staff")
# Roles the chain owner hands out here. "owner"/"admin" are chain-wide roles for the
# REST API only; they show only on an account that already has one (e.g. the superuser).
CHAIN_ROLE_CHOICES = [
    ("manager", "Café owner"),
    ("staff", "Staff"),
    ("customer", "Customer"),
]
API_ROLE_LABELS = {"owner": "Chain owner (API)", "admin": "Head office (API)"}


class TillPinMixin(forms.Form):
    """A write-only 4-digit PIN for the tills (stored hashed, see apps.pos.pins)."""

    till_pin = forms.CharField(
        label="Till PIN",
        required=False,
        max_length=4,
        widget=forms.PasswordInput(render_value=False, attrs={"inputmode": "numeric"}),
        help_text="4 digits to sign in at the tills, different for everyone. Leave empty to keep it.",
    )
    clear_till_pin = forms.BooleanField(label="Remove till PIN", required=False)

    def init_till_pin(self):
        if self.instance.pk and self.instance.pos_pin:
            self.fields[
                "till_pin"
            ].help_text = "A PIN is set. Type 4 new digits to change it, or tick Remove till PIN."

    def clean_till_pin(self):
        pin = self.cleaned_data.get("till_pin", "").strip()
        if pin:
            try:
                pins.set_pin(self.instance, pin)
            except ValueError as exc:
                raise forms.ValidationError(str(exc)) from exc
        return pin

    def apply_till_pin(self, user):
        if self.cleaned_data.get("clear_till_pin") or user.role == "customer":
            user.pos_pin = ""
        elif self.cleaned_data.get("till_pin"):
            pins.set_pin(user, self.cleaned_data["till_pin"])


class CreateUserForm(TillPinMixin, AdminUserCreationForm):
    locations = forms.ModelMultipleChoiceField(
        queryset=Location.objects.none(),
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label="Cafés",
        help_text="Where this person works. Café owners and staff only see these cafés.",
    )

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "phone", "role"]

    def clean(self):
        data = super().clean()
        if data.get("role", "staff") in TEAM_ROLES and not data.get("locations"):
            self.add_error("locations", "Choose at least one café.")
        return data


class PasswordSummaryWidget(forms.Widget):
    """States whether a password is set and where to change it, instead of the hash parameters."""

    template_name = "admin/widgets/password_summary.html"
    read_only = True

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context["widget"]["has_password"] = bool(value) and not str(value).startswith("!")
        return context

    def render(self, name, value, attrs=None, renderer=None):
        # The project engine, not the form renderer, holds templates/admin/.
        return render_to_string(self.template_name, self.get_context(name, value, attrs))

    def id_for_label(self, id_):
        return None


class ChangeUserForm(TillPinMixin, UserChangeForm):
    password = forms.Field(
        label="Password", required=False, disabled=True, widget=PasswordSummaryWidget
    )

    class Meta:
        model = User
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password"].help_text = ""
        self.init_till_pin()


class AssignmentInline(OperationsInline):
    """The cafés a person works at; a café owner only sees and adds their own cafés."""

    model = StaffAssignment
    fk_name = "user"
    fields = ("location", "is_active")
    show_change_link = False
    verbose_name = "café"
    verbose_name_plural = "Cafés"
    view_roles = add_roles = change_roles = OWNERS

    def get_queryset(self, request):
        qs = super().get_queryset(request).select_related("location")
        ids = bos_location_ids(request.user)
        return qs if ids is None else qs.filter(location__in=ids)


def customer_summary(user):
    """What a customer has with us: coffee card, gift card, orders, bookings and enquiries."""
    card = LoyaltyCard.objects.filter(user=user).first()
    gift = GiftCard.objects.filter(user=user).first()
    profile = CustomerProfile.objects.filter(user=user).select_related("preferred_location").first()
    orders = Order.objects.filter(customer=user, channel=Order.Channel.APP)
    done = orders.filter(status=Order.Status.COMPLETED).aggregate(
        spent=Sum("total_cents"), count=Count("id")
    )
    name = user.get_full_name() or user.email
    return {
        "hero": {
            "eyebrow": "Customer",
            "title": name,
            "chips": [
                ui.chip("Can sign in", "good") if user.is_active else ui.chip("Locked", "bad"),
                ui.tag("Email verified" if user.email_verified else "Email not verified"),
                *([ui.tag("Gets offers", "info")] if user.marketing_opt_in else []),
            ],
            "meta": [
                *ui.contact(user.phone, user.email),
                {"icon": "calendar", "text": f"Joined {date_format(user.date_joined, 'j M Y')}"},
            ],
            "stat": {
                "label": "Spent in the app",
                "value": ui.aud(done["spent"]),
                "sub": f"{done['count']} completed order{'s' if done['count'] != 1 else ''}",
            },
        },
        "email": user.email,
        "card": card,
        "stamps": [i < (card.stamps if card else 0) for i in range(STAMPS_PER_REWARD)],
        "gift": gift,
        "gift_balance": ui.aud(gift.balance_cents if gift else 0),
        "profile": ui.facts(
            ("Favourite café", getattr(profile and profile.preferred_location, "name", "")),
            (
                "Birthday",
                date_format(profile.birthday, "j F") if profile and profile.birthday else "",
            ),
            ("Last sign-in", ui.moment(user.last_login)),
            ("Notes", profile.notes if profile else ""),
        ),
        "order_count": orders.count(),
        "orders": orders.select_related("location").order_by("-created_at")[:5],
        "bookings": Booking.objects.filter(customer=user)
        .select_related("location")
        .order_by("-date", "-time")[:5],
        "enquiries": Enquiry.objects.filter(customer=user).order_by("-created_at")[:3],
    }


class TeamRoleFilter(admin.SimpleListFilter):
    title = "role"
    parameter_name = "team_role"

    def lookups(self, request, model_admin):
        if bos_role(request.user) == CHAIN:
            return [("chain", "Chain owner"), ("manager", "Café owner"), ("staff", "Staff")]
        return [("staff", "Staff")]

    def queryset(self, request, queryset):
        if self.value() == "chain":
            return queryset.filter(is_superuser=True)
        if self.value() in TEAM_ROLES:
            return queryset.filter(role=self.value(), is_superuser=False)
        return queryset


class CafeFilter(admin.SimpleListFilter):
    title = "café"
    parameter_name = "cafe"

    def lookups(self, request, model_admin):
        return [(c.pk, c.name) for c in bos_locations(request.user).order_by("sort_order", "name")]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(
                assignments__location=self.value(), assignments__is_active=True
            ).distinct()
        return queryset


def team_summary(user, request):
    """Who this team member is and where they work, above the edit form."""
    from apps.core.admin_views import ROLE_ACCESS

    role = CHAIN if user.is_superuser else user.role
    role_name = {CHAIN: "Chain owner", "manager": "Café owner", "staff": "Staff"}.get(
        role, API_ROLE_LABELS.get(role, user.get_role_display())
    )
    visible = bos_location_ids(request.user)
    assignments = [
        a
        for a in user.assignments.select_related("location").order_by("location__sort_order")
        if visible is None or a.location_id in visible
    ]
    active_cafes = [a.location for a in assignments if a.is_active]
    return {
        "hero": {
            "eyebrow": "Team member",
            "title": user.get_full_name() or user.email,
            "chips": [
                ui.chip(
                    role_name, "info" if role == CHAIN else "good" if role == "manager" else "quiet"
                ),
                ui.chip("Can sign in", "good") if user.is_active else ui.chip("Locked", "bad"),
                *([ui.tag("Till PIN set")] if user.pos_pin else []),
            ],
            "meta": [
                *ui.contact(user.phone, user.email),
                {"icon": "clock", "text": f"Last sign-in {ui.moment(user.last_login) or 'never'}"},
            ],
            "stat": {
                "label": "Works at",
                "value": "All cafés" if user.is_superuser else str(len(active_cafes)),
                "sub": "" if user.is_superuser else ("café" if len(active_cafes) == 1 else "cafés"),
            },
        },
        "assignments": assignments,
        "access": ROLE_ACCESS.get(role, ()),
        "access_title": (
            "What staff can do" if role == "staff" else f"What a {role_name.lower()} can do"
        ),
        "role_name": role_name,
        "joined": user.date_joined,
        "has_password": user.has_usable_password(),
    }


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    change_form_template = "admin/bos_user_form.html"
    formfield_overrides = BOS_FORMFIELD_OVERRIDES
    list_per_page = 25
    actions = None
    add_form = CreateUserForm
    form = ChangeUserForm
    inlines = (AssignmentInline,)
    ordering = ["first_name", "last_name", "email"]
    list_display = ["full_name", "email", "team_role", "cafes", "status", "last_seen"]
    list_display_links = ["full_name"]
    search_fields = ["email", "first_name", "last_name", "phone"]
    list_filter = [TeamRoleFilter, CafeFilter, "is_active"]

    def get_changelist(self, request, **kwargs):
        return TeamChangeList

    def changelist_view(self, request, extra_context=None):
        context = {
            "list_title": "Team",
            "list_links": [
                {"label": "Team by café", "icon": "store", "url": reverse("admin:bos_team")}
            ],
        }
        return super().changelist_view(request, {**context, **(extra_context or {})})

    @admin.display(description="Status", ordering="is_active")
    def status(self, obj):
        return ui.chip("Can sign in", "good") if obj.is_active else ui.chip("Locked", "bad")

    @admin.display(description="Last sign-in", ordering="last_login")
    def last_seen(self, obj):
        return ui.moment(obj.last_login) or "Never"

    @admin.display(description="Name", ordering="first_name")
    def full_name(self, obj):
        return obj.get_full_name() or obj.email

    @admin.display(description="Role", ordering="role")
    def team_role(self, obj):
        if obj.is_superuser:
            return ui.chip("Chain owner", "info")
        label = dict(CHAIN_ROLE_CHOICES).get(obj.role) or API_ROLE_LABELS.get(obj.role, obj.role)
        return ui.chip(label, "good" if obj.role == "manager" else "quiet")

    # --- who may do what -------------------------------------------------
    def manages(self, request, obj):
        """A café owner manages staff (never owners or the chain) at one of their cafés."""
        if bos_role(request.user) == CHAIN:
            return True
        return (
            obj.role == "staff"
            and not obj.is_superuser
            and obj.assignments.filter(location__in=bos_location_ids(request.user)).exists()
        )

    def get_queryset(self, request):
        qs = super().get_queryset(request).prefetch_related("assignments__location")
        role = bos_role(request.user)
        if role == CHAIN:
            return qs
        if role == MANAGER:
            return qs.filter(
                role="staff",
                is_superuser=False,
                assignments__location__in=bos_location_ids(request.user),
            ).distinct()
        return qs.none()

    def has_module_permission(self, request):
        return bos_role(request.user) in OWNERS

    def has_view_permission(self, request, obj=None):
        return bos_role(request.user) in OWNERS and (obj is None or self.manages(request, obj))

    def has_change_permission(self, request, obj=None):
        return self.has_view_permission(request, obj)

    def has_add_permission(self, request):
        return bos_role(request.user) in OWNERS

    def has_delete_permission(self, request, obj=None):
        return False

    # --- forms ------------------------------------------------------------
    def get_fieldsets(self, request, obj=None):
        chain = bos_role(request.user) == CHAIN
        if obj is None:
            fields = ["email", "first_name", "last_name", "phone", "password1", "password2"]
            fields += ["role", "locations"] if chain else ["locations"]
            return [("Create a person", {"fields": [*fields, "till_pin"]})]
        profile = ["first_name", "last_name", "phone"]
        access = ["is_active"]
        if chain:
            profile += ["marketing_opt_in", "email_verified"]
            access = ["role", "is_active", "is_superuser"]
        sets = [
            ("Sign-in", {"fields": ["email", "password"]}),
            ("Profile", {"fields": profile}),
            ("Access", {"fields": access}),
        ]
        if obj.role != "customer" or obj.is_superuser:
            sets.append(("Till", {"fields": ["till_pin", "clear_till_pin"]}))
        return sets

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj))
        if obj and bos_role(request.user) != CHAIN:
            # Locking the account would also lock them out of a café run by someone else.
            elsewhere = obj.assignments.filter(is_active=True).exclude(
                location__in=bos_location_ids(request.user)
            )
            if elsewhere.exists():
                fields.append("is_active")
        return fields

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        chain = bos_role(request.user) == CHAIN
        cafes = bos_locations(request.user)

        class ScopedForm(form):
            def __init__(self, *args, **kw):
                super().__init__(*args, **kw)
                if "locations" in self.fields:
                    self.fields["locations"].queryset = cafes
                    picked = self.initial.get("locations")
                    if isinstance(picked, str):  # ?locations=<id> from a café card
                        self.initial["locations"] = picked.split(",")
                    if not chain and len(cafes) == 1:  # one café: nothing to choose
                        self.fields["locations"].initial = list(cafes)
                if "role" in self.fields:
                    if chain:
                        current = self.instance.role if self.instance.pk else None
                        extra = (
                            [(current, API_ROLE_LABELS[current])]
                            if current in API_ROLE_LABELS
                            else []
                        )
                        self.fields["role"].choices = [*CHAIN_ROLE_CHOICES, *extra]
                    else:
                        del self.fields["role"]
                if "is_active" in self.fields:
                    self.fields["is_active"].label = "Can sign in"
                    self.fields[
                        "is_active"
                    ].help_text = (
                        "Untick to lock the account instead of deleting it; history is kept."
                    )

        return ScopedForm

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id) if object_id else None
        customer = bool(obj and obj.role == "customer" and not obj.is_superuser)
        context = {
            "customer": customer_summary(obj) if customer else None,
            "team": team_summary(obj, request) if obj and not customer else None,
        }
        return super().changeform_view(
            request, object_id, form_url, {**context, **(extra_context or {})}
        )

    def get_inline_instances(self, request, obj=None):
        # On the add page the cafés are picked in the form itself.
        return super().get_inline_instances(request, obj) if obj else []

    # --- saving -------------------------------------------------------------
    def save_model(self, request, obj, form, change):
        if not change and bos_role(request.user) != CHAIN:
            obj.role = "staff"
        # Workspace access follows the role; is_staff is never set by hand.
        obj.is_staff = obj.is_superuser or obj.role in TEAM_ROLES
        before = snapshot(User.objects.get(pk=obj.pk)) if change else None
        form.apply_till_pin(obj)
        super().save_model(request, obj, form, change)
        audit(request, obj, before, "admin_update" if change else "admin_create")
        if not change:
            for location in form.cleaned_data.get("locations") or []:
                assignment = StaffAssignment(
                    user=obj, location=location, created_by=request.user, updated_by=request.user
                )
                assignment.save()
                audit(request, assignment, None, "admin_create")

    def save_formset(self, request, form, formset, change):
        OperationsAdmin.save_formset(self, request, form, formset, change)

    @admin.display(description="Cafés")
    def cafes(self, obj):
        if obj.is_superuser:
            return ui.tag("All cafés", "info")
        names = [a.location.name for a in obj.assignments.all() if a.is_active]
        if not names:
            return "—"
        return format_html(
            '<span class="bos-cafe-pills">{}</span>',
            format_html_join("", '<span class="bos-cafe-pill">{}</span>', ((n,) for n in names)),
        )


class TeamChangeList(ChangeList):
    """People list: the team only. Customers have their own list (CustomerAdmin)."""

    def get_queryset(self, request, exclude_parameters=None):
        # Also narrows the "N total" count, which Django takes from root_queryset.
        self.root_queryset = self.root_queryset.exclude(role="customer", is_superuser=False)
        return super().get_queryset(request, exclude_parameters)


@admin.register(Customer)
class CustomerAdmin(UserAdmin):
    """Mobile app customers, apart from the team. The chain owner's list only."""

    list_display = [
        "full_name",
        "email",
        "phone",
        "stamps",
        "gift_balance",
        "app_orders",
        "date_joined",
        "is_active",
    ]
    list_filter = ["is_active", "email_verified", "marketing_opt_in"]
    ordering = ["-date_joined"]

    def get_changelist(self, request, **kwargs):
        return ChangeList

    def changelist_view(self, request, extra_context=None):
        return DjangoUserAdmin.changelist_view(self, request, extra_context)

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .filter(role="customer", is_superuser=False)
            .select_related("loyalty_card", "gift_card")
            .annotate(app_order_count=Count("orders", filter=Q(orders__channel="app")))
        )

    def has_module_permission(self, request):
        return bos_role(request.user) == CHAIN

    def has_view_permission(self, request, obj=None):
        return bos_role(request.user) == CHAIN

    def has_add_permission(self, request):
        return False  # customers sign up in the app

    @admin.display(description="Coffee card")
    def stamps(self, obj):
        card = getattr(obj, "loyalty_card", None)
        return f"{card.stamps}/{STAMPS_PER_REWARD}" if card else "—"

    @admin.display(description="Gift card")
    def gift_balance(self, obj):
        gift = getattr(obj, "gift_card", None)
        return ui.aud(gift.balance_cents) if gift and gift.balance_cents else "—"

    @admin.display(description="App orders", ordering="app_order_count")
    def app_orders(self, obj):
        return obj.app_order_count


@admin.register(StaffAssignment)
class StaffAssignmentAdmin(OperationsAdmin):
    view_roles = OWNERS
    location_lookup = "location"
    list_display = ("user", "location", "is_active")
    list_filter = ("location", "is_active")
    search_fields = ("user__email", "location__name")
    autocomplete_fields = ("user", "location")
    fieldsets = [("Team assignment", {"fields": ("user", "location", "is_active")}), RECORD_FIELDS]


@admin.register(CustomerProfile)
class CustomerProfileAdmin(OperationsAdmin):
    list_display = ("user", "preferred_location", "birthday")
    search_fields = ("user__email", "user__first_name", "user__last_name")
    autocomplete_fields = ("user", "preferred_location")
    fieldsets = [
        ("Customer profile", {"fields": ("user", "preferred_location", "birthday", "notes")}),
        RECORD_FIELDS,
    ]
