from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.cms.models import NavigationItem, Page
from apps.core.models import AuditLog, SiteSettings

pytestmark = pytest.mark.django_db


def test_audit_failure_rolls_back_business_write_and_version(owner_client, dish):
    version = SiteSettings.load().menu_version
    with patch("apps.menu.services.audit", side_effect=RuntimeError("audit unavailable")):
        response = owner_client.patch(
            f"/api/v1/bos/menu-items/{dish.pk}", {"base_price_cents": 100}, format="json"
        )
    assert response.status_code == 500
    dish.refresh_from_db()
    assert dish.base_price_cents == 1090
    assert SiteSettings.load().menu_version == version
    assert not AuditLog.objects.exists()


def test_integer_bounds_match_postgres_on_all_databases(owner_client, dish):
    response = owner_client.patch(
        f"/api/v1/bos/menu-items/{dish.pk}", {"base_price_cents": 2147483648}, format="json"
    )
    assert response.status_code == 400


def test_scheduled_publication_invalidates_bootstrap_etag(client):
    now = timezone.now()
    page = Page.objects.create(
        slug="upcoming", title="Upcoming", status="published", published_at=now + timedelta(hours=1)
    )
    NavigationItem.objects.create(menu="header", label="Upcoming", page=page)
    initial = client.get("/api/v1/public/bootstrap")
    assert initial.data["SETTINGS"]["navigation"] == []
    with patch("apps.core.public_services.timezone.now", return_value=now + timedelta(hours=2)):
        response = client.get("/api/v1/public/bootstrap", HTTP_IF_NONE_MATCH=initial["ETag"])
    assert response.status_code == 200
    assert response.data["SETTINGS"]["navigation"][0]["url"] == "/upcoming"
