from decimal import Decimal

import pytest

from apps.cms.models import ContentBlock, Page
from apps.core.models import AuditLog, SiteSettings
from apps.menu.models import LocationMenuItem
from apps.menu.services import cents_from_aud

pytestmark = pytest.mark.django_db


def test_health_never_queries_database(client, django_assert_num_queries):
    with django_assert_num_queries(0):
        assert client.get("/health").json() == {"ok": True}


def test_catering_price_keeps_cents_like_website(client):
    from apps.enquiries.models import CateringPackage

    CateringPackage.objects.create(slug="breakfast", name="Breakfast", price_cents=2200)
    CateringPackage.objects.create(slug="lunch", name="Lunch", price_cents=2750, sort_order=1)
    prices = [row["price"] for row in client.get("/api/v1/public/bootstrap").json()["CATERING"]]
    assert prices == ["$22", "$27.50"]


def test_bootstrap_prices_branch_isolation_and_etag(client, branch, other_branch, dish):
    initial = client.get("/api/v1/public/bootstrap?location=braddon")
    assert initial.status_code == 200
    assert initial.json()["MENU"][0]["price"] == 10.9
    etag = initial["ETag"]
    assert (
        client.get("/api/v1/public/bootstrap?location=braddon", HTTP_IF_NONE_MATCH=etag).status_code
        == 304
    )
    assert (
        client.get("/api/v1/public/bootstrap?location=other", HTTP_IF_NONE_MATCH=etag).status_code
        == 200
    )
    row = LocationMenuItem.objects.create(
        location=branch, menu_item=dish, price_override_cents=0, is_available=False
    )
    result = client.get("/api/v1/public/bootstrap?location=braddon", HTTP_IF_NONE_MATCH=etag)
    assert result.status_code == 200 and result["ETag"] != etag
    assert result.json()["MENU"][0]["price"] == 0
    assert result.json()["MENU"][0]["available"] is False
    assert client.get("/api/v1/public/menu?location=other").json()[0]["price"] == 10.9
    row.is_hidden = True
    row.save()
    assert client.get("/api/v1/public/menu?location=braddon").data == []
    assert client.get("/api/v1/public/menu?location=missing").status_code == 404


def test_global_price_changes_are_audited_and_refresh_public(owner_client, dish):
    version = SiteSettings.load().menu_version
    response = owner_client.patch(
        f"/api/v1/bos/menu-items/{dish.pk}", {"base_price_cents": 1295}, format="json"
    )
    assert response.status_code == 200, response.data
    assert SiteSettings.load().menu_version > version
    audit = AuditLog.objects.get(entity_id=str(dish.pk))
    assert audit.before["base_price_cents"] == 1090 and audit.after["base_price_cents"] == 1295
    assert owner_client.get("/api/v1/public/menu").json()[0]["price"] == 12.95
    assert (
        owner_client.patch(
            f"/api/v1/bos/menu-items/{dish.pk}", {"base_price_cents": -1}, format="json"
        ).status_code
        == 400
    )
    assert (
        owner_client.patch(
            f"/api/v1/bos/menu-items/{dish.pk}", {"slug": "changed"}, format="json"
        ).status_code
        == 400
    )


def test_staff_can_only_change_own_availability(client, staff, branch, other_branch, dish):
    client.force_authenticate(staff)
    path = f"/api/v1/bos/locations/{branch.slug}/menu-items/{dish.slug}"
    assert client.patch(path, {"is_available": False}, format="json").status_code == 200
    assert client.patch(path, {"price_override_cents": 10}, format="json").status_code == 403
    assert client.patch(path, {"is_hidden": True}, format="json").status_code == 403
    assert (
        client.patch(
            f"/api/v1/bos/locations/{other_branch.slug}/menu-items/{dish.slug}",
            {"is_available": False},
            format="json",
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/bos/locations/{branch.slug}/menu-items/bulk-availability",
            {"items": [dish.slug], "is_available": True},
            format="json",
        ).status_code
        == 200
    )
    assert client.get("/api/v1/bos/location-menu-items").data["count"] == 1
    assert (
        client.post(
            f"/api/v1/bos/locations/{branch.slug}/menu-items/bulk-availability",
            {"items": [dish.slug, "unknown"], "is_available": False},
            format="json",
        ).status_code
        == 404
    )
    assert LocationMenuItem.objects.get().is_available is True


@pytest.mark.parametrize(
    "endpoint",
    [
        "locations",
        "locations/braddon",
        "categories",
        "menu",
        "catering-packages",
        "settings",
        "version",
        "bootstrap",
    ],
)
def test_public_reads_are_anonymous(client, branch, dish, endpoint):
    assert client.get(f"/api/v1/public/{endpoint}").status_code == 200


def test_unpublished_data_does_not_leak(client, branch, dish):
    branch.is_published = False
    branch.save()
    dish.category.is_active = False
    dish.category.save()
    assert client.get("/api/v1/public/locations").data == []
    assert client.get("/api/v1/public/menu").data == []
    page = Page.objects.create(slug="about", title="About")
    ContentBlock.objects.create(page=page, key="text", type="rich_text", data={"text": "Hello"})
    assert client.get("/api/v1/public/pages/about").status_code == 404
    page.status = "published"
    page.save()
    assert client.get("/api/v1/public/pages/about").data["blocks"][0]["data"] == {"text": "Hello"}


@pytest.mark.parametrize(
    "value,expected", [("10.9", 1090), ("0.01", 1), ("$22", 2200), (Decimal("0.29"), 29)]
)
def test_money_conversion_is_exact(value, expected):
    assert cents_from_aud(value) == expected


@pytest.mark.parametrize("value", ["0.001", "NaN", "Infinity"])
def test_invalid_money_is_rejected(value):
    with pytest.raises(ValueError):
        cents_from_aud(value)
