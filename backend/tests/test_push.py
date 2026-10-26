"""Expo push notifications for the customer app: registering phones and pushing feed items."""

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
