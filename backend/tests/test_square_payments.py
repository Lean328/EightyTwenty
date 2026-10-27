"""Square as the app's payment provider (apps/orders/payments.py), with Square's API faked."""

import httpx
import pytest
from django.test import RequestFactory

from apps.loyalty.models import GiftCard
from apps.orders import payments
from apps.orders.models import Order
from apps.orders.services import transition_order
from tests.factories import UserFactory
from tests.test_mobile_api import BASE, app, cafe, customer, menu, order_body  # noqa: F401

NONCE = "cnon:card-nonce-ok"


class FakeSquare:
    """Answers Square API calls from a script and records them."""

    def __init__(self):
        self.calls = []
        self.status = "APPROVED"
        self.fail = None

    def __call__(self, method, url, json=None, headers=None, timeout=None):
        path = url.split(".com", 1)[1]
        self.calls.append((method, path, json, headers))
        if self.fail == "network":
            raise httpx.ConnectError("down")
        if self.fail:
            status, errors = self.fail
            return httpx.Response(status, json={"errors": errors})
        if method == "POST" and path == "/v2/payments":
            status = "COMPLETED" if json["autocomplete"] else "APPROVED"
            return httpx.Response(200, json={"payment": {"id": "pay_1", "status": status}})
        if method == "GET":
            return httpx.Response(200, json={"payment": {"id": "pay_1", "status": self.status}})
        return httpx.Response(200, json={"payment": {"id": "pay_1"}, "refund": {"id": "r_1"}})

    def paths(self):
        return [(m, p) for m, p, _, _ in self.calls]


@pytest.fixture
def square(settings, monkeypatch, cafe):  # noqa: F811
    settings.PAYMENT_PROVIDER = "square"
    settings.SQUARE_ACCESS_TOKEN = "EAAA-test"
    settings.SQUARE_ENVIRONMENT = "sandbox"
    settings.SQUARE_LOCATION_ID = "L_DEFAULT"
    cafe.square_location_id = "L_BRADDON"
    cafe.save()
    fake = FakeSquare()
    monkeypatch.setattr(payments.httpx, "request", fake)
    return fake


def place(app, key="ord_abc"):  # noqa: F811
    body = order_body(payment={"choice": "new_card", "token": NONCE}, expectedTotalCents=3016)
    return app.post(f"{BASE}/orders", body, format="json", HTTP_IDEMPOTENCY_KEY=key)


def move(order, status):
    request = RequestFactory().post("/")
    request.user = UserFactory(role="staff", is_staff=True)
    return transition_order(order, status, request)


def test_an_order_is_authorised_at_the_cafe_location_not_charged(app, menu, square):  # noqa: F811
    response = place(app)
    assert response.status_code == 201, response.json()
    order = Order.objects.get(pk=response.json()["id"])
    assert order.payment_reference == "square:pay_1"
    method, path, body, headers = square.calls[0]
    assert (method, path) == ("POST", "/v2/payments")
    assert body["autocomplete"] is False and body["source_id"] == NONCE
    assert body["amount_money"] == {"amount": order.total_cents, "currency": "AUD"}
    assert body["location_id"] == "L_BRADDON" and len(body["idempotency_key"]) <= 45
    assert headers["Authorization"] == "Bearer EAAA-test" and headers["Square-Version"]


def test_accepting_captures_and_declining_releases(app, menu, square):  # noqa: F811
    order = Order.objects.get(pk=place(app).json()["id"])
    move(order, "confirmed")
    assert square.paths()[-1] == ("POST", "/v2/payments/pay_1/complete")
    move(order, "preparing")  # captured once only
    assert square.paths().count(("POST", "/v2/payments/pay_1/complete")) == 1

    second = Order.objects.get(pk=place(app, key="ord_def").json()["id"])
    move(second, "declined")
    assert square.paths()[-2:] == [
        ("GET", "/v2/payments/pay_1"),
        ("POST", "/v2/payments/pay_1/cancel"),
    ]


def test_declining_after_capture_refunds_the_full_amount(app, menu, square):  # noqa: F811
    order = Order.objects.get(pk=place(app).json()["id"])
    move(order, "confirmed")
    square.status = "COMPLETED"
    move(order, "declined")
    method, path, body, _ = square.calls[-1]
    assert (method, path) == ("POST", "/v2/refunds")
    assert body["payment_id"] == "pay_1"
    assert body["amount_money"] == {"amount": order.total_cents, "currency": "AUD"}


def test_a_declined_card_says_why_and_saves_nothing(app, menu, square):  # noqa: F811
    square.fail = (402, [{"category": "PAYMENT_METHOD_ERROR", "code": "INSUFFICIENT_FUNDS"}])
    response = place(app)
    assert response.status_code == 402
    assert response.json()["error"]["code"] == "PAYMENT_DECLINED"
    assert "enough funds" in response.json()["error"]["message"]
    assert not Order.objects.exists()


def test_square_down_is_a_retryable_error(app, menu, square):  # noqa: F811
    square.fail = "network"
    response = place(app)
    assert response.status_code == 502 and response.json()["error"]["code"] == "SERVER"
    assert "haven’t been charged" in response.json()["error"]["message"]
    assert not Order.objects.exists()


def test_a_used_nonce_can_be_retried_with_a_new_card(app, menu, square):  # noqa: F811
    square.fail = (400, [{"category": "INVALID_REQUEST_ERROR", "code": "CARD_TOKEN_USED"}])
    assert place(app).json()["error"]["code"] == "PAYMENT_DECLINED"


def test_without_a_square_location_card_payments_are_unavailable(app, menu, square, cafe, settings):  # noqa: F811
    cafe.square_location_id = ""
    cafe.save()
    settings.SQUARE_LOCATION_ID = ""
    assert place(app).status_code == 501
    assert square.calls == []


def test_egift_cards_are_not_sold_until_square_issues_them(app, customer, square):  # noqa: F811
    GiftCard.objects.create(user=customer, balance_cents=0)
    body = {
        "amountCents": 2500,
        "recipientName": "Mia",
        "recipientEmail": "mia@example.com",
        "message": "",
        "paymentToken": NONCE,
    }
    response = app.post(f"{BASE}/gift-cards/send", body, format="json", HTTP_IDEMPOTENCY_KEY="g1")
    assert response.status_code == 501
    assert square.calls == []
