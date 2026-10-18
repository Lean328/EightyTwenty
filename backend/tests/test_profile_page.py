"""The signed-in person's own profile page in the BOS workspace."""

import pytest
from django.test import Client
from django.urls import reverse

from apps.accounts.models import StaffAssignment
from apps.core.models import AuditLog

from .factories import LocationFactory, UserFactory

pytestmark = pytest.mark.django_db
URL = reverse("admin:bos_profile")


def signed_in(user):
    client = Client()
    client.force_login(user)
    return client


def member(role, *cafes, **fields):
    user = UserFactory(role=role, is_staff=True, **fields)
    for cafe in cafes:
        StaffAssignment.objects.create(user=user, location=cafe)
    return user


def test_account_menu_links_to_profile():
    owner = UserFactory(is_staff=True, is_superuser=True, role="owner")
    page = signed_in(owner).get(reverse("admin:index"))
    assert f'href="{URL}"' in page.content.decode()


def test_chain_owner_sees_every_cafe_and_full_account_link():
    LocationFactory(name="Braddon")
    owner = UserFactory(is_staff=True, is_superuser=True, role="owner", first_name="Thinh")
    page = signed_in(owner).get(URL)
    body = page.content.decode()
    assert page.status_code == 200
    assert "Chain owner" in body and "All cafés" in body and "Braddon" in body
    assert reverse("admin:accounts_user_change", args=[owner.pk]) in body


def test_staff_sees_only_assigned_cafes():
    braddon = LocationFactory(name="Braddon")
    LocationFactory(name="Civic")
    staff = member("staff", braddon, first_name="Lan")
    body = signed_in(staff).get(URL).content.decode()
    assert "Braddon" in body and "Civic" not in body
    assert "Ask your café owner for a 4-digit PIN" in body


def test_profile_update_saves_and_audits():
    staff = member("staff", LocationFactory(), first_name="Lan")
    client = signed_in(staff)
    response = client.post(URL, {"first_name": "Lan", "last_name": "Nguyen", "phone": "0400 111"})
    assert response.status_code == 302
    staff.refresh_from_db()
    assert (staff.last_name, staff.phone) == ("Nguyen", "0400 111")
    entry = AuditLog.objects.get(actor=staff, entity_type="accounts.user")
    assert entry.before["last_name"] == "" and entry.after["last_name"] == "Nguyen"
    assert "password" not in entry.after
    body = client.get(URL).content.decode()
    assert "Lan Nguyen" in body and "Your details were saved." in body
    assert '<span class="bos-feed-mark bos-tone-info">Update</span>' in body


def test_profile_post_cannot_change_role_or_email():
    staff = member("staff", LocationFactory(), email="lan@example.test")
    signed_in(staff).post(
        URL,
        {"first_name": "Lan", "email": "evil@example.test", "role": "manager", "is_superuser": 1},
    )
    staff.refresh_from_db()
    assert (staff.email, staff.role, staff.is_superuser) == ("lan@example.test", "staff", False)


def test_unchanged_form_writes_no_audit():
    staff = member("staff", LocationFactory(), first_name="Lan", last_name="Nguyen", phone="")
    signed_in(staff).post(URL, {"first_name": "Lan", "last_name": "Nguyen", "phone": ""})
    assert not AuditLog.objects.filter(actor=staff).exists()


def test_profile_needs_workspace_access(client):
    assert client.get(URL).status_code == 302
    customer = UserFactory(role="customer")
    assert signed_in(customer).get(URL).status_code == 302
