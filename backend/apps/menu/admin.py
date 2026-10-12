from django import forms
from django.contrib import admin
from django.db.models import Q

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, OperationsInline
from apps.core.admin_forms import AUDField
from apps.core.bos_access import ALL, CHAIN, MANAGER, OWNERS, bos_location_ids, in_scope
from apps.core.templatetags.bos_admin import status_badge
from apps.media.admin import ImageUploadForm, attach_upload, preview, thumbnail

from .models import (
    Category,
    DietaryTag,
    LocationMenuItem,
    MenuItem,
    MenuItemDietaryTag,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)


class MenuItemForm(ImageUploadForm):
    base_price_cents = AUDField(label="Price (AUD)", min_value=0)
    upload_folder = "menu"


class OptionForm(forms.ModelForm):
    price_delta_cents = AUDField(label="Price adjustment (AUD)")


class AvailabilityForm(forms.ModelForm):
    price_override_cents = AUDField(
        label="Location price (AUD)",
        min_value=0,
        required=False,
        help_text="Leave blank to use the menu item's standard price.",
    )


class ModifierOptionInline(OperationsInline):
    model = ModifierOption
    form = OptionForm
    fields = ("name", "price_delta_cents", "sort_order", "is_active")


class ModifierLinkInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = MenuItemModifierGroup
    autocomplete_fields = ("modifier_group",)
    fields = ("modifier_group", "sort_order", "is_active")
    verbose_name_plural = "Modifier groups"


class DietaryInline(OperationsInline):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    model = MenuItemDietaryTag
    autocomplete_fields = ("tag",)
    fields = ("tag", "sort_order")
    verbose_name_plural = "Dietary labels"


