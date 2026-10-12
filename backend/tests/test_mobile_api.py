"""Customer mobile app API (/api/v1/app): contract shapes, rules and side effects."""

from datetime import time, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import StaffAssignment
from apps.bookings.models import Booking
from apps.enquiries.models import CateringPackage
from apps.locations.models import Location, OpeningHours
from apps.loyalty.models import GiftCard, LoyaltyCard
from apps.media.models import MediaAsset
from apps.menu.models import (
    Category,
    LocationMenuItem,
    MenuItem,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)
from apps.notifications.models import AppNotification, EmailMessage
from apps.orders.models import Order
from apps.orders.services import compute_totals

from .factories import UserFactory

BASE = "/api/v1/app"
PASSWORD = "A-strong-password-2026"
LOCATION_KEYS = {
    "id", "name", "subtitle", "area", "headline", "address", "phone", "email", "hoursLabel",
    "hoursShort", "weeklyHours", "status", "fulfilmentMethods", "note", "waitLabel", "imageUrl",
    "galleryUrls", "externalOrderUrl", "bookingLabel", "flags",
}  # fmt: skip
ORDER_KEYS = {
    "id", "number", "locationId", "locationName", "method", "status", "createdAt", "timing",
    "deliveryAddress", "tableNumber", "lines", "totals", "paymentLabel", "stampsEarned",
    "rewardRedeemed", "estimatedWait",
}  # fmt: skip


@pytest.fixture
def cafe(db):
    location = Location.objects.create(
        slug="braddon",
        name="Braddon",
        subtitle="Lonsdale St",
        is_published=True,
        status="open",
        fulfilment_methods=["pickup", "delivery"],
        wait_text="20–25 min",
        email="braddon@example.com",
    )
    for day in range(7):
        OpeningHours.objects.create(
            location=location, weekday=day, opens_at=time(6), closes_at=time(15)
        )
    return location


@pytest.fixture
def menu(db):
    coffee = Category.objects.create(slug="coffee", name="Coffee & Hot Drinks", short_name="Coffee")
    food = Category.objects.create(slug="allday", name="All Day Meals", sort_order=1)
    flat = MenuItem.objects.create(
        slug="hotcoffee", category=coffee, name="Milk Based Coffee", base_price_cents=500,
        is_published=True, is_featured=True,
    )  # fmt: skip
    drink = ModifierGroup.objects.create(
        code="drink", name="Choose your drink", is_required=True, max_select=1
    )
    for order, (name, cents) in enumerate([("Flat White", 50), ("Latte", 50), ("Macchiato", 0)]):
        ModifierOption.objects.create(
            group=drink, name=name, price_delta_cents=cents, sort_order=order
        )
    variation = ModifierGroup.objects.create(code="var", name="Drink variation", max_select=0)
    ModifierOption.objects.create(group=variation, name="OAT ADC", price_delta_cents=80)
    MenuItemModifierGroup.objects.create(menu_item=flat, modifier_group=drink, sort_order=0)
    MenuItemModifierGroup.objects.create(menu_item=flat, modifier_group=variation, sort_order=1)
    burger = MenuItem.objects.create(
        slug="bburger",
        category=food,
        name="Breakfast Burger",
        base_price_cents=2300,
        is_published=True,
    )
    return {"coffee": flat, "burger": burger}


@pytest.fixture
def customer(db):
    user = UserFactory(first_name="Sophie", last_name="Nguyen", phone="0400 123 456")
    return user


@pytest.fixture
def app(customer):
    client = APIClient()
    client.force_authenticate(customer)
    return client


