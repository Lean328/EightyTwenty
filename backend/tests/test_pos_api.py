"""Till API (/api/v1/pos): device + PIN sign-in, snapshot, orders, payments, kitchen, cash."""

from datetime import timedelta
from urllib.parse import quote

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import StaffAssignment
from apps.core.models import AuditLog
from apps.core.throttles import PersistentThrottle
from apps.locations.models import Location
from apps.loyalty.models import GiftCard, LoyaltyCard
from apps.menu.models import (
    Category,
    LocationMenuItem,
    MenuItem,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)
from apps.notifications.models import AppNotification
from apps.orders.models import Order, OrderLine
from apps.pos import pins
from apps.pos.models import CashShift, CommandReceipt, Promotion, TillTransaction
from apps.pos.views import OrdersView, PosView, SnapshotView, VerifyPinView

from .factories import UserFactory

BASE = "/api/v1/pos"
TERMINAL = "BRADDON-TILL-1"


@pytest.fixture
def cafe(db):
    return Location.objects.create(
        slug="braddon",
        name="Braddon",
        is_published=True,
        status="open",
        fulfilment_methods=["pickup", "dine_in"],
        email="braddon@example.com",
    )


@pytest.fixture
def elsewhere(db):
    return Location.objects.create(slug="civic", name="Civic", is_published=True, status="open")


@pytest.fixture
def menu(db):
    coffee = Category.objects.create(slug="coffee", name="Coffee & Hot Drinks")
    food = Category.objects.create(slug="allday", name="All Day Meals", sort_order=1)
    flat = MenuItem.objects.create(
        slug="hotcoffee", category=coffee, name="Milk Based Coffee", base_price_cents=500,
        is_published=True,
    )  # fmt: skip
    drink = ModifierGroup.objects.create(
        code="drink", name="Choose your drink", is_required=True, max_select=1
    )
    ModifierOption.objects.create(group=drink, name="Flat White", price_delta_cents=50)
    variation = ModifierGroup.objects.create(code="var", name="Drink variation", max_select=0)
    ModifierOption.objects.create(group=variation, name="OAT ADC", price_delta_cents=80)
    MenuItemModifierGroup.objects.create(menu_item=flat, modifier_group=drink, sort_order=0)
    MenuItemModifierGroup.objects.create(menu_item=flat, modifier_group=variation, sort_order=1)
    burger = MenuItem.objects.create(
        slug="bburger", category=food, name="Breakfast Burger", base_price_cents=2300,
        is_published=True,
    )  # fmt: skip
    return {"coffee": flat, "burger": burger}


@pytest.fixture
def cashier(cafe):
    user = UserFactory(role="staff", first_name="Mia", last_name="Tran", is_staff=True)
    StaffAssignment.objects.create(user=user, location=cafe)
    pins.set_pin(user, "4821")
    user.save()
    return user


@pytest.fixture
def till(cashier):
    client = APIClient()
    client.force_authenticate(cashier)
    client.credentials(HTTP_X_TERMINAL_ID=TERMINAL)
    return client


def line(key="L1", item="hotcoffee", price=6.3, qty=1, **extra):
    sel = {"drink": ["Flat White"], "var": ["OAT ADC"]} if item == "hotcoffee" else {}
    return {"key": key, "itemId": item, "name": item, "price": price, "qty": qty, "sel": sel,
            "adjust": [], "note": "", **extra}  # fmt: skip


def order_body(number="BRADDON-TILL-1-0001", **overrides):
    body = {
        "id": number,
        "channel": "pos",
        "type": "takeaway",
        "status": "new",
        "accepted": True,
        "cafe": "braddon",
        "time": "09:41",
        "placedAt": timezone.now().isoformat(),
        "tables": [],
        "lines": [line(qty=2), line("L2", "bburger", 23)],
        "total": 35.6,
        "paid": False,
        "methods": [],
        "payments": [],
        "note": "",
        "discounts": [],
        "rewardUsed": False,
        "staff": "Mia Tran",
        "history": [{"at": "16 Oct, 9:41 am", "what": "Created on till by Mia Tran"}],
    }
    body.update(overrides)
    return body


def post(client, path, body, key=None, method="post"):
    headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
    return getattr(client, method)(f"{BASE}{path}", body, format="json", **headers)


def create(till, **overrides):
    response = post(till, "/orders", order_body(**overrides), key=f"CMD-{overrides}")
    assert response.status_code == 201, response.json()
    return response.json()


def pay(till, number, amount, ref="P1", **extra):
    body = {"method": "cash", "amount": amount, "tip": 0, "surcharge": 0, "ref": ref,
            "by": "Mia Tran", **extra}  # fmt: skip
    return post(till, f"/orders/{quote(number)}/payments", body)


# ---------------------------------------------------------------- device & staff


def test_customers_and_unassigned_staff_cannot_use_the_till(cafe):
    client = APIClient()
    client.force_authenticate(UserFactory())
    assert client.get(f"{BASE}/locations").status_code == 403
    client.force_authenticate(UserFactory(role="staff"))
    response = client.get(f"{BASE}/locations")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert APIClient().get(f"{BASE}/snapshot").status_code == 401


def test_locations_are_the_cafes_of_the_account(till, cafe, elsewhere):
    assert till.get(f"{BASE}/locations").json() == {
        "results": [{"id": "braddon", "slug": "braddon", "name": "Braddon"}]
    }
    assert till.get(f"{BASE}/snapshot?cafe=civic").status_code == 404
    owner = APIClient()
    owner.force_authenticate(UserFactory(role="owner"))
    assert len(owner.get(f"{BASE}/locations").json()["results"]) == 2


