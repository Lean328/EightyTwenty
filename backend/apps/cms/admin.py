from django.contrib import admin

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, OperationsInline
from apps.core.admin_forms import ValidatedAdminForm
from apps.core.templatetags.bos_admin import status_badge

from .models import ContentBlock, NavigationItem, Page
from .serializers import ContentBlockSerializer, NavigationSerializer


class ContentBlockForm(ValidatedAdminForm):
    serializer_class = ContentBlockSerializer
    # ModelForm validates the parent relation after the new page is saved.
    object_validation_method = "validate_content"


class NavigationForm(ValidatedAdminForm):
    serializer_class = NavigationSerializer


class ContentBlockInline(OperationsInline):
    model = ContentBlock
    form = ContentBlockForm
    fields = ("key", "type", "data", "sort_order", "is_active")


@admin.register(Page)
class PageAdmin(OperationsAdmin):
    list_display = ("title", "slug", "publication", "published_at", "updated_at")
    list_filter = ("status",)
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (ContentBlockInline,)
    fieldsets = [
        ("Page", {"fields": ("title", "slug", "status", "published_at")}),
        ("Search appearance", {"fields": ("seo_title", "seo_description")}),
        RECORD_FIELDS,
    ]

    @admin.display(description="Status", ordering="status")
    def publication(self, obj):
        return status_badge(obj.status)


@admin.register(ContentBlock)
class ContentBlockAdmin(OperationsAdmin):
    form = ContentBlockForm
    list_display = ("key", "page", "type", "sort_order", "is_active")
    list_filter = ("page", "type", "is_active")
    search_fields = ("key", "page__title")
    autocomplete_fields = ("page",)
    description = 'Structured page content. Example hero data: {"title": "Welcome", "subtitle": "Food that feels good"}.'
    fieldsets = [
        ("Content", {"fields": ("page", "key", "type", "data", "sort_order", "is_active")}),
        RECORD_FIELDS,
    ]


@admin.register(NavigationItem)
class NavigationAdmin(OperationsAdmin):
    form = NavigationForm
    list_display = ("label", "menu", "page", "url", "parent", "is_active")
    list_filter = ("menu", "is_active")
    search_fields = ("label", "url")
    autocomplete_fields = ("page", "parent")
    description = (
        "Choose a page or enter a link. Internal links start with /; external links use HTTPS."
    )
    fieldsets = [
        (
            "Navigation link",
            {"fields": ("label", "menu", "page", "url", "parent", "sort_order", "is_active")},
        ),
        RECORD_FIELDS,
    ]
