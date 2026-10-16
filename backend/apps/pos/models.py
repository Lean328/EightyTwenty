from django.conf import settings
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
