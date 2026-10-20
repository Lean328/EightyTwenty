"""Readable record pages: order, booking and enquiry summaries, and the customer overview."""

from datetime import time, timedelta

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import StaffAssignment
from apps.bookings.models import Booking
from apps.enquiries.models import Enquiry
from apps.loyalty.models import GiftCard, LoyaltyCard
from apps.orders.models import Order, OrderAdjustment, OrderLine, OrderPayment

from .factories import LocationFactory, UserFactory

pytestmark = pytest.mark.django_db


def signed_in(user):
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def cafe():
    return LocationFactory(name="Braddon")


@pytest.fixture
def chain():
    return UserFactory(is_staff=True, is_superuser=True, role="owner", first_name="Sam")


@pytest.fixture
def crew(cafe):
    user = UserFactory(role="staff", is_staff=True, first_name="Mia", last_name="Tran")
    StaffAssignment.objects.create(user=user, location=cafe)
    return user


@pytest.fixture
def guest():
    return UserFactory(
        role="customer", first_name="Olivia", last_name="Smith", phone="0412 345 678"
    )


def order(cafe, **fields):
    data = {"location": cafe, "subtotal_cents": 2300, "total_cents": 2300, **fields}
    return Order.objects.create(**data)


def page(client, name, obj):
    response = client.get(reverse(f"admin:{name}_change", args=[obj.pk]))
    assert response.status_code == 200
    return response.content.decode()


def test_till_order_reads_like_a_receipt(cafe, chain):
    obj = order(
        cafe,
        channel="pos",
        status="completed",
        table_number="4",
        staff_name="Mia T.",
        subtotal_cents=2800,
        discount_cents=280,
        total_cents=2520,
        discounts=[{"label": "Staff 10%", "amount": 2.8}],
        review_note="Flat White: till $5.50, menu $5.00",
        history=[{"at": timezone.now().isoformat(), "what": "Sent to kitchen"}],
    )
    OrderLine.objects.create(
        order=obj, item_slug="flat", name="Flat White", qty=2, unit_price_cents=550,
        modifiers_label="Oat milk", note="Extra hot",
    )  # fmt: skip
    OrderLine.objects.create(
        order=obj, item_slug="toast", name="Banana Toast", qty=0, unit_price_cents=1700
    )
    OrderPayment.objects.create(order=obj, method="card", amount_cents=2520, reference="p1")
    OrderAdjustment.objects.create(
        order=obj, key="a1", mode="refund", amount_cents=500, reason="Cold coffee"
    )
    body = page(signed_in(chain), "orders_order", obj)
    for text in [
        "Till order",
        "Table 4",
        "2×",
        "Oat milk",
        "Extra hot",
        "$11.00",
        "Voided",
        "Staff 10%",
        "−$2.80",
        "$25.20",
        "Check prices",
        "Flat White: till $5.50",
        "Rung up at the till",
        "Sent to kitchen",
        "Paid $25.20 by card",
        "Refund · Cold coffee",
    ]:
        assert text in body, text
    assert 'class="bos-tabs"' not in body and "field-number" not in body


def test_app_order_shows_customer_and_who_moved_it(cafe, chain, crew, guest):
    obj = order(cafe, customer=guest, contact_name="Olivia Smith", contact_phone="0412 345 678")
    client = signed_in(crew)
    client.post(reverse("admin:orders_order_transition", args=[obj.pk, "confirmed"]))
    body = page(client, "orders_order", obj)
    assert "App order" in body and 'href="tel:0412345678"' in body
    assert "Placed in the app" in body and "Mia Tran" in body
    # Staff cannot open customer accounts, so the name is not a link for them.
    assert reverse("admin:accounts_customer_change", args=[guest.pk]) not in body
    assert reverse("admin:accounts_customer_change", args=[guest.pk]) in page(
        signed_in(chain), "orders_order", obj
    )


def test_booking_page_puts_guest_contact_and_timeline_first(cafe, crew):
    booking = Booking.objects.create(
        location=cafe,
        date=timezone.localdate() + timedelta(days=1),
        time=time(9, 30),
        party_size=4,
        name="Jack Brown",
        email="jack@example.com",
        phone="(04) 1234-5678",
        notes="Window seat please",
        source="app",
    )
    body = page(signed_in(crew), "bookings_booking", booking)
    for text in [
        "Jack Brown",
        "From the app",
        "Tomorrow",
        "9:30 AM",
        "4 guests",
        'href="tel:0412345678"',
        'href="mailto:jack@example.com',
        "Window seat please",
        "Requested on the app",
        "Confirm booking",
    ]:
        assert text in body, text
    assert "Guest details" not in body


def test_enquiry_shows_the_message_and_keeps_the_follow_up_form(cafe, chain):
    enquiry = Enquiry.objects.create(
        kind="catering",
        name="Noah Taylor",
        email="noah@example.com",
        phone="0412 000 111",
        location=cafe,
        headcount=30,
        event_date=timezone.localdate() + timedelta(days=9),
        message="Lunch for 30, mostly vegetarian.",
        payload={"occasion": "Office lunch", "dietary": ["Vegan", "Gluten free"], "source": "pos"},
    )
    client = signed_in(chain)
    body = page(client, "enquiries_enquiry", enquiry)
    for text in [
        "Catering enquiry",
        "Lunch for 30, mostly vegetarian.",
        "Reply by email",
        "Office lunch",
        "Dietary needs",
        "Vegan, Gluten free",
        "30 guests",
        "Sent from a till",
        'name="internal_notes"',
    ]:
        assert text in body, text
    assert '"source"' not in body and "Payload" not in body

    url = reverse("admin:enquiries_enquiry_change", args=[enquiry.pk])
    response = client.post(url, {"status": "in_progress", "internal_notes": "Called back"})
    assert response.status_code == 302
    enquiry.refresh_from_db()
    assert enquiry.status == "in_progress"
    body = page(client, "enquiries_enquiry", enquiry)
    assert "In progress" in body and "Sam" in body


def test_customer_account_opens_with_an_overview(cafe, chain, guest):
    LoyaltyCard.objects.create(user=guest, stamps=5)
    GiftCard.objects.create(user=guest, balance_cents=2500)
    order(cafe, customer=guest, status="completed", total_cents=1250)
    order(cafe, customer=guest, status="received")
    Booking.objects.create(
        location=cafe, date=timezone.localdate(), time=time(10), party_size=2, name="Olivia",
        email="o@example.com", phone="1", customer=guest,
    )  # fmt: skip
    body = page(signed_in(chain), "accounts_customer", guest)
    for text in [
        "Spent in the app",
        "$12.50",
        "1 completed order",
        "5 of 9 stamps",
        "$25.00",
        "2 orders in the app",
        "Bookings",
        "Account settings",
    ]:
        assert text in body, text
    assert body.count('class="is-on"') == 5


def test_team_accounts_have_no_customer_overview(chain, crew):
    body = page(signed_in(chain), "accounts_user", crew)
    assert "Spent in the app" not in body