def order_body(**overrides):
    body = {
        "locationId": "braddon",
        "method": "pickup",
        "timing": {"type": "asap"},
        "deliveryAddress": None,
        "tableNumber": None,
        "lines": [
            {
                "itemId": "hotcoffee",
                "qty": 1,
                "selections": {"drink": ["Flat White"], "var": ["OAT ADC"]},
                "note": "",
            },
            {"itemId": "bburger", "qty": 1, "selections": {}, "note": "No beetroot relish"},
        ],
        "payment": {"choice": "apple_pay", "token": "demo_applepay_1"},
        "useGiftCard": False,
        "useReward": False,
        "contact": {"name": "Sophie Nguyen", "phone": "0400 123 456"},
        "expectedTotalCents": 2930,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------- pricing


def test_pricing_matches_the_app_worked_example(db):
    lines = [(630, 2, True), (2300, 1, False)]
    totals = compute_totals(lines, "delivery", "saved_card", 9, True, True, 1000)
    assert {k: totals[k] for k in ("subtotal", "delivery", "reward", "surcharge", "gift_card", "total")} == {
        "subtotal": 3560, "delivery": 356, "reward": 630, "surcharge": 97, "gift_card": 1000, "total": 2383,
    }  # fmt: skip
    assert totals["coffee_count"] == 2 and totals["reward_available"]


def test_pricing_rounds_rates_half_up_in_cents(db):
    assert (
        compute_totals([(2365, 1, False)], "delivery", "apple_pay", 0, False, False, 0)["delivery"]
        == 237
    )
    assert (
        compute_totals([(11000, 1, False)], "pickup", "new_card", 0, False, False, 0)["surcharge"]
        == 325
    )


# ---------------------------------------------------------------- auth & account


def test_sign_up_returns_a_session_and_creates_cards(client, cafe):
    response = client.post(
        f"{BASE}/auth/sign-up",
        {
            "name": "Alex Smith",
            "phone": "0400 000 000",
            "email": "Alex@Example.com",
            "password": PASSWORD,
        },
        format="json",
    )
    assert response.status_code == 201
    session = response.json()
    assert set(session) == {"customerId", "accessToken", "refreshToken", "expiresAt"}
    assert session["expiresAt"].endswith(("+10:00", "+11:00"))
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['accessToken']}")
    me = client.get(f"{BASE}/me").json()
    assert me["name"] == "Alex Smith" and me["email"] == "alex@example.com"
    assert LoyaltyCard.objects.get(user_id=me["id"]).member_number.startswith("8020 ")
    assert GiftCard.objects.get(user_id=me["id"]).balance_cents == 0
    assert client.get(f"{BASE}/me/preferences").json()["homeCafeId"] == "braddon"


def test_sign_up_errors_use_the_app_error_shape(client, customer):
    bad = client.post(
        f"{BASE}/auth/sign-up",
        {"name": "A", "phone": "0400 000 000", "email": "not-an-email", "password": PASSWORD},
        format="json",
    )
    assert bad.status_code == 422
    assert bad.json() == {
        "error": {
            "code": "VALIDATION",
            "message": "Enter a valid email address.",
            "fields": {"email": "invalid"},
        }
    }
    taken = client.post(
        f"{BASE}/auth/sign-up",
        {
            "name": "A",
            "phone": "0400 000 000",
            "email": customer.email.upper(),
            "password": PASSWORD,
        },
        format="json",
    )
    assert taken.status_code == 409
    assert taken.json()["error"]["code"] == "CONFLICT"
    assert taken.json()["error"]["fields"] == {"email": "taken"}
    short = client.post(
        f"{BASE}/auth/sign-up",
        {"name": "A", "phone": "0400 000 000", "email": "new@example.com", "password": "abcdefg"},
        format="json",
    )
    assert short.json()["error"]["fields"] == {"password": "too_short"}


def test_sign_in_refresh_rotation_and_sign_out(client, customer):
    wrong = client.post(
        f"{BASE}/auth/sign-in",
        {"email": customer.email, "password": "wrong-password"},
        format="json",
    )
    assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "UNAUTHORIZED"
    session = client.post(
        f"{BASE}/auth/sign-in",
        {"email": f"  {customer.email.upper()} ", "password": PASSWORD},
        format="json",
    ).json()
    renewed = client.post(
        f"{BASE}/auth/refresh", {"refreshToken": session["refreshToken"]}, format="json"
    )
    assert renewed.status_code == 200 and renewed.json()["refreshToken"] != session["refreshToken"]
    replay = client.post(
        f"{BASE}/auth/refresh", {"refreshToken": session["refreshToken"]}, format="json"
    )
    assert replay.status_code == 401
    token = renewed.json()["refreshToken"]
    assert (
        client.post(f"{BASE}/auth/sign-out", {"refreshToken": token}, format="json").status_code
        == 204
    )
    assert (
        client.post(f"{BASE}/auth/refresh", {"refreshToken": token}, format="json").status_code
        == 401
    )


