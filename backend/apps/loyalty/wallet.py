"""
The coffee card in Apple Wallet: signed .pkpass files, Apple's update web service and the
pushes that make an iPhone fetch a changed card. Adapted from the loyalty-soya-nail project.

Setup (server only, see docs/OPERATIONS.md): a Pass Type ID and its certificate + private key
(PEM), Apple's WWDR intermediate (PEM), the Apple team ID and the public HTTPS URL of the web
service (`…/api/v1/app/wallet`). Until all of that is present `ready()` is False, the app
hides "Add to Apple Wallet" and `GET /me/loyalty/wallet-pass` answers 404.

Card updates need no scheduler: saving a coffee card bumps its pass version and, after the
commit, a background thread sends an empty APNs push to every iPhone holding it; the phone
then asks the web service for the new pass. A failed push stays pending and goes out with the
next change.
"""

import hashlib
import io
import json
import logging
import ssl
import threading
import zipfile
from pathlib import Path

from django.conf import settings
from django.core import signing
from django.db import close_old_connections, transaction
from django.db.models import F
from django.utils import timezone

from .models import STAMPS_PER_REWARD, LoyaltyCard, WalletPass, WalletRegistration, balance
from .services import plural
from .wallet_art import strips

logger = logging.getLogger(__name__)

ASSETS = Path(__file__).resolve().parent / "wallet_assets"
TICKET_SALT = "wallet-pass-download"
TICKET_MAX_AGE = 600
APNS_URL = "https://api.push.apple.com/3/device/"


class WalletUnavailable(Exception):
    pass


def ready():
    """Everything a signed, updatable pass needs is configured."""
    files = (
        settings.APPLE_WALLET_CERT_PATH,
        settings.APPLE_WALLET_KEY_PATH,
        settings.APPLE_WALLET_WWDR_CERT_PATH,
    )
    return bool(
        settings.APPLE_WALLET_PASS_TYPE_ID
        and settings.APPLE_WALLET_TEAM_ID
        and settings.APPLE_WALLET_WEB_SERVICE_URL.startswith("https://")
        and all(path and Path(path).is_file() for path in files)
    )


def pass_for(card):
    return WalletPass.objects.get_or_create(card=card)[0]


def download_ticket(wallet_pass):
    return signing.dumps(str(wallet_pass.serial), salt=TICKET_SALT)


def pass_from_ticket(ticket):
    try:
        serial = signing.loads(ticket, salt=TICKET_SALT, max_age=TICKET_MAX_AGE)
    except signing.BadSignature:
        return None
    return (
        WalletPass.objects.select_related("card__user")
        .filter(serial=serial, card__user__is_active=True)
        .first()
    )


# ---------------------------------------------------------------- the pass


def cafes():
    from apps.locations.models import Location

    return list(
        Location.objects.filter(is_published=True, status="open").order_by("sort_order", "name")
    )


def pass_json(wallet_pass):
    card = wallet_pass.card
    user = card.user
    rewards, stamps = balance(card.stamps)  # free coffees add up; stamps = towards the next
    away = STAMPS_PER_REWARD - stamps
    barcode = {
        # The same characters as the app's barcode: the counter scans it into BOS search.
        "message": card.member_number,
        "format": "PKBarcodeFormatCode128",
        "messageEncoding": "iso-8859-1",
        "altText": card.member_number,
    }
    places = cafes()
    data = {
        "formatVersion": 1,
        "passTypeIdentifier": settings.APPLE_WALLET_PASS_TYPE_ID,
        "teamIdentifier": settings.APPLE_WALLET_TEAM_ID,
        "serialNumber": str(wallet_pass.serial),
        "authenticationToken": wallet_pass.authentication_token,
        "webServiceURL": settings.APPLE_WALLET_WEB_SERVICE_URL.rstrip("/"),
        "organizationName": "EightyTwenty",
        "description": "EightyTwenty coffee card",
        "foregroundColor": "rgb(247, 240, 228)",
        "backgroundColor": "rgb(75, 46, 38)",
        "labelColor": "rgb(214, 180, 140)",
        "sharingProhibited": True,
        "voided": not user.is_active,
        "barcode": barcode,
        "barcodes": [barcode],
        "storeCard": {
            "headerFields": [
                {
                    "key": "stamps",
                    "label": "STAMPS",
                    "value": f"{stamps}/{STAMPS_PER_REWARD}",
                    "textAlignment": "PKTextAlignmentRight",
                    "changeMessage": "Your EightyTwenty coffee card now has %@ stamps.",
                }
            ],
            # The stamps themselves are drawn on the strip image (wallet_art.py).
            "secondaryFields": [
                {"key": "member", "label": "MEMBER", "value": user.get_full_name() or user.email},
                {
                    "key": "reward",
                    "label": "FREE COFFEE",
                    "value": f"{plural(rewards, 'free coffee')} ready"
                    if rewards
                    else f"{away} more to go",
                    "textAlignment": "PKTextAlignmentRight",
                    **({"changeMessage": "%@ — show your card."} if rewards else {}),
                },
            ],
            "backFields": [
                {
                    "key": "how",
                    "label": "How it works",
                    "value": f"One stamp for every coffee. Every {STAMPS_PER_REWARD} stamps is a free "
                    "coffee — any coffee, any size — and free coffees add up until you use "
                    "them. Show this card at the counter; it updates by itself.",
                },
                {
                    "key": "cafes",
                    "label": "Our cafés",
                    "value": "\n".join(f"{c.name} — {c.address}" for c in places) or "Canberra",
                },
                {
                    "key": "website",
                    "label": "Website",
                    "value": settings.CLIENT_BASE_URL or "https://eightytwenty.pages.dev",
                },
                {"key": "number", "label": "Member number", "value": card.member_number},
                {
                    "key": "terms",
                    "label": "Terms",
                    "value": "Stamps and free coffees have no cash value and can’t be transferred.",
                },
            ],
        },
    }
    located = [
        {
            "latitude": float(c.lat),
            "longitude": float(c.lng),
            "relevantText": f"You’re near EightyTwenty {c.name}. Show your coffee card.",
        }
        for c in places
        if c.lat is not None and c.lng is not None
    ][:10]
    if located:
        data["locations"] = located
    return data