def test_verify_pin_returns_staff_and_permissions(till, cashier, cafe):
    response = post(till, "/staff/verify-pin", {"pin": "4821"})
    assert response.status_code == 200
    assert response.json()["staff"] == {
        "id": str(cashier.pk), "name": "Mia Tran", "initials": "MT", "role": "cashier",
        "cafe": "braddon", "shift": "",
    }  # fmt: skip
    assert "orders.refund" not in response.json()["permissions"]
    assert post(till, "/staff/verify-pin", {"pin": "0000"}).status_code == 204
    assert post(till, "/staff/verify-pin", {"pin": "48"}).status_code == 204


def test_pins_are_unique_and_scoped_to_the_cafes(cafe, elsewhere, cashier):
    other = UserFactory(role="staff")
    StaffAssignment.objects.create(user=other, location=elsewhere)
    with pytest.raises(ValueError, match="already uses"):
        pins.set_pin(other, "4821")
    pins.set_pin(other, "1357")
    other.save()
    assert pins.find_by_pin("1357", [cafe.pk]) is None
    assert pins.find_by_pin("1357", [elsewhere.pk]) == other
    manager = UserFactory(role="manager")
    StaffAssignment.objects.create(user=manager, location=cafe)
    assert pins.permissions(manager) == pins.ROLES["manager"]["perms"]
    assert pins.till_role(UserFactory(role="owner")) == "admin"


def test_till_pin_is_set_in_the_bos_workspace(client, cashier):
    owner = UserFactory(role="owner", is_superuser=True, is_staff=True)
    browser = __import__("django.test", fromlist=["Client"]).Client()
    browser.force_login(owner)
    url = reverse("admin:accounts_user_change", args=[cashier.pk])
    page = browser.get(url)
    assert b"Till PIN" in page.content and b"A PIN is set" in page.content
    form = {
        "email": cashier.email, "first_name": "Mia", "last_name": "Tran", "phone": "",
        "role": "staff", "is_active": "on", "till_pin": "2468",
        "assignments-TOTAL_FORMS": "0", "assignments-INITIAL_FORMS": "0",
    }  # fmt: skip
    response = browser.post(url, form)
    assert response.status_code == 302, response.content[:2000]
    cashier.refresh_from_db()
    assert cashier.pos_pin == pins.pin_hash(cashier, "2468")


# ---------------------------------------------------------------- snapshot & catalogue


def test_snapshot_shape_menu_and_staff(till, cafe, menu, cashier):
    LocationMenuItem.objects.create(location=cafe, menu_item=menu["burger"], is_available=False)
    response = till.get(f"{BASE}/snapshot?cafe=braddon")
    assert response.status_code == 200
    snap = response.json()
    assert set(snap) == {
        "locations", "categories", "menu", "cateringPackages", "tables", "promotions",
        "availability", "stock", "stockLog", "orders", "customers", "giftCards",
        "reservations", "catering", "staff", "roles", "settings", "currentShift",
        "closedShifts", "audit", "reports",
    }  # fmt: skip
    coffee = next(item for item in snap["menu"] if item["id"] == "hotcoffee")
    assert coffee["id"] == "hotcoffee" and coffee["price"] == 5
    assert coffee["mods"][0] == {
        "id": "drink", "name": "Choose your drink", "required": True, "max": 1,
        "options": [["Flat White", 0.5]],
    }  # fmt: skip
    assert snap["availability"]["soldOut"] == ["bburger"]  # the account has one café
    assert [s["name"] for s in snap["staff"]] == ["Mia Tran"]
    assert snap["roles"]["cashier"]["perms"][0] == "pos"
    assert snap["settings"]["rules"]["surcharge"] == "2.95"
    assert len(snap["reports"]["days"]) == 7 and snap["currentShift"] is None
    assert till.get(f"{BASE}/snapshot").json()["locations"][0]["id"] == "braddon"


def test_backend_check_catalogue_endpoints(till, cafe, menu):
    assert till.get(f"{BASE}/locations/braddon/categories").json()[0]["id"] == "coffee"
    items = till.get(f"{BASE}/locations/braddon/menu").json()
    item = next(row for row in items if row["id"] == "hotcoffee")
    assert item["priceCents"] == 500 and item["available"] is True
    assert item["modifierGroups"][0]["options"] == [{"name": "Flat White", "priceCents": 50}]


# ---------------------------------------------------------------- orders


def test_create_order_records_lines_and_checks_prices(till, cafe, menu):
    data = create(till)
    assert data["id"] == "BRADDON-TILL-1-0001" and data["status"] == "new"
    assert data["accepted"] and not data["paid"] and data["total"] == 35.6
    assert [ln["key"] for ln in data["lines"]] == ["L1", "L2"]
    order = Order.objects.get(number="BRADDON-TILL-1-0001")
    assert order.channel == "pos" and order.method == "takeaway" and order.customer is None
    assert order.total_cents == 3560 and order.terminal_id == TERMINAL
    assert order.review_note == ""


def test_price_differences_are_recorded_not_rejected(till, cafe, menu):
    body = order_body(lines=[line(price=5.8), line("L2", "unknown-item", 4)], total=9.8)
    response = post(till, "/orders", body)
    assert response.status_code == 201
    note = Order.objects.get().review_note
    assert "rung up at $5.80 (menu $6.30)" in note and "not on the Braddon menu" in note


