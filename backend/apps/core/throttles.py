import hashlib
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

from .models import RateLimitBucket


class PersistentThrottle(SimpleRateThrottle):
    """Database-backed fixed windows shared by all Gunicorn workers."""

    def __init__(self):
        self.remaining_wait = 0

    def allow_request(self, request, view):
        scope = getattr(view, "throttle_scope", None) or (
            "user" if request.user.is_authenticated else "anon"
        )
        rate = self.THROTTLE_RATES.get(scope)
        if not rate:
            return True
        limit, duration = self.parse_rate(rate)
        identity = (
            str(request.user.pk) if request.user.is_authenticated else self.get_ident(request)
        )
        identities = [identity]
        if scope == "auth" and isinstance(request.data, dict) and request.data.get("email"):
            identities.append("email:" + str(request.data["email"]).strip().lower())
        allowed = True
        now = timezone.now()
        for ident in identities:
            key = hashlib.sha256(f"{scope}:{ident}".encode()).hexdigest()
            with transaction.atomic():
                bucket, _ = RateLimitBucket.objects.get_or_create(
                    key=key, defaults={"expires_at": now + timedelta(seconds=duration)}
                )
                bucket = RateLimitBucket.objects.select_for_update().get(pk=bucket.pk)
                if bucket.expires_at <= now:
                    bucket.hits = 0
                    bucket.expires_at = now + timedelta(seconds=duration)
                if bucket.hits >= limit:
                    allowed = False
                    self.remaining_wait = max(
                        self.remaining_wait, (bucket.expires_at - now).total_seconds()
                    )
                else:
                    bucket.hits += 1
                    bucket.save(update_fields=["hits", "expires_at", "updated_at"])
        return allowed

    def wait(self):
        return self.remaining_wait
