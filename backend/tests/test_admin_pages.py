from datetime import time, timedelta

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.bookings.models import Booking, BookingRule
from apps.core.models import AuditLog, SiteSettings
from apps.enquiries.models import Enquiry
from apps.menu.models import LocationMenuItem

from .factories import LocationFactory, MenuItemFactory, UserFactory

pytestmark = pytest.mark.django_db
PAGES = ["admin:bos_reports", "admin:bos_schedule", "admin:bos_availability", "admin:bos_system"]


@pytest.fixture
def admin_client():
    client = Client()
    client.force_login(UserFactory(is_staff=True, is_superuser=True, role="owner"))
    return client


def booking(location, **kwargs):
    return Booking.objects.create(
        location=location,
        date=kwargs.pop("date", timezone.localdate()),
        time=kwargs.pop("time", time(10)),
        party_size=kwargs.pop("party_size", 2),
        name="Guest",
        email="guest@example.test",
        phone="0400000000",
        **kwargs,
    )


@pytest.mark.parametrize("name", PAGES)
def test_workspace_pages_are_superuser_only(client, name):
    client.force_login(UserFactory(is_staff=True, role="manager"))
    assert client.get(reverse(name)).status_code == 302


def test_reports_cover_periods_locations_and_export(admin_client):
    a, b = LocationFactory(is_published=True), LocationFactory(is_published=True)
    booking(a, status="seated", party_size=4)
    booking(a, status="no_show", time=time(12, 30))
    booking(b, status="cancelled", date=timezone.localdate() - timedelta(days=3))
    Enquiry.objects.create(
        kind="catering", name="Guest", email="g@example.test", message="Hi", status="won"
    )
    url = reverse("admin:bos_reports")
    response = admin_client.get(url)
    report = response.context["bookings"]
    assert report["total"] == 3
    assert report["guests"] == 6  # Cancelled bookings are not guests.
    assert report["no_show_rate"] == 50
    assert response.context["enquiries"]["win_rate"] == 100
    for params in [
        {"period": "7"},
        {"period": "90"},
        {"period": "365"},
        {"from": "2026-01-01", "to": "2026-02-01"},
    ]:
        assert admin_client.get(url, params).status_code == 200
    scoped = admin_client.get(url, {"location": a.slug}).context["bookings"]
    assert scoped["total"] == 2
    assert admin_client.get(url, {"location": "nowhere"}).status_code == 404
    export = admin_client.get(url, {"export": "bookings", "location": a.slug})
    assert export["Content-Type"].startswith("text/csv")
    lines = export.content.decode().strip().splitlines()
    assert lines[0].startswith("Reference,Date") and len(lines) == 3


def test_schedule_groups_by_slot_and_actions_return_to_it(admin_client):
    location = LocationFactory(is_published=True)
    BookingRule.objects.create(location=location, is_enabled=True, max_covers_per_slot=4)
    first = booking(location, party_size=3)
    booking(location, party_size=2, time=time(10, 15), status="confirmed")
    response = admin_client.get(reverse("admin:bos_schedule"), {"location": location.slug})
    card = response.context["cards"][0]
    assert card["count"] == 2 and card["waiting"] == 1
    assert card["slots"][0]["covers"] == 5 and card["slots"][0]["full"]
    here = reverse("admin:bos_schedule") + f"?location={location.slug}"
    url = reverse("admin:bookings_booking_transition", args=[first.pk, "confirmed"])
    assert admin_client.post(url, {"next": here})["Location"] == here
    first.refresh_from_db()
    assert first.status == "confirmed"
    # An off-site "next" is ignored.
    other = booking(location)
    url = reverse("admin:bookings_booking_transition", args=[other.pk, "declined"])
    assert (
        "evil.example" not in admin_client.post(url, {"next": "https://evil.example/"})["Location"]
    )


def test_availability_board_toggles_with_audit_and_cache_bump(admin_client):
    location = LocationFactory(is_published=True)
    item = MenuItemFactory(is_published=True)
    url = reverse("admin:bos_availability")
    assert admin_client.get(url).status_code == 200
    version = SiteSettings.load().menu_version
    response = admin_client.post(
        url,
        {"item": item.pk, "location": location.pk, "available": "0"},
        headers={"X-Requested-With": "fetch"},
    )
    assert response.json()["cells"][0]["state"] == "off"
    override = LocationMenuItem.objects.get(menu_item=item, location=location)
    assert not override.is_available and override.created_by.is_superuser
    assert AuditLog.objects.filter(entity_id=str(override.pk), action="admin_create").exists()
    assert SiteSettings.load().menu_version > version
    response = admin_client.post(url, {"item": item.pk, "location": "all", "available": "1"})
    assert response.status_code == 302
    override.refresh_from_db()
    assert override.is_available
    # Turning on an item with no override creates nothing.
    other = MenuItemFactory(is_published=True)
    admin_client.post(url, {"item": other.pk, "location": location.pk, "available": "1"})
    assert not LocationMenuItem.objects.filter(menu_item=other).exists()