def test_promo_codes_are_checked_not_refused(till, cafe, elsewhere, menu):
    today = timezone.localdate()
    Promotion.objects.create(code="WELCOME10", label="10% off", kind="pct", percent=10)
    Promotion.objects.create(
        code="SUMMER", label="$5 off", kind="amt", amount_cents=500,
        ends_on=today - timedelta(days=1),
    )  # fmt: skip
    Promotion.objects.create(
        code="CIVIC5", label="$5 off", kind="amt", amount_cents=500, location=elsewhere
    )

    def note(number, discounts, total):
        create(till, id=number, discounts=discounts, total=total)
        return Order.objects.get(number=number).review_note

    assert note("P-1", [{"label": "WELCOME10 · 10% off", "amount": 3.56}], 32.04) == ""
    assert note("P-2", [{"label": "Staff 50%", "amount": 17.8}], 17.8) == ""
    assert note("P-3", [{"label": "10% off", "code": "welcome10", "amount": 10}], 25.6) == (
        "Promo code WELCOME10 took $10.00 off; it allows $3.56."
    )
    assert "Promo code SUMMER ended on" in note("P-4", [{"label": "SUMMER", "amount": 5}], 30.6)
    assert note("P-5", [{"label": "x", "code": "CIVIC5", "amount": 5}], 30.6) == (
        "Promo code CIVIC5 is for Civic only."
    )
    assert note("P-6", [{"label": "x", "code": "NOPE", "amount": 1}], 34.6) == (
        "Promo code NOPE is not in BOS."
    )
    feed = till.get(f"{BASE}/orders", {"cafe": "braddon"}).json()["orders"]
    sent = next(row for row in feed if row["id"] == "P-3")["discounts"]
    assert sent == [{"label": "10% off", "amount": 10.0, "code": "welcome10"}]


def test_totals_must_add_up(till, cafe, menu):
    response = post(till, "/orders", order_body(total=30))
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == {"total": "invalid"}
    discounted = order_body(discounts=[{"label": "Staff 50%", "amount": 17.8}], total=17.8)
    assert post(till, "/orders", discounted).status_code == 201
    delivery = order_body("D-1", type="delivery", total=39.16)
    assert post(till, "/orders", delivery).status_code == 201


def test_order_numbers_are_unique_and_retries_replay(till, cafe, menu):
    body = order_body()
    first = post(till, "/orders", body, key="CMD-1")
    again = post(till, "/orders", body, key="CMD-1")
    assert first.status_code == again.status_code == 201
    assert again.json() == first.json() and Order.objects.count() == 1
    clash = post(till, "/orders", body, key="CMD-2")
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "CONFLICT"
    reused = post(till, "/orders", order_body("OTHER-1"), key="CMD-1")
    assert reused.status_code == 409
    assert CommandReceipt.objects.filter(key="CMD-1", status_code=201).count() == 1


def test_create_with_a_gift_card_payment(till, cafe, menu):
    gift = {"method": "gift", "amount": 1000, "tip": 0, "surcharge": 0, "ref": "G1",
            "giftLast4": "4471"}  # fmt: skip
    data = create(till, payments=[gift])
    assert data["payments"][0]["giftLast4"] == "4471" and data["methods"] == ["gift"]


def test_payments_are_idempotent_and_capped(till, cafe, menu):
    create(till)
    number = "BRADDON-TILL-1-0001"
    first = pay(till, number, 2000, method="card", surcharge=59)
    assert first.status_code == 200 and not first.json()["paid"]
    assert pay(till, number, 2000, method="card", surcharge=59).status_code == 200
    over = pay(till, number, 2000, ref="P2")
    assert over.status_code == 422 and "more than the $15.60 due" in over.json()["error"]["message"]
    done = pay(till, number, 1560, ref="P3", cashPaid=2000, change=440)
    assert done.json()["paid"] and done.json()["methods"] == ["card", "cash"]
    order = Order.objects.get()
    assert order.payments.count() == 2 and order.surcharge_cents == 59


def test_kitchen_progress_and_status(till, cafe, menu):
    create(till)
    path = f"/orders/{quote('BRADDON-TILL-1-0001')}"
    prep = post(till, f"{path}/preparation",
                {"lines": [{"key": "L1", "prep": "ready"}, {"key": "L2", "prep": "preparing"}],
                 "status": "preparing", "note": "Drinks ready"}, method="put")  # fmt: skip
    assert prep.status_code == 200
    assert [ln.get("prep") for ln in prep.json()["lines"]] == ["ready", "preparing"]
    assert prep.json()["status"] == "preparing"
    assert prep.json()["history"][-1]["what"] == "Drinks ready"
    bad = post(till, f"{path}/preparation", {"lines": [{"key": "X", "prep": "ready"}],
                                             "status": "ready"}, method="put")  # fmt: skip
    assert bad.status_code == 422
    assert post(till, f"{path}/status", {"status": "completed"}).json()["status"] == "completed"
    late = post(till, f"{path}/preparation", {"lines": [], "status": "ready"}, method="put")
    assert late.status_code == 409 and "completed" in late.json()["error"]["message"]
    assert post(till, f"{path}/status", {"status": "ready"}).status_code == 409
    assert post(till, f"{path}/status", {"status": "cancelled"}).status_code == 422


