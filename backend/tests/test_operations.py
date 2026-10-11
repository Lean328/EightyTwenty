from unittest.mock import Mock, patch

import pytest
from rest_framework.test import APIRequestFactory

from apps.core.models import AuditLog
from apps.core.throttles import PersistentThrottle
from apps.media.models import MediaAsset
from apps.notifications.models import EmailMessage

pytestmark = pytest.mark.django_db


def test_jobs_require_exact_token_and_retry_email(client, settings):
    message = EmailMessage.objects.create(
        recipient="guest@example.com", subject="Hello", body="Test", dedup_key="test"
    )
    for path in ["retry-emails", "cleanup"]:
        assert client.post(f"/api/v1/jobs/{path}").status_code == 403
        assert client.post(f"/api/v1/jobs/{path}", HTTP_X_JOB_TOKEN="wrong").status_code == 403
        response = client.post(f"/api/v1/jobs/{path}", HTTP_X_JOB_TOKEN=settings.JOB_TOKEN)
        assert response.status_code == 200, response.data
    message.refresh_from_db()
    assert message.status == "sent"
    assert (
        client.post("/api/v1/jobs/retry-emails", HTTP_X_JOB_TOKEN=settings.JOB_TOKEN).data[
            "processed"
        ]
        == 0
    )


def test_throttle_is_shared_between_instances():
    from django.contrib.auth.models import AnonymousUser

    request = APIRequestFactory().post("/", {}, REMOTE_ADDR="192.0.2.1")
    request.user = AnonymousUser()
    request.data = {}
    view = Mock(throttle_scope="forms")
    for _ in range(10):
        assert PersistentThrottle().allow_request(request, view)
    throttle = PersistentThrottle()
    assert not throttle.allow_request(request, view)
    assert throttle.wait() > 0


def test_media_flow_receipt_ownership_validation_and_audit(owner_client, owner, settings):
    settings.SUPABASE_URL = "https://test.supabase.co"
    settings.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key"
    settings.SUPABASE_PUBLIC_MEDIA_BASE = "https://test.supabase.co/storage/v1/object/public/media"
    with patch("apps.media.services.httpx.Client") as constructor:
        storage = constructor.return_value.__enter__.return_value
        storage.post.return_value = Mock(
            json=lambda: {"url": "/object/upload/sign/media/path?token=example"}
        )
        storage.head.return_value = Mock(
            headers={"content-length": "1024", "content-type": "image/webp"}
        )
        result = owner_client.post(
            "/api/v1/bos/media/upload-url",
            {"folder": "menu", "content_hash": "a" * 64},
            format="json",
        )
        assert result.status_code == 200, result.data
        receipt = result.data["receipt"]
        registered = owner_client.post(
            "/api/v1/bos/media",
            {"upload_receipt": receipt, "width": 1600, "height": 1000, "alt_text": "Dish"},
            format="json",
        )
        assert registered.status_code == 201, registered.data
        assert registered.data["bytes"] == 3072
        assert "upload_receipt" not in registered.data
        assert (
            owner_client.post(
                "/api/v1/bos/media", {"upload_receipt": receipt}, format="json"
            ).status_code
            == 409
        )
        assert owner_client.get(f"/api/v1/bos/media/{registered.data['id']}").status_code == 200
        assert (
            owner_client.patch(
                f"/api/v1/bos/media/{registered.data['id']}", {"alt_text": "Updated"}, format="json"
            ).status_code
            == 200
        )
    assert MediaAsset.objects.count() == 1
    assert "server-only-test-key" not in str(list(AuditLog.objects.values()))
    assert "token=example" not in str(list(AuditLog.objects.values()))


def test_media_missing_configuration_and_wrong_roles(client, owner, staff):
    client.force_authenticate(staff)
    assert client.post("/api/v1/bos/media/upload-url", {}, format="json").status_code == 403
    client.force_authenticate(owner)
    assert (
        client.post(
            "/api/v1/bos/media/upload-url",
            {"folder": "menu", "content_hash": "a" * 64},
            format="json",
        ).status_code
        == 503
    )
    assert (
        client.post("/api/v1/bos/media", {"upload_receipt": "forged"}, format="json").status_code
        == 400
    )


def test_schema_and_docs_available(client):
    assert client.get("/api/docs/").status_code == 200
    response = client.get("/api/schema/?format=json")
    assert response.status_code == 200
    schema = response.json()
    assert "/api/v1/public/bootstrap" in schema["paths"]
    assert schema["components"]["securitySchemes"]["JobToken"]["name"] == "X-Job-Token"
    for endpoint in ["login", "refresh"]:
        response_schema = schema["paths"][f"/api/v1/auth/{endpoint}"]["post"]["responses"]["200"][
            "content"
        ]["application/json"]["schema"]
        assert response_schema["$ref"].endswith("/TokenPair")
