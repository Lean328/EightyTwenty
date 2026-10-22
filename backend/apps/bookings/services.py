from datetime import UTC, datetime, timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.exceptions import DomainError
from apps.core.models import SiteSettings
from apps.core.services import audit, snapshot
from apps.notifications.services import enqueue_email, notify

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
        raise DomainError("invalid_booking_date", "Please choose a date inside the booking window.")
    hours = hours_for(location, date)
    if not hours or hours.is_closed or not hours.opens_at or not hours.closes_at:
        raise DomainError("location_closed", "The café is closed on this day.")
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
        raise DomainError("invalid_slot", "Please choose a time within opening hours.")


def validate_request(location, rule, date, time, party_size):
    """
    A booking *request* for a café whose online-booking rule is off: the café confirms
    by hand, so only the business rules every channel shares apply (open café, inside
    opening hours, 12 hours' notice, a sensible party size and horizon). No slot or
    capacity check; that is what switching the rule on adds.
    """
    if not location.is_published or location.status != "open":
        raise DomainError("bookings_disabled", "This location is not accepting bookings.")
    maximum = rule.max_party_size if rule else 10
    if party_size > maximum:
        raise DomainError(
            "party_too_large", f"For groups larger than {maximum}, please call the café."
        )
    horizon = rule.max_days_ahead if rule else 60
    if date > timezone.localdate() + timedelta(days=horizon):
        raise DomainError(
            "invalid_booking_date", f"Bookings can be made up to {horizon} days ahead."
        )
    if problem := app_booking_problems(location, date, time):
        code = "location_closed" if "closed" in problem else "invalid_booking_date"
        raise DomainError(code, f"{problem}.")


def used_covers(location, date, time):
    return (
        Booking.objects.filter(
            location=location, date=date, time=time, status__in=OCCUPYING_STATUSES
        ).aggregate(total=Sum("party_size"))["total"]
        or 0
    )


@transaction.atomic
def create_booking(data, customer=None):
    """
    A booking request from the website. With the café's online-booking rule switched on
    the slot and its capacity are enforced; with it off the request is still recorded for
    the café to confirm or decline in BOS (the same path the mobile app already uses), so
    a request never has to fall back to an email draft.
    """
    location = data["location"]
    rule = BookingRule.objects.select_for_update().filter(location=location).first()
    if rule and rule.is_enabled:
        validate_slot(location, rule, data["date"], data["time"], data["party_size"])
        if (
            used_covers(location, data["date"], data["time"]) + data["party_size"]
            > rule.max_covers_per_slot
        ):
            raise DomainError("booking_slot_full", "This time slot is full.", 409)
    else:
        validate_request(location, rule, data["date"], data["time"], data["party_size"])
    booking = Booking.objects.create(**data, customer=customer)
    enqueue_email(
        booking.email,
        f"Booking request {booking.reference}",
        f"We received your booking request for {location.name}, {booking.date} "
        f"{booking.time:%H:%M}, party of {booking.party_size}. Your booking is requested, "
        "not confirmed. The café will confirm it with you by email.",
        f"booking-{booking.pk}-requested",
    )
    notify_cafe(booking)
    return booking


def notify_cafe(booking):
    """The request lands in the café inbox too, as the old email draft used to."""
    location = booking.location
    enqueue_email(
        location.email or SiteSettings.load().contact_email,
        f"EightyTwenty booking request — {location.name}",
        "\n".join(
            [
                f"Reference: {booking.reference} (BOS workspace → Bookings)",
                f"Café: {location.name}",
                f"Guests: {booking.party_size}",
                f"Date: {booking.date}",
                f"Time: {booking.time:%H:%M}",
                f"Table: {booking.get_seating_display() or 'No preference'}",
                f"Name: {booking.name}",
                f"Phone: {booking.phone}",
                f"Email: {booking.email}",
                f"Special requests: {booking.notes or 'None'}",
            ]
        ),
        f"booking-{booking.pk}-cafe",
    )


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
        if booking.email:  # bookings taken at the till may have no email
            enqueue_email(
                booking.email,
                f"Booking {booking.reference}: {new_status}",
                f"Your booking at {booking.location.name} on {booking.date} at {booking.time} is now {new_status}.",
                f"booking-{booking.pk}-{new_status}",
            )
        if text := app_message(booking):
            notify(booking.customer, "booking", text)
    return booking


def app_message(booking):
    """In-app feed line for a signed-in customer's booking (mobile app bell)."""
    hour = booking.time.hour % 12 or 12
    meridiem = "am" if booking.time.hour < 12 else "pm"
    when = f"{booking.date:%A} {booking.date.day} {booking.date:%B}, {hour}:{booking.time:%M} {meridiem}"
    table = f"table for {booking.party_size} at {booking.location.name}"
    return {
        "confirmed": f"Your {table} is set for {when}.",
        "declined": f"{booking.location.name} couldn’t take your booking for {when}. "
        "Please call the café to find another time.",
        "cancelled": f"Your booking at {booking.location.name} for {when} was cancelled.",
    }.get(booking.status, "")


def app_booking_problems(location, date, time, now=None):
    """
    The mobile app's booking rules, in Canberra time (src/domain/reservations.ts): open
    hours only, last booking 30 minutes before close, at least 12 hours' notice.
    Returns a customer message or "".
    """
    hours = hours_for(location, date)
    if not hours or hours.is_closed or not hours.opens_at or not hours.closes_at:
        return "Café is closed on this date"
    last = datetime.combine(date, hours.closes_at) - timedelta(minutes=30)
    if time < hours.opens_at or datetime.combine(date, time) > last:
        return "Café is closed at this time"
    try:
        moment = local_datetime(date, time)
    except DomainError:
        return "Café is closed at this time"
    if moment - (now or timezone.now()) < timedelta(hours=12):
        return "Bookings need at least 12 hours’ notice"
    return ""


@transaction.atomic
def create_app_booking(customer, data):
    """
    A booking *request* from the app. The café confirms it (today's process is a request by
    email), so this records it in BOS and emails the café inbox and the guest; it does not
    need the website's online-booking rule switched on.
    """
    location = data["location"]
    booking = Booking.objects.create(**data, customer=customer, source="app")
    enqueue_email(
        booking.email,
        f"Booking request {booking.reference}",
        f"We received your booking request for {location.name}, {booking.date} {booking.time:%H:%M}, "
        f"party of {booking.party_size}. Your booking is requested, not confirmed. "
        "The café will confirm it with you.",
        f"booking-{booking.pk}-requested",
    )
    notify_cafe(booking)
    return booking


@transaction.atomic
def cancel_by_customer(booking, request):
    booking = (
        Booking.objects.select_for_update(of=("self",))
        .select_related("location")
        .get(pk=booking.pk)
    )
    if booking.status in {"cancelled", "declined"}:
        return booking
    if booking.status != "requested":
        raise DomainError(
            "booking_confirmed",
            "This booking is already confirmed. Please call the café to change it.",
            409,
        )
    before = snapshot(booking)
    booking.status = "cancelled"
    booking.handled_at = timezone.now()
    booking.updated_by = request.user
    booking.save()
    audit(request, booking, before, "cancel")
    enqueue_email(
        booking.location.email or SiteSettings.load().contact_email,
        f"Booking request cancelled — {booking.reference}",
        f"{booking.name} cancelled their request for {booking.date} at {booking.time:%H:%M} "
        f"({booking.party_size} guests) at {booking.location.name}.",
        f"booking-{booking.pk}-cancelled-by-guest",
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