def test_refund_void_and_cancel(till, cafe, menu):
    create(till)
    number = "BRADDON-TILL-1-0001"
    path = f"/orders/{quote(number)}/adjustments"
    pay(till, number, 3560)
    void = {
        "adjustment": {"key": "R1", "mode": "void", "amount": 630, "reason": "Entered by mistake",
                       "by": "Mia Tran", "items": {"L1": 1}},
        "lines": [{"key": "L1", "qty": 1}, {"key": "L2", "qty": 1}],
        "total": 29.3,
        "status": "new",
    }  # fmt: skip
    data = post(till, path, void).json()
    assert (
        data["total"] == 29.3
        and data["lines"][0]["qty"] == 1
        and data["refunds"][0]["amount"] == 630
    )
    assert post(till, path, void).status_code == 200  # same key: ignored
    too_much = {**void, "adjustment": {**void["adjustment"], "key": "R2", "mode": "refund",
                                       "amount": 5000}}  # fmt: skip
    assert post(till, path, too_much).status_code == 422
    raise_qty = {**void, "adjustment": {**void["adjustment"], "key": "R3"},
                 "lines": [{"key": "L1", "qty": 5}]}  # fmt: skip
    assert post(till, path, raise_qty).status_code == 422
    cancel = {"adjustment": {"key": "R4", "mode": "cancel", "amount": 2930, "reason": "Customer cancelled"},
              "lines": [], "total": 0, "status": "cancelled"}  # fmt: skip
    data = post(till, path, cancel).json()
    assert data["status"] == "cancelled" and data["lines"] == []
    assert OrderLine.objects.filter(order__number=number).count() == 2  # voided lines are kept
    assert AuditLog.objects.filter(action="pos_cancel").exists()
    assert pay(till, number, 100, ref="P9").status_code == 409


def test_tables(till, cafe, menu):
    create(till, type="dinein", table="T4", tables=["T4"])
    path = f"/orders/{quote('BRADDON-TILL-1-0001')}/tables"
    data = post(till, path, {"table": "T6", "tables": ["T6", "T7"], "cleared": False}, method="put")
    assert data.json()["table"] == "T6" and data.json()["tables"] == ["T6", "T7"]
    assert Order.objects.get().method == "dine_in"


# ---------------------------------------------------------------- app orders on the till


@pytest.fixture
def app_order(cafe, menu):
    customer = UserFactory(first_name="Sophie")
    LoyaltyCard.objects.create(user=customer, stamps=3)
    order = Order.objects.create(
        number="#8020-4471", customer=customer, location=cafe, method="pickup", status="received",
        contact_name="Sophie", contact_phone="0400 123 456", payment_choice="apple_pay",
        payment_label="Apple Pay", payment_reference="demo:1", subtotal_cents=1130,
        total_cents=1130, stamps_earned=2,
    )  # fmt: skip
    OrderLine.objects.create(
        order=order, menu_item=menu["coffee"], item_slug="hotcoffee", name="Milk Based Coffee",
        qty=2, unit_price_cents=565,
    )  # fmt: skip
    return order


def test_app_orders_appear_in_the_feed_and_are_accepted(till, app_order):
    feed = till.get(f"{BASE}/orders?cafe=braddon").json()
    data = feed["orders"][0]
    assert data["id"] == "#8020-4471" and data["channel"] == "app"
    assert data["status"] == "new" and data["accepted"] is False and data["paid"] is True
    assert data["payments"][0]["method"] == "wallet" and data["total"] == 11.3
    assert data["type"] == "pickup" and data["extRef"] == str(app_order.pk)
    path = f"/orders/{quote('#8020-4471')}"
    blocked = post(till, f"{path}/preparation", {"lines": [], "status": "preparing"}, method="put")
    assert (
        blocked.status_code == 409
        and "waiting to be accepted" in blocked.json()["error"]["message"]
    )
    accepted = post(till, f"{path}/accept", {}).json()
    assert accepted["status"] == "preparing" and accepted["accepted"]
    assert AppNotification.objects.filter(user=app_order.customer).exists()
    later = till.get(f"{BASE}/orders?cafe=braddon&since={quote(feed['cursor'])}").json()
    assert [o["id"] for o in later["orders"]] == ["#8020-4471"]


def test_cancelling_an_app_order_returns_stamps(till, app_order):
    cancel = {"adjustment": {"key": "R1", "mode": "cancel", "amount": 0, "reason": "Café too busy"},
              "lines": [], "total": 0, "status": "cancelled"}  # fmt: skip
    response = post(till, f"/orders/{quote('#8020-4471')}/adjustments", cancel)
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    app_order.refresh_from_db()
    assert app_order.status == "declined"
    assert LoyaltyCard.objects.get(user=app_order.customer).stamps == 1
    app = APIClient()
    app.force_authenticate(app_order.customer)
    mine = app.get("/api/v1/app/me/orders").json()["items"]
    assert mine[0]["status"] == "declined"


def test_cancel_and_refund_app_orders_as_the_till_sends_them(till, app_order):
    # What the till really sends: its view of the order (gift card share counted) and the
    # whole paid amount back (ledger.refundableC), lines unchanged.
    app_order.gift_card_cents, app_order.total_cents = 300, 830
    app_order.save()
    path = f"/orders/{quote('#8020-4471')}"
    seen = till.get(f"{BASE}/orders?cafe=braddon").json()["orders"][0]
    assert seen["total"] == 11.3 and seen["paid"] is True and seen["stamped"] is False
    assert pay(till, "#8020-4471", 100).status_code == 422  # nothing is due
    lines = [{"key": row["key"], "qty": row["qty"]} for row in seen["lines"]]
    too_much = {"adjustment": {"key": "R0", "mode": "refund", "amount": 1131},
                "lines": lines, "total": 11.3, "status": "new"}  # fmt: skip
    assert post(till, f"{path}/adjustments", too_much).status_code == 422
    cancel = {"adjustment": {"key": "R1", "mode": "cancel", "amount": 1130, "reason": "Café too busy"},
              "lines": lines, "total": 11.3, "status": "cancelled"}  # fmt: skip
    response = post(till, f"{path}/adjustments", cancel)
    data = response.json()
    assert response.status_code == 200 and data["status"] == "cancelled", data
    assert data["refunds"][0]["amount"] == 1130
    app_order.refresh_from_db()
    assert app_order.status == "declined" and app_order.total_cents == 830
    assert LoyaltyCard.objects.get(user=app_order.customer).stamps == 1
    assert GiftCard.objects.get(user=app_order.customer).balance_cents == 300


