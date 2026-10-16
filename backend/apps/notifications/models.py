from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class EmailMessage(BaseModel):
    def __str__(self):
        return self.subject

    recipient = models.EmailField()
    subject = models.CharField(max_length=240)
    body = models.TextField()
    dedup_key = models.CharField(max_length=200, unique=True)
    status = models.CharField(
        max_length=12,
        default="pending",
        choices=[
            ("pending", "Pending"),
            ("sending", "Sending"),
            ("sent", "Sent"),
            ("failed", "Failed"),
        ],
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=100, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "email"
        verbose_name_plural = "email delivery"


class AppNotification(BaseModel):
    """One line in a customer's in-app feed (the bell), also pushed to their phones."""

    class Kind(models.TextChoices):
        ORDER = "order"
        LOYALTY = "loyalty"
        BOOKING = "booking"
        OFFER = "offer"
        GIFT_CARD = "gift_card"

    def __str__(self):
        return self.text

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="app_notifications"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    text = models.CharField(max_length=300)
    unread = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "app notification"
        indexes = [models.Index(fields=["user", "created_at"])]


class PushDevice(BaseModel):
    """A phone that receives push notifications through Expo (registered by the app)."""

    def __str__(self):
        return f"{self.user} · {self.platform or 'device'}"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_devices"
    )
    token = models.CharField(max_length=200, unique=True, help_text="Expo push token.")
    platform = models.CharField(max_length=10, blank=True)
    is_active = models.BooleanField(default=True)
    last_error = models.CharField(max_length=120, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "push device"
