from urllib.parse import parse_qs, urlsplit

import pytest
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.notifications.models import EmailMessage

from .factories import UserFactory

pytestmark = pytest.mark.django_db
PASSWORD = "A-strong-password-2026"


def test_registration_cannot_set_role_and_normalizes_email(client):
    assert (
        client.post(
            "/api/v1/auth/register",
            {"email": "A@example.com", "password": PASSWORD, "role": "owner"},
            format="json",
        ).status_code
        == 400
    )
    result = client.post(
        "/api/v1/auth/register", {"email": "A@EXAMPLE.COM", "password": PASSWORD}, format="json"
    )
    assert result.status_code == 201, result.data
    user = User.objects.get(email="a@example.com")
    assert user.role == "customer" and user.check_password(PASSWORD)
    assert "password" not in result.data
    assert (
        client.post(
            "/api/v1/auth/register", {"email": "a@example.com", "password": PASSWORD}, format="json"
        ).status_code
        == 400
    )


def test_login_rotation_logout_and_permissions(client):
    user = UserFactory()
    login = client.post(
        "/api/v1/auth/login", {"email": user.email.upper(), "password": PASSWORD}, format="json"
    )
    assert login.status_code == 200
    pair = login.data
    refresh = client.post("/api/v1/auth/refresh", {"refresh": pair["refresh"]}, format="json")
    assert refresh.status_code == 200
    assert (
        client.post("/api/v1/auth/refresh", {"refresh": pair["refresh"]}, format="json").status_code
        == 401
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.data['access']}")
    assert client.get("/api/v1/me").data["email"] == user.email
    assert client.get("/api/v1/bos/menu-items").status_code == 403
    assert (
        client.post(
            "/api/v1/auth/logout", {"refresh": refresh.data["refresh"]}, format="json"
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/v1/auth/refresh", {"refresh": refresh.data["refresh"]}, format="json"
        ).status_code
        == 401
    )


def test_password_reset_email_verification_and_revocation(client):
    user = UserFactory()
    tokens = RefreshToken.for_user(user)
    for email in [user.email, "absent@example.com"]:
        assert client.post("/api/v1/auth/password/reset", {"email": email}, format="json").data == {
            "message": "If the account exists, an email will be sent."
        }
    body = EmailMessage.objects.get().body
    query = {
        key: values[0] for key, values in parse_qs(urlsplit(body.splitlines()[1]).query).items()
    }
    result = client.post(
        "/api/v1/auth/password/reset/confirm",
        {**query, "password": "Another-secret-password-2026"},
        format="json",
    )
    assert result.status_code == 200, result.data
    assert (
        client.post(
            "/api/v1/auth/password/reset/confirm", {**query, "password": PASSWORD}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post("/api/v1/auth/refresh", {"refresh": str(tokens)}, format="json").status_code
        == 401
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.access_token}")
    assert client.get("/api/v1/me").status_code == 401
    client.credentials()
    assert (
        client.post(
            "/api/v1/auth/verify-email/request", {"email": user.email}, format="json"
        ).status_code
        == 200
    )
    body = EmailMessage.objects.filter(subject="Verify your email").get().body
    query = {
        key: values[0] for key, values in parse_qs(urlsplit(body.splitlines()[1]).query).items()
    }
    assert client.post("/api/v1/auth/verify-email", query, format="json").status_code == 200
    assert client.post("/api/v1/auth/verify-email", query, format="json").status_code == 400


def test_profile_update_and_anonymization(client, branch):
    user = UserFactory()
    client.force_authenticate(user)
    assert client.patch("/api/v1/me", {"role": "owner"}, format="json").status_code == 400
    assert client.patch("/api/v1/me", {"phone": "0411111111"}, format="json").status_code == 200
    assert client.get("/api/v1/me/profile").status_code == 200
    assert (
        client.patch(
            "/api/v1/me/profile", {"preferred_location": str(branch.pk)}, format="json"
        ).status_code
        == 200
    )
    assert client.delete("/api/v1/me").status_code == 204
    user.refresh_from_db()
    assert not user.is_active and not user.has_usable_password() and not user.phone


def test_disabled_user_cannot_refresh_and_foreign_logout_rejected(client):
    user = UserFactory()
    other = UserFactory()
    token = RefreshToken.for_user(user)
    client.force_authenticate(other)
    assert (
        client.post("/api/v1/auth/logout", {"refresh": str(token)}, format="json").status_code
        == 401
    )
    user.is_active = False
    user.save()
    client.force_authenticate(None)
    assert (
        client.post("/api/v1/auth/refresh", {"refresh": str(token)}, format="json").status_code
        == 401
    )


def test_admin_cannot_grant_owner_or_edit_owner(client, owner):
    admin = UserFactory(role="admin")
    client.force_authenticate(admin)
    assert (
        client.patch(
            f"/api/v1/bos/users/{owner.pk}", {"first_name": "Taken over"}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/bos/users",
            {"email": "new@example.com", "password": PASSWORD, "role": "owner"},
            format="json",
        ).status_code
        == 400
    )
    client.force_authenticate(owner)
    assert (
        client.patch(
            f"/api/v1/bos/users/{owner.pk}", {"is_active": False}, format="json"
        ).status_code
        == 400
    )
