import logging
from datetime import timedelta

import httpx
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import AppNotification, EmailMessage, PushDevice

logger = logging.getLogger(__name__)


def enqueue_email(recipient, subject, body, dedup_key):
    message, created = EmailMessage.objects.get_or_create(
        dedup_key=dedup_key, defaults={"recipient": recipient, "subject": subject, "body": body}
    )
    if created:
        transaction.on_commit(lambda: deliver_email(message.pk), robust=True)
    return message


def deliver_email(message_id):
    now = timezone.now()
    with transaction.atomic():
        message = EmailMessage.objects.select_for_update().get(pk=message_id)
        if message.status == "sent" or message.attempts >= 8 or message.next_attempt_at > now:
            return False
        message.status = "sending"
        message.attempts += 1
        message.next_attempt_at = now + timedelta(minutes=5)
        message.save(update_fields=["status", "attempts", "next_attempt_at", "updated_at"])
    try:
        if settings.EMAIL_PROVIDER_API_KEY:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.EMAIL_PROVIDER_API_KEY}",
                    "Idempotency-Key": message.dedup_key,
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [message.recipient],
                    "subject": message.subject,
                    "text": message.body,
                },
                timeout=5,
            )
            response.raise_for_status()
        elif settings.DEBUG or settings.EMAIL_BACKEND.endswith("locmem.EmailBackend"):
            send_mail(message.subject, message.body, settings.EMAIL_FROM, [message.recipient])
        else:
            raise RuntimeError("Email provider is not configured")
    except Exception as exc:
        EmailMessage.objects.filter(
            pk=message.pk, status="sending", attempts=message.attempts
        ).update(
            status="failed",
            last_error=type(exc).__name__,
            next_attempt_at=now + timedelta(minutes=min(2**message.attempts, 360)),
        )
        logger.warning("Email delivery failed for message %s (%s)", message.pk, type(exc).__name__)
        return False
    EmailMessage.objects.filter(pk=message.pk, status="sending", attempts=message.attempts).update(
        status="sent", sent_at=timezone.now(), last_error=""
    )
    return True


def retry_emails(limit=10):
    ids = list(
        EmailMessage.objects.filter(
            Q(status="pending") | Q(status="failed") | Q(status="sending"),
            attempts__lt=8,
            next_attempt_at__lte=timezone.now(),
        )
        .order_by("next_attempt_at")
        .values_list("pk", flat=True)[:limit]
    )
    return sum(deliver_email(pk) for pk in ids)


# Feed kind → the app's notification toggle (Profile → Notifications).
PUSH_TOGGLES = {
    "order": "orderUpdates",
    "booking": "bookings",
    "loyalty": "coffeeCard",
    "gift_card": "giftCardActivity",
    "offer": "offersAndNews",
}


def notify(user, kind, text):
    """Add a line to a customer's in-app feed (mobile app bell) and push it to their phones."""
    if user is None or not user.is_active:
        return None
    item = AppNotification.objects.create(user=user, kind=kind, text=text[:300])
    if wants_push(user, kind):
        transaction.on_commit(lambda: send_push(user.pk, item), robust=True)
    return item


def wants_push(user, kind):
    if not settings.PUSH_ENABLED:
        return False
    if not PushDevice.objects.filter(user=user, is_active=True).exists():
        return False
    from apps.accounts.models import CustomerProfile
    from apps.mobile.presenters import APP_PREFERENCE_DEFAULTS

    stored = CustomerProfile.objects.filter(user=user).values_list("app_preferences", flat=True)
    toggles = {
        **APP_PREFERENCE_DEFAULTS["notifications"],
        **((stored.first() or {}).get("notifications") or {}),
    }
    return bool(toggles.get(PUSH_TOGGLES.get(kind, ""), True))


def send_push(user_id, item):
    """One Expo push request for every active phone of the user. Failures never raise."""
    devices = list(PushDevice.objects.filter(user_id=user_id, is_active=True))
    if not devices:
        return 0
    messages = [
        {
            "to": device.token,
            "title": "EightyTwenty",
            "body": item.text,
            "sound": "default",
            "data": {"kind": item.kind, "notificationId": str(item.pk)},
        }
        for device in devices
    ]
    headers = {"Accept": "application/json"}
    if settings.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"
    try:
        response = httpx.post(settings.EXPO_PUSH_URL, json=messages, headers=headers, timeout=5)
        response.raise_for_status()
        tickets = response.json().get("data") or []
    except Exception as exc:
        logger.warning("Push delivery failed for user %s (%s)", user_id, type(exc).__name__)
        return 0
    sent = 0
    for device, ticket in zip(devices, tickets, strict=False):
        if ticket.get("status") == "ok":
            sent += 1
            continue
        error = (ticket.get("details") or {}).get("error") or ticket.get("message") or "error"
        device.last_error = str(error)[:120]
        # The app was uninstalled or the token expired: stop sending to it.
        device.is_active = error != "DeviceNotRegistered"
        device.save(update_fields=["last_error", "is_active", "updated_at"])
    return sent


def register_push_device(user, token, platform=""):
    """The token moves to whoever signed in on that phone last."""
    device, _ = PushDevice.objects.update_or_create(
        token=token,
        defaults={"user": user, "platform": platform, "is_active": True, "last_error": ""},
    )
    return device


def remove_push_device(user, token):
    PushDevice.objects.filter(user=user, token=token).update(is_active=False)
