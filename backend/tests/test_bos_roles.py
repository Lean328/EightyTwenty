"""The BOS workspace for the three levels: chain owner, café owner, staff."""

from datetime import time

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import StaffAssignment, User
from apps.bookings.models import Booking
from apps.enquiries.models import Enquiry
from apps.menu.models import LocationMenuItem, MenuItem

from .factories import LocationFactory, MenuItemFactory, UserFactory

pytestmark = pytest.mark.django_db


def member(role, *cafes):
    user = UserFactory(role=role, is_staff=True)
    for cafe in cafes:
        StaffAssignment.objects.create(user=user, location=cafe)
    return user


def signed_in(user):
    client = Client()
    client.force_login(user)
    return client


def booking(cafe, **kwargs):
    return Booking.objects.create(
        location=cafe,
        date=timezone.localdate(),
        time=time(10),
        party_size=2,
        name=kwargs.pop("name", "Guest"),
        email="guest@example.test",
        phone="0400000000",
        **kwargs,
    )


@pytest.fixture
def world():
    a, b = (
        LocationFactory(slug="braddon", name="Braddon"),
        LocationFactory(slug="civic", name="Civic"),
    )
    return {
        "a": a,
        "b": b,
        "chain": UserFactory(is_staff=True, is_superuser=True, role="owner"),
        "manager": member("manager", a),
        "staff": member("staff", a),
        "staff_b": member("staff", b),
        "manager_b": member("manager", b),
    }


def test_who_can_open_the_workspace(world):
    assert signed_in(world["manager"]).get("/").status_code == 200
    assert signed_in(world["staff"]).get("/").status_code == 200
    unassigned = UserFactory(role="manager", is_staff=True)
    assert signed_in(unassigned).get("/").status_code == 302
    customer = UserFactory(role="customer", is_staff=True)
    assert signed_in(customer).get("/").status_code == 302


def test_menu_shows_each_role_only_its_pages(world):
    staff_page = signed_in(world["staff"]).get("/").content.decode()
    assert "Schedule" in staff_page and "Availability board" in staff_page
    for hidden in ["Team", "Customers", "Reports", "System status", "Pages", "Email delivery"]:
        assert f">{hidden}<" not in staff_page, hidden
    manager_page = signed_in(world["manager"]).get("/").content.decode()
    assert ">Team<" in manager_page and ">Reports<" in manager_page
    assert ">System status<" not in manager_page and ">Pages<" not in manager_page
    assert ">Customers<" not in manager_page


def test_bookings_are_scoped_and_handled_by_owners_and_staff(world):
    mine, theirs = booking(world["a"], name="Mine"), booking(world["b"], name="Theirs")
    client = signed_in(world["staff"])
    page = client.get(reverse("admin:bookings_booking_changelist")).content.decode()
    assert "Mine" in page and "Theirs" not in page
    assert client.get(reverse("admin:bookings_booking_change", args=[theirs.pk])).status_code == 302
    other = reverse("admin:bookings_booking_transition", args=[theirs.pk, "confirmed"])
    assert client.post(other).status_code == 404
    own = reverse("admin:bookings_booking_transition", args=[mine.pk, "confirmed"])
    assert client.post(own).status_code == 302
    mine.refresh_from_db()
    assert mine.status == "confirmed"


def test_staff_read_enquiries_owners_follow_them_up(world):
    enquiry = Enquiry.objects.create(
        kind="catering", name="Guest", email="g@example.test", message="Hi", location=world["a"]
    )
    url = reverse("admin:enquiries_enquiry_change", args=[enquiry.pk])
    data = {"status": "in_progress", "internal_notes": "Called back"}
    assert signed_in(world["staff"]).get(url).status_code == 200
    assert signed_in(world["staff"]).post(url, data).status_code == 403
    assert signed_in(world["manager"]).post(url, {**data, "_save": "Save"}).status_code == 302
    enquiry.refresh_from_db()
    assert enquiry.status == "in_progress"
    assert signed_in(world["manager_b"]).get(url).status_code == 302  # not their café


def menu_post(item_or_none, **fields):
    data = {
        "name": "Braddon Bowl",
        "slug": "braddon-bowl",
        "base_price_cents": "18.50",
        "is_published": "on",
        "sort_order": "0",
        "modifier_links-TOTAL_FORMS": "0",
        "modifier_links-INITIAL_FORMS": "0",
        "dietary_links-TOTAL_FORMS": "0",
        "dietary_links-INITIAL_FORMS": "0",
        "_save": "Save",
    }
    data.update(fields)
    return data


def test_cafe_owners_run_their_own_items_but_not_the_chain_menu(world, client):
    chain_item = MenuItemFactory()
    manager = signed_in(world["manager"])
    change = reverse("admin:menu_menuitem_change", args=[chain_item.pk])
    assert manager.get(change).status_code == 200  # can read the chain menu
    assert (
        manager.post(
            change, menu_post(chain_item, category=str(chain_item.category_id))
        ).status_code
        == 403
    )
    add = reverse("admin:menu_menuitem_add")
    category = str(chain_item.category_id)
    response = manager.post(add, menu_post(None, category=category))
    assert "location" in response.context["adminform"].form.errors  # must pick a café
    response = manager.post(add, menu_post(None, category=category, location=str(world["b"].pk)))
    assert "location" in response.context["adminform"].form.errors  # not their café
    response = manager.post(add, menu_post(None, category=category, location=str(world["a"].pk)))
    assert response.status_code == 302
    own = MenuItem.objects.get(slug="braddon-bowl")
    assert own.location == world["a"]
    edit = menu_post(own, category=category, location=str(world["a"].pk), name="Braddon Bowl II")
    assert (
        manager.post(reverse("admin:menu_menuitem_change", args=[own.pk]), edit).status_code == 302
    )
    assert signed_in(world["staff"]).get(add).status_code == 403
    assert (
        signed_in(world["manager_b"])
        .get(reverse("admin:menu_menuitem_change", args=[own.pk]))
        .status_code
        == 302
    )
    # The website shows a café-only item on that café's menu alone.
    slugs = lambda url: {row["id"] for row in client.get(url).json()}  # noqa: E731
    assert "braddon-bowl" in slugs("/api/v1/public/menu?location=braddon")
    assert "braddon-bowl" not in slugs("/api/v1/public/menu?location=civic")
    assert "braddon-bowl" not in {
        row["id"] for row in client.get("/api/v1/public/bootstrap").json()["MENU"]
    }