def test_protected_calls_without_a_token_answer_401(client):
    response = client.get(f"{BASE}/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_profile_update_rejects_a_taken_email(app, customer):
    other = UserFactory(email="taken@example.com")
    response = app.patch(f"{BASE}/me", {"email": other.email.upper()}, format="json")
    assert response.status_code == 409 and response.json()["error"]["fields"] == {"email": "taken"}
    updated = app.patch(
        f"{BASE}/me", {"name": "Sophie N", "phone": "0411 111 111"}, format="json"
    ).json()
    assert updated["name"] == "Sophie N" and updated["phone"] == "0411 111 111"


def test_preferences_merge_and_validate(app, cafe):
    defaults = app.get(f"{BASE}/me/preferences").json()
    assert defaults["notifications"]["offersAndNews"] is False and defaults["avatar"] == 0
    patched = app.patch(
        f"{BASE}/me/preferences", {"dietary": ["vegan"], "avatar": 3}, format="json"
    ).json()
    assert patched["dietary"] == ["vegan"] and patched["avatar"] == 3
    assert patched["security"] == defaults["security"]
    bad = app.patch(f"{BASE}/me/preferences", {"homeCafeId": "nowhere"}, format="json")
    assert bad.status_code == 422 and bad.json()["error"]["fields"] == {"homeCafeId": "invalid"}


def test_favourites_and_addresses(app, menu):
    added = app.put(f"{BASE}/me/favourites/hotcoffee")
    assert added.status_code == 200 and added.json() == {"itemIds": ["hotcoffee"]}
    assert app.put(f"{BASE}/me/favourites/hotcoffee").json() == {"itemIds": ["hotcoffee"]}
    assert app.put(f"{BASE}/me/favourites/nope").status_code == 404
    assert app.delete(f"{BASE}/me/favourites/hotcoffee").json() == {"itemIds": []}
    address = app.post(
        f"{BASE}/me/addresses", {"label": "work", "line": " 1 Main St "}, format="json"
    )
    assert address.status_code == 201 and address.json()["line"] == "1 Main St"
    assert app.post(f"{BASE}/me/addresses", {"label": "home", "line": ""}, format="json").json()[
        "error"
    ]["fields"] == {"line": "required"}
    assert app.delete(f"{BASE}/me/addresses/{address.json()['id']}").status_code == 204
    assert app.get(f"{BASE}/me/addresses").json() == []


# ---------------------------------------------------------------- cafés & menu


def test_locations_follow_the_app_shape(client, cafe):
    Location.objects.create(slug="akuna", name="Akuna St", is_published=True, status="tbc")
    rows = client.get(f"{BASE}/locations").json()
    assert [row["id"] for row in rows] == ["akuna", "braddon"]
    braddon = next(row for row in rows if row["id"] == "braddon")
    assert set(braddon) == LOCATION_KEYS
    assert braddon["status"] == "open" and braddon["weeklyHours"]["mon"] == {
        "open": "06:00",
        "close": "15:00",
    }
    assert braddon["area"] == "Lonsdale St" and braddon["waitLabel"] == "20–25 min"
    akuna = next(row for row in rows if row["id"] == "akuna")
    assert (
        akuna["status"] == "coming_soon" and akuna["weeklyHours"] is None and akuna["phone"] is None
    )
    assert client.get(f"{BASE}/locations/nowhere").json()["error"] == {
        "code": "NOT_FOUND", "message": "That café could not be found.", "fields": {}
    }  # fmt: skip


def test_menu_hides_sold_out_items_and_uses_cents(client, cafe, menu):
    LocationMenuItem.objects.create(location=cafe, menu_item=menu["burger"], is_available=False)
    items = client.get(f"{BASE}/locations/braddon/menu").json()
    assert [item["id"] for item in items] == ["hotcoffee"]
    coffee = items[0]
    assert coffee["priceCents"] == 500 and coffee["featured"] is True
    assert coffee["modifierGroups"][0] == {
        "id": "drink",
        "name": "Choose your drink",
        "required": True,
        "maxSelections": 1,
        "options": [
            {"name": "Flat White", "priceCents": 50},
            {"name": "Latte", "priceCents": 50},
            {"name": "Macchiato", "priceCents": 0},
        ],
    }
    assert client.get(f"{BASE}/menu/items/bburger").json()["priceCents"] == 2300
    categories = client.get(f"{BASE}/menu/categories").json()
    assert categories[0] == {
        "id": "coffee",
        "name": "Coffee & Hot Drinks",
        "shortName": "Coffee",
        "note": "",
    }
    assert categories[1]["shortName"] == "All Day Meals"


# ---------------------------------------------------------------- orders


def test_orders_need_a_payment_provider_unless_the_gift_card_covers_them(app, customer, cafe, menu):
    response = app.post(f"{BASE}/orders", order_body(), format="json")
    assert response.status_code == 501 and response.json()["error"]["code"] == "NOT_IMPLEMENTED"
    assert not Order.objects.exists()
    GiftCard.objects.create(user=customer, balance_cents=5000)
    covered = app.post(
        f"{BASE}/orders", order_body(useGiftCard=True, expectedTotalCents=0, payment={"choice": "apple_pay"}),
        format="json",
    )  # fmt: skip
    assert covered.status_code == 201
    assert covered.json()["paymentLabel"] == "Gift card"
    assert GiftCard.objects.get(user=customer).balance_cents == 2070


def test_demo_order_prices_on_the_server_and_applies_side_effects(
    app, customer, cafe, menu, settings
):
    settings.PAYMENT_PROVIDER = "demo"
    response = app.post(f"{BASE}/orders", order_body(), format="json", HTTP_IDEMPOTENCY_KEY="ord_1")
    assert response.status_code == 201, response.json()
    order = response.json()
    assert set(order) == ORDER_KEYS
    assert order["status"] == "received" and order["timing"] == {"type": "asap"}
    assert order["lines"][0]["unitPriceCents"] == 630
    assert order["lines"][0]["modifiersLabel"] == "Flat White, OAT ADC"
    assert order["totals"]["totalCents"] == 2930 and order["stampsEarned"] == 1
    assert order["estimatedWait"] == "20–25 min" and order["paymentLabel"] == "Apple Pay"
    assert LoyaltyCard.objects.get(user=customer).stamps == 1
    assert AppNotification.objects.filter(user=customer, kind="loyalty").exists()
    assert EmailMessage.objects.filter(
        recipient="braddon@example.com", subject__contains=order["number"]
    ).exists()
    # A retry with the same key replays the order instead of charging again.
    retry = app.post(
        f"{BASE}/orders", order_body(payment={"choice": "apple_pay", "token": "demo_applepay_2"}),
        format="json", HTTP_IDEMPOTENCY_KEY="ord_1",
    )  # fmt: skip
    assert retry.status_code == 201 and retry.json()["id"] == order["id"]
    assert Order.objects.count() == 1
    changed = app.post(
        f"{BASE}/orders", order_body(method="delivery", deliveryAddress="1 Main St", expectedTotalCents=3223),
        format="json", HTTP_IDEMPOTENCY_KEY="ord_1",
    )  # fmt: skip
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "CONFLICT"
    assert app.get(f"{BASE}/orders/{order['id']}").json()["number"] == order["number"]
    history = app.get(f"{BASE}/me/orders?limit=1").json()
    assert [row["id"] for row in history["items"]] == [order["id"]] and history[
        "nextCursor"
    ] is None


def test_order_rejections_follow_the_documented_rules(app, cafe, menu, settings):
    settings.PAYMENT_PROVIDER = "demo"

    def error(**overrides):
        return app.post(f"{BASE}/orders", order_body(**overrides), format="json").json()["error"]

    assert error(expectedTotalCents=2900) == {
        "code": "PRICE_CHANGED", "message": "Your total changed to $29.30. Please review your order.", "fields": {}
    }  # fmt: skip
    assert (
        error(method="dine_in", tableNumber="4")["message"] == "Dine In isn’t offered at Braddon."
    )
    assert error(method="delivery")["fields"] == {"deliveryAddress": "required"}
    assert error(lines=[])["message"] == "Your order is empty."
    assert error(lines=[{"itemId": "hotcoffee", "qty": 1, "selections": {}}])["message"] == (
        "Choose options for Milk Based Coffee."
    )
    assert error(lines=[{"itemId": "ghost", "qty": 1}])["message"] == (
        "An item in your order is no longer available."
    )
    assert error(
        payment={"choice": "saved_card", "paymentMethodId": "pm_1"}, expectedTotalCents=3016
    )["fields"] == {"paymentMethodId": "invalid"}
    assert error(payment={"choice": "apple_pay"})["code"] == "PAYMENT_DECLINED"
    Location.objects.filter(pk=cafe.pk).update(status="tbc")
    assert error()["code"] == "LOCATION_UNAVAILABLE"


def test_quote_returns_server_totals_with_reward(app, customer, cafe, menu):
    LoyaltyCard.objects.create(user=customer, stamps=9)
    body = {
        k: v
        for k, v in order_body(useReward=True).items()
        if k not in {"contact", "expectedTotalCents", "timing"}
    }
    quote = app.post(f"{BASE}/orders/quote", body, format="json").json()
    assert quote["rewardAvailable"] is True and quote["coffeeCount"] == 1
    assert quote["totals"]["rewardCents"] == 630 and quote["totals"]["totalCents"] == 2300


def test_other_customers_orders_are_not_found(app, cafe, menu, settings):
    settings.PAYMENT_PROVIDER = "demo"
    order_id = app.post(f"{BASE}/orders", order_body(), format="json").json()["id"]
    stranger = APIClient()
    stranger.force_authenticate(UserFactory())
    assert stranger.get(f"{BASE}/orders/{order_id}").json()["error"]["code"] == "NOT_FOUND"
    assert stranger.get(f"{BASE}/orders/not-a-uuid").status_code == 404


def test_staff_move_orders_along_and_a_decline_gives_everything_back(
    app, customer, cafe, menu, settings
):
    settings.PAYMENT_PROVIDER = "demo"
    GiftCard.objects.create(user=customer, balance_cents=1000)
    LoyaltyCard.objects.create(user=customer, stamps=9)
    body = order_body(useGiftCard=True, useReward=True, expectedTotalCents=1300)
    order = Order.objects.get(pk=app.post(f"{BASE}/orders", body, format="json").json()["id"])
    assert order.reward_redeemed and order.gift_card_cents == 1000
    assert LoyaltyCard.objects.get(user=customer).stamps == 0
    barista = UserFactory(role="staff", is_staff=True)
    StaffAssignment.objects.create(user=barista, location=cafe)
    web = Client()
    web.force_login(barista)
    url = reverse("admin:orders_order_transition", args=[order.pk, "confirmed"])
    assert web.post(url).status_code == 302
    order.refresh_from_db()
    assert order.status == "confirmed" and order.handled_by == barista
    assert (
        "confirmed"
        in AppNotification.objects.filter(user=customer, kind="order").latest("created_at").text
    )
    web.post(reverse("admin:orders_order_transition", args=[order.pk, "declined"]))
    order.refresh_from_db()
    assert order.status == "declined"
    assert GiftCard.objects.get(user=customer).balance_cents == 1000
    assert LoyaltyCard.objects.get(user=customer).stamps == 9
    assert web.get(reverse("admin:orders_order_change", args=[order.pk])).status_code == 200


def test_staff_only_see_their_own_cafes_orders(app, cafe, menu, settings):
    settings.PAYMENT_PROVIDER = "demo"
    order_id = app.post(f"{BASE}/orders", order_body(), format="json").json()["id"]
    elsewhere = Location.objects.create(slug="civic", name="Civic", is_published=True)
    barista = UserFactory(role="staff", is_staff=True)
    StaffAssignment.objects.create(user=barista, location=elsewhere)
    web = Client()
    web.force_login(barista)
    assert web.get(reverse("admin:orders_order_change", args=[order_id])).status_code in {302, 404}
    assert "#8020" not in web.get(reverse("admin:orders_order_changelist")).content.decode()


# ---------------------------------------------------------------- bookings & catering


def booking_body(**overrides):
    body = {
        "locationId": "braddon",
        "date": str(timezone.localdate() + timedelta(days=3)),
        "time": "09:30",
        "guests": 2,
        "seating": "outdoor",
        "name": "Sophie Nguyen",
        "phone": "0400 123 456",
        "email": "sophie@example.com",
        "notes": "",
    }
    body.update(overrides)
    return body


def test_booking_requests_follow_the_app_rules(app, cafe):
    today = app.post(
        f"{BASE}/reservations", booking_body(date=str(timezone.localdate())), format="json"
    )
    assert today.json()["error"] == {
        "code": "VALIDATION", "message": "Choose a date from tomorrow onwards.", "fields": {"date": "invalid"}
    }  # fmt: skip
    late = app.post(f"{BASE}/reservations", booking_body(time="14:45"), format="json").json()[
        "error"
    ]
    assert late["message"] == "Café is closed at this time" and late["fields"] == {
        "time": "invalid"
    }
    several = app.post(
        f"{BASE}/reservations", booking_body(name="", email="x@y"), format="json"
    ).json()
    assert several["error"]["message"] == "Please check the highlighted fields."
    assert several["error"]["fields"] == {"name": "invalid", "email": "invalid"}
    created = app.post(f"{BASE}/reservations", booking_body(), format="json")
    assert created.status_code == 201
    reservation = created.json()
    assert reservation["status"] == "requested" and reservation["seating"] == "outdoor"
    booking = Booking.objects.get(pk=reservation["id"])
    assert booking.source == "app" and booking.seating == "outdoor"
    assert EmailMessage.objects.filter(recipient="braddon@example.com").exists()
    assert app.get(f"{BASE}/me/reservations").json()[0]["id"] == reservation["id"]
    assert app.delete(f"{BASE}/reservations/{reservation['id']}").status_code == 204
    assert app.get(f"{BASE}/me/reservations").json()[0]["status"] == "cancelled"


def test_confirmed_bookings_cannot_be_cancelled_in_the_app(app, cafe):
    reservation = app.post(f"{BASE}/reservations", booking_body(), format="json").json()
    Booking.objects.filter(pk=reservation["id"]).update(status="confirmed")
    response = app.delete(f"{BASE}/reservations/{reservation['id']}")
    assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT"


def test_bookings_need_confirmed_hours(app, cafe):
    Location.objects.create(slug="akuna", name="Akuna St", is_published=True, status="tbc")
    error = app.post(
        f"{BASE}/reservations", booking_body(locationId="akuna"), format="json"
    ).json()["error"]
    assert error["code"] == "LOCATION_UNAVAILABLE"


def test_catering_enquiries(app, client):
    CateringPackage.objects.create(slug="lunch", name="Lunch", price_cents=2750, items=["Sliders"])
    packages = client.get(f"{BASE}/catering/packages").json()
    assert packages[0]["priceLabel"] == "$27.50" and packages[0]["inclusions"] == ["Sliders"]
    body = {
        "packageId": "lunch", "firstName": "Sophie", "lastName": "Nguyen", "email": "sophie@example.com",
        "phone": "0400 123 456", "company": "", "occasion": "", "date": None, "time": None, "guests": 30,
        "location": "Office", "dietary": ["Vegan"], "notes": "Lunch for the team",
    }  # fmt: skip
    assert app.post(f"{BASE}/catering-enquiries", {**body, "packageId": "x"}, format="json").json()[
        "error"
    ]["fields"] == {"packageId": "invalid"}
    created = app.post(f"{BASE}/catering-enquiries", body, format="json")
    assert created.status_code == 201
    assert created.json()["occasion"] == "Catering" and created.json()["status"] == "enquiry_sent"
    assert app.get(f"{BASE}/me/catering-enquiries").json()[0]["packageName"] == "Lunch"


# ---------------------------------------------------------------- rewards, feed, content


def test_loyalty_card_wallet_and_gift_sending(app, customer, settings):
    card = app.get(f"{BASE}/me/loyalty").json()
    assert card["stampsPerReward"] == 9 and card["walletPassAdded"] is False
    assert app.get(f"{BASE}/me/loyalty/wallet-pass").status_code == 404
    assert app.post(f"{BASE}/me/loyalty/wallet-pass/added").json()["walletPassAdded"] is True
    assert app.get(f"{BASE}/me/loyalty/activity").json() == {"items": [], "nextCursor": None}
    body = {"amountCents": 5000, "recipientName": "Alex", "recipientEmail": "alex@example.com", "message": "", "paymentToken": "demo_applepay_9"}  # fmt: skip
    assert app.post(f"{BASE}/gift-cards/send", body, format="json").status_code == 501
    settings.PAYMENT_PROVIDER = "demo"
    assert (
        app.post(
            f"{BASE}/gift-cards/send", {**body, "recipientEmail": "nope"}, format="json"
        ).status_code
        == 422
    )
    sent = app.post(f"{BASE}/gift-cards/send", body, format="json", HTTP_IDEMPOTENCY_KEY="gift_1")
    assert sent.status_code == 201 and sent.json()["description"] == "Sent to Alex"
    again = app.post(f"{BASE}/gift-cards/send", body, format="json", HTTP_IDEMPOTENCY_KEY="gift_1")
    assert again.json()["id"] == sent.json()["id"]
    assert app.get(f"{BASE}/me/gift-card").json()["balanceCents"] == 0
    assert len(app.get(f"{BASE}/me/gift-card/activity").json()) == 1
    assert app.get(f"{BASE}/me/payment-methods").json() == []
    assert (
        app.post(f"{BASE}/me/payment-methods", {"sourceToken": "x"}, format="json").status_code
        == 501
    )


def test_notification_feed_seen_read_and_clear(app, customer):
    AppNotification.objects.create(user=customer, kind="order", text="Order ready")
    feed = app.get(f"{BASE}/me/notifications").json()
    assert len(feed["unseenIds"]) == 1 and feed["items"][0]["unread"] is True
    assert app.post(f"{BASE}/me/notifications/seen").status_code == 204
    feed = app.get(f"{BASE}/me/notifications").json()
    assert feed["unseenIds"] == [] and feed["items"][0]["unread"] is True
    app.post(f"{BASE}/me/notifications/read-all")
    assert app.get(f"{BASE}/me/notifications").json()["items"][0]["unread"] is False
    assert app.delete(f"{BASE}/me/notifications").status_code == 204
    assert app.get(f"{BASE}/me/notifications").json()["items"] == []


def test_offers_and_faqs_come_from_the_cms(client, db):
    offers = client.get(f"{BASE}/content/offers").json()
    assert offers[0]["id"] == "keepcups" and offers[0]["imageUrl"] is None
    faqs = client.get(f"{BASE}/content/faqs").json()
    assert faqs[0]["question"] == "How does the coffee card work?" and len(faqs) == 6


def test_password_reset_email_links_to_a_working_page(client, customer):
    response = client.post(f"{BASE}/auth/password-reset", {"email": customer.email}, format="json")
    assert response.status_code == 204
    assert (
        client.post(
            f"{BASE}/auth/password-reset", {"email": "nobody@example.com"}, format="json"
        ).status_code
        == 204
    )
    body = EmailMessage.objects.get(recipient=customer.email).body
    link = next(word for word in body.split() if "/account/reset-password" in word)
    query = {k: v[0] for k, v in parse_qs(urlparse(link).query).items()}
    page = Client()
    assert "Choose a new password" in page.get(link).content.decode()
    done = page.post(
        "/account/reset-password",
        {**query, "password": "New-password-2026", "confirm": "New-password-2026"},
    )
    assert "Password updated" in done.content.decode()
    customer.refresh_from_db()
    assert customer.check_password("New-password-2026")
    assert "expired" in page.get(link).content.decode()


def test_closure_request_emails_the_team(app, customer):
    assert app.post(f"{BASE}/me/closure-request").status_code == 204
    assert EmailMessage.objects.filter(
        subject__contains="closure", body__contains=customer.email
    ).exists()


def test_images_are_phone_sized_storage_urls(client, cafe, menu):
    stored = MediaAsset.objects.create(
        storage_path="menu/x/1600.webp",
        variants={"thumb": "https://cdn.test/400.webp", "md": "https://cdn.test/800.webp"},
    )
    legacy = MediaAsset.objects.create(legacy_path="img/food/burger.webp")
    MenuItem.objects.filter(pk=menu["coffee"].pk).update(image=stored)
    MenuItem.objects.filter(pk=menu["burger"].pk).update(image=legacy)
    items = {item["id"]: item for item in client.get(f"{BASE}/locations/braddon/menu").json()}
    assert items["hotcoffee"]["imageUrl"] == "https://cdn.test/800.webp"
    assert items["bburger"]["imageUrl"] is None


def test_app_docs_page_only_documents_the_app_api(client, db):
    import yaml

    schema = yaml.safe_load(client.get("/api/docs/app/schema/").content)
    assert schema["info"]["title"] == "EightyTwenty Mobile App API"
    assert "Connect the app in 2 minutes" in schema["info"]["description"]
    paths = set(schema["paths"]) - {"/health"}
    assert paths and all(path.startswith("/api/v1/app/") for path in paths)
    assert "Idempotency-Key" in schema["paths"]["/api/v1/app/orders"]["post"]["description"]
    assert client.get("/api/docs/app/").status_code == 200
    assert client.get("/api/docs/app/redoc/").status_code == 200
