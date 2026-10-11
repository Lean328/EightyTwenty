from django import forms
from django.conf import settings
from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.core.admin_base import RECORD_FIELDS, OperationsAdmin
from apps.core.bos_access import OWNERS
from apps.core.exceptions import DomainError
from apps.core.services import audit

from .models import MediaAsset
from .services import brand_alt, label_from_filename, store_image

UPLOAD_HELP = (
    "JPG, PNG or WebP up to 15 MB. It is rotated, resized to 400/800/1600 px WebP "
    "and stored automatically."
)


def preview_url(asset, size="md"):
    """Absolute URL for an asset; legacy website paths resolve against the website."""
    url = (asset.variants.get(size) or asset.public_url) if asset else ""
    if url and not url.startswith(("http://", "https://", "/")):
        url = f"{settings.MEDIA_PREVIEW_BASE_URL}/{url}"
    return url


def thumbnail(asset):
    url = preview_url(asset, "thumb")
    if not url:
        return mark_safe('<span class="bos-thumb bos-thumb-empty">—</span>')
    return format_html('<img class="bos-thumb" src="{}" alt="" loading="lazy">', url)


def preview(asset, empty="No photo yet."):
    url = preview_url(asset) if asset else ""
    if not url:
        return empty
    return format_html(
        '<span class="bos-preview"><a class="bos-preview-frame" href="{0}" target="_blank" '
        'rel="noopener" data-bos-lightbox data-bos-caption="{1}"><img class="bos-preview-image" '
        'src="{0}" alt="{1}"></a><a class="bos-preview-link" href="{0}" target="_blank" '
        'rel="noopener">Open full size</a></span>',
        url,
        asset.alt_text,
    )


class ImageUploadForm(forms.ModelForm):
    """
    Adds a file box to any admin form. The image is encoded and stored during
    clean(), and only when the rest of the form is valid, so a typo elsewhere
    never leaves a stray file in Storage; a storage failure shows on the field.
    """

    upload = forms.FileField(
        required=False,
        label="Upload a new photo",
        help_text=UPLOAD_HELP,
        widget=forms.FileInput(attrs={"accept": "image/jpeg,image/png,image/webp,image/avif"}),
    )
    upload_folder = "admin"
    uploaded_image = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if field := self.fields.get("image"):
            field.label = "Or pick from Media library"
            field.help_text = "Reuse an uploaded photo. A new upload above replaces this choice."

    def clean(self):
        data = super().clean()
        file = data.get("upload")
        if file and not self._errors:
            try:
                self.uploaded_image = store_image(file, self.upload_folder)
            except DomainError as exc:
                self.add_error("upload", str(exc.detail))
        return data


def attach_upload(request, form, alt_text):
    """Create the MediaAsset for a fresh upload (audited) and return it, or None."""
    if not form.uploaded_image:
        return None
    asset = MediaAsset(
        **form.uploaded_image,
        alt_text=brand_alt(alt_text),
        uploaded_by=request.user,
        created_by=request.user,
        updated_by=request.user,
    )
    asset.save()
    audit(request, asset, None, "admin_create")
    return asset


class MediaAssetForm(ImageUploadForm):
    upload_folder = "library"

    class Meta:
        model = MediaAsset
        fields = "__all__"

    def clean(self):
        data = super().clean()
        if self.instance._state.adding and not (data.get("upload") or data.get("legacy_path")):
            self.add_error("upload", "Choose an image to upload.")
        return data


@admin.register(MediaAsset)
class MediaAssetAdmin(OperationsAdmin):
    form = MediaAssetForm
    # Café owners upload photos for their own items; editing the library stays with the chain.
    view_roles = add_roles = OWNERS
    list_display = ("thumb", "alt_text", "width", "height", "is_active", "created_at")
    list_display_links = ("alt_text",)
    list_filter = ("is_active", "mime")
    search_fields = ("alt_text", "storage_path", "legacy_path")
    description = (
        "Upload a photo once, then pick it on menu items, catering packages or location photos."
    )
    readonly_fields = (
        *OperationsAdmin.readonly_fields,
        "photo",
        "storage_path",
        "variants",
        "mime",
        "width",
        "height",
        "bytes",
        "uploaded_by",
    )
    fieldsets = [
        ("Image", {"fields": ("photo", "upload", "alt_text", "is_active")}),
        (
            "Stored files",
            {
                "fields": (
                    ("width", "height"),
                    "storage_path",
                    "variants",
                    "bytes",
                    "mime",
                    "legacy_path",
                    "uploaded_by",
                )
            },
        ),
        RECORD_FIELDS,
    ]

    @admin.display(description="")
    def thumb(self, obj):
        return thumbnail(obj)

    @admin.display(description="Photo")
    def photo(self, obj):
        return preview(obj if obj.pk else None, "The uploaded photo appears here after saving.")

    def save_model(self, request, obj, form, change):
        if form.uploaded_image:
            for field, value in form.uploaded_image.items():
                setattr(obj, field, value)
            obj.uploaded_by = request.user
            if not obj.alt_text:
                obj.alt_text = brand_alt(label_from_filename(form.cleaned_data["upload"].name))
        super().save_model(request, obj, form, change)
