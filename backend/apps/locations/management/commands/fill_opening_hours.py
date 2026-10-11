"""Create weekly OpeningHours from the hours text the website already shows.

Only locations with no weekly hours are touched, so hours edited in the admin
are never overwritten. Dry run by default; pass --apply to write.

    python manage.py fill_opening_hours            # preview
    python manage.py fill_opening_hours --apply    # write
"""

import re
from datetime import time

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.locations.models import Location, OpeningHours

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SEGMENT = re.compile(
    r"(?P<first>mon|tue|wed|thu|fri|sat|sun)\w*"
    r"(?:\s*[-–]\s*(?P<last>mon|tue|wed|thu|fri|sat|sun)\w*)?\s+"
    r"(?:(?P<closed>closed)|(?P<opens>\d{1,2}(?::\d{2})?\s*[ap]m)\s*[-–]\s*(?P<closes>\d{1,2}(?::\d{2})?\s*[ap]m))",
    re.IGNORECASE,
)


def clock(text):
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*([ap])m", text.strip().lower())
    hour, minute, half = int(match[1]), int(match[2] or 0), match[3]
    return time(hour % 12 + (12 if half == "p" else 0), minute)


def parse_week(text):
    """{weekday: (opens, closes) or None for closed}; days the text never names are absent."""
    week = {}
    for match in SEGMENT.finditer(text or ""):
        first = DAYS.index(match["first"].lower()[:3])
        last = DAYS.index(match["last"].lower()[:3]) if match["last"] else first
        days = range(first, last + 1) if first <= last else [*range(first, 7), *range(0, last + 1)]
        hours = None if match["closed"] else (clock(match["opens"]), clock(match["closes"]))
        for day in days:
            week[day] = hours
    return week


class Command(BaseCommand):
    help = "Create weekly opening hours from each location's hours text (locations without hours only)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true", help="Write the hours (default: preview)."
        )

    def handle(self, *args, apply=False, **options):
        for location in Location.objects.filter(opening_hours__isnull=True).order_by("sort_order"):
            week = parse_week(location.hours_text)
            if len(week) != 7:
                self.stdout.write(f"skip  {location.name}: cannot read {location.hours_text!r}")
                continue
            summary = ", ".join(
                f"{DAYS[d].title()} {'closed' if h is None else f'{h[0]:%H:%M}-{h[1]:%H:%M}'}"
                for d, h in sorted(week.items())
            )
            self.stdout.write(f"{'write' if apply else 'plan '} {location.name}: {summary}")
            if apply:
                with transaction.atomic():
                    for day, hours in sorted(week.items()):
                        # save() per row so signals bump menu_version, as the admin does.
                        OpeningHours(
                            location=location,
                            weekday=day,
                            opens_at=hours[0] if hours else None,
                            closes_at=hours[1] if hours else None,
                            is_closed=hours is None,
                        ).save()
        if not apply:
            self.stdout.write("Preview only. Run again with --apply to write.")
