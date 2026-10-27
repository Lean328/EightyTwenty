from .models import Location

# Permanently closed cafés stay in BOS/history, even if old CMS data republishes them.
CLOSED_PUBLIC_LOCATION_SLUGS = frozenset({"akuna"})


def public_locations():
    return Location.objects.filter(is_published=True).exclude(slug__in=CLOSED_PUBLIC_LOCATION_SLUGS)


WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # OpeningHours.weekday 0 = Monday


def weekly_hours(location):
    """
    {"mon": {"open": "07:00", "close": "15:00"} | None, ...}, or None while hours are TBC.
    A café that is not open, or has no hours entered, has no weekly hours (no orders/bookings).
    """
    rows = {row.weekday: row for row in location.opening_hours.all()}
    if location.status != "open" or not rows:
        return None
    week = {}
    for day, key in enumerate(WEEKDAY_KEYS):
        row = rows.get(day)
        week[key] = (
            {"open": row.opens_at.strftime("%H:%M"), "close": row.closes_at.strftime("%H:%M")}
            if row and not row.is_closed and row.opens_at and row.closes_at
            else None
        )
    return week if any(week.values()) else None


def takes_customers(location):
    """Open for app orders and booking requests (the app's "not coming soon")."""
    return location.is_published and weekly_hours(location) is not None
