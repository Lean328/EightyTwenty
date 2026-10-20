"""Workspace lists: bookings by default, team vs customers, coffee card counter, orders, Overview."""

from datetime import time, timedelta

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import StaffAssignment
from apps.bookings.models import Booking
from apps.core.models import AuditLog
from apps.loyalty.models import LoyaltyActivity, LoyaltyCard
from apps.notifications.models import AppNotification
from apps.orders.models import Order, OrderLine

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


def member(role, cafe, **fields):
    user = UserFactory(role=role, is_staff=True, **fields)
    StaffAssignment.objects.create(user=user, location=cafe)
    return user


def booking(cafe, days, name, **fields):
    return Booking.objects.create(
        location=cafe, date=timezone.localdate() + timedelta(days=days), time=time(9, 30),
        party_size=2, name=name, email="g@example.com", phone="0412 345 678", **fields,
    )  # fmt: skip


def body(client, url):
    response = client.get(url)
    assert response.status_code == 200
    return response.content.decode()


def test_bookings_open_on_today_and_upcoming_soonest_first(cafe, chain):
    booking(cafe, -3, "Past Guest", status="requested")
    booking(cafe, 5, "Later Guest")
    booking(cafe, 0, "Today Guest")
    client = signed_in(chain)
    url = reverse("admin:bookings_booking_changelist")
    page = body(client, url)
    assert "Past Guest" not in page
    assert page.index("Today Guest") < page.index("Later Guest")
    assert 'href="tel:0412345678"' in page and "Today" in page
    assert "Past Guest" in body(client, url + "?when=past")
    # Any filter, search or Overview link shows every date, latest first.
    requested = body(client, url + "?status__exact=requested")
    assert "Past Guest" in requested
    everything = body(client, url + "?q=Guest")
    assert everything.index("Later Guest") < everything.index("Past Guest")


def test_team_and_customers_are_listed_apart(cafe, chain):
    staff = member("staff", cafe, first_name="Mia", last_name="Tran")
    guest = UserFactory(role="customer", first_name="Olivia", last_name="Smith")
    LoyaltyCard.objects.create(user=guest, stamps=5)
    client = signed_in(chain)
    team = body(client, reverse("admin:accounts_user_changelist"))
    assert "Mia Tran" in team and "Staff" in team and "Olivia Smith" not in team
    customers = body(client, reverse("admin:accounts_customer_changelist"))
    assert "Olivia Smith" in customers and "5/9" in customers and "Mia Tran" not in customers
    page = body(client, reverse("admin:accounts_customer_change", args=[guest.pk]))
    assert "Spent in the app" in page
    # An old link to the customer through the team list still opens.
    assert client.get(reverse("admin:accounts_user_change", args=[guest.pk])).status_code == 200
    manager = signed_in(member("manager", cafe))
    assert manager.get(reverse("admin:accounts_customer_changelist")).status_code == 403
    assert staff.pk  # the manager still sees their staff in Team
    assert "Mia Tran" in body(manager, reverse("admin:accounts_user_changelist"))


def test_staff_stamp_and_redeem_at_the_counter(cafe):
    staff = member("staff", cafe, first_name="Mia")
    guest = UserFactory(role="customer", first_name="Olivia")
    card = LoyaltyCard.objects.create(user=guest, stamps=8)
    client = signed_in(staff)
    listing = reverse("admin:loyalty_loyaltycard_changelist")
    page = body(client, listing)
    assert "+1 stamp" in page and "8/9" in page
    stamp = reverse("admin:loyalty_loyaltycard_stamp", args=[card.pk])
    assert client.post(stamp, HTTP_REFERER="http://testserver" + listing).url.endswith(listing)
    card.refresh_from_db()
    assert card.stamps == 9
    assert LoyaltyActivity.objects.filter(card=card, type="earn", location_name="Braddon").exists()
    assert AppNotification.objects.filter(user=guest).exists()
    assert AuditLog.objects.filter(entity_id=str(card.pk), actor=staff).exists()
    assert "Redeem free coffee" in body(client, listing)

    client.post(stamp)  # a full card takes no more stamps
    card.refresh_from_db()
    assert card.stamps == 9
    client.post(reverse("admin:loyalty_loyaltycard_redeem", args=[card.pk]))
    card.refresh_from_db()
    assert card.stamps == 0
    assert LoyaltyActivity.objects.filter(card=card, description="Free coffee redeemed").exists()
    client.post(reverse("admin:loyalty_loyaltycard_redeem", args=[card.pk]))  # nothing to redeem
    card.refresh_from_db()
    assert card.stamps == 0


def test_only_the_chain_owner_types_a_stamp_count(cafe, chain):
    card = LoyaltyCard.objects.create(user=UserFactory(role="customer"), stamps=3)
    url = reverse("admin:loyalty_loyaltycard_change", args=[card.pk])
    staff_page = body(signed_in(member("staff", cafe)), url)
    assert 'name="stamps"' not in staff_page and "+1 stamp" in staff_page
    chain_page = body(signed_in(chain), url)
    assert 'name="stamps"' in chain_page and "Save correction" in chain_page


def test_orders_list_shows_who_and_what(cafe, chain):
    order = Order.objects.create(
        location=cafe, channel="pos", table_number="4", subtotal_cents=1600, total_cents=1600
    )
    for position, (name, qty) in enumerate(
        [("Flat White", 2), ("Banana Bread", 1), ("Toast", 1), ("Juice", 1), ("Voided", 0)]
    ):
        OrderLine.objects.create(
            order=order, item_slug=name.lower(), name=name, qty=qty, unit_price_cents=400,
            position=position,
        )  # fmt: skip
    page = body(signed_in(chain), reverse("admin:orders_order_changelist"))
    assert "Table 4" in page and "2× Flat White, Banana Bread, Toast +1 more" in page
    assert "Voided" not in page


def test_overview_counts_app_orders_waiting(cafe, chain):
    other = LocationFactory(name="Civic")
    for location in (cafe, cafe, other):
        Order.objects.create(location=location, subtotal_cents=500, total_cents=500)
    Order.objects.create(location=cafe, channel="pos", subtotal_cents=500, total_cents=500)
    page = body(signed_in(chain), reverse("admin:index"))
    assert "<strong>3</strong> app orders are waiting for you" in page
    assert "channel__exact=app&amp;status__exact=received" in page
    manager_page = body(signed_in(member("manager", cafe)), reverse("admin:index"))
    assert "<strong>2</strong> app orders are waiting for you" in manager_page
