import logging
from datetime import timedelta

import httpx
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import EmailMessage

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