def test_only_pin_checks_are_rate_limited(monkeypatch):
    monkeypatch.setattr(PosView, "throttle_classes", [PersistentThrottle])
    assert OrdersView().get_throttles() == [] and SnapshotView().get_throttles() == []
    assert len(VerifyPinView().get_throttles()) == 1


def test_till_orders_do_not_show_in_the_customer_app(till, cafe, menu, app_order):
    create(till, customerId=str(app_order.customer_id))
    assert Order.objects.get(number="BRADDON-TILL-1-0001").customer == app_order.customer
    app = APIClient()
    app.force_authenticate(app_order.customer)
    assert [o["number"] for o in app.get("/api/v1/app/me/orders").json()["items"]] == ["#8020-4471"]


def test_feed_cursor_only_returns_changes(till, cafe, menu):
    create(till)
    first = till.get(f"{BASE}/orders?cafe=braddon").json()
    Order.objects.update(updated_at=timezone.now() - timedelta(minutes=5))
    quiet = till.get(f"{BASE}/orders?cafe=braddon&since={quote(first['cursor'])}").json()
    assert quiet["orders"] == []
    assert till.get(f"{BASE}/orders?cafe=braddon&since=yesterday").status_code == 422


def test_reads_do_not_grow_queries_with_rows(till, cafe, menu):
    def count(path):
        with CaptureQueriesContext(connection) as ctx:
            assert till.get(path).status_code == 200
        return len(ctx)

    create(till)
    feed, snap = count(f"{BASE}/orders?cafe=braddon"), count(f"{BASE}/snapshot?cafe=braddon")
    for n in range(2, 6):
        number = f"BRADDON-TILL-1-000{n}"
        create(till, id=number)
        pay(till, number, 1000, ref=f"P{n}")
    assert count(f"{BASE}/orders?cafe=braddon") == feed
    assert count(f"{BASE}/snapshot?cafe=braddon") == snap


# ---------------------------------------------------------------- cash & records


def shift_body(**overrides):
    body = {"id": "SH1", "cafe": "braddon", "staffId": "x", "staffName": "Mia Tran",
            "openedAt": "16 Oct, 6:02 am", "float": 20000, "cashSales": 0, "cashRefunds": 0,
            "moves": [], "status": "open"}  # fmt: skip
    body.update(overrides)
    return body


def test_cash_shift_open_move_close(till, cafe):
    assert post(till, "/shifts", shift_body()).status_code == 201
    assert post(till, "/shifts", shift_body(id="SH2")).status_code == 409
    move = {"id": "M1", "type": "out", "amount": 4500, "reason": "Banking drop", "by": "Mia"}
    assert len(post(till, "/shifts/SH1/moves", move).json()["moves"]) == 1
    assert len(post(till, "/shifts/SH1/moves", move).json()["moves"]) == 1
    assert till.get(f"{BASE}/snapshot?cafe=braddon").json()["currentShift"]["id"] == "SH1"
    close = shift_body(status="closed", cashSales=48650, cashRefunds=630, moves=[move],
                       closedAt="3:08 pm", closedBy="Mia", counted=63500, expected=63520,
                       variance=-20)  # fmt: skip
    wrong = {**close, "expected": 60000, "variance": 3500}
    assert post(till, "/shifts/SH1", wrong, method="put").status_code == 422
    closed = post(till, "/shifts/SH1", close, method="put").json()
    assert closed["status"] == "closed" and closed["variance"] == -20
    assert CashShift.objects.get().expected_cents == 63520
    snap = till.get(f"{BASE}/snapshot?cafe=braddon").json()
    assert snap["currentShift"] is None and snap["closedShifts"][0]["id"] == "SH1"


def test_transactions_and_audit_are_kept_once(till, cafe):
    record = {"kind": "payment", "orderId": "BRADDON-TILL-1-0001", "cafeId": "braddon",
              "terminalId": TERMINAL, "amountC": 3560, "gstC": 324,
              "at": timezone.now().isoformat(), "staff": "Mia", "reference": "P1"}  # fmt: skip
    assert post(till, "/transactions", record).json() == {"ok": True}
    assert post(till, "/transactions", record).status_code == 200
    assert TillTransaction.objects.count() == 1
    entry = {"id": "A1", "at": "9:41 am", "ts": 1, "staff": "Mia", "role": "Cashier",
             "action": "Discount applied", "detail": "Staff 50%", "reason": "", "approver": "",
             "amount": -1780, "area": "Till", "cafe": "braddon"}  # fmt: skip
    post(till, "/audit", entry)
    post(till, "/audit", entry)
    assert AuditLog.objects.filter(entity_type="pos.audit").count() == 1
    assert (
        till.get(f"{BASE}/snapshot?cafe=braddon").json()["audit"][0]["action"] == "Discount applied"
    )
    other = {**entry, "id": "A2", "cafe": "civic"}
    assert post(till, "/audit", other).status_code == 404


