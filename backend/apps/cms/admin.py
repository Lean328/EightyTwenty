from django.contrib import admin

from apps.accounts.models import User
from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin, OperationsInline
from apps.core.admin_forms import ValidatedAdminForm
from apps.core.services import audit
from apps.core.templatetags.bos_admin import status_badge
from apps.media.admin import ImageUploadForm, attach_upload, preview
from apps.notifications.services import notify

from .models import ContentBlock, Faq, NavigationItem, Offer, Page
from .serializers import ContentBlockSerializer, NavigationSerializer


class ContentBlockForm(ValidatedAdminForm):
    serializer_class = ContentBlockSerializer
    # ModelForm validates the parent relation after the new page is saved.
    object_validation_method = "validate_content"


class NavigationForm(ValidatedAdminForm):
    serializer_class = NavigationSerializer


class OfferForm(ImageUploadForm):
    upload_folder = "offers"


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


@admin.register(Offer)
class OfferAdmin(OperationsAdmin):
    form = OfferForm
    list_display = ("name", "tag", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "line")
    prepopulated_fields = {"slug": ("name",)}
    description = (
        "In-store offers shown in the mobile app (Home and Offers). Nothing is redeemed online. "
        "Tick an offer and choose “Send to the app” to add it to every customer's notifications "
        "(pushed to phones only for customers who turned on Offers & news)."
    )
    fieldsets = [
        ("Offer", {"fields": ("name", "slug", "tag", "line", "fine")}),
        ("Photo", {"fields": ("photo", "upload", "image")}),
        ("Visibility", {"fields": ("sort_order", "is_active")}),
        RECORD_FIELDS,
    ]
    actions = ("send_to_app",)

    @admin.display(description="Current photo")
    def photo(self, obj):
        return preview(obj.image)

    def get_readonly_fields(self, request, obj=None):
        return (*super().get_readonly_fields(request, obj), "photo")

    def save_model(self, request, obj, form, change):
        # A new upload is encoded to WebP and stored in Supabase Storage (media/services.py).
        asset = attach_upload(request, form, obj.name)
        if asset:
            obj.image = asset
        super().save_model(request, obj, form, change)

    @admin.action(description="Send to the app (notifications + push)")
    def send_to_app(self, request, queryset):
        offers = list(queryset.filter(is_active=True))
        customers = list(User.objects.filter(role="customer", is_active=True))
        for offer in offers:
            for user in customers:
                notify(user, "offer", f"{offer.name}: {offer.line}"[:300], "/offers")
            audit(request, offer, action="send_to_app", after={"customers": len(customers)})
        self.message_user(
            request, f"{len(offers)} offer(s) sent to {len(customers)} app customer(s)."
        )


@admin.register(Faq)
class FaqAdmin(OperationsAdmin):
    list_display = ("question", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("question", "answer")
    description = "Help questions in the mobile app. Keep answers in step with the real rules (surcharge, booking notice)."
    fieldsets = [
        ("Question", {"fields": ("question", "answer", "sort_order", "is_active")}),
        RECORD_FIELDS,
    ]
