import httpx
from django.conf import settings
from rest_framework import serializers

from .exceptions import DomainError


def verify_form(data, request):
    if data.pop("website", ""):
        raise DomainError("spam_detected", "Unable to accept this submission.")
    token = data.pop("turnstile_token", "")
    if not settings.TURNSTILE_ENABLED:
        return
    if not token:
        raise DomainError("captcha_required", "Please complete the verification.")
    try:
        response = httpx.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token},
            timeout=5,
        )
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise DomainError(
            "captcha_unavailable", "Verification is temporarily unavailable.", 503
        ) from exc
    if not result.get("success") or (
        settings.TURNSTILE_ALLOWED_HOSTNAMES
        and result.get("hostname") not in settings.TURNSTILE_ALLOWED_HOSTNAMES
    ):
        raise DomainError("captcha_failed", "Verification failed. Please try again.")


class AntiSpamMixin(serializers.Serializer):
    website = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=500
    )
    turnstile_token = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=2048
    )
