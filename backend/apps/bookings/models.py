import secrets

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import ManagedModel


def booking_reference():
    return "BK-" + secrets.token_hex(6).upper()


class BookingRule(ManagedModel):
    def __str__(self):
        return f"{self.location} / Reservation rules"

    location = models.OneToOneField(
        "locations.Location", on_delete=models.PROTECT, related_name="booking_rule"
    )
    is_enabled = models.BooleanField(default=False)
    slot_minutes = models.PositiveSmallIntegerField(
        default=30, validators=[MinValueValidator(5), MaxValueValidator(240)]
    )
    max_party_size = models.PositiveSmallIntegerField(default=10, validators=[MinValueValidator(1)])
    max_covers_per_slot = models.PositiveSmallIntegerField(
        default=20, validators=[MinValueValidator(1)]
    )
    min_lead_minutes = models.PositiveIntegerField(default=120)
    max_days_ahead = models.PositiveSmallIntegerField(
        default=60, validators=[MinValueValidator(1), MaxValueValidator(365)]
    )


class Booking(ManagedModel):
    def __str__(self):
        return f"{self.reference} / {self.name}"

    class Status(models.TextChoices):
        REQUESTED = "requested"
        CONFIRMED = "confirmed"
        DECLINED = "declined"
        CANCELLED = "cancelled"
        SEATED = "seated"
        NO_SHOW = "no_show"

    reference = models.CharField(
        max_length=20, unique=True, default=booking_reference, editable=False
    )
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    date = models.DateField()
    time = models.TimeField()
    party_size = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=32)
    notes = models.TextField(blank=True)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bookings",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED)
    source = models.CharField(
        max_length=10, choices=[("web", "Web"), ("app", "App"), ("staff", "Staff")], default="web"
    )
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="handled_bookings",
    )
    handled_at = models.DateTimeField(null=True, blank=True)

    class Meta(ManagedModel.Meta):
        indexes = [models.Index(fields=["location", "date", "time", "status"])]
