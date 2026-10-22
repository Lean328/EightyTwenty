from datetime import date, time, timedelta
from unittest.mock import Mock, patch

import pytest
from django.utils import timezone

from apps.bookings.models import Booking, BookingRule
from apps.bookings.services import local_datetime
from apps.core.exceptions import DomainError
from apps.enquiries.models import Enquiry
from apps.locations.models import SpecialHours
from apps.notifications.models import EmailMessage

from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_booking_workflow_and_capacity(client, staff, booking_data):
    first = client.post("/api/v1/public/bookings", booking_data, format="json")
    assert first.status_code == 201, first.data
    assert first.data["status"] == "requested"
    assert client.post("/api/v1/public/bookings", booking_data, format="json").status_code == 201
    full = client.post("/api/v1/public/bookings", booking_data, format="json")
    assert full.status_code == 409 and full.data["error"]["code"] == "booking_slot_full"
    booking = Booking.objects.get(reference=first.data["reference"])
    client.force_authenticate(staff)
    assert client.get("/api/v1/bos/bookings?location=braddon").data["count"] == 2
    assert (
        client.post(f"/api/v1/bos/bookings/{booking.pk}/confirm", {}, format="json").data["status"]
        == "confirmed"
    )
    assert (
        client.patch(
            f"/api/v1/bos/bookings/{booking.pk}", {"status": "cancelled"}, format="json"
        ).status_code
        == 200
    )
    invalid = client.post(f"/api/v1/bos/bookings/{booking.pk}/confirm", {}, format="json")
    assert invalid.status_code == 409
    assert EmailMessage.objects.filter(subject__contains=booking.reference).count() == 3


@pytest.mark.parametrize(
    "change,code",
    [
        ({"time": "10:15"}, "invalid_slot"),
        ({"party_size": 5}, "party_too_large"),
        ({"time": "15:00"}, "invalid_slot"),
        ({"date": "2000-01-01"}, "invalid_booking_date"),
        ({"website": "spam"}, "spam_detected"),
    ],
)
def test_invalid_bookings_do_not_write(client, booking_data, change, code):
    response = client.post("/api/v1/public/bookings", {**booking_data, **change}, format="json")
    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == code
    assert not Booking.objects.exists()


def test_special_hours_disabled_rule_and_availability(client, booking_data, branch):
    url = f"/api/v1/public/bookings/availability?location={branch.slug}&date={booking_data['date']}"
    assert any(slot["time"] == "10:00:00" for slot in client.get(url).data)
    SpecialHours.objects.create(location=branch, date=booking_data["date"], is_closed=True)
    assert client.get(url).data == []
    assert (
        client.post("/api/v1/public/bookings", booking_data, format="json").data["error"]["code"]
        == "location_closed"
    )
    BookingRule.objects.filter(location=branch).update(is_enabled=False)
    assert client.get(url).data == []
    SpecialHours.objects.filter(location=branch).delete()
    branch.email = "braddon@example.com"
    branch.save()
    # Rule off: the request is still recorded for the café to confirm, with the seating
    # preference, and both the guest and the café inbox are told.
    recorded = client.post(
        "/api/v1/public/bookings", {**booking_data, "seating": "outdoor"}, format="json"
    )
    assert recorded.status_code == 201, recorded.data
    booking = Booking.objects.get(reference=recorded.data["reference"])
    assert booking.status == "requested" and booking.seating == "outdoor"
    assert booking.source == "web"
    assert EmailMessage.objects.filter(recipient=branch.email).count() == 1
    assert EmailMessage.objects.filter(recipient=booking.email).count() == 1


@pytest.mark.parametrize(
    "change,code",
    [
        ({"party_size": 5}, "party_too_large"),
        ({"time": "05:00"}, "location_closed"),
        ({"time": "14:45"}, "location_closed"),
        ({"date": "2000-01-01"}, "invalid_booking_date"),
        ({"date": str(timezone.localdate() + timedelta(days=90))}, "invalid_booking_date"),
    ],
)
def test_requests_with_rule_off_keep_the_shared_rules(client, booking_data, branch, change, code):
    BookingRule.objects.filter(location=branch).update(is_enabled=False)
    response = client.post("/api/v1/public/bookings", {**booking_data, **change}, format="json")
    assert response.status_code == 400, response.data
    assert response.data["error"]["code"] == code
    assert response.data["error"]["message"]
    assert not Booking.objects.exists()