def test_system_status_reports_data_checks(admin_client):
    booking(LocationFactory(), date=timezone.localdate() - timedelta(days=2))
    response = admin_client.get(reverse("admin:bos_system"))
    checks = {row["label"]: row for row in response.context["data_checks"]}
    assert checks["Past booking requests never answered"]["value"] == 1
    assert (
        admin_client.get(checks["Past booking requests never answered"]["url"]).status_code == 200
    )


def test_breadcrumbs_say_overview(admin_client):
    page = admin_client.get(reverse("admin:menu_menuitem_changelist")).content.decode()
    assert ">Overview</a>" in page and ">Home</a>" not in page


def test_lists_and_forms_use_workspace_wording_and_formats(admin_client):
    location = LocationFactory()
    booking(location, time=time(10))
    page = admin_client.get(reverse("admin:bookings_booking_changelist")).content.decode()
    assert "<title>Bookings · " in page and "Select booking" not in page
    assert "10:00 AM" in page and "a.m." not in page
    assert "Reservations</a>" in page  # App crumb is no longer "Bookings › Bookings".
    item = MenuItemFactory(is_featured=True)
    page = admin_client.get(reverse("admin:menu_menuitem_changelist")).content.decode()
    assert 'class="bos-bool is-yes"' in page and "icon-yes.svg" not in page
    page = admin_client.get(reverse("admin:menu_menuitem_change", args=[item.pk])).content.decode()
    assert "<h1>Edit menu item</h1>" in page


def test_empty_lists_explain_themselves(admin_client):
    page = admin_client.get(reverse("admin:core_auditlog_changelist")).content.decode()
    assert "No activity log yet." in page
    page = admin_client.get(
        reverse("admin:core_auditlog_changelist"), {"q": "zzz"}
    ).content.decode()
    assert "match “zzz”" in page and "Show all activity log" in page


def test_enquiry_list_shows_type_and_waiting_time(admin_client):
    Enquiry.objects.create(kind="catering", name="Guest", email="g@example.test", message="Hi")
    page = admin_client.get(reverse("admin:enquiries_enquiry_changelist")).content.decode()
    assert "Catering</span>" in page and 'bos-tone-quiet">0h' in page.replace("'", '"')


def test_admin_404_is_a_page_and_api_404_stays_json(admin_client):
    response = admin_client.get("/not-a-real-page/")
    assert response.status_code == 404
    assert "find that page" in response.content.decode()
    assert admin_client.get("/api/v1/nope").json()["error"]["code"] == "not_found"


def test_admin_500_page_needs_no_static_files_or_database():
    from django.template.loader import render_to_string

    page = render_to_string("admin/error_standalone.html")
    assert "Something went wrong" in page and "/static/" not in page


def test_workspace_lives_at_the_site_root(client):
    response = client.get("/")
    assert response.status_code == 302 and response["Location"].startswith("/login/")
    assert "Team sign-in" in client.get("/login/").content.decode()
    assert reverse("admin:index") == "/"


def test_old_admin_links_redirect_to_the_root(client):
    response = client.get("/admin/menu/menuitem/?q=toast")
    assert response.status_code == 301 and response["Location"] == "/menu/menuitem/?q=toast"
    assert client.get("/admin")["Location"] == "/"
    assert client.get("/administrator").status_code == 302  # not a legacy link: sign-in


def test_unknown_api_paths_stay_json_for_everyone(client):
    response = client.get("/api/v2/whatever")
    assert response.status_code == 404 and response.json()["error"]["code"] == "not_found"


def test_robots_and_favicon(client):
    assert "Disallow: /" in client.get("/robots.txt").content.decode()
    assert client.get("/favicon.ico")["Location"].endswith("bos/img/favicon.png")


def test_forbidden_page_is_inside_the_workspace():
    from apps.accounts.models import StaffAssignment

    staff = UserFactory(role="staff", is_staff=True)
    StaffAssignment.objects.create(user=staff, location=LocationFactory())
    client = Client()
    client.force_login(staff)
    response = client.get(reverse("admin:bos_reports"))
    page = response.content.decode()
    assert response.status_code == 403
    assert "have access to this page" in page and 'class="bos-sidebar"' in page


def test_expired_form_explains_what_to_do():
    client = Client(enforce_csrf_checks=True)
    response = client.post("/login/", {"username": "a@example.test", "password": "x"})
    assert response.status_code == 403 and "form expired" in response.content.decode()


def test_error_page_for_signed_out_visitors_is_standalone(rf):
    from django.contrib.auth.models import AnonymousUser

    from apps.core.views import not_found

    request = rf.get("/nowhere/")
    request.user = AnonymousUser()
    page = not_found(request, None).content.decode()
    assert "find that page" in page and 'href="/"' in page and "bos-sidebar" not in page
