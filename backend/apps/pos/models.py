from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import BaseModel, ManagedModel


class CashShift(ManagedModel):
    """A till's cash drawer from opening float to the closing count. Ids come from the till."""

    def __str__(self):
        return f"{self.location} · {self.staff_name} · {self.opened_label}"

    reference = models.CharField(max_length=60, unique=True)
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    terminal_id = models.CharField(max_length=60, blank=True)
    staff_ref = models.CharField(max_length=60, blank=True)
    staff_name = models.CharField(max_length=120, blank=True)
    opened_label = models.CharField(max_length=40, blank=True, help_text="As shown on the till.")
    float_cents = models.PositiveIntegerField()
    cash_sales_cents = models.PositiveIntegerField(default=0)
    cash_refunds_cents = models.PositiveIntegerField(default=0)
    moves = models.JSONField(default=list, blank=True, help_text="Cash in / out, as the till sent.")
    status = models.CharField(
        max_length=6, choices=[("open", "Open"), ("closed", "Closed")], default="open"
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_label = models.CharField(max_length=40, blank=True)
    closed_by = models.CharField(max_length=120, blank=True)
    counted_cents = models.PositiveIntegerField(null=True, blank=True)
    expected_cents = models.IntegerField(null=True, blank=True)
    variance_cents = models.IntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    approved_by = models.CharField(max_length=120, blank=True)

    class Meta(ManagedModel.Meta):
        verbose_name = "till shift"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["location", "status"])]


class TillTransaction(ManagedModel):
    """Append-only record of money moving at a till (for the ledger and invoicing later)."""

    class Kind(models.TextChoices):
        SALE = "sale"
        PAYMENT = "payment"
        REFUND = "refund"
        VOID = "void"
        CANCEL = "cancel"
        GIFT_ISSUE = "gift-issue"
        CASH_IN = "cash-in"
        CASH_OUT = "cash-out"

    def __str__(self):
        return f"{self.kind} {self.amount_cents}"

    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    order_number = models.CharField(max_length=40, blank=True)
    terminal_id = models.CharField(max_length=60, blank=True)
    amount_cents = models.IntegerField(help_text="GST inclusive; negative = money returned.")
    gst_cents = models.IntegerField(default=0)
    occurred_at = models.DateTimeField()
    staff_name = models.CharField(max_length=120, blank=True)
    reference = models.CharField(max_length=80)

    class Meta(ManagedModel.Meta):
        verbose_name = "till transaction"
        ordering = ["-occurred_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["location", "kind", "reference"], name="unique_till_transaction"
            )
        ]


class CommandReceipt(BaseModel):
    """The answer to a till write, kept per Idempotency-Key so a retry replays it."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=100)
    request_hash = models.CharField(max_length=64)
    status_code = models.PositiveSmallIntegerField(default=0)
    response = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["user", "key"], name="unique_command_receipt")
        ]


class TillTable(ManagedModel):
    """A table on a café's floor plan, as the till shows it for dine-in orders."""

    def __str__(self):
        return f"{self.location} · {self.label}"

    location = models.ForeignKey(
        "locations.Location", on_delete=models.PROTECT, related_name="till_tables"
    )
    label = models.CharField(max_length=20, help_text="What staff call it, e.g. T4.")
    seats = models.PositiveSmallIntegerField(default=4, validators=[MinValueValidator(1)])
    zone = models.CharField(max_length=40, blank=True, help_text="e.g. Window, Courtyard.")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        verbose_name = "table"
        ordering = ["location", "sort_order", "label"]
        constraints = [
            models.UniqueConstraint(fields=["location", "label"], name="unique_till_table")
        ]


class Promotion(ManagedModel):
    """A promo code staff type at the till: a percentage or a dollar amount off the order."""

    def __str__(self):
        return self.code

    code = models.CharField(
        max_length=30, unique=True, help_text="Staff type it; not case sensitive."
    )
    label = models.CharField(max_length=80, help_text="Shown on the order, e.g. 10% off.")
    kind = models.CharField(
        max_length=3, choices=[("pct", "Percentage off"), ("amt", "Amount off")], default="pct"
    )
    percent = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text="For a percentage off.",
    )
    amount_cents = models.PositiveIntegerField(null=True, blank=True)
    location = models.ForeignKey(
        "locations.Location",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        help_text="Empty = every café.",
    )
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        verbose_name = "promo code"
        ordering = ["code"]

    def clean(self):
        self.code = (self.code or "").strip().upper()
        if self.kind == "pct" and not self.percent:
            raise ValidationError({"percent": "Enter the percentage off."})
        if self.kind == "amt" and not self.amount_cents:
            raise ValidationError({"amount_cents": "Enter the amount off."})
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValidationError({"ends_on": "The end date is before the start date."})

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        super().save(*args, **kwargs)

class TillSettings(ManagedModel):
    location = models.OneToOneField("locations.Location", on_delete=models.PROTECT, related_name="till_settings")
    category_order = models.JSONField(default=list, blank=True)
    toggles = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Till settings · {self.location}"
