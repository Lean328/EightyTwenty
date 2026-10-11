import pytest

from apps.cms.models import Page
from apps.core.models import AuditLog
from apps.media.models import MediaAsset
from apps.menu.models import ModifierGroup

from .factories import UserFactory

pytestmark = pytest.mark.django_db

CATALOG_ENDPOINTS = [
    "locations",
    "location-images",
    "opening-hours",
    "special-hours",
    "categories",
    "dietary-tags",
    "menu-items",
    "modifier-groups",
    "modifier-options",
    "menu-item-modifier-groups",
    "booking-rules",
    "catering-packages",
    "pages",
    "content-blocks",
    "navigation",
]
PRIVATE_ENDPOINTS = ["users", "staff-assignments", "audit-logs", "email-messages", "media"]


@pytest.mark.parametrize(
    "endpoint",
    CATALOG_ENDPOINTS + PRIVATE_ENDPOINTS + ["bookings", "enquiries", "location-menu-items"],
)
def test_bos_list_authentication_and_roles(client, owner, staff, endpoint):
    url = f"/api/v1/bos/{endpoint}"
    assert client.get(url).status_code == 401
    client.force_authenticate(UserFactory())
    assert client.get(url).status_code == 403
    client.force_authenticate(staff)
    assert client.get(url).status_code == (403 if endpoint in PRIVATE_ENDPOINTS else 200)
    client.force_authenticate(owner)
    result = client.get(url)
    assert result.status_code == 200
    assert set(result.data) == {"count", "next", "previous", "results"}


@pytest.fixture
def payloads(branch, dish):
    group = ModifierGroup.objects.create(code="add", name="Add-ons")
    page = Page.objects.create(slug="home", title="Home")
    asset = MediaAsset.objects.create(legacy_path="img/sample.jpg")
    staff = UserFactory(role="manager")
    return {
        "locations": ({"slug": "new-branch", "name": "New Branch"}, {"note": "Updated"}),
        "location-images": (
            {"location": str(branch.pk), "asset": str(asset.pk), "position": 0},
            {"is_active": False},
        ),
        "opening-hours": (
            {"location": str(branch.pk), "weekday": 0, "opens_at": "06:00", "closes_at": "15:00"},
            {"closes_at": "16:00"},
        ),
        "special-hours": (
            {"location": str(branch.pk), "date": "2027-01-01", "is_closed": True},
            {"reason": "Public holiday"},
        ),
        "categories": ({"slug": "drinks", "name": "Drinks"}, {"note": "Updated"}),
        "dietary-tags": (
            {"code": "GF*", "label": "GF optional"},
            {"description": "Available on request"},
        ),
        "menu-items": (
            {
                "slug": "new-dish",
                "name": "New dish",
                "category": str(dish.category_id),
                "base_price_cents": 1190,
            },
            {"base_price_cents": 1200},
        ),
        "modifier-groups": ({"code": "drink", "name": "Milk"}, {"max_select": 1}),
        "modifier-options": (
            {"group": str(group.pk), "name": "Egg", "price_delta_cents": 300},
            {"price_delta_cents": 350},
        ),
        "menu-item-modifier-groups": (
            {"menu_item": str(dish.pk), "modifier_group": str(group.pk)},
            {"is_active": False},
        ),
        "booking-rules": ({"location": str(branch.pk)}, {"max_party_size": 8}),
        "catering-packages": (
            {"slug": "breakfast", "name": "Breakfast", "price_cents": 2200, "items": ["Eggs"]},
            {"price_cents": 2300},
        ),
        "pages": ({"slug": "about", "title": "About"}, {"status": "published"}),
        "content-blocks": (
            {"page": str(page.pk), "key": "hero", "type": "hero", "data": {"title": "Hello"}},
            {"data": {"title": "Welcome"}},
        ),
        "navigation": (
            {"menu": "header", "label": "Home", "page": str(page.pk)},
            {"label": "Homepage"},
        ),
        "users": (
            {"email": "new@example.com", "password": "A-secure-secret-2026", "role": "staff"},
            {"first_name": "New"},
        ),
        "staff-assignments": (
            {"user": str(staff.pk), "location": str(branch.pk)},
            {"is_active": False},
        ),
    }


@pytest.mark.parametrize("endpoint", CATALOG_ENDPOINTS + ["users", "staff-assignments"])
def test_bos_create_retrieve_update_audit_and_staff_write_denied(
    client, owner, staff, payloads, endpoint
):
    payload, change = payloads[endpoint]
    url = f"/api/v1/bos/{endpoint}"
    client.force_authenticate(staff)
    assert client.post(url, payload, format="json").status_code == 403
    client.force_authenticate(owner)
    result = client.post(url, payload, format="json")
    assert result.status_code == 201, result.data
    identifier = result.data["slug"] if endpoint == "locations" else result.data["id"]
    detail = f"{url}/{identifier}"
    assert client.get(detail).status_code == 200
    response = client.patch(detail, change, format="json")
    assert response.status_code == 200, response.data
    assert AuditLog.objects.filter(entity_id=result.data["id"]).count() == 2
    assert client.delete(detail).status_code == 405


def test_settings_permissions_validation_and_audit(client, staff, owner):
    client.force_authenticate(staff)
    assert client.get("/api/v1/bos/settings").status_code == 200
    assert (
        client.patch("/api/v1/bos/settings", {"brand_name": "X"}, format="json").status_code == 403
    )
    client.force_authenticate(owner)
    assert (
        client.patch("/api/v1/bos/settings", {"brand_name": "New Name"}, format="json").status_code
        == 200
    )
    assert client.get("/api/v1/public/settings").data["brand_name"] == "New Name"
    assert (
        client.patch("/api/v1/bos/settings", {"menu_version": 0}, format="json").status_code == 400
    )


def test_cms_shape_and_navigation_cycle_validation(owner_client):
    page = Page.objects.create(slug="about", title="About")
    invalid = owner_client.post(
        "/api/v1/bos/content-blocks",
        {
            "page": str(page.pk),
            "key": "test",
            "type": "cta",
            "data": {"label": "Click", "url": "javascript:alert(1)"},
        },
        format="json",
    )
    assert invalid.status_code == 400
    node = owner_client.post(
        "/api/v1/bos/navigation",
        {"menu": "header", "label": "About", "page": str(page.pk)},
        format="json",
    )
    assert node.status_code == 201
    assert (
        owner_client.patch(
            f"/api/v1/bos/navigation/{node.data['id']}", {"parent": node.data["id"]}, format="json"
        ).status_code
        == 400
    )
