import uuid

from django.conf import settings
from django.db import models

SITE_SETTINGS_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["created_at", "id"]


class ManagedModel(BaseModel):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta(BaseModel.Meta):
        abstract = True


class SiteSettings(ManagedModel):
    def __str__(self):
        return self.brand_name

    id = models.UUIDField(primary_key=True, default=SITE_SETTINGS_ID, editable=False)
    brand_name = models.CharField(max_length=120, default="EightyTwenty")
    contact_email = models.EmailField(default="info@eightytwentyfood.com.au")
    social_links = models.JSONField(default=dict, blank=True)
    footer = models.TextField(blank=True)
    announcement = models.TextField(blank=True)
    order_rules = models.JSONField(default=dict, blank=True)
    menu_version = models.PositiveBigIntegerField(default=1, editable=False)

    class Meta:
        verbose_name_plural = "site settings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=SITE_SETTINGS_ID), name="site_settings_singleton"
            )
        ]

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=SITE_SETTINGS_ID)[0]


class AuditLog(BaseModel):
    def __str__(self):
        return f"{self.action} / {self.entity_type}"

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    before = models.JSONField(null=True)
    after = models.JSONField(null=True)
    ip = models.GenericIPAddressField(null=True)

    class Meta(BaseModel.Meta):
        verbose_name = "activity entry"
        verbose_name_plural = "activity log"


class RateLimitBucket(BaseModel):
    key = models.CharField(max_length=64, unique=True)
    hits = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)


class JobClock(models.Model):
    """When a scheduled job last started (apps/core/jobs.py): one row per clock."""

    name = models.CharField(max_length=40, primary_key=True)
    last_run_at = models.DateTimeField()

    def __str__(self):
        return f"{self.name} @ {self.last_run_at:%Y-%m-%d %H:%M}"
