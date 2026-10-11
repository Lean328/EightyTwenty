import secrets

from django.conf import settings
from django.db import models

from apps.core.models import ManagedModel


def enquiry_reference():
    return "EN-" + secrets.token_hex(6).upper()


class CateringPackage(ManagedModel):
    def __str__(self):
        return self.name

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    price_cents = models.PositiveIntegerField()
    unit = models.CharField(max_length=60, default="per person")
    blurb = models.TextField(blank=True)
    items = models.JSONField(default=list, blank=True)
    image = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL)
    image_position = models.CharField(max_length=40, default="50% 50%")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "slug"]


class Enquiry(ManagedModel):
    def __str__(self):
        return f"{self.reference} / {self.name}"

    kind = models.CharField(
        max_length=12,
        choices=[("catering", "Catering"), ("wholesale", "Wholesale"), ("contact", "Contact")],
    )
    reference = models.CharField(
        max_length=20, unique=True, default=enquiry_reference, editable=False
    )
    name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    company = models.CharField(max_length=200, blank=True)
    location = models.ForeignKey(
        "locations.Location", null=True, blank=True, on_delete=models.PROTECT
    )
    event_date = models.DateField(null=True, blank=True)
    headcount = models.PositiveIntegerField(null=True, blank=True)
    package = models.ForeignKey(CateringPackage, null=True, blank=True, on_delete=models.PROTECT)
    message = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=15,
        choices=[
            ("new", "New"),
            ("in_progress", "In progress"),
            ("quoted", "Quoted"),
            ("won", "Won"),
            ("lost", "Lost"),
            ("closed", "Closed"),
        ],
        default="new",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    internal_notes = models.TextField(blank=True)

    class Meta(ManagedModel.Meta):
        verbose_name_plural = "enquiries"
        indexes = [models.Index(fields=["location", "status", "created_at"])]
