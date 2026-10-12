"""
Taking money for app orders and eGift cards.

No payment provider has been chosen (ARCHITECTURE §14), so there is no real charge here.
PAYMENT_PROVIDER="" (default) answers 501 NOT_IMPLEMENTED whenever money is due;
PAYMENT_PROVIDER="demo" accepts the app's demo tokens (demo_applepay_…, demo_card_…) and
charges nothing, so the app can be tested end to end. A real provider (e.g. Square, which
the café already uses for gift cards) replaces `charge` and `refund`.
"""

from django.conf import settings

from apps.mobile.errors import AppError

NOT_COMPLETED = "Payment was not completed."


def charge(amount_cents, token, description):
    """Charge a single-use provider token. Returns the provider's payment reference."""
    if not token:
        raise AppError("PAYMENT_DECLINED", NOT_COMPLETED, 402)
    if settings.PAYMENT_PROVIDER == "demo":
        if not str(token).startswith("demo_"):
            raise AppError("PAYMENT_DECLINED", NOT_COMPLETED, 402)
        return f"demo:{str(token)[:60]}"
    raise AppError(
        "NOT_IMPLEMENTED",
        "Card and Apple Pay payments aren’t available in the app yet. Please order at the café.",
        501,
    )


def refund(reference, amount_cents):
    """Give money back for a declined order. Demo charges have nothing to refund."""
    return bool(reference)


def payments_enabled():
    return settings.PAYMENT_PROVIDER == "demo"