def test_pos_docs_page_is_published(client):
    assert client.get("/api/docs/pos/").status_code == 200
    schema = client.get("/api/docs/pos/schema/").content.decode()
    assert "/api/v1/pos/orders" in schema and "/api/v1/auth/login" in schema
    assert "/api/v1/app/" not in schema


def test_bos_pages_show_till_orders_shifts_and_transactions(till, cafe, menu):
    from django.test import Client

    create(till, lines=[line(price=5.8)], total=5.8)
    post(till, "/shifts", shift_body())
    record = {"kind": "payment", "cafeId": "braddon", "amountC": 580, "gstC": 53,
              "at": timezone.now().isoformat(), "reference": "P1"}  # fmt: skip
    post(till, "/transactions", record)
    manager = UserFactory(role="manager", is_staff=True)
    StaffAssignment.objects.create(user=manager, location=cafe)
    browser = Client()
    browser.force_login(manager)
    order = Order.objects.get()
    page = browser.get(reverse("admin:orders_order_change", args=[order.pk]))
    assert page.status_code == 200 and b"Check prices" in page.content
    assert b"rung up at $5.80" in page.content
    for name in ["orders_order", "pos_cashshift", "pos_tilltransaction"]:
        assert browser.get(reverse(f"admin:{name}_changelist")).status_code == 200
    shift = CashShift.objects.get()
    assert browser.get(reverse("admin:pos_cashshift_change", args=[shift.pk])).status_code == 200


def test_any_origin_and_host_may_call_the_api(client, settings):
    settings.ALLOWED_HOSTS = ["*"]
    response = client.options(
        f"{BASE}/locations",
        HTTP_ORIGIN="http://192.168.1.20:5173",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_HOST="pos-preview.example.net",
    )
    assert response.status_code == 200
    assert response["access-control-allow-origin"] == "*"


# ---------------------------------------------------------------- phase 2: customers & bookings


@pytest.fixture
def regular(cafe):
    from apps.accounts.models import CustomerProfile

    user = UserFactory(first_name="Sophie", last_name="Nguyen", phone="0400 123 456")
    CustomerProfile.objects.create(user=user, preferred_location=cafe, notes="Oat milk")
    LoyaltyCard.objects.create(user=user, stamps=9)
    return user


def test_snapshot_lists_customers_with_their_coffee_card(till, cafe, menu, regular):
    people = till.get(f"{BASE}/snapshot?cafe=braddon").json()["customers"]
    assert people[0]["id"] == str(regular.pk) and people[0]["name"] == "Sophie Nguyen"
    assert (people[0]["stamps"], people[0]["rewards"]) == (0, 1)
    assert people[0]["homeCafe"] == "braddon" and people[0]["notes"] == "Oat milk"


def test_customer_edit_and_coffee_card_from_the_till(till, regular):
    path = f"/customers/{regular.pk}"
    edited = post(till, path, {"name": "Sophie N", "dietary": ["Vegan"], "notes": "Allergic to nuts"},
                  method="put").json()  # fmt: skip
    assert edited["name"] == "Sophie N" and edited["dietary"] == ["Vegan"]
    other = UserFactory(email="taken@example.com")
    assert post(till, path, {"email": other.email}, method="put").status_code == 409
    redeemed = post(till, f"{path}/loyalty", {"stamps": 0, "rewards": 0, "reason": "Free coffee"},
                    method="put").json()  # fmt: skip
    assert (redeemed["stamps"], redeemed["rewards"]) == (0, 0)
    assert LoyaltyCard.objects.get(user=regular).stamps == 0
    stamped = post(till, f"{path}/loyalty", {"stamps": 2, "rewards": 0}, method="put").json()
    assert stamped["stamps"] == 2
    assert LoyaltyCard.objects.get(user=regular).activity.filter(type="earn").exists()
    assert AppNotification.objects.filter(user=regular, kind="loyalty").exists()
    full = post(till, f"{path}/loyalty", {"stamps": 3, "rewards": 2}, method="put").json()
    assert (full["stamps"], full["rewards"]) == (0, 1)
    assert post(till, "/customers/not-a-uuid/loyalty", {"stamps": 1, "rewards": 0},
                method="put").status_code == 404  # fmt: skip


def test_sold_out_from_the_till(till, cafe, elsewhere, menu):
    path = "/items/bburger/sold-out"
    assert post(till, path, {"soldOut": True}, method="put").json() == {"ok": True}
    assert not LocationMenuItem.objects.get(location=cafe, menu_item=menu["burger"]).is_available
    assert not LocationMenuItem.objects.filter(location=elsewhere).exists()  # not this account's
    snap = till.get(f"{BASE}/snapshot?cafe=braddon").json()["availability"]
    assert snap["soldOut"] == ["bburger"] and snap["branchOff"] == {"braddon": []}
    on = post(
        till, "/locations/braddon/items/bburger/availability", {"available": True}, method="put"
    )
    assert on.status_code == 200
    assert LocationMenuItem.objects.get(location=cafe, menu_item=menu["burger"]).is_available
    assert post(till, "/items/nope/sold-out", {"soldOut": True}, method="put").status_code == 404
    assert post(till, "/locations/civic/items/bburger/availability", {"available": False},
                method="put").status_code == 404  # fmt: skip