@admin.register(MenuItem)
class MenuItemAdmin(OperationsAdmin):
    form = MenuItemForm
    # Chain items: chain owner only. Café-only items: also the owners of that café.
    view_roles = ALL
    add_roles = change_roles = OWNERS
    list_display = (
        "thumb",
        "name",
        "category",
        "scope",
        "price",
        "publication",
        "is_featured",
        "sort_order",
    )
    list_display_links = ("name",)
    list_filter = ("is_published", "category", "location", "is_featured")
    search_fields = ("name", "slug", "description")
    autocomplete_fields = ("category",)
    prepopulated_fields = {"slug": ("name",)}
    inlines = (ModifierLinkInline, DietaryInline)
    description = "Set the price, dietary labels and available extras. Publish when the item is ready for customers."
    fieldsets = [
        (
            "Menu details",
            {
                "fields": (
                    "name",
                    "slug",
                    "category",
                    "location",
                    "description",
                    "base_price_cents",
                )
            },
        ),
        ("Photo", {"fields": ("photo", "upload", "image")}),
        ("Visibility", {"fields": ("is_published", "is_featured", "sort_order", "price_source")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="")
    def thumb(self, obj):
        return thumbnail(obj.image)

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

    @admin.display(description="Sold at", ordering="location__name")
    def scope(self, obj):
        return obj.location.name if obj.location_id else "All cafés"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        ids = bos_location_ids(request.user)
        return qs if ids is None else qs.filter(Q(location__isnull=True) | Q(location__in=ids))

    def has_view_permission(self, request, obj=None):
        return self.bos_role(request) in ALL and (
            obj is None or obj.location_id is None or in_scope(request.user, obj.location_id)
        )

    def has_change_permission(self, request, obj=None):
        role = self.bos_role(request)
        if role == CHAIN:
            return True
        # A café owner edits only items that belong to one of their cafés.
        return role == MANAGER and (
            obj is None or (obj.location_id is not None and in_scope(request.user, obj.location_id))
        )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if self.bos_role(request) != CHAIN and "location" in form.base_fields:
            field = form.base_fields["location"]
            field.required = True
            field.help_text = "This item is sold only at the café you choose."
        return form

    @admin.display(description="Price · AUD", ordering="base_price_cents")
    def price(self, obj):
        return f"${obj.base_price_cents / 100:,.2f}"

    @admin.display(description="Visibility", ordering="is_published")
    def publication(self, obj):
        return status_badge("published" if obj.is_published else "draft")


@admin.register(Category)
class CategoryAdmin(OperationsAdmin):
    view_roles = ALL
    list_display = ("name", "note", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    fieldsets = [
        ("Category", {"fields": ("name", "slug", "short_name", "note", "sort_order", "is_active")}),
        RECORD_FIELDS,
    ]


@admin.register(ModifierGroup)
class ModifierGroupAdmin(OperationsAdmin):
    view_roles = ALL
    list_display = ("name", "code", "is_required", "min_select", "max_select", "is_active")
    list_filter = ("is_active", "is_required")
    search_fields = ("name", "code")
    inlines = (ModifierOptionInline,)
    description = "Extras shared across menu items. A maximum of 0 means unlimited selections."
    fieldsets = [
        (
            "Group & selection rules",
            {"fields": ("name", "code", "is_required", "min_select", "max_select", "is_active")},
        ),
        RECORD_FIELDS,
    ]


@admin.register(ModifierOption)
class ModifierOptionAdmin(OperationsAdmin):
    view_roles = ALL
    form = OptionForm
    list_display = ("name", "group", "price_delta_cents", "is_active", "sort_order")
    list_filter = ("is_active", "group")
    search_fields = ("name", "group__name")
    autocomplete_fields = ("group",)
    fieldsets = [
        ("Option", {"fields": ("group", "name", "price_delta_cents", "sort_order", "is_active")}),
        RECORD_FIELDS,
    ]


class AvailabilityAttentionFilter(admin.SimpleListFilter):
    title = "menu attention"
    parameter_name = "attention"

    def lookups(self, request, model_admin):
        return [("unavailable", "Published items unavailable")]

    def queryset(self, request, queryset):
        if self.value() == "unavailable":
            return queryset.filter(
                is_available=False,
                is_hidden=False,
                menu_item__is_published=True,
                menu_item__category__is_active=True,
            )
        return queryset


@admin.register(LocationMenuItem)
class AvailabilityAdmin(OperationsAdmin):
    view_roles = ALL
    add_roles = change_roles = OWNERS
    location_lookup = "location"
    form = AvailabilityForm
    list_display = ("menu_item", "location", "local_price", "is_available", "is_hidden")
    list_filter = ("location", AvailabilityAttentionFilter, "is_available", "is_hidden")
    search_fields = ("menu_item__name", "location__name")
    autocomplete_fields = ("location", "menu_item")
    description = "Control an item's price and availability at one location. Hidden items are removed from that location's menu."
    fieldsets = [
        (
            "Location availability",
            {
                "fields": (
                    "location",
                    "menu_item",
                    "price_override_cents",
                    "is_available",
                    "is_hidden",
                )
            },
        ),
        RECORD_FIELDS,
    ]

    @admin.display(description="Price · AUD", ordering="price_override_cents")
    def local_price(self, obj):
        return (
            f"${obj.price_override_cents / 100:,.2f}"
            if obj.price_override_cents is not None
            else "Standard price"
        )


@admin.register(DietaryTag)
class DietaryTagAdmin(OperationsAdmin):
    view_roles = ALL
    list_display = ("label", "code", "description")
    search_fields = ("label", "code")
    fieldsets = [("Dietary label", {"fields": ("code", "label", "description")}), RECORD_FIELDS]


@admin.register(MenuItemModifierGroup)
class ModifierLinkAdmin(OperationsAdmin):
    list_display = ("menu_item", "modifier_group", "sort_order", "is_active")
    search_fields = ("menu_item__name", "modifier_group__name")
    autocomplete_fields = ("menu_item", "modifier_group")


@admin.register(MenuItemDietaryTag)
class DietaryLinkAdmin(OperationsAdmin):
    list_display = ("menu_item", "tag", "sort_order")
    search_fields = ("menu_item__name", "tag__label")
    autocomplete_fields = ("menu_item", "tag")
