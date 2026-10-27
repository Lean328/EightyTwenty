"""Day-before reminders for confirmed tables (bookings.services.send_reminders)."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from apps.bookings.models import Booking
from apps.bookings.services import send_reminders
from apps.notifications.models import AppNotification, EmailMessage

from .factories import UserFactory

SYDNEY = ZoneInfo("Australia/Sydney")
NOW = datetime(2026, 11, 2, 12, 0, tzinfo=SYDNEY)  # Monday noon


def booking(branch, when, status="confirmed", customer=None):
    return Booking.objects.create(
        location=branch,
        date=when.date(),
        time=when.time(),
        party_size=2,
        name="Sophie",
        email="sophie@example.com",
        phone="0400 000 000",
        status=status,
        customer=customer,
    )


def test_a_confirmed_table_tomorrow_gets_one_reminder(branch, db):
    customer = UserFactory()
    row = booking(branch, NOW + timedelta(hours=22), customer=customer)
    assert send_reminders(NOW) == 1
    mail = EmailMessage.objects.get(dedup_key=f"booking-{row.pk}-reminder")
    assert mail.subject == f"See you tomorrow at EightyTwenty {branch.name}"
    assert "tomorrow at 10:00 AM, 2 guests" in mail.body and row.reference in mail.body
    feed = AppNotification.objects.get(user=customer, kind="booking")
    assert feed.text == f"Reminder: your table at {branch.name} tomorrow at 10:00 AM, 2 guests."
    row.refresh_from_db()
    assert row.reminded_at is not None
    assert send_reminders(NOW + timedelta(minutes=15)) == 0


def test_only_confirmed_tables_in_the_window(branch, db):
    booking(branch, NOW + timedelta(hours=30))  # too early: next runs will catch it
    booking(branch, NOW + timedelta(hours=1))  # too late to be useful
    booking(branch, NOW + timedelta(hours=20), status="requested")
    booking(branch, NOW + timedelta(hours=20), status="cancelled")
    assert send_reminders(NOW) == 0
    assert not EmailMessage.objects.filter(dedup_key__endswith="-reminder").exists()


def test_later_today_says_today(branch, db):
    morning = datetime.combine(NOW.date(), time(7, 0), tzinfo=SYDNEY)
    booking(branch, morning + timedelta(hours=8, minutes=30))
    assert send_reminders(morning) == 1
    assert EmailMessage.objects.get().subject.startswith("See you today")


def test_job_endpoint(client, settings, branch):
    booking(branch, datetime.now(SYDNEY) + timedelta(hours=5))
    response = client.post("/api/v1/jobs/booking-reminders", HTTP_X_JOB_TOKEN=settings.JOB_TOKEN)
    assert response.status_code == 200 and response.json() == {"processed": 1}
    assert client.post("/api/v1/jobs/booking-reminders").status_code == 403
