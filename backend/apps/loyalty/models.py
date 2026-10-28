import secrets
import uuid

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, ManagedModel

STAMPS_PER_REWARD = 9


def member_number():
    return f"8020 {secrets.randbelow(10**4):04d} {secrets.randbelow(10**4):04d}"


def gift_card_last4():
    return f"{secrets.randbelow(10**4):04d}"


class LoyaltyCard(ManagedModel):
    """Coffee card: one stamp per coffee, nine stamps and the 10th coffee is free."""

    def __str__(self):
        return self.member_number

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="loyalty_card"
    )
    member_number = models.CharField(max_length=20, unique=True, default=member_number)
    stamps = models.PositiveIntegerField(default=0, help_text="Total unspent stamp units; each nine units is one reward.")
    wallet_pass_added = models.BooleanField(default=False)

    class Meta(ManagedModel.Meta):
        verbose_name = "coffee card"


class LoyaltyActivity(BaseModel):
    def __str__(self):
        return self.description

    card = models.ForeignKey(LoyaltyCard, on_delete=models.CASCADE, related_name="activity")
    type = models.CharField(max_length=6, choices=[("earn", "Earn"), ("redeem", "Redeem")])
    description = models.CharField(max_length=200)
    location_name = models.CharField(max_length=120, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "coffee card activity"
        verbose_name_plural = "coffee card activity"


class GiftCard(ManagedModel):
    """A customer's stored balance. Topped up by the team in BOS; spent on app orders."""

    def __str__(self):
        return f"Gift card ·· {self.last4}"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gift_card"
    )
    last4 = models.CharField(max_length=4, default=gift_card_last4)
    balance_cents = models.PositiveIntegerField(default=0)

    class Meta(ManagedModel.Meta):
        verbose_name = "gift card"


class GiftCardActivity(BaseModel):
    def __str__(self):
        return self.description

    card = models.ForeignKey(GiftCard, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(
        max_length=5, choices=[("added", "Added"), ("spent", "Spent"), ("sent", "Sent")]
    )
    description = models.CharField(max_length=200)
    amount_cents = models.PositiveIntegerField()
    # Only for "sent" eGifts.
    recipient_name = models.CharField(max_length=160, blank=True)
    recipient_email = models.EmailField(blank=True)
    message = models.TextField(blank=True)
    payment_reference = models.CharField(max_length=120, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True)
    request_hash = models.CharField(max_length=64, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "gift card activity"
        verbose_name_plural = "gift card activity"
        constraints = [
            models.UniqueConstraint(
                fields=["card", "idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="unique_gift_idempotency_key",
            )
        ]


def wallet_token():
    return secrets.token_hex(24)


class WalletPass(BaseModel):
    """
    The coffee card as an Apple Wallet pass. `version` goes up whenever the card changes, so
    every iPhone holding the pass is told to fetch the new one (apps/loyalty/wallet.py).
    """

    def __str__(self):
        return f"Wallet pass {self.card.member_number}"

    card = models.OneToOneField(LoyaltyCard, on_delete=models.CASCADE, related_name="wallet_pass")
    serial = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    authentication_token = models.CharField(max_length=64, default=wallet_token, editable=False)
    version = models.BigIntegerField(default=1)

    class Meta(BaseModel.Meta):
        verbose_name = "Wallet pass"


class WalletRegistration(BaseModel):
    """An iPhone that holds a pass and wants to hear when it changes (Apple's web service)."""

    def __str__(self):
        return self.device_library_id

    wallet_pass = models.ForeignKey(
        WalletPass, on_delete=models.CASCADE, related_name="registrations"
    )
    device_library_id = models.CharField(max_length=200)
    push_token = models.CharField(max_length=256)
    notified_version = models.BigIntegerField(default=0)

    class Meta(BaseModel.Meta):
        verbose_name = "Wallet device"
        constraints = [
            models.UniqueConstraint(
                fields=["wallet_pass", "device_library_id"], name="unique_wallet_registration"
            )
        ]