def reservation_body(**overrides):
    body = {"id": "rK2M9QZ1A", "cafe": "braddon", "date": str(timezone.localdate() + timedelta(days=1)),
            "time": "09:30", "guests": 4, "name": "Hannah Lee", "phone": "0412 345 678",
            "notes": "High chair", "status": "pending"}  # fmt: skip
    body.update(overrides)
    return body


def test_reservations_from_the_till(till, cafe, regular):
    from apps.bookings.models import Booking
    from apps.notifications.models import EmailMessage

    path = "/reservations/rK2M9QZ1A"
    made = post(till, path, reservation_body(customerId=str(regular.pk)), method="put").json()
    assert made["status"] == "pending" and made["source"] == "pos"
    booking = Booking.objects.get(reference="rK2M9QZ1A")
    assert booking.source == "staff" and booking.customer == regular and booking.party_size == 4
    seated = post(till, path, reservation_body(status="completed", guests=5), method="put").json()
    assert seated["status"] == "completed" and seated["guests"] == 5
    booking.refresh_from_db()
    assert booking.status == "seated"
    assert not EmailMessage.objects.filter(recipient="").exists()  # no email → no mail
    assert post(till, path, reservation_body(status="pending"), method="put").status_code == 409
    assert post(till, path, reservation_body(id="other"), method="put").status_code == 422
    snap = till.get(f"{BASE}/snapshot?cafe=braddon").json()["reservations"]
    assert [r["id"] for r in snap] == ["rK2M9QZ1A"]


def test_website_bookings_show_and_confirm_on_the_till(till, cafe):
    from apps.bookings.models import Booking

    web = Booking.objects.create(
        location=cafe, date=timezone.localdate() + timedelta(days=2), time="10:00", party_size=2,
        name="Web Guest", email="guest@example.com", phone="0400", source="web",
    )  # fmt: skip
    row = next(r for r in till.get(f"{BASE}/snapshot?cafe=braddon").json()["reservations"])
    assert row["id"] == web.reference and row["source"] == "web" and row["status"] == "pending"
    body = {**row, "status": "confirmed"}
    assert (
        post(till, f"/reservations/{web.reference}", body, method="put").json()["status"]
        == "confirmed"
    )
    web.refresh_from_db()
    assert web.status == "confirmed" and web.handled_by is not None


def test_catering_from_the_till(till, cafe):
    from apps.enquiries.models import CateringPackage, Enquiry

    CateringPackage.objects.create(slug="grazing", name="Grazing Box", price_cents=2200)
    body = {"id": "ceQ2M8ZK1", "packageId": "Grazing Box", "guests": 20, "date": "2026-11-02",
            "time": "11:30", "fulfil": "delivery", "address": "1 Office St", "cafe": "",
            "name": "Acme Pty Ltd", "contact": "Jo · 0400 111 222", "dietary": ["2 vegan"],
            "notes": "Leave at reception", "quote": 484, "status": "enquiry"}  # fmt: skip
    made = post(till, "/catering/ceQ2M8ZK1", body, method="put").json()
    assert made["source"] == "pos" and made["quote"] == 484 and made["fulfil"] == "delivery"
    enquiry = Enquiry.objects.get(reference="ceQ2M8ZK1")
    assert enquiry.kind == "catering" and enquiry.headcount == 20 and enquiry.status == "new"
    won = post(till, "/catering/ceQ2M8ZK1", {**body, "status": "confirmed"}, method="put").json()
    assert won["status"] == "confirmed"
    enquiry.refresh_from_db()
    assert enquiry.status == "won" and enquiry.payload["address"] == "1 Office St"
    snap = till.get(f"{BASE}/snapshot?cafe=braddon").json()["catering"]
    assert snap[0]["id"] == "ceQ2M8ZK1" and snap[0]["packageId"] == "Grazing Box"


# ---------------------------------------------------------------- BOS sales report


def test_bos_reports_show_sales_from_app_and_till_orders(till, cafe, menu, app_order):
    from django.test import Client

    create(till)  # $35.60 till order
    number = "BRADDON-TILL-1-0001"
    pay(till, number, 3560, method="card", surcharge=105)
    refund = {"adjustment": {"key": "R1", "mode": "refund", "amount": 630, "reason": "Wrong item"},
              "lines": [{"key": "L1", "qty": 2}, {"key": "L2", "qty": 1}], "total": 35.6,
              "status": "new"}  # fmt: skip
    post(till, f"/orders/{quote(number)}/adjustments", refund)
    post(till, f"/orders/{quote('#8020-4471')}/accept", {})  # app order: $11.30 Apple Pay
    create(till, id="CANCELLED-1", status="new")
    cancel = {"adjustment": {"key": "R2", "mode": "cancel", "amount": 0, "reason": "x"},
              "lines": [], "total": 0, "status": "cancelled"}  # fmt: skip
    post(till, "/orders/CANCELLED-1/adjustments", cancel)
    owner = UserFactory(role="owner", is_superuser=True, is_staff=True)
    browser = Client()
    browser.force_login(owner)
    page = browser.get(reverse("admin:bos_reports"))
    assert page.status_code == 200
    sales = page.context["sales"]
    assert sales["total"] == 3560 + 1130 and sales["orders"] == 2
    assert sales["returned"] == 630
    assert {row["label"]: row["value"] for row in sales["tenders"]} == {
        "Card": 3560,
        "Wallet": 1130,
    }
    assert {row["label"] for row in sales["channels"]} == {"Till", "App"}
    assert sales["items"][0]["label"] == "Milk Based Coffee"  # app + till lines, menu name
    assert sales["items"][0]["value"] == 4
    assert b"Sales over time" in page.content and b"$46.90" in page.content
    csv = browser.get(reverse("admin:bos_reports") + "?export=orders").content.decode()
    assert "BRADDON-TILL-1-0001" in csv and "#8020-4471" in csv and "CANCELLED-1" not in csv


