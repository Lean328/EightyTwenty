"""Apple Wallet coffee card: signed pass, Apple's web service, update pushes."""

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID
from rest_framework.test import APIClient

from apps.loyalty import wallet
from apps.loyalty.models import LoyaltyCard, WalletPass, WalletRegistration
from apps.loyalty.services import card_for

from .factories import UserFactory

BASE = "/api/v1/app"
PASS_TYPE = "pass.au.com.eightytwentyfood.loyalty"


def self_signed(tmp_path, name):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = tmp_path / f"{name}.pem", tmp_path / f"{name}.key"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    return cert_path, key_path


@pytest.fixture
def configured(settings, tmp_path):
    cert, key = self_signed(tmp_path, "pass")
    wwdr, _ = self_signed(tmp_path, "wwdr")
    settings.APPLE_WALLET_PASS_TYPE_ID = PASS_TYPE
    settings.APPLE_WALLET_TEAM_ID = "TEAM123456"
    settings.APPLE_WALLET_CERT_PATH = str(cert)
    settings.APPLE_WALLET_KEY_PATH = str(key)
    settings.APPLE_WALLET_WWDR_CERT_PATH = str(wwdr)
    settings.APPLE_WALLET_WEB_SERVICE_URL = "https://api.example.com/api/v1/app/wallet"
    return settings


@pytest.fixture
def customer(db):
    return UserFactory(first_name="Sophie", last_name="Nguyen")


@pytest.fixture
def app(customer):
    client = APIClient()
    client.force_authenticate(customer)
    return client


def download(app):
    links = app.get(f"{BASE}/me/loyalty/wallet-pass").json()
    assert links["url"].startswith("http://testserver/api/v1/app/wallet/add?ticket=")
    assert links["passUrl"].startswith("http://testserver/api/v1/app/wallet/pass?ticket=")
    return APIClient().get(links["passUrl"].removeprefix("http://testserver"))


def test_no_certificates_no_wallet_button(app):
    assert app.get(f"{BASE}/me/loyalty").json()["walletPassAvailable"] is False
    assert app.get(f"{BASE}/me/loyalty/wallet-pass").status_code == 404


def test_the_pass_is_a_signed_coffee_card(app, customer, configured):
    card = card_for(customer)
    LoyaltyCard.objects.filter(pk=card.pk).update(stamps=6)
    assert app.get(f"{BASE}/me/loyalty").json()["walletPassAvailable"] is True
    response = download(app)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/vnd.apple.pkpass"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert {"pass.json", "manifest.json", "signature", "icon.png", "logo@2x.png"} <= names
    assert {"strip.png", "strip@2x.png", "strip@3x.png"} <= names  # the stamps, drawn
    manifest = json.loads(archive.read("manifest.json"))
    for name, digest in manifest.items():
        assert hashlib.sha1(archive.read(name)).hexdigest() == digest
    # A detached PKCS#7 signature over the manifest bytes, carrying the WWDR certificate.
    certs = pkcs7.load_der_pkcs7_certificates(archive.read("signature"))
    assert {c.subject.rfc4514_string() for c in certs} == {"CN=pass", "CN=wwdr"}
    data = json.loads(archive.read("pass.json"))
    assert data["passTypeIdentifier"] == PASS_TYPE and data["teamIdentifier"] == "TEAM123456"
    assert data["webServiceURL"] == "https://api.example.com/api/v1/app/wallet"
    assert data["barcodes"][0] == {
        "message": card.member_number,
        "format": "PKBarcodeFormatCode128",
        "messageEncoding": "iso-8859-1",
        "altText": card.member_number,
    }
    assert data["storeCard"]["headerFields"][0]["value"] == "6/9"
    member, reward = data["storeCard"]["secondaryFields"]
    assert member["value"] == "Sophie Nguyen" and reward["value"] == "3 more to go"


def test_add_page_hands_the_pass_to_wallet_then_returns_to_the_app(app, configured):
    back = "exp://192.168.1.5:8081/--/loyalty?added=1"
    url = app.get(f"{BASE}/me/loyalty/wallet-pass", {"return": back}).json()["url"]
    page = APIClient().get(url.removeprefix("http://testserver"))
    assert page.status_code == 200 and page["Content-Type"].startswith("text/html")
    html = page.content.decode()
    assert "/api/v1/app/wallet/pass?ticket=" in html and "Back to the app" in html
    assert 'href="exp://192.168.1.5:8081/--/loyalty?added=1"' in html
    # Only app links go back; anything else is dropped. A bad ticket explains itself.
    evil = app.get(f"{BASE}/me/loyalty/wallet-pass", {"return": "https://evil.example"}).json()
    assert "evil" not in evil["url"]
    assert "expired" in APIClient().get(f"{BASE}/wallet/add?ticket=nope").content.decode()


