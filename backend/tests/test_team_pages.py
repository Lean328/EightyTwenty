"""Team by café and the team account pages, by role."""

import pytest
from django.test import Client
from django.urls import reverse

from apps.accounts.models import StaffAssignment, User

from .factories import LocationFactory, UserFactory

pytestmark = pytest.mark.django_db


def member(role, *cafes, **fields):
    user = UserFactory(role=role, is_staff=True, **fields)
    for cafe in cafes:
        StaffAssignment.objects.create(user=user, location=cafe)
    return user


def signed_in(user):
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def world():
    a = LocationFactory(slug="braddon", name="Braddon")
    b = LocationFactory(slug="civic", name="Civic")
    return {
        "a": a,
        "b": b,
        "chain": UserFactory(is_staff=True, is_superuser=True, role="owner", first_name="Sam"),
        "manager": member("manager", a, first_name="Mia", last_name="Owner"),
        "staff": member("staff", a, first_name="Ari", last_name="Barista"),
        "staff_b": member("staff", b, first_name="Bo", last_name="Civic"),
        "lonely": UserFactory(role="staff", is_staff=True, first_name="No", last_name="Cafe"),
    }


def test_chain_owner_sees_every_cafe_and_the_unassigned(world):
    page = signed_in(world["chain"]).get(reverse("admin:bos_team"))
    assert page.status_code == 200
    html = page.content.decode()
    assert "Braddon" in html and "Civic" in html
    assert "Mia Owner" in html and "Ari Barista" in html and "Bo Civic" in html
    assert "Not assigned to a café" in html and "No Cafe" in html
    assert reverse("admin:accounts_user_add") in html
    cards = {card["cafe"].slug: card for card in page.context["cards"]}
    assert [p["name"] for p in cards["braddon"]["owners"]] == ["Mia Owner"]
    assert [p["name"] for p in cards["braddon"]["staff"]] == ["Ari Barista"]
    assert cards["civic"]["url"].endswith(f"/{world['b'].pk}/change/")
    assert page.context["totals"] == {"people": 3, "owners": 1, "locked": 0}


def test_cafe_owner_sees_only_their_cafe_and_links_only_their_staff(world):
    page = signed_in(world["manager"]).get(reverse("admin:bos_team"))
    assert page.status_code == 200
    html = page.content.decode()
    assert "Braddon" in html and "Civic" not in html
    assert "Bo Civic" not in html and "Not assigned to a café" not in html
    (card,) = page.context["cards"]
    owner, staff = card["owners"][0], card["staff"][0]
    assert owner["name"] == "Mia Owner" and owner["url"] == ""  # cannot edit themselves here
    assert staff["url"] == reverse("admin:accounts_user_change", args=[world["staff"].pk])
    assert card["add_url"].endswith(f"?locations={world['a'].pk}")


def test_staff_and_customers_cannot_open_team_by_cafe(world):
    assert signed_in(world["staff"]).get(reverse("admin:bos_team")).status_code == 403
    customer = UserFactory(role="customer")
    assert signed_in(customer).get(reverse("admin:bos_team")).status_code == 302
    staff_page = signed_in(world["staff"]).get(reverse("admin:index")).content.decode()
    assert reverse("admin:bos_team") not in staff_page


def test_team_list_filters_by_role_and_cafe(world):
    chain = signed_in(world["chain"])
    url = reverse("admin:accounts_user_changelist")
    everyone = chain.get(url).content.decode()
    assert "Team by café" in everyone and "Bo Civic" in everyone
    by_cafe = chain.get(url, {"cafe": world["a"].pk}).content.decode()
    assert "Ari Barista" in by_cafe and "Bo Civic" not in by_cafe
    owners = chain.get(url, {"team_role": "manager"}).content.decode()
    assert "Mia Owner" in owners and "Ari Barista" not in owners
    chain_only = chain.get(url, {"team_role": "chain"}).context["cl"].result_list
    assert list(chain_only) == [world["chain"]]
    # A café owner's filters only offer their own cafés and the staff role.
    manager = signed_in(world["manager"]).get(url)
    choices = {
        f.title: [c["display"] for c in f.choices(manager.context["cl"])]
        for f in manager.context["cl"].filter_specs
    }
    assert "Civic" not in choices["café"] and "Café owner" not in choices["role"]


def test_account_page_shows_the_team_summary(world):
    chain = signed_in(world["chain"])
    page = chain.get(reverse("admin:accounts_user_change", args=[world["staff"].pk]))
    assert page.status_code == 200
    team = page.context["team"]
    assert team["hero"]["title"] == "Ari Barista" and team["role_name"] == "Staff"
    assert [a.location.slug for a in team["assignments"]] == ["braddon"]
    html = page.content.decode()
    assert "Team member" in html and "What staff can do" in html
    customer = UserFactory(role="customer")
    assert (
        chain.get(reverse("admin:accounts_user_change", args=[customer.pk])).context["team"] is None
    )
    # The add form opened from a café card has that café ticked already.
    add = chain.get(reverse("admin:accounts_user_add"), {"locations": world["b"].pk})
    assert add.context["adminform"].form["locations"].value() == [str(world["b"].pk)]


def test_cafe_owner_summary_only_lists_their_cafes(world):
    StaffAssignment.objects.create(user=world["staff"], location=world["b"])
    page = signed_in(world["manager"]).get(
        reverse("admin:accounts_user_change", args=[world["staff"].pk])
    )
    assert [a.location.slug for a in page.context["team"]["assignments"]] == ["braddon"]
    assert User.objects.get(pk=world["staff"].pk).assignments.count() == 2
