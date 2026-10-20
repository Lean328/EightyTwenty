"""seed_demo: demo records for a local database only."""

from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.accounts.models import User
from apps.bookings.models import Booking
from apps.enquiries.models import Enquiry
from apps.orders.models import Order
from apps.pos import pins

from .factories import LocationFactory, MenuItemFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def menu():
    cafes = [LocationFactory(), LocationFactory()]
    MenuItemFactory(name="Flat White")
    MenuItemFactory(name="Banana Bread")
    return cafes


def test_fills_a_local_database(menu):
    out = StringIO()
    call_command("seed_demo", "--days", "3", stdout=out)
    assert "Demo data" in out.getvalue()
    owner = User.objects.get(email="owner@example.com")
    assert owner.is_superuser and owner.check_password("eightytwenty-demo")
    assert User.objects.filter(role="customer").count() == 30
    assert Order.objects.filter(channel="pos").exists() and Order.objects.filter(channel="app")
    assert Booking.objects.exists() and Enquiry.objects.count() == 15
    staff = User.objects.get(email=f"staff.{menu[0].slug}@example.com")
    assert pins.find_by_pin("1002", [menu[0].pk]) == staff
    with pytest.raises(CommandError, match="already here"):
        call_command("seed_demo")


def test_needs_the_menu_first(db):
    with pytest.raises(CommandError, match="seed_from_mock"):
        call_command("seed_demo")


def test_refuses_a_remote_database(menu, monkeypatch):
    monkeypatch.setattr(connection, "vendor", "postgresql")
    monkeypatch.setitem(
        connection.settings_dict, "HOST", "aws-0-ap-southeast-1.pooler.supabase.com"
    )
    with pytest.raises(CommandError, match="local database"):
        call_command("seed_demo")
    assert not User.objects.exists()
