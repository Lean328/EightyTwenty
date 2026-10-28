"""Expo push notifications for the customer app: registering phones and pushing feed items."""

from unittest.mock import patch
from urllib.parse import quote

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile
from apps.notifications.models import PushDevice
from apps.notifications.services import notify

from .factories import UserFactory

TOKEN = "ExponentPushToken[abc123]"


class FakeResponse:
    def __init__(self, tickets):
        self.tickets = tickets

    def raise_for_status(self):
        return None

    def json(self):
        return {"data": self.tickets}


@pytest.fixture
def customer(db):
    return UserFactory(first_name="Sophie")


@pytest.fixture
def app(customer):
    client = APIClient()
    client.force_authenticate(customer)
    return client


@pytest.fixture
def expo(monkeypatch, settings):
    settings.PUSH_ENABLED = True
    calls = []

    def post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers})
        return FakeResponse(
            calls_tickets.pop(0) if calls_tickets else [{"status": "ok"}] * len(json)
        )

    calls_tickets = []
    monkeypatch.setattr("apps.notifications.services.httpx.post", post)
    return {"calls": calls, "tickets": calls_tickets}


def test_register_and_remove_a_phone(app, customer):
    assert app.post("/api/v1/app/me/push-tokens", {"token": TOKEN, "platform": "ios"},
                    format="json").status_code == 204  # fmt: skip
    device = PushDevice.objects.get()
    assert device.user == customer and device.platform == "ios" and device.is_active
    bad = app.post("/api/v1/app/me/push-tokens", {"token": "not-a-token"}, format="json")
    assert bad.status_code == 422 and bad.json()["error"]["fields"] == {"token": "invalid"}
    other = APIClient()
    other.force_authenticate(UserFactory())
    other.post("/api/v1/app/me/push-tokens", {"token": TOKEN}, format="json")
    assert PushDevice.objects.get().user != customer  # the phone moved to the new sign-in
    assert other.delete(f"/api/v1/app/me/push-tokens/{quote(TOKEN)}").status_code == 204
    assert not PushDevice.objects.get().is_active


def test_feed_items_are_pushed(customer, expo, django_capture_on_commit_callbacks):
    PushDevice.objects.create(user=customer, token=TOKEN)
    with django_capture_on_commit_callbacks(execute=True):
        item = notify(
            customer, "order", "Order #8020-4471 is ready at the Braddon counter.", "/orders/abc"
        )
    assert len(expo["calls"]) == 1
    message = expo["calls"][0]["json"][0]
    assert message["to"] == TOKEN and message["body"].startswith("Order #8020-4471")
    assert message["data"] == {
        "kind": "order",
        "notificationId": str(item.pk),
        "url": "/orders/abc",
    }


def test_push_follows_the_customers_toggles(customer, expo, django_capture_on_commit_callbacks):
    PushDevice.objects.create(user=customer, token=TOKEN)
    CustomerProfile.objects.create(
        user=customer, app_preferences={"notifications": {"coffeeCard": False}}
    )
    with django_capture_on_commit_callbacks(execute=True):
        notify(customer, "loyalty", "Stamp added")
        notify(customer, "offer", "New offer")  # offersAndNews is off by default
    assert expo["calls"] == []
    with django_capture_on_commit_callbacks(execute=True):
        notify(customer, "booking", "Your table is set")
    assert len(expo["calls"]) == 1