def test_staff_toggle_availability_only_at_their_cafe(world):
    item = MenuItemFactory(is_published=True)
    exclusive = MenuItemFactory(is_published=True, location=world["a"])
    staff = signed_in(world["staff"])
    url = reverse("admin:bos_availability")
    page = staff.get(url)
    assert [c["location"] for c in page.context["locations"]] == [world["a"]]
    assert (
        staff.post(url, {"item": item.pk, "location": world["a"].pk, "available": "0"}).status_code
        == 302
    )
    assert not LocationMenuItem.objects.get(menu_item=item, location=world["a"]).is_available
    assert (
        staff.post(url, {"item": item.pk, "location": world["b"].pk, "available": "0"}).status_code
        == 404
    )
    assert (
        signed_in(world["staff_b"])
        .post(url, {"item": exclusive.pk, "location": world["b"].pk, "available": "0"})
        .status_code
        == 404
    )


def test_cafe_owner_manages_only_their_staff(world):
    manager = signed_in(world["manager"])
    page = manager.get(reverse("admin:accounts_user_changelist")).content.decode()
    assert world["staff"].email in page
    for other in ["staff_b", "manager_b", "chain"]:
        assert world[other].email not in page, other
    for other in ["staff_b", "manager_b", "chain"]:
        url = reverse("admin:accounts_user_change", args=[world[other].pk])
        assert manager.get(url).status_code == 302, other
    add = reverse("admin:accounts_user_add")
    data = {
        "email": "new.staff@example.test",
        "first_name": "New",
        "password1": "Sup3r-secret-pass",
        "password2": "Sup3r-secret-pass",
        "locations": [str(world["b"].pk)],
    }
    response = manager.post(add, data)
    assert "locations" in response.context["adminform"].form.errors  # not their café
    data["locations"] = [str(world["a"].pk)]
    assert manager.post(add, data).status_code == 302
    created = User.objects.get(email="new.staff@example.test")
    assert created.role == "staff" and created.is_staff and not created.is_superuser
    assert list(created.assignments.values_list("location", flat=True)) == [world["a"].pk]
    # Someone who also works at another café cannot be locked out by one owner.
    StaffAssignment.objects.create(user=world["staff"], location=world["b"])
    form_page = manager.get(reverse("admin:accounts_user_change", args=[world["staff"].pk]))
    assert "is_active" in form_page.context["adminform"].readonly_fields


def test_chain_owner_creates_cafe_owners(world):
    chain = signed_in(world["chain"])
    data = {
        "email": "owner.kingston@example.test",
        "password1": "Sup3r-secret-pass",
        "password2": "Sup3r-secret-pass",
        "role": "manager",
        "locations": [str(world["b"].pk)],
    }
    assert chain.post(reverse("admin:accounts_user_add"), data).status_code == 302
    owner = User.objects.get(email="owner.kingston@example.test")
    assert owner.role == "manager" and owner.is_staff
    assert signed_in(owner).get("/").status_code == 200


def test_reports_and_system_by_role(world):
    booking(world["a"])
    booking(world["b"])
    assert signed_in(world["staff"]).get(reverse("admin:bos_reports")).status_code == 403
    response = signed_in(world["manager"]).get(reverse("admin:bos_reports"))
    assert response.status_code == 200 and response.context["bookings"]["total"] == 1
    assert signed_in(world["manager"]).get(reverse("admin:bos_system")).status_code == 403
    assert signed_in(world["staff"]).get(reverse("admin:bos_schedule")).status_code == 200


def test_cafe_owner_edits_their_cafe_but_not_its_listing(world):
    cafe = world["a"]
    manager = signed_in(world["manager"])
    url = reverse("admin:locations_location_change", args=[cafe.pk])
    form = manager.get(url).context["adminform"]
    assert {"status", "is_published", "name"} <= set(form.readonly_fields)
    assert (
        manager.get(reverse("admin:locations_location_change", args=[world["b"].pk])).status_code
        == 302
    )
    assert signed_in(world["staff"]).post(url, {"address": "x"}).status_code == 403


def test_menu_list_says_where_each_item_is_sold(world):
    MenuItemFactory(name="Everywhere Toast")
    MenuItemFactory(name="Braddon Only", location=world["a"])
    page = (
        signed_in(world["manager"]).get(reverse("admin:menu_menuitem_changelist")).content.decode()
    )
    assert 'class="field-scope">All cafés<' in page and 'class="field-scope">Braddon<' in page


def test_api_only_roles_are_hidden_from_the_role_picker(world):
    chain = signed_in(world["chain"])
    add_choices = dict(
        chain.get(reverse("admin:accounts_user_add"))
        .context["adminform"]
        .form.fields["role"]
        .choices
    )
    assert set(add_choices) == {"manager", "staff", "customer"}
    own = chain.get(reverse("admin:accounts_user_change", args=[world["chain"].pk]))
    assert "owner" in dict(own.context["adminform"].form.fields["role"].choices)
