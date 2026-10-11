from datetime import UTC, datetime, timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.exceptions import DomainError
from apps.core.services import audit, snapshot
from apps.notifications.services import enqueue_email

from .models import Booking, BookingRule

OCCUPYING_STATUSES = ["requested", "confirmed", "seated"]
TRANSITIONS = {
    "requested": {"confirmed", "declined", "cancelled"},
    "confirmed": {"cancelled", "seated", "no_show"},
    "declined": set(),
    "cancelled": set(),
    "seated": set(),
    "no_show": set(),
}


def hours_for(location, date):
    return (
        location.special_hours.filter(date=date).first()
        or location.opening_hours.filter(weekday=date.weekday()).first()
    )


def local_datetime(date, time):
    naive = datetime.combine(date, time)
    zone = timezone.get_default_timezone()
    local = naive.replace(tzinfo=zone)
    # Reject ambiguous/nonexistent wall times during Sydney DST transitions.
    if (
        local.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != naive
        or local.utcoffset() != naive.replace(tzinfo=zone, fold=1).utcoffset()
    ):
        raise DomainError(
            "invalid_slot", "This local time is not a valid unambiguous booking time."
        )
    return local


def validate_slot(location, rule, date, time, party_size):
    if not rule or not rule.is_enabled or not location.is_published or location.status != "open":
        raise DomainError("bookings_disabled", "This location is not accepting bookings.")
    if party_size > rule.max_party_size:
        raise DomainError("party_too_large", f"The maximum party size is {rule.max_party_size}.")
    now = timezone.now()
    moment = local_datetime(date, time)
    if moment < now + timedelta(minutes=rule.min_lead_minutes) or date > timezone.localdate(
        now
    ) + timedelta(days=rule.max_days_ahead):
        raise DomainError(
            "invalid_booking_date", "The requested time is outside the booking window."
        )
    hours = hours_for(location, date)
    if not hours or hours.is_closed or not hours.opens_at or not hours.closes_at:
        raise DomainError("location_closed", "No booking hours are configured for this day.")
    start = datetime.combine(date, hours.opens_at)
    requested = datetime.combine(date, time)
    end = datetime.combine(date, hours.closes_at)
    difference = (requested - start).total_seconds()
    if (
        time.second
        or time.microsecond
        or difference < 0
        or difference % (rule.slot_minutes * 60)
        or requested + timedelta(minutes=rule.slot_minutes) > end
    ):
        raise DomainError("invalid_slot", "Choose a valid slot within opening hours.")


def used_covers(location, date, time):
    return (
        Booking.objects.filter(
            location=location, date=date, time=time, status__in=OCCUPYING_STATUSES
        ).aggregate(total=Sum("party_size"))["total"]
        or 0
    )


@transaction.atomic
def create_booking(data, customer=None):
    location = data["location"]
    rule = BookingRule.objects.select_for_update().filter(location=location).first()
    validate_slot(location, rule, data["date"], data["time"], data["party_size"])
    if (
        used_covers(location, data["date"], data["time"]) + data["party_size"]
        > rule.max_covers_per_slot
    ):
        raise DomainError("booking_slot_full", "This time slot is full.", 409)
    booking = Booking.objects.create(**data, customer=customer)
    enqueue_email(
        booking.email,
        f"Booking request {booking.reference}",
        f"We received your booking request for {location.name}, {booking.date} {booking.time}, party of {booking.party_size}. Your booking is requested, not confirmed. Staff will contact you after reviewing it.",
        f"booking-{booking.pk}-requested",
    )
    return booking


@transaction.atomic
def update_booking(booking, changes, request):
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    before = snapshot(booking)
    new_status = changes.get("status", booking.status)
    changed_status = new_status != booking.status
    if changed_status and new_status not in TRANSITIONS[booking.status]:
        raise DomainError(
            "invalid_transition", f"Cannot change {booking.status} to {new_status}.", 409
        )
    for key, value in changes.items():
        setattr(booking, key, value)
    if changed_status:
        booking.handled_by = request.user
        booking.handled_at = timezone.now()
    booking.updated_by = request.user
    booking.save()
    audit(request, booking, before)
    if changed_status:
        enqueue_email(
            booking.email,
            f"Booking {booking.reference}: {new_status}",
            f"Your booking at {booking.location.name} on {booking.date} at {booking.time} is now {new_status}.",
            f"booking-{booking.pk}-{new_status}",
        )
    return booking


def available_slots(location, date):
    rule = BookingRule.objects.filter(location=location, is_enabled=True).first()
    hours = hours_for(location, date)
    if not rule or not hours or hours.is_closed or not hours.opens_at or not hours.closes_at:
        return []
    used = {
        row["time"]: row["covers"]
        for row in Booking.objects.filter(
            location=location, date=date, status__in=OCCUPYING_STATUSES
        )
        .values("time")
        .annotate(covers=Sum("party_size"))
    }
    current = datetime.combine(date, hours.opens_at)
    end = datetime.combine(date, hours.closes_at)
    result = []
    while current + timedelta(minutes=rule.slot_minutes) <= end:
        try:
            validate_slot(location, rule, date, current.time(), 1)
        except DomainError:
            pass
        else:
            remaining = max(0, rule.max_covers_per_slot - used.get(current.time(), 0))
            result.append(
                {
                    "time": current.time(),
                    "remaining_covers": remaining,
                    "max_party_size": min(rule.max_party_size, remaining),
                }
            )
        current += timedelta(minutes=rule.slot_minutes)
    return result
