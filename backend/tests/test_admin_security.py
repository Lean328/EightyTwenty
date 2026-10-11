import pytest

from .factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "path",
    [
        "/admin/",
        "/admin/accounts/user/",
        "/admin/menu/menuitem/",
        "/admin/bookings/booking/",
        "/admin/core/auditlog/",
        "/admin/cms/contentblock/add/",
    ],
)
def test_superuser_admin_pages_render(client, path):
    user = UserFactory(is_staff=True, is_superuser=True, role="owner")
    client.force_login(user)
    assert client.get(path).status_code == 200


def test_api_staff_cannot_log_into_internal_admin(client):
    user = UserFactory(role="staff", is_staff=False)
    client.force_login(user)
    assert client.get("/admin/menu/menuitem/").status_code == 302


def test_unknown_endpoint_has_error_envelope(client, settings):
    settings.DEBUG = False
    response = client.get("/api/v1/not-implemented")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
