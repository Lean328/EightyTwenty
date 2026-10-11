"""Shared admin policy; each domain owns its ModelAdmin configuration."""

from django.contrib import admin
from django.contrib.admin.widgets import RelatedFieldWidgetWrapper

from .admin_widgets import BOS_FORMFIELD_OVERRIDES, MediaPicker
from .bos_access import CHAIN, bos_locations, bos_role, in_scope, scope_filter
from .services import audit, snapshot

RECORD_FIELDS = (
    "Record history",
    {"fields": ("id", "created_at", "updated_at", "created_by", "updated_by")},
)


class RoleAccessMixin:
    """
    Who may see, add and change a table in the workspace (see core/bos_access.py).

    Each admin lists the roles allowed per action. With `location_lookup` set,
    café owners and staff only ever get rows of their own cafés: other rows are
    filtered out of lists and searches, and opening one by URL is refused.
    Nothing is ever deleted from the admin; records are hidden or deactivated.
    """

    view_roles = (CHAIN,)
    add_roles = (CHAIN,)
    change_roles = (CHAIN,)
    location_lookup = None  # "location", or "pk" for the Location table itself

    def bos_role(self, request):
        return bos_role(request.user)

    def location_of(self, obj):
        if self.location_lookup == "pk":
            return obj.pk
        return getattr(obj, f"{self.location_lookup}_id")

    def in_scope(self, request, obj):
        if obj is None or not self.location_lookup or self.bos_role(request) == CHAIN:
            return True
        return in_scope(request.user, self.location_of(obj))

    def has_module_permission(self, request):
        return self.bos_role(request) in set(self.view_roles) | set(self.change_roles)

    def has_view_permission(self, request, obj=None):
        role = self.bos_role(request)
        return role in set(self.view_roles) | set(self.change_roles) and self.in_scope(request, obj)

    def has_add_permission(self, request, *args):
        return self.bos_role(request) in self.add_roles

    def has_change_permission(self, request, obj=None):
        return self.bos_role(request) in self.change_roles and self.in_scope(request, obj)

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if self.location_lookup and self.bos_role(request) != CHAIN:
            qs = qs.filter(scope_filter(request.user, self.location_lookup))
        return qs

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        from apps.locations.models import Location

        if db_field.related_model is Location and self.bos_role(request) != CHAIN:
            kwargs["queryset"] = bos_locations(request.user)
        if db_field.related_model._meta.label == "media.MediaAsset":
            kwargs["widget"] = MediaPicker()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        field = super().formfield_for_dbfield(db_field, request, **kwargs)
        # Photos are chosen in the picker, not through the add/edit popup links.
        if field and isinstance(field.widget, RelatedFieldWidgetWrapper):
            if isinstance(field.widget.widget, MediaPicker):
                field.widget = field.widget.widget
        return field


# Kept for readability where a table is the chain owner's alone.
SuperuserOnlyMixin = RoleAccessMixin


class OperationsAdmin(RoleAccessMixin, admin.ModelAdmin):
    actions = None
    list_per_page = 25
    list_select_related = True
    readonly_fields = ("id", "created_at", "updated_at", "created_by", "updated_by")
    change_form_template = "admin/bos_change_form.html"
    description = "Manage the details below. Changes are recorded in the activity log."
    formfield_overrides = BOS_FORMFIELD_OVERRIDES

    def get_readonly_fields(self, request, obj=None):
        fields = list(self.readonly_fields)
        if obj and any(field.name == "slug" for field in self.model._meta.fields):
            fields.append("slug")
        return fields

    def get_prepopulated_fields(self, request, obj=None):
        return {} if obj else super().get_prepopulated_fields(request, obj)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        return super().changeform_view(
            request,
            object_id,
            form_url,
            {"bos_description": self.description, **(extra_context or {})},
        )

    def save_model(self, request, obj, form, change):
        before = snapshot(type(obj).objects.get(pk=obj.pk)) if change else None
        obj.updated_by = request.user
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
        audit(request, obj, before, "admin_update" if change else "admin_create")

    def save_formset(self, request, form, formset, change):
        # Django wraps parent and inline saves in the same transaction.
        for obj in formset.save(commit=False):
            before = snapshot(type(obj).objects.get(pk=obj.pk)) if not obj._state.adding else None
            obj.updated_by = request.user
            if obj._state.adding:
                obj.created_by = request.user
            obj.save()
            audit(request, obj, before, "admin_create" if before is None else "admin_update")
        formset.save_m2m()


class OperationsInline(RoleAccessMixin, admin.TabularInline):
    """Rows inside a parent form: allowed when the role may change the parent record."""

    formfield_overrides = BOS_FORMFIELD_OVERRIDES

    def parent_admin(self, obj):
        return self.admin_site._registry.get(type(obj))

    def _parent_allows(self, request, obj, check):
        parent = self.parent_admin(obj) if obj is not None else None
        return parent is None or getattr(parent, check)(request, obj)

    def has_view_permission(self, request, obj=None):
        return self.bos_role(request) in set(self.view_roles) | set(
            self.change_roles
        ) and self._parent_allows(request, obj, "has_view_permission")

    def has_add_permission(self, request, obj=None):
        return self.bos_role(request) in self.add_roles and self._parent_allows(
            request, obj, "has_change_permission"
        )

    def has_change_permission(self, request, obj=None):
        return self.bos_role(request) in self.change_roles and self._parent_allows(
            request, obj, "has_change_permission"
        )

    extra = 0
    can_delete = False
    show_change_link = True
    exclude = ("created_at", "updated_at", "created_by", "updated_by")


class ReadOnlyAdmin(OperationsAdmin):
    readonly_fields = ("id", "created_at", "updated_at")

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