def build_pkpass(wallet_pass):
    """The signed .pkpass archive for this pass. Raises WalletUnavailable when unsigned."""
    files = {"pass.json": json.dumps(pass_json(wallet_pass), indent=2).encode()}
    for asset in sorted(ASSETS.glob("*.png")):
        files[asset.name] = asset.read_bytes()
    rewards, stamps = balance(wallet_pass.card.stamps)
    files.update(strips(stamps, STAMPS_PER_REWARD, ready=rewards > 0))
    manifest = json.dumps(
        {name: hashlib.sha1(data).hexdigest() for name, data in files.items()}, indent=2
    ).encode()
    files["manifest.json"] = manifest
    files["signature"] = sign(manifest)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def sign(manifest):
    if not ready():
        raise WalletUnavailable("Apple Wallet signing is not configured.")
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs7

    password = settings.APPLE_WALLET_KEY_PASSWORD.encode() or None
    try:
        cert = x509.load_pem_x509_certificate(Path(settings.APPLE_WALLET_CERT_PATH).read_bytes())
        key = serialization.load_pem_private_key(
            Path(settings.APPLE_WALLET_KEY_PATH).read_bytes(), password=password
        )
        wwdr = x509.load_pem_x509_certificate(
            Path(settings.APPLE_WALLET_WWDR_CERT_PATH).read_bytes()
        )
    except (OSError, ValueError, TypeError) as exc:
        raise WalletUnavailable("Apple Wallet certificates could not be read.") from exc
    # Binary: sign the exact manifest bytes (text mode turns LF into CRLF and iPhones reject it).
    return (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(manifest)
        .add_signer(cert, key, hashes.SHA256())
        .add_certificate(wwdr)
        .sign(
            serialization.Encoding.DER,
            [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary],
        )
    )


# ---------------------------------------------------------------- updates


def card_changed(card_id):
    """A coffee card was saved: newer pass version, then tell the iPhones holding it."""
    changed = WalletPass.objects.filter(card_id=card_id).update(
        version=F("version") + 1, updated_at=timezone.now()
    )
    if not changed:
        return
    if not ready():
        return  # stays pending; goes out once Wallet is configured and the card changes again
    transaction.on_commit(lambda: threading.Thread(target=_push_in_thread, daemon=True).start())


def _push_in_thread():
    try:
        push_pending()
    except Exception:
        logger.exception("Could not send Wallet updates")
    finally:
        close_old_connections()


def push_pending():
    """Empty APNs pushes for every registration behind its pass. Returns (sent, failed)."""
    if not ready():
        return 0, 0
    pending = list(
        WalletRegistration.objects.select_related("wallet_pass").filter(
            notified_version__lt=F("wallet_pass__version")
        )[:500]
    )
    if not pending:
        return 0, 0
    import httpx

    context = ssl.create_default_context()
    context.load_cert_chain(
        settings.APPLE_WALLET_CERT_PATH,
        settings.APPLE_WALLET_KEY_PATH,
        password=settings.APPLE_WALLET_KEY_PASSWORD or None,
    )
    sent = failed = 0
    with httpx.Client(http2=True, verify=context, timeout=15) as client:
        for registration in pending:
            version = registration.wallet_pass.version
            try:
                response = client.post(
                    APNS_URL + registration.push_token,
                    content=b"{}",
                    headers={
                        "apns-topic": settings.APPLE_WALLET_PASS_TYPE_ID,
                        "apns-priority": "5",
                        "content-type": "application/json",
                    },
                )
            except httpx.HTTPError:
                failed += 1
                continue
            if response.status_code == 200:
                WalletRegistration.objects.filter(
                    pk=registration.pk, notified_version__lt=version
                ).update(notified_version=version)
                sent += 1
            elif response.status_code == 410:  # the card was removed from that iPhone
                registration.delete()
            else:
                failed += 1
    return sent, failed


def on_card_saved(sender, instance, created, **kwargs):
    if not created:
        card_changed(instance.pk)


def connect_signals():
    from django.db.models.signals import post_save

    # weak=False: a weakly held receiver can be garbage collected (it was on production, where
    # DEBUG is off and nothing else keeps a reference), and then cards silently stop updating.
    post_save.connect(
        on_card_saved, sender=LoyaltyCard, weak=False, dispatch_uid="wallet_card_changed"
    )