def test_uninstalled_apps_are_dropped(customer, expo, django_capture_on_commit_callbacks):
    PushDevice.objects.create(user=customer, token=TOKEN)
    expo["tickets"].append(
        [{"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}]
    )
    with django_capture_on_commit_callbacks(execute=True):
        notify(customer, "order", "Ready")
    device = PushDevice.objects.get()
    assert not device.is_active and device.last_error == "DeviceNotRegistered"


def test_push_failures_never_break_the_request(customer, monkeypatch, settings):
    from apps.notifications.services import send_push

    settings.PUSH_ENABLED = True
    PushDevice.objects.create(user=customer, token=TOKEN)

    def boom(*args, **kwargs):
        raise OSError("network down")

    monkeypatch.setattr("apps.notifications.services.httpx.post", boom)
    item = notify(customer, "order", "Ready")
    assert send_push(customer.pk, item) == 0


def test_closing_the_account_forgets_the_phones(customer):
    from apps.accounts.services import anonymize

    PushDevice.objects.create(user=customer, token=TOKEN)
    anonymize(customer)
    assert not PushDevice.objects.exists()


def test_email_goes_through_brevo_when_the_key_is_a_brevo_key(settings, db):
    from apps.notifications.models import EmailMessage
    from apps.notifications.services import deliver_email

    settings.EMAIL_PROVIDER = ""
    settings.EMAIL_PROVIDER_API_KEY = "xkeysib-test"
    settings.EMAIL_FROM = "EightyTwenty <no-reply@oms.com.vn>"
    message = EmailMessage.objects.create(
        recipient="sophie@example.com", subject="Hi", body="Body", dedup_key="brevo-1"
    )
    with patch("apps.notifications.services.httpx.post") as post:
        post.return_value.raise_for_status.return_value = None
        assert deliver_email(message.pk) is True
    url = post.call_args.args[0]
    payload = post.call_args.kwargs["json"]
    assert url == "https://api.brevo.com/v3/smtp/email"
    assert post.call_args.kwargs["headers"]["api-key"] == "xkeysib-test"
    assert payload["sender"] == {"name": "EightyTwenty", "email": "no-reply@oms.com.vn"}
    assert payload["to"] == [{"email": "sophie@example.com"}]
    assert payload["textContent"] == "Body"
    assert "htmlContent" not in payload
    message.refresh_from_db()
    assert message.status == "sent"


def test_every_email_also_goes_out_in_the_brand_layout(settings, db):
    from apps.notifications.services import enqueue_email, send_with_provider

    settings.EMAIL_PROVIDER = "brevo"
    settings.EMAIL_PROVIDER_API_KEY = "any"
    message = enqueue_email(
        "sophie@example.com",
        "Booking request BK-1",
        "We received your request.\n\nDetails: https://example.com/b",
        "layout-1",
    )
    assert "<h1" in message.html and "Booking request BK-1" in message.html
    assert '<a href="https://example.com/b"' in message.html
    with patch("apps.notifications.services.httpx.post") as post:
        send_with_provider(message)
    payload = post.call_args.kwargs["json"]
    assert payload["htmlContent"] == message.html and payload["textContent"] == message.body


def test_a_brevo_failure_is_retried_later(settings, db):
    from apps.notifications.models import EmailMessage
    from apps.notifications.services import deliver_email

    settings.EMAIL_PROVIDER = "brevo"
    settings.EMAIL_PROVIDER_API_KEY = "any"
    message = EmailMessage.objects.create(
        recipient="sophie@example.com", subject="Hi", body="Body", dedup_key="brevo-2"
    )
    with patch("apps.notifications.services.httpx.post") as post:
        post.return_value.raise_for_status.side_effect = RuntimeError("401")
        assert deliver_email(message.pk) is False
    message.refresh_from_db()
    assert message.status == "failed" and message.attempts == 1


def test_dev_redirect_keeps_mail_away_from_real_cafe_inboxes(settings, db):
    from apps.notifications.models import EmailMessage
    from apps.notifications.services import deliver_email

    settings.EMAIL_PROVIDER = "brevo"
    settings.EMAIL_PROVIDER_API_KEY = "any"
    settings.EMAIL_REDIRECT_TO = "dev@example.com"
    message = EmailMessage.objects.create(
        recipient="braddon@eightytwentyfood.com.au", subject="New order", body="B", dedup_key="r"
    )
    with patch("apps.notifications.services.httpx.post") as post:
        post.return_value.raise_for_status.return_value = None
        deliver_email(message.pk)
    payload = post.call_args.kwargs["json"]
    assert payload["to"] == [{"email": "dev@example.com"}]
    assert payload["subject"] == "[dev → braddon@eightytwentyfood.com.au] New order"