def test_card_updates_survive_garbage_collection(customer, configured):
    """The receiver is held strongly: on production (DEBUG off) a weak one was collected."""
    import gc
    import weakref

    from django.db.models.signals import post_save

    held = [r for r in post_save.receivers if r[0][0] == "wallet_card_changed"]
    assert len(held) == 1 and not isinstance(held[0][1], weakref.ReferenceType)
    gc.collect()
    wallet_pass = wallet.pass_for(card_for(customer))
    card = LoyaltyCard.objects.get(user=customer)
    card.stamps = 2
    card.save()
    assert WalletPass.objects.get(pk=wallet_pass.pk).version == wallet_pass.version + 1


def test_a_stale_or_forged_ticket_is_refused(configured, db):
    assert APIClient().get(f"{BASE}/wallet/pass?ticket=nope").status_code == 410


def test_apple_web_service_round_trip(app, customer, configured):
    download(app)
    wallet_pass = WalletPass.objects.get(card__user=customer)
    path = f"{BASE}/wallet/v1/devices/dev1/registrations/{PASS_TYPE}/{wallet_pass.serial}"
    apple = APIClient()
    token = {"pushToken": "ab" * 32}
    assert apple.post(path, token, format="json").status_code == 401
    assert (
        apple.post(path, token, format="json", HTTP_AUTHORIZATION="ApplePass wrong").status_code
        == 401
    )
    auth = {"HTTP_AUTHORIZATION": f"ApplePass {wallet_pass.authentication_token}"}
    assert apple.post(path, token, format="json", **auth).status_code == 201
    assert LoyaltyCard.objects.get(user=customer).wallet_pass_added is True

    # A stamp at the counter: the pass version moves on and the phone is told.
    before = WalletPass.objects.get(pk=wallet_pass.pk).version
    card = LoyaltyCard.objects.get(user=customer)
    card.stamps = 1
    card.save()
    after = WalletPass.objects.get(pk=wallet_pass.pk).version
    assert after > before
    updates = apple.get(
        f"{BASE}/wallet/v1/devices/dev1/registrations/{PASS_TYPE}?passesUpdatedSince={before}"
    )
    assert updates.json() == {"serialNumbers": [str(wallet_pass.serial)], "lastUpdated": str(after)}
    assert (
        apple.get(
            f"{BASE}/wallet/v1/devices/dev1/registrations/{PASS_TYPE}?passesUpdatedSince={after}"
        ).status_code
        == 204
    )
    latest = apple.get(f"{BASE}/wallet/v1/passes/{PASS_TYPE}/{wallet_pass.serial}", **auth)
    assert latest.status_code == 200
    assert (
        json.loads(zipfile.ZipFile(io.BytesIO(latest.content)).read("pass.json"))["storeCard"][
            "headerFields"
        ][0]["value"]
        == "1/9"
    )
    assert apple.delete(path, **auth).status_code == 200
    assert not WalletRegistration.objects.exists()
    assert apple.post(f"{BASE}/wallet/v1/log", {"logs": []}, format="json").status_code == 200


class FakeApns:
    def __init__(self, status):
        self.status, self.calls = status, []

    def __call__(self, **kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, content=None, headers=None):
        self.calls.append((url, headers))
        return httpx.Response(self.status)


@pytest.mark.parametrize("status", [200, 410])
def test_pending_updates_are_pushed_to_apple(customer, configured, status):
    wallet_pass = wallet.pass_for(card_for(customer))
    WalletRegistration.objects.create(
        wallet_pass=wallet_pass, device_library_id="dev1", push_token="cd" * 32, notified_version=0
    )
    fake = FakeApns(status)
    with patch("httpx.Client", fake):
        sent, failed = wallet.push_pending()
    url, headers = fake.calls[0]
    assert url == "https://api.push.apple.com/3/device/" + "cd" * 32
    assert headers["apns-topic"] == PASS_TYPE
    if status == 200:
        assert (sent, failed) == (1, 0)
        assert WalletRegistration.objects.get().notified_version == wallet_pass.version
    else:
        assert not WalletRegistration.objects.exists()


def test_the_pass_shows_free_coffees_that_add_up(app, customer, configured):
    card = card_for(customer)
    LoyaltyCard.objects.filter(pk=card.pk).update(stamps=20)  # 2 free coffees + 2 stamps
    archive = zipfile.ZipFile(io.BytesIO(download(app).content))
    fields = json.loads(archive.read("pass.json"))["storeCard"]
    assert fields["headerFields"][0]["value"] == "2/9"
    reward = next(f for f in fields["secondaryFields"] if f["key"] == "reward")
    assert reward["value"] == "2 free coffees ready"
