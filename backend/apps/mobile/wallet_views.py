"""
Apple Wallet endpoints under /api/v1/app/wallet: the one-off pass download the app opens, and
Apple's pass web service (iPhones register, ask what changed, fetch the new pass). Apple's own
calls authenticate with "ApplePass <authenticationToken>" from the pass, not a JWT.
"""

import json
import re
import secrets
import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render
from django.utils.http import http_date
from drf_spectacular.utils import extend_schema
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.loyalty import wallet
from apps.loyalty.models import WalletPass, WalletRegistration


def pkpass_response(wallet_pass):
    try:
        data = wallet.build_pkpass(wallet_pass)
    except wallet.WalletUnavailable:
        return Response(status=503)
    response = HttpResponse(data, content_type="application/vnd.apple.pkpass")
    response["Content-Disposition"] = 'attachment; filename="eightytwenty.pkpass"'
    response["Last-Modified"] = http_date(wallet_pass.updated_at.timestamp())
    response["Cache-Control"] = "no-store"
    return response


@extend_schema(exclude=True)
class AppleView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def authorized(self, request, pass_type, serial):
        if pass_type != settings.APPLE_WALLET_PASS_TYPE_ID:
            return None
        wallet_pass = (
            WalletPass.objects.select_related("card__user").filter(serial=serial).first()
            if _uuid(serial)
            else None
        )
        expected = "ApplePass " + (wallet_pass.authentication_token if wallet_pass else "")
        if not wallet_pass or not secrets.compare_digest(
            request.headers.get("Authorization", ""), expected
        ):
            return None
        return wallet_pass


def _uuid(value):
    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True


RETURN_URL = re.compile(r"^(exps?|eightytwenty)://[^\s\"'<>]{0,300}$")


def pass_links(request, wallet_pass, return_url=""):
    """(the "adding your card" page, the .pkpass itself) for one short-lived ticket."""
    ticket = wallet.download_ticket(wallet_pass)
    pass_url = request.build_absolute_uri(f"/api/v1/app/wallet/pass?ticket={ticket}")
    query = {"ticket": ticket}
    if return_url:
        query["return"] = return_url
    return request.build_absolute_uri(f"/api/v1/app/wallet/add?{urlencode(query)}"), pass_url


class AddPageView(AppleView):
    """GET wallet/add?ticket=…&return=… — opened in an in-app browser sheet: hands the pass to
    Wallet, then offers "Back to the app" (the app's own link) instead of a blank page."""

    def get(self, request):
        ticket = request.query_params.get("ticket", "")
        return_url = request.query_params.get("return", "")
        if not RETURN_URL.match(return_url):
            return_url = ""
        pass_url = ""
        if wallet.pass_from_ticket(ticket):
            pass_url = request.build_absolute_uri(
                f"/api/v1/app/wallet/pass?{urlencode({'ticket': ticket})}"
            )
        response = render(
            request._request,
            "wallet/add.html",
            {
                "pass_url": pass_url,
                "pass_url_json": json.dumps(pass_url),
                "return_url": return_url,
            },
        )
        response["Cache-Control"] = "no-store"
        return response


class PassDownloadView(AppleView):
    """GET wallet/pass?ticket=… — the link `GET /me/loyalty/wallet-pass` hands the app."""

    def get(self, request):
        wallet_pass = wallet.pass_from_ticket(request.query_params.get("ticket", ""))
        if not wallet_pass:
            return Response(status=410)
        return pkpass_response(wallet_pass)


class RegistrationView(AppleView):
    def post(self, request, device, pass_type, serial):
        wallet_pass = self.authorized(request, pass_type, serial)
        if not wallet_pass:
            return Response(status=401)
        token = str(request.data.get("pushToken", ""))
        if not token or len(token) > 256 or len(device) > 200:
            return Response(status=400)
        # A phone registers right after adding the pass it just downloaded: nothing is pending.
        _, created = WalletRegistration.objects.update_or_create(
            wallet_pass=wallet_pass,
            device_library_id=device,
            defaults={"push_token": token},
            create_defaults={"push_token": token, "notified_version": wallet_pass.version},
        )
        WalletRegistration.objects.filter(device_library_id=device).update(push_token=token)
        if not wallet_pass.card.wallet_pass_added:
            wallet_pass.card.wallet_pass_added = True
            wallet_pass.card.save(update_fields=["wallet_pass_added", "updated_at"])
        return Response(status=201 if created else 200)

    def delete(self, request, device, pass_type, serial):
        wallet_pass = self.authorized(request, pass_type, serial)
        if not wallet_pass:
            return Response(status=401)
        WalletRegistration.objects.filter(
            wallet_pass=wallet_pass, device_library_id=device
        ).delete()
        return Response(status=200)


class UpdatesView(AppleView):
    def get(self, request, device, pass_type):
        if pass_type != settings.APPLE_WALLET_PASS_TYPE_ID:
            return Response(status=204)
        try:
            since = int(request.query_params.get("passesUpdatedSince") or 0)
        except ValueError:
            return Response(status=400)
        passes = list(
            WalletPass.objects.filter(
                registrations__device_library_id=device, version__gt=since
            ).distinct()
        )
        if not passes:
            return Response(status=204)
        return Response(
            {
                "serialNumbers": [str(p.serial) for p in passes],
                "lastUpdated": str(max(p.version for p in passes)),
            }
        )


class LatestPassView(AppleView):
    def get(self, request, pass_type, serial):
        wallet_pass = self.authorized(request, pass_type, serial)
        if not wallet_pass:
            return Response(status=401)
        return pkpass_response(wallet_pass)


class LogView(AppleView):
    def post(self, request):
        return Response(status=200)  # Wallet's logs can hold personal data: not kept
