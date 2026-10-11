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
