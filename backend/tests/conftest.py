from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import StaffAssignment
from apps.bookings.models import BookingRule
from apps.locations.models import OpeningHours

from .factories import LocationFactory, MenuItemFactory, UserFactory


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def owner(db):
    return UserFactory(role="owner")


@pytest.fixture
def owner_client(client, owner):
    client.force_authenticate(owner)
    return client


@pytest.fixture
def branch(db):
    return LocationFactory(slug="braddon")


@pytest.fixture
def other_branch(db):
    return LocationFactory(slug="other")


@pytest.fixture
def staff(branch):
    user = UserFactory(role="staff")
    StaffAssignment.objects.create(user=user, location=branch)
    return user


@pytest.fixture
def dish(db):
    return MenuItemFactory(slug="sample-dish")


@pytest.fixture
def booking_data(branch):
    BookingRule.objects.create(
        location=branch,
        is_enabled=True,
        min_lead_minutes=0,
        max_party_size=4,
        max_covers_per_slot=4,
    )
    for day in range(7):
        OpeningHours.objects.create(
            location=branch, weekday=day, opens_at=time(6), closes_at=time(15)
        )
    return {
        "location": branch.slug,
        "date": str(timezone.localdate() + timedelta(days=2)),
        "time": "10:00",
        "party_size": 2,
        "name": "Example Customer",
        "email": "guest@example.com",
        "phone": "0400000000",
        "source": "web",
    }
