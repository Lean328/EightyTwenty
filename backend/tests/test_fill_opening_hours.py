from datetime import time
from io import StringIO

import pytest
from django.core.management import call_command

from apps.locations.management.commands.fill_opening_hours import parse_week
from apps.locations.models import OpeningHours

from .factories import LocationFactory

pytestmark = pytest.mark.django_db


def test_parse_week_reads_website_hours_text():
    week = parse_week("Mon–Fri 7:00am – 3:00pm · Sat–Sun closed")
    assert week[0] == (time(7), time(15)) and week[4] == (time(7), time(15))
    assert week[5] is None and week[6] is None
    assert parse_week("Mon-Sun 6am - 2:30pm")[6] == (time(6), time(14, 30))
    assert parse_week("Hours to be confirmed") == {}


def test_command_previews_then_fills_only_locations_without_hours():
    todo = LocationFactory(hours_text="Mon–Fri 7:00am – 3:00pm · Sat–Sun closed")
    done = LocationFactory(hours_text="Mon–Sun 6:00am – 3:00pm")
    OpeningHours.objects.create(location=done, weekday=0, opens_at=time(8), closes_at=time(12))
    tbc = LocationFactory(hours_text="Hours to be confirmed")
    call_command("fill_opening_hours", stdout=StringIO())
    assert not todo.opening_hours.exists()
    out = StringIO()
    call_command("fill_opening_hours", "--apply", stdout=out)
    assert todo.opening_hours.count() == 7
    assert todo.opening_hours.filter(is_closed=True).count() == 2
    assert done.opening_hours.count() == 1  # Hours entered in the admin are never touched.
    assert not tbc.opening_hours.exists() and "skip" in out.getvalue()