def test_requests_need_an_open_cafe(client, booking_data, branch):
    BookingRule.objects.filter(location=branch).delete()
    branch.status = "tbc"
    branch.save()
    response = client.post("/api/v1/public/bookings", booking_data, format="json")
    assert response.data["error"]["code"] == "bookings_disabled"
    branch.status = "open"
    branch.save()
    assert client.post("/api/v1/public/bookings", booking_data, format="json").status_code == 201


def test_cross_branch_bookings_and_my_bookings(client, staff, booking_data, other_branch):
    customer = UserFactory()
    client.force_authenticate(customer)
    client.post("/api/v1/public/bookings", booking_data, format="json")
    own = Booking.objects.get()
    assert client.get("/api/v1/me/bookings").data["count"] == 1
    other = Booking.objects.create(
        location=other_branch,
        date=booking_data["date"],
        time="10:00",
        party_size=1,
        name="Other",
        email="other@example.com",
        phone="123",
    )
    client.force_authenticate(staff)
    assert client.get(f"/api/v1/bos/bookings/{other.pk}").status_code == 404
    assert (
        client.patch(
            f"/api/v1/bos/bookings/{other.pk}", {"status": "confirmed"}, format="json"
        ).status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/bos/bookings/{other.pk}/confirm", {}, format="json").status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/bos/bookings/{own.pk}/decline", {}, format="json").status_code == 200
    )
    assert (
        client.patch(
            f"/api/v1/bos/bookings/{own.pk}", {"location": str(other_branch.pk)}, format="json"
        ).status_code
        == 400
    )
    client.force_authenticate(UserFactory())
    assert client.get("/api/v1/me/bookings").data["count"] == 0


@pytest.mark.parametrize("kind", ["catering", "wholesale", "contact"])
def test_enquiry_ingest_scoped_queue_and_assignment(
    client, staff, owner, branch, other_branch, kind
):
    data = {
        "kind": kind,
        "name": "Test",
        "email": "guest@example.com",
        "message": "Please send details.",
        "location": branch.slug,
    }
    result = client.post("/api/v1/public/enquiries", data, format="json")
    assert result.status_code == 201, result.data
    record = Enquiry.objects.get(reference=result.data["reference"])
    client.post("/api/v1/public/enquiries", {**data, "location": other_branch.slug}, format="json")
    client.post("/api/v1/public/enquiries", {**data, "location": None}, format="json")
    client.force_authenticate(staff)
    assert client.get("/api/v1/bos/enquiries").data["count"] == 1
    assert (
        client.patch(
            f"/api/v1/bos/enquiries/{record.pk}",
            {"status": "in_progress", "assigned_to": str(staff.pk), "internal_notes": "Call back"},
            format="json",
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/v1/bos/enquiries/{record.pk}",
            {"assigned_to": str(UserFactory().pk)},
            format="json",
        ).status_code
        == 400
    )
    client.force_authenticate(owner)
    assert client.get("/api/v1/bos/enquiries").data["count"] == 3


def test_captcha_fail_closed_and_email_failure_does_not_lose_booking(
    client, booking_data, settings, django_capture_on_commit_callbacks
):
    settings.TURNSTILE_ENABLED = True
    assert (
        client.post("/api/v1/public/bookings", booking_data, format="json").data["error"]["code"]
        == "captcha_required"
    )
    with patch("apps.core.antispam.httpx.post", return_value=Mock(json=lambda: {"success": False})):
        assert (
            client.post(
                "/api/v1/public/bookings", {**booking_data, "turnstile_token": "bad"}, format="json"
            ).data["error"]["code"]
            == "captcha_failed"
        )
    settings.TURNSTILE_ENABLED = False
    with (
        patch("apps.notifications.services.send_mail", side_effect=RuntimeError("unavailable")),
        django_capture_on_commit_callbacks(execute=True),
    ):
        assert (
            client.post("/api/v1/public/bookings", booking_data, format="json").status_code == 201
        )
    assert Booking.objects.count() == 1
    # Guest receipt and café inbox copy both queued and both retried later.
    assert list(EmailMessage.objects.values_list("status", flat=True)) == ["failed", "failed"]


@pytest.mark.parametrize("day", [date(2026, 10, 4), date(2026, 4, 5)])
def test_sydney_dst_nonexistent_or_ambiguous_times_are_rejected(day):
    with pytest.raises(DomainError):
        local_datetime(day, time(2, 30))
