from concurrent.futures import ThreadPoolExecutor
from datetime import time, timedelta
from threading import Barrier

import pytest
from django.db import close_old_connections, connection
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.bookings.models import Booking, BookingRule
from apps.bookings.services import create_booking
from apps.core.exceptions import DomainError
from apps.locations.models import OpeningHours

from .factories import LocationFactory, UserFactory

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif(
        connection.vendor != "postgresql", reason="Requires real PostgreSQL row locks/RLS"
    ),
]


def test_concurrent_bookings_cannot_overbook():
    branch = LocationFactory()
    day = timezone.localdate() + timedelta(days=2)
    BookingRule.objects.create(
        location=branch, is_enabled=True, max_party_size=2, max_covers_per_slot=2
    )
    OpeningHours.objects.create(
        location=branch, weekday=day.weekday(), opens_at=time(6), closes_at=time(15)
    )
    barrier = Barrier(2)

    def book():
        close_old_connections()
        barrier.wait(timeout=5)
        try:
            create_booking(
                {
                    "location": branch,
                    "date": day,
                    "time": time(10),
                    "party_size": 2,
                    "name": "Test",
                    "email": "test@example.com",
                    "phone": "123",
                }
            )
            return "created"
        except DomainError as exc:
            return exc.error_code
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(lambda _: book(), range(2)))
    assert sorted(result) == ["booking_slot_full", "created"]
    assert Booking.objects.count() == 1


def test_concurrent_refresh_token_rotation_rejects_replay():
    user = UserFactory()
    refresh = str(RefreshToken.for_user(user))
    barrier = Barrier(2)

    def renew():
        close_old_connections()
        barrier.wait(timeout=5)
        try:
            return (
                APIClient()
                .post("/api/v1/auth/refresh", {"refresh": refresh}, format="json")
                .status_code
            )
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: renew(), range(2))) == [200, 401]


def test_all_django_tables_have_row_level_security():
    with connection.cursor() as cursor:
        cursor.execute("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'")
        rows = cursor.fetchall()
    assert rows and all(enabled for _, enabled in rows), rows
