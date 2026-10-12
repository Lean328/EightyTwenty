import secrets

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, ManagedModel


def order_number():
    return f"#8020-{secrets.randbelow(10**4):04d}"


class Order(ManagedModel):
    """An app order. Priced by the server (services.price_order), never by the client."""

    class Status(models.TextChoices):
        RECEIVED = "received"
        CONFIRMED = "confirmed"
        PREPARING = "preparing"
        READY = "ready"
        COMPLETED = "completed"
        DECLINED = "declined"

    def __str__(self):
        return self.number

    number = models.CharField(max_length=20, unique=True, default=order_number, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders"
    )
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    method = models.CharField(
        max_length=8,
        choices=[("pickup", "Pickup"), ("delivery", "Delivery"), ("dine_in", "Dine in")],
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RECEIVED)
    scheduled_time = models.TimeField(
        null=True, blank=True, help_text="Empty = as soon as possible (today, café time)."
    )
    delivery_address = models.CharField(max_length=300, blank=True)
    table_number = models.CharField(max_length=20, blank=True)
    contact_name = models.CharField(max_length=160)
    contact_phone = models.CharField(max_length=32)
    payment_choice = models.CharField(
        max_length=10,
        choices=[("apple_pay", "Apple Pay"), ("saved_card", "Saved card"), ("new_card", "Card")],
    )
    payment_label = models.CharField(max_length=60)
    payment_reference = models.CharField(max_length=120, blank=True)
    subtotal_cents = models.PositiveIntegerField()
    delivery_cents = models.PositiveIntegerField(default=0)
    reward_cents = models.PositiveIntegerField(default=0)
    surcharge_cents = models.PositiveIntegerField(default=0)
    gift_card_cents = models.PositiveIntegerField(default=0)
    total_cents = models.PositiveIntegerField()
    stamps_earned = models.PositiveSmallIntegerField(default=0)
    reward_redeemed = models.BooleanField(default=False)
    estimated_wait = models.CharField(max_length=40)
    idempotency_key = models.CharField(max_length=100, blank=True, editable=False)
    request_hash = models.CharField(max_length=64, blank=True, editable=False)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="handled_orders",
    )
    handled_at = models.DateTimeField(null=True, blank=True)

    class Meta(ManagedModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["location", "status", "created_at"]),
            models.Index(fields=["customer", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="unique_order_idempotency_key",
            )
        ]


class OrderLine(BaseModel):
    def __str__(self):
        return f"{self.qty} × {self.name}"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    menu_item = models.ForeignKey(
        "menu.MenuItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    item_slug = models.SlugField()
    name = models.CharField(max_length=160)
    qty = models.PositiveSmallIntegerField()
    unit_price_cents = models.PositiveIntegerField(help_text="Item plus selected options.")
    selections = models.JSONField(default=dict, blank=True)
    modifiers_label = models.CharField(max_length=500, blank=True)
    note = models.CharField(max_length=500, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ["position"]
