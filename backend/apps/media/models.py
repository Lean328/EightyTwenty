from django.conf import settings
from django.db import models

from apps.core.models import ManagedModel


class MediaAsset(ManagedModel):
    def __str__(self):
        return self.alt_text or self.storage_path or self.legacy_path or f"Asset {str(self.pk)[:8]}"

    storage_path = models.CharField(max_length=500, blank=True)
    legacy_path = models.CharField(max_length=500, blank=True)
    variants = models.JSONField(default=dict, blank=True)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    alt_text = models.CharField(max_length=240, blank=True)
    mime = models.CharField(max_length=60, default="image/webp")
    bytes = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_media",
    )
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        verbose_name = "image"
        verbose_name_plural = "media library"
        constraints = [
            models.UniqueConstraint(
                fields=["storage_path"],
                condition=~models.Q(storage_path=""),
                name="unique_media_storage_path",
            )
        ]

    @property
    def public_url(self):
        return self.variants.get("md", self.legacy_path)