# ---------------------------------------------------------------- tables, promo codes, dashboard


def test_snapshot_tables_and_promo_codes(till, cafe, elsewhere):
    from apps.pos.models import Promotion, TillTable

    TillTable.objects.create(location=cafe, label="T2", seats=2, zone="Window", sort_order=2)
    TillTable.objects.create(location=cafe, label="T1", seats=4, zone="Window", sort_order=1)
    TillTable.objects.create(location=cafe, label="T9", is_active=False)
    TillTable.objects.create(location=elsewhere, label="C1")
    today = timezone.localdate()
    Promotion.objects.create(code="welcome10", label="10% off", kind="pct", percent=10)
    Promotion.objects.create(code="LOCAL5", label="$5 off", kind="amt", amount_cents=500,
                             location=cafe)  # fmt: skip
    Promotion.objects.create(code="CIVIC", label="x", kind="pct", percent=5, location=elsewhere)
    Promotion.objects.create(code="OLD", label="x", kind="pct", percent=5,
                             ends_on=today - timedelta(days=1))  # fmt: skip
    Promotion.objects.create(code="OFF", label="x", kind="pct", percent=5, is_active=False)
    snap = till.get(f"{BASE}/snapshot?cafe=braddon").json()
    assert snap["tables"] == [
        {"id": "T1", "seats": 4, "zone": "Window"},
        {"id": "T2", "seats": 2, "zone": "Window"},
    ]
    assert snap["promotions"] == [
        {"code": "LOCAL5", "kind": "amt", "value": 5, "label": "$5 off"},
        {"code": "WELCOME10", "kind": "pct", "value": 10, "label": "10% off"},
    ]


def test_bos_tables_and_promo_codes_pages(cafe, elsewhere):
    from django.test import Client

    from apps.pos.models import Promotion, TillTable

    manager = UserFactory(role="manager", is_staff=True)
    StaffAssignment.objects.create(user=manager, location=cafe)
    TillTable.objects.create(location=elsewhere, label="C1")
    browser = Client()
    browser.force_login(manager)
    added = browser.post(
        reverse("admin:pos_tilltable_add"),
        {"location": cafe.pk, "label": "T1", "seats": 4, "zone": "Main", "sort_order": 0,
         "is_active": "on"},
    )  # fmt: skip
    assert added.status_code == 302, added.content[:1500]
    listing = browser.get(reverse("admin:pos_tilltable_changelist")).content.decode()
    assert "T1" in listing and "C1" not in listing  # only their café's floor plan
    assert browser.get(reverse("admin:pos_promotion_add")).status_code == 403  # chain owner only
    owner = UserFactory(role="owner", is_superuser=True, is_staff=True)
    browser.force_login(owner)
    made = browser.post(
        reverse("admin:pos_promotion_add"),
        {"code": " local5 ", "label": "$5 off", "is_active": "on", "kind": "amt",
         "amount_cents": "5.00", "location": ""},
    )  # fmt: skip
    assert made.status_code == 302, made.content[:1500]
    promo = Promotion.objects.get()
    assert promo.code == "LOCAL5" and promo.amount_cents == 500
    missing = browser.post(
        reverse("admin:pos_promotion_add"),
        {"code": "PCT", "label": "x", "kind": "pct", "location": ""},
    )
    assert missing.status_code == 200 and b"Enter the percentage off" in missing.content


def test_dashboard_figures_come_from_real_records(till, cafe, menu, regular, app_order):
    from apps.bookings.models import Booking
    from apps.enquiries.models import CateringPackage, Enquiry
    from apps.loyalty import services as loyalty

    card = LoyaltyCard.objects.get(user=regular)
    card.stamps = 3
    card.save()
    loyalty.record_stamp_change(card, 1, location_name="Braddon")  # +2 stamps
    card.stamps = 0
    card.save()
    loyalty.record_stamp_change(card, 3, location_name="Braddon")  # a correction, no stamps
    today = timezone.localdate()
    for status, size in [("seated", 4), ("no_show", 2), ("cancelled", 6)]:
        Booking.objects.create(location=cafe, date=today, time="09:00", party_size=size,
                               name="G", email="", phone="", status=status)  # fmt: skip
    package = CateringPackage.objects.create(slug="box", name="Box", price_cents=2000)
    Enquiry.objects.create(kind="catering", name="A", email="", message="", status="won",
                           package=package, headcount=10, location=cafe)  # fmt: skip
    Enquiry.objects.create(kind="catering", name="B", email="", message="", location=cafe)
    create(till)
    reports = till.get(f"{BASE}/snapshot?cafe=braddon").json()["reports"]
    assert reports["loyalty"]["stamps"] == 2
    assert reports["reservations"] == {"week": 2, "covers": 6, "noShow": 1, "avgParty": 3.0}
    assert reports["catering"] == {"enquiries": 2, "confirmed": 1, "revenue": 200}
    assert reports["loyaltyActivity"][0]["what"].endswith("Sophie Nguyen")
    assert reports["loyaltyActivity"][0]["when"].startswith("Today")
    assert reports["days"][-1]["sales"] == 35.6  # till order; the app order is not accepted
    assert reports["salesTodayComparison"] == ""  # nothing sold a week ago to compare with
