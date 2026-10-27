"""
Taking money for app orders. The only module that talks to a payment provider.

PAYMENT_PROVIDER:
- "" (default): answers 501 NOT_IMPLEMENTED whenever money is due (orders fully covered by a
  gift card or a free coffee still go through).
- "demo": accepts the app's demo tokens (demo_applepay_…, demo_card_…) and charges nothing,
  so the app can be tested end to end. Test servers only.
- "square": Square Payments API. The app sends a single-use nonce from Square's card entry
  or Apple Pay sheet. An order's payment is only authorised (`autocomplete: false`): it is
  captured when the café accepts the order (`capture`) and released when the café declines
  (`refund`), which is what the app tells the customer ("You haven't been charged"). An
  authorisation nobody acts on lapses after Square's delay (7 days, then cancelled).

Money is integer cents AUD. Square credentials stay on the server (SQUARE_ACCESS_TOKEN); the
app only knows the public application ID.
"""

import hashlib
import logging

import httpx
from django.conf import settings

from apps.mobile.errors import AppError

logger = logging.getLogger(__name__)

NOT_COMPLETED = "Payment was not completed."
DECLINED = "Your card was declined. Please try another card or Apple Pay."
UNREACHABLE = (
    "We couldn’t reach the payment service, so you haven’t been charged. Please try again."
)
NOT_AVAILABLE = (
    "Card and Apple Pay payments aren’t available in the app yet. Please order at the café."
)
SQUARE_HOSTS = {
    "sandbox": "https://connect.squareupsandbox.com",
    "production": "https://connect.squareup.com",
}
# Square error codes worth a specific line; every other card problem reads DECLINED.
CARD_MESSAGES = {
    "INSUFFICIENT_FUNDS": "Your card doesn’t have enough funds. Please try another card.",
    "CVV_FAILURE": "The security code didn’t match. Please check your card details.",
    "ADDRESS_VERIFICATION_FAILURE": "The postcode didn’t match your card.",
    "INVALID_POSTAL_CODE": "The postcode didn’t match your card.",
    "INVALID_EXPIRATION": "Your card has expired. Please try another card.",
    "CARD_EXPIRED": "Your card has expired. Please try another card.",
    "CARD_NOT_SUPPORTED": "This card isn’t accepted. Please try another card.",
}


class SquareError(Exception):
    def __init__(self, status, errors):
        self.status = status
        self.errors = errors
        super().__init__(f"Square {status}: {errors}")

    @property
    def code(self):
        return (self.errors[0].get("code") if self.errors else "") or ""

    @property
    def category(self):
        return (self.errors[0].get("category") if self.errors else "") or ""


def provider():
    return settings.PAYMENT_PROVIDER


def payments_enabled():
    if provider() == "square":
        return bool(settings.SQUARE_ACCESS_TOKEN)
    return provider() == "demo"


def charge(amount_cents, token, description, idempotency_key="", location=None, capture=False):
    """
    Charge a single-use provider token. Returns the payment reference stored on the order.
    `capture=False` (orders) only authorises with Square; `capture=True` takes the money now.
    """
    if not token:
        raise AppError("PAYMENT_DECLINED", NOT_COMPLETED, 402)
    if provider() == "demo":
        if not str(token).startswith("demo_"):
            raise AppError("PAYMENT_DECLINED", NOT_COMPLETED, 402)
        return f"demo:{str(token)[:60]}"
    if provider() == "square" and settings.SQUARE_ACCESS_TOKEN:
        return square_charge(
            amount_cents, str(token), description, idempotency_key, location, capture
        )
    raise AppError("NOT_IMPLEMENTED", NOT_AVAILABLE, 501)


def capture(reference):
    """Take the money the order authorised (the café accepted it). Never raises."""
    payment_id = square_id(reference)
    if not payment_id:
        return True
    try:
        square("POST", f"/v2/payments/{payment_id}/complete", {})
        return True
    except (SquareError, httpx.HTTPError):
        logger.exception("Square capture failed for %s", reference)
        return False


def refund(reference, amount_cents):
    """
    Give the money back for an order that will not be made: an authorisation is released
    (cancelled), a captured payment is refunded. Never raises — the café's decision stands
    and a failure is logged for the team to finish in Square.
    """
    payment_id = square_id(reference)
    if not payment_id:
        return bool(reference)
    try:
        status = square("GET", f"/v2/payments/{payment_id}")["payment"]["status"]
        if status == "APPROVED":
            square("POST", f"/v2/payments/{payment_id}/cancel", {})
        elif status == "COMPLETED":
            square(
                "POST",
                "/v2/refunds",
                {
                    "idempotency_key": square_key(f"refund:{payment_id}"),
                    "payment_id": payment_id,
                    "amount_money": {"amount": amount_cents, "currency": "AUD"},
                    "reason": "EightyTwenty order not made",
                },
            )
        return True
    except (SquareError, httpx.HTTPError, KeyError):
        logger.exception("Square refund failed for %s", reference)
        return False


# ---------------------------------------------------------------- Square


def square_charge(amount_cents, token, description, idempotency_key, location, capture):
    location_id = (getattr(location, "square_location_id", "") or "") or (
        settings.SQUARE_LOCATION_ID
    )
    if not location_id:
        logger.error("No Square location for %s", getattr(location, "slug", "eGift"))
        raise AppError("NOT_IMPLEMENTED", NOT_AVAILABLE, 501)
    body = {
        # The nonce is part of the key: a retry with the same card replays, a new card is new.
        "idempotency_key": square_key(f"{idempotency_key}:{token}"),
        "source_id": token,
        "amount_money": {"amount": amount_cents, "currency": "AUD"},
        "autocomplete": capture,
        "location_id": location_id,
        "note": description[:500],
    }
    try:
        payment = square("POST", "/v2/payments", body)["payment"]
    except httpx.HTTPError:
        logger.exception("Square unreachable")
        raise AppError("SERVER", UNREACHABLE, 502) from None
    except SquareError as e:
        if e.category == "PAYMENT_METHOD_ERROR":
            raise AppError("PAYMENT_DECLINED", CARD_MESSAGES.get(e.code, DECLINED), 402) from None
        if e.status in (400, 404, 409, 422):
            # Used or expired nonce, bad amount…: the customer can simply try again.
            logger.warning("Square refused the payment: %s", e.errors)
            raise AppError("PAYMENT_DECLINED", NOT_COMPLETED, 402) from None
        logger.error("Square error: %s", e)
        raise AppError("SERVER", UNREACHABLE, 502) from None
    if payment.get("status") not in ("APPROVED", "COMPLETED"):
        raise AppError("PAYMENT_DECLINED", DECLINED, 402)
    return f"square:{payment['id']}"


def square(method, path, body=None):
    response = httpx.request(
        method,
        SQUARE_HOSTS.get(settings.SQUARE_ENVIRONMENT, SQUARE_HOSTS["sandbox"]) + path,
        json=body,
        headers={
            "Authorization": f"Bearer {settings.SQUARE_ACCESS_TOKEN}",
            "Square-Version": settings.SQUARE_VERSION,
        },
        timeout=20,
    )
    try:
        data = response.json() if response.content else {}
    except ValueError:
        data = {}
    if response.status_code >= 400:
        raise SquareError(response.status_code, data.get("errors") or [])
    return data


def square_id(reference):
    return reference.removeprefix("square:") if reference.startswith("square:") else ""


def square_key(seed):
    """Square idempotency keys are at most 45 characters."""
    return hashlib.sha256(seed.encode()).hexdigest()[:45]
