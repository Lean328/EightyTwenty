"""
Customer mobile app API, mounted at /api/v1/app. Paths, payloads and errors follow the
contract the app is coded against (EightyTwentyMobile/docs/API_CONTRACTS.md); the
human-readable guide is docs/APP_API.md. Views stay thin: rules live in the domain services.
"""

import hashlib
import json
import uuid
from datetime import date as Date
from datetime import datetime

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts import services as account_services
from apps.accounts.models import CustomerProfile, SavedAddress, User
from apps.accounts.serializers import RefreshSerializer
from apps.bookings import services as booking_services
from apps.bookings.models import Booking
from apps.cms.models import Faq, Offer
from apps.core.models import SiteSettings
from apps.enquiries.models import CateringPackage, Enquiry
from apps.enquiries.services import create_enquiry
from apps.locations.models import Location, LocationImage
from apps.locations.services import takes_customers
from apps.loyalty import services as loyalty
from apps.loyalty.models import GiftCardActivity, LoyaltyActivity
from apps.menu.catalog import menu_items
from apps.menu.models import Category, MenuItem
from apps.notifications.models import AppNotification
from apps.notifications.services import enqueue_email
from apps.orders import payments
from apps.orders import services as order_services
from apps.orders.models import Order

from . import presenters as p
from . import serializers as s
from .errors import AppError, app_exception_handler, invalid, not_found

AUTH, ACCOUNT, CATALOGUE, ORDERS, REWARDS, BOOKINGS, FEED = (
    "App · Auth",
    "App · Account",
    "App · Cafés & menu",
    "App · Orders & payments",
    "App · Loyalty & gift cards",
    "App · Bookings & catering",
    "App · Notifications & content",
)
PAGING = [
    OpenApiParameter("cursor", str, description="nextCursor from the previous page"),
    OpenApiParameter("limit", int, description="1–50, default 20"),
]


def doc(tag, summary, request=None, responses=None, errors=(), **kwargs):
    responses = dict(responses or {})
    for code in errors:
        responses.setdefault(code, s.ErrorOut)
    return extend_schema(
        tags=[tag], summary=summary, request=request, responses=responses, **kwargs
    )


def out(serializer, data, status_code=200, many=False):
    return Response(serializer(data, many=many).data, status=status_code)


def parse_uuid(value, message):
    try:
        return uuid.UUID(str(value))
    except ValueError as exc:
        raise not_found(message) from exc


def page(queryset, request, present):
    """Cursor pages ({items, nextCursor}); the cursor is an opaque offset."""
    try:
        offset = max(0, int(request.query_params.get("cursor") or 0))
        limit = min(50, max(1, int(request.query_params.get("limit") or 20)))
    except ValueError as exc:
        raise invalid("That page link is no longer valid.", cursor="invalid") from exc
    rows = list(queryset[offset : offset + limit + 1])
    return {
        "items": [present(row) for row in rows[:limit]],
        "nextCursor": str(offset + limit) if len(rows) > limit else None,
    }


def request_hash(data, *token_paths):
    """Fingerprint of a request body without single-use payment tokens (idempotency replays)."""
    body = json.loads(json.dumps(data, default=str))
    for path in token_paths:
        target = body
        for key in path[:-1]:
            target = target.get(key) if isinstance(target, dict) else None
        if isinstance(target, dict):
            target.pop(path[-1], None)
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def session(user):
    refresh = RefreshToken.for_user(user)
    return session_from(user.pk, str(refresh.access_token), str(refresh))


def session_from(user_id, access, refresh):
    expires = datetime.fromtimestamp(AccessToken(access)["exp"], tz=timezone.get_default_timezone())
    return {
        "customerId": str(user_id),
        "accessToken": access,
        "refreshToken": refresh,
        "expiresAt": p.iso(expires),
    }


def profile_of(user, lock=False):
    qs = (
        CustomerProfile.objects.select_for_update(of=("self",)) if lock else CustomerProfile.objects
    )
    return qs.filter(user=user).select_related("preferred_location").first() or (
        CustomerProfile.objects.create(user=user)
    )


def home_cafe(profile):
    if profile.preferred_location and profile.preferred_location.is_published:
        return profile.preferred_location.slug
    published = Location.objects.filter(is_published=True)
    fallback = published.filter(slug=p.DEFAULT_HOME_CAFE).first() or published.first()
    return fallback.slug if fallback else p.DEFAULT_HOME_CAFE


def split_name(name):
    first, _, last = name.strip().partition(" ")
    return first[:100], last.strip()[:100]


def published_locations():
    return Location.objects.filter(is_published=True).prefetch_related(
        Prefetch(
            "images", queryset=LocationImage.objects.filter(is_active=True).select_related("asset")
        ),
        "opening_hours",
    )


def find_location(slug):
    location = published_locations().filter(slug=slug).first()
    if location is None:
        raise not_found("That café could not be found.")
    return location


class AppView(APIView):
    def get_exception_handler(self):
        return app_exception_handler


class PublicView(AppView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]


# ---------------------------------------------------------------- auth


class SignInView(PublicView):
    throttle_scope = "auth"

    @doc(AUTH, "Sign in with email and password", s.SignInIn, {200: s.SessionOut}, (401, 422))
    def post(self, request):
        data = s.SignInIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(
            request, email=data.validated_data["email"], password=data.validated_data["password"]
        )
        if user is None:
            raise AppError(
                "UNAUTHORIZED",
                "That email and password don’t match. Try again or reset your password.",
                401,
            )
        return out(s.SessionOut, session(user))


class SignUpView(PublicView):
    throttle_scope = "auth"

    @doc(AUTH, "Create a customer account", s.SignUpIn, {201: s.SessionOut}, (409, 422))
    def post(self, request):
        data = s.SignUpIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        first, last = split_name(values["name"])
        candidate = User(email=values["email"], first_name=first, last_name=last)
        try:
            validate_password(values["password"], candidate)
        except DjangoValidationError as exc:
            short = any(error.code == "password_too_short" for error in exc.error_list)
            raise invalid(exc.messages[0], password="too_short" if short else "invalid") from exc
        with transaction.atomic():
            if User.objects.filter(email__iexact=values["email"]).exists():
                raise AppError(
                    "CONFLICT",
                    "An account with this email already exists. Log in instead.",
                    409,
                    {"email": "taken"},
                )
            user = User.objects.create_user(
                email=values["email"],
                password=values["password"],
                first_name=first,
                last_name=last,
                phone=values["phone"],
            )
            CustomerProfile.objects.create(user=user)
            loyalty.card_for(user)
            loyalty.gift_card_for(user)
        return out(s.SessionOut, session(user), 201)


class SignOutView(PublicView):
    @doc(AUTH, "Sign out (revoke the refresh token)", s.SignOutIn, {204: None})
    def post(self, request):
        token = request.data.get("refreshToken") if isinstance(request.data, dict) else None
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # already revoked or expired: signing out still succeeds
        return Response(status=204)


class RefreshView(PublicView):
    throttle_scope = "auth"

    @doc(AUTH, "Swap a refresh token for a new session", s.RefreshIn, {200: s.SessionOut}, (401,))
    @transaction.atomic
    def post(self, request):
        data = s.RefreshIn(data=request.data)
        data.is_valid(raise_exception=True)
        expired = AppError("UNAUTHORIZED", "Your session has expired. Please log in again.", 401)
        try:
            token = RefreshToken(data.validated_data["refreshToken"])
            # Serialize rotation so a replayed token cannot mint two sessions.
            User.objects.select_for_update().filter(pk=token["user_id"]).first()
            rotated = RefreshSerializer(data={"refresh": data.validated_data["refreshToken"]})
            rotated.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, KeyError, ValidationError) as exc:
            # Only a token that is really unusable signs the customer out; a database or
            # network hiccup must surface as a 5xx so the app keeps the session.
            raise expired from exc
        tokens = rotated.validated_data
        return out(
            s.SessionOut, session_from(token["user_id"], tokens["access"], tokens["refresh"])
        )


class PasswordResetView(PublicView):
    throttle_scope = "auth"

    @doc(AUTH, "Email a password reset link", s.EmailIn, {204: None}, (422,))
    def post(self, request):
        data = s.EmailIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=data.validated_data["email"], is_active=True
        ).first()
        if user:  # same answer either way, so the form cannot reveal who has an account
            account_services.send_account_link(
                user, "reset-password", base=request.build_absolute_uri("/account").rstrip("/")
            )
        return Response(status=204)


# ---------------------------------------------------------------- account


class MeView(AppView):
    @doc(ACCOUNT, "Profile", responses={200: s.CustomerOut}, errors=(401,))
    def get(self, request):
        return out(s.CustomerOut, p.customer(request.user))

    @doc(ACCOUNT, "Update name, email or phone", s.ProfileIn, {200: s.CustomerOut}, (409, 422))
    @transaction.atomic
    def patch(self, request):
        data = s.ProfileIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if "email" in values and values["email"] != user.email.lower():
            if User.objects.filter(email__iexact=values["email"]).exclude(pk=user.pk).exists():
                raise AppError(
                    "CONFLICT", "Another account already uses this email.", 409, {"email": "taken"}
                )
            user.email = values["email"]
            user.email_verified = False
        if "name" in values:
            user.first_name, user.last_name = split_name(values["name"])
        if "phone" in values:
            user.phone = values["phone"]
        user.save()
        return out(s.CustomerOut, p.customer(user))


class ClosureRequestView(AppView):
    @doc(ACCOUNT, "Ask the team to close this account", responses={204: None})
    def post(self, request):
        profile = profile_of(request.user)
        profile.closure_requested_at = timezone.now()
        profile.save(update_fields=["closure_requested_at", "updated_at"])
        user = request.user
        enqueue_email(
            SiteSettings.load().contact_email,
            "Account closure request (mobile app)",
            f"{p.full_name(user) or 'A customer'} <{user.email}> asked to close their account.\n"
            f"Customer id: {user.pk}\nCheck their gift card balance before closing it "
            "(BOS workspace → Users).",
            f"closure-{user.pk}-{timezone.localdate()}",
        )
        return Response(status=204)


class PreferencesView(AppView):
    @doc(ACCOUNT, "Preferences", responses={200: s.PreferencesOut})
    def get(self, request):
        profile = profile_of(request.user)
        return out(s.PreferencesOut, p.preferences(profile, home_cafe(profile)))

    @doc(
        ACCOUNT,
        "Update preferences (top-level merge)",
        s.PreferencesIn,
        {200: s.PreferencesOut},
        (422,),
    )
    @transaction.atomic
    def patch(self, request):
        data = s.PreferencesIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        profile = profile_of(request.user, lock=True)
        if "homeCafeId" in values:
            cafe = Location.objects.filter(slug=values.pop("homeCafeId"), is_published=True).first()
            if cafe is None:
                raise invalid("Choose one of our cafés.", homeCafeId="invalid")
            profile.preferred_location = cafe
        if "dietary" in values:
            values["dietary"] = list(dict.fromkeys(values["dietary"]))
        profile.app_preferences = {**(profile.app_preferences or {}), **values}
        profile.save()
        return out(s.PreferencesOut, p.preferences(profile, home_cafe(profile)))


def live_items(slugs):
    return set(
        MenuItem.objects.filter(
            slug__in=slugs, is_published=True, category__is_active=True
        ).values_list("slug", flat=True)
    )


def favourite_ids(profile):
    """Favourites in the order added, minus items that have left the menu."""
    stored = profile.favourite_items or []
    live = live_items(stored) if stored else set()
    return [slug for slug in stored if slug in live]


class FavouritesView(AppView):
    @doc(ACCOUNT, "Favourite menu items", responses={200: s.FavouritesOut})
    def get(self, request):
        return out(s.FavouritesOut, {"itemIds": favourite_ids(profile_of(request.user))})


class FavouriteView(AppView):
    @doc(ACCOUNT, "Add a favourite (idempotent)", responses={200: s.FavouritesOut}, errors=(404,))
    @transaction.atomic
    def put(self, request, item_id):
        if not live_items([item_id]):
            raise not_found("That item is no longer on the menu.")
        profile = profile_of(request.user, lock=True)
        stored = profile.favourite_items or []
        if item_id not in stored:
            profile.favourite_items = [*stored, item_id]
            profile.save(update_fields=["favourite_items", "updated_at"])
        return out(s.FavouritesOut, {"itemIds": favourite_ids(profile)})

    @doc(ACCOUNT, "Remove a favourite (idempotent)", responses={200: s.FavouritesOut})
    @transaction.atomic
    def delete(self, request, item_id):
        profile = profile_of(request.user, lock=True)
        stored = profile.favourite_items or []
        if item_id in stored:
            profile.favourite_items = [slug for slug in stored if slug != item_id]
            profile.save(update_fields=["favourite_items", "updated_at"])
        return out(s.FavouritesOut, {"itemIds": favourite_ids(profile)})


class AddressesView(AppView):
    @doc(ACCOUNT, "Saved delivery addresses", responses={200: s.AddressOut(many=True)})
    def get(self, request):
        rows = SavedAddress.objects.filter(user=request.user)
        return out(s.AddressOut, [p.address(row) for row in rows], many=True)

    @doc(ACCOUNT, "Save an address", s.AddressIn, {201: s.AddressOut}, (422,))
    def post(self, request):
        data = s.AddressIn(data=request.data)
        data.is_valid(raise_exception=True)
        row = SavedAddress.objects.create(
            user=request.user,
            label=data.validated_data["label"],
            line=data.validated_data["line"].strip(),
        )
        return out(s.AddressOut, p.address(row), 201)


class AddressView(AppView):
    @doc(ACCOUNT, "Remove a saved address (idempotent)", responses={204: None})
    def delete(self, request, address_id):
        try:
            SavedAddress.objects.filter(user=request.user, pk=uuid.UUID(address_id)).delete()
        except ValueError:
            pass
        return Response(status=204)


# ---------------------------------------------------------------- cafés & menu


class LocationsView(PublicView):
    @doc(
        CATALOGUE,
        "Cafés (display order, coming-soon ones included)",
        responses={200: s.LocationOut(many=True)},
    )
    def get(self, request):
        return out(s.LocationOut, [p.location(row) for row in published_locations()], many=True)


class LocationView(PublicView):
    @doc(CATALOGUE, "One café", responses={200: s.LocationOut}, errors=(404,))
    def get(self, request, slug):
        return out(s.LocationOut, p.location(find_location(slug)))


class LocationMenuView(PublicView):
    @doc(
        CATALOGUE,
        "A café's menu (sold-out and hidden items left out)",
        responses={200: s.MenuItemOut(many=True)},
        errors=(404,),
    )
    def get(self, request, slug):
        location = find_location(slug)
        rows = [p.menu_item(entry) for entry in menu_items(location) if entry.available]
        return out(s.MenuItemOut, rows, many=True)


class CategoriesView(PublicView):
    @doc(CATALOGUE, "Menu categories (rail order)", responses={200: s.CategoryOut(many=True)})
    def get(self, request):
        rows = Category.objects.filter(is_active=True)
        return out(s.CategoryOut, [p.category(row) for row in rows], many=True)


class MenuItemView(PublicView):
    @doc(
        CATALOGUE, "One menu item, whatever the café", responses={200: s.MenuItemOut}, errors=(404,)
    )
    def get(self, request, slug):
        entries = menu_items(any_location=True, slugs={slug})
        if not entries:
            raise not_found("That item is no longer on the menu.")
        return out(s.MenuItemOut, p.menu_item(entries[0]))


# ---------------------------------------------------------------- orders & payments


def my_orders(user):
    return Order.objects.filter(customer=user).select_related("location").prefetch_related("lines")


class OrdersView(AppView):
    @doc(
        ORDERS,
        "Place an order (server re-prices it; send an Idempotency-Key header)",
        s.OrderIn,
        {201: s.OrderOut},
        (402, 409, 422, 501),
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)],
    )
    def post(self, request):
        data = s.OrderIn(data=request.data)
        data.is_valid(raise_exception=True)
        key = request.headers.get("Idempotency-Key", "")[:100]
        fingerprint = request_hash(request.data, ("payment", "token")) if key else ""
        order, _ = order_services.create_order(request.user, data.validated_data, key, fingerprint)
        return out(s.OrderOut, p.order(my_orders(request.user).get(pk=order.pk)), 201)


class OrderQuoteView(AppView):
    @doc(ORDERS, "Price a cart without ordering (optional)", s.QuoteIn, {200: s.QuoteOut}, (422,))
    def post(self, request):
        data = s.QuoteIn(data=request.data)
        data.is_valid(raise_exception=True)
        priced, totals = order_services.quote(request.user, data.validated_data)
        return out(s.QuoteOut, p.quote(priced, totals))


class OrderView(AppView):
    @doc(
        ORDERS,
        "One order (poll every few seconds while live)",
        responses={200: s.OrderOut},
        errors=(404,),
    )
    def get(self, request, order_id):
        pk = parse_uuid(order_id, "Order not found.")
        order = my_orders(request.user).filter(pk=pk).first()
        if order is None:
            raise not_found("Order not found.")
        return out(s.OrderOut, p.order(order))


class MyOrdersView(AppView):
    @doc(ORDERS, "Order history, newest first", responses={200: s.OrderPageOut}, parameters=PAGING)
    def get(self, request):
        return out(s.OrderPageOut, page(my_orders(request.user), request, p.order))


class PaymentMethodsView(AppView):
    @doc(
        ORDERS,
        "Saved cards (empty until a payment provider is connected)",
        responses={200: s.SavedCardOut(many=True)},
    )
    def get(self, request):
        return out(s.SavedCardOut, [], many=True)

    @doc(ORDERS, "Save a card (not available yet: 501)", s.AddCardIn, {201: s.SavedCardOut}, (501,))
    def post(self, request):
        raise AppError("NOT_IMPLEMENTED", "Saving a card isn’t available in the app yet.", 501)


class PaymentMethodView(AppView):
    @doc(ORDERS, "Remove a saved card (idempotent)", responses={204: None})
    def delete(self, request, method_id):
        return Response(status=204)


# ---------------------------------------------------------------- loyalty & gift cards


class LoyaltyView(AppView):
    @doc(REWARDS, "Coffee card", responses={200: s.LoyaltyCardOut})
    def get(self, request):
        return out(s.LoyaltyCardOut, p.loyalty_card(loyalty.card_for(request.user)))


class LoyaltyActivityView(AppView):
    @doc(
        REWARDS,
        "Coffee card history, newest first",
        responses={200: s.LoyaltyPageOut},
        parameters=PAGING,
    )
    def get(self, request):
        rows = LoyaltyActivity.objects.filter(card__user=request.user).order_by("-created_at")
        return out(s.LoyaltyPageOut, page(rows, request, p.loyalty_activity))


class WalletPassView(AppView):
    @doc(
        REWARDS,
        "Apple Wallet pass URL (404 until passes are issued)",
        responses={200: s.WalletPassOut},
        errors=(404,),
    )
    def get(self, request):
        raise not_found("Wallet passes aren’t available yet.")


class WalletPassAddedView(AppView):
    @doc(REWARDS, "Record that the pass was added to Wallet", responses={200: s.LoyaltyCardOut})
    def post(self, request):
        card = loyalty.card_for(request.user)
        if not card.wallet_pass_added:
            card.wallet_pass_added = True
            card.save(update_fields=["wallet_pass_added", "updated_at"])
        return out(s.LoyaltyCardOut, p.loyalty_card(card))


class GiftCardView(AppView):
    @doc(REWARDS, "Gift card balance", responses={200: s.GiftCardOut})
    def get(self, request):
        return out(s.GiftCardOut, p.gift_card(loyalty.gift_card_for(request.user)))


class GiftActivityView(AppView):
    @doc(REWARDS, "Gift card activity, newest first", responses={200: s.GiftActivityOut(many=True)})
    def get(self, request):
        rows = GiftCardActivity.objects.filter(card__user=request.user).order_by("-created_at")[
            :100
        ]
        return out(s.GiftActivityOut, [p.gift_activity(row) for row in rows], many=True)


class GiftSendView(AppView):
    throttle_scope = "forms"

    @doc(
        REWARDS,
        "Buy an eGift card for someone (send an Idempotency-Key header)",
        s.GiftSendIn,
        {201: s.GiftActivityOut},
        (402, 409, 422, 501),
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)],
    )
    @transaction.atomic
    def post(self, request):
        data = s.GiftSendIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        card = loyalty.gift_card_for(request.user, lock=True)
        key = request.headers.get("Idempotency-Key", "")[:100]
        fingerprint = request_hash(request.data, ("paymentToken",)) if key else ""
        if key and (existing := card.activity.filter(idempotency_key=key).first()):
            if existing.request_hash != fingerprint:
                raise AppError(
                    "CONFLICT",
                    "This gift was already sent with different details. Please try again.",
                    409,
                )
            return out(s.GiftActivityOut, p.gift_activity(existing), 201)
        fields = {}
        if not values["recipientName"].strip():
            fields["recipientName"] = "required"
        if not s.EMAIL_LOOSE.match(values["recipientEmail"].strip()):
            fields["recipientEmail"] = "invalid"
        if fields:
            raise invalid("Add their name and a valid email.", **fields)
        if values["amountCents"] not in s.GIFT_AMOUNTS:
            raise invalid("Choose $25, $50, $75 or $100.", amountCents="invalid")
        name = values["recipientName"].strip()
        reference = payments.charge(
            values["amountCents"], values["paymentToken"], f"EightyTwenty eGift card for {name}"
        )
        # A real provider would issue the eGift and email it here; demo charges send nothing.
        row = GiftCardActivity.objects.create(
            card=card,
            kind="sent",
            description=f"Sent to {name}",
            amount_cents=values["amountCents"],
            recipient_name=name,
            recipient_email=values["recipientEmail"].strip(),
            message=values["message"].strip(),
            payment_reference=reference,
            idempotency_key=key,
            request_hash=fingerprint,
        )
        return out(s.GiftActivityOut, p.gift_activity(row), 201)


# ---------------------------------------------------------------- bookings & catering


def validate_reservation(values):
    """The app's booking rules in its documented order (API_CONTRACTS.md §12.2)."""
    location = (
        Location.objects.filter(slug=values["locationId"], is_published=True)
        .prefetch_related("opening_hours")
        .first()
    )
    if location is None or not takes_customers(location):
        raise AppError("LOCATION_UNAVAILABLE", "Bookings open when hours are confirmed.", 422)
    try:
        day = Date.fromisoformat(values["date"])
    except ValueError:
        day = None
    if day is None or day <= timezone.localdate():
        raise invalid("Choose a date from tomorrow onwards.", date="invalid")
    fields, message = {}, ""
    guests = values["guests"]
    if not isinstance(guests, int) or isinstance(guests, bool) or not 1 <= guests <= 100:
        fields["guests"] = "invalid"
    try:
        time = datetime.strptime(values["time"], "%H:%M").time()
    except ValueError:
        time = None
        fields["time"] = "invalid"
    if time and (message := booking_services.app_booking_problems(location, day, time)):
        fields["time"] = "invalid"
    if not values["name"].strip():
        fields["name"] = "invalid"
    if s.digits(values["phone"]) < 8:
        fields["phone"] = "invalid"
    if not s.EMAIL_STRICT.match(values["email"].strip()):
        fields["email"] = "invalid"
    if fields:
        raise invalid(message or "Please check the highlighted fields.", **fields)
    return {
        "location": location,
        "date": day,
        "time": time,
        "party_size": guests,
        "seating": values["seating"],
        "name": values["name"].strip(),
        "phone": values["phone"].strip(),
        "email": values["email"].strip().lower(),
        "notes": values["notes"].strip(),
    }


class ReservationsView(AppView):
    throttle_scope = "forms"

    @doc(
        BOOKINGS,
        "Request a table (the café confirms it)",
        s.ReservationIn,
        {201: s.ReservationOut},
        (422,),
    )
    def post(self, request):
        data = s.ReservationIn(data=request.data)
        data.is_valid(raise_exception=True)
        booking = booking_services.create_app_booking(
            request.user, validate_reservation(data.validated_data)
        )
        return out(s.ReservationOut, p.reservation(booking), 201)


class MyReservationsView(AppView):
    @doc(BOOKINGS, "My booking requests", responses={200: s.ReservationOut(many=True)})
    def get(self, request):
        rows = (
            Booking.objects.filter(customer=request.user)
            .select_related("location")
            .order_by("-date", "-time")[:100]
        )
        return out(s.ReservationOut, [p.reservation(row) for row in rows], many=True)


class ReservationView(AppView):
    @doc(BOOKINGS, "Cancel a booking request", responses={204: None}, errors=(404, 409))
    def delete(self, request, booking_id):
        pk = parse_uuid(booking_id, "That booking could not be found.")
        booking = Booking.objects.filter(customer=request.user, pk=pk).first()
        if booking is None:
            raise not_found("That booking could not be found.")
        booking_services.cancel_by_customer(booking, request)
        return Response(status=204)


class CateringPackagesView(PublicView):
    @doc(BOOKINGS, "Catering packages", responses={200: s.CateringPackageOut(many=True)})
    def get(self, request):
        rows = CateringPackage.objects.filter(is_active=True).select_related("image")
        return out(s.CateringPackageOut, [p.catering_package(row) for row in rows], many=True)


def validate_enquiry(values):
    package = CateringPackage.objects.filter(slug=values["packageId"], is_active=True).first()
    if package is None:
        raise invalid("Choose a catering menu.", packageId="invalid")
    fields = {}
    for name in ("firstName", "lastName", "notes"):
        if not values[name].strip():
            fields[name] = "invalid"
    if not s.EMAIL_STRICT.match(values["email"].strip()):
        fields["email"] = "invalid"
    if s.digits(values["phone"]) < 8:
        fields["phone"] = "invalid"
    day = None
    if values["date"]:
        try:
            day = Date.fromisoformat(values["date"])
        except ValueError:
            fields["date"] = "invalid"
        else:
            if day <= timezone.localdate():
                fields["date"] = "invalid"
    guests = values["guests"]
    if guests is not None and (
        not isinstance(guests, int) or isinstance(guests, bool) or not 1 <= guests <= 10000
    ):
        fields["guests"] = "invalid"
    if values["time"]:
        try:
            datetime.strptime(values["time"], "%H:%M")
        except ValueError:
            fields["time"] = "invalid"
    if fields:
        raise invalid("Please check the highlighted fields.", **fields)
    return package, day


class EnquiriesView(AppView):
    throttle_scope = "forms"

    @doc(
        BOOKINGS,
        "Send a catering enquiry",
        s.CateringEnquiryIn,
        {201: s.CateringEnquiryOut},
        (422,),
    )
    def post(self, request):
        data = s.CateringEnquiryIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        package, day = validate_enquiry(values)
        enquiry = create_enquiry(
            {
                "kind": "catering",
                "name": f"{values['firstName'].strip()} {values['lastName'].strip()}",
                "email": values["email"].strip().lower(),
                "phone": values["phone"].strip(),
                "company": values["company"].strip(),
                "event_date": day,
                "headcount": values["guests"],
                "package": package,
                "message": values["notes"].strip(),
                "payload": {
                    "occasion": values["occasion"].strip() or "Catering",
                    "time": values["time"] or "",
                    "eventLocation": values["location"].strip(),
                    "dietary": ", ".join(values["dietary"]),
                    "source": "app",
                },
                "customer": request.user,
            }
        )
        return out(s.CateringEnquiryOut, p.catering_enquiry(enquiry), 201)


class MyEnquiriesView(AppView):
    @doc(
        BOOKINGS,
        "My catering enquiries, newest first",
        responses={200: s.CateringEnquiryOut(many=True)},
    )
    def get(self, request):
        rows = (
            Enquiry.objects.filter(customer=request.user, kind="catering")
            .select_related("package")
            .order_by("-created_at")[:100]
        )
        return out(s.CateringEnquiryOut, [p.catering_enquiry(row) for row in rows], many=True)


# ---------------------------------------------------------------- notifications & content


class NotificationsView(AppView):
    @doc(FEED, "In-app notification feed", responses={200: s.NotificationFeedOut})
    def get(self, request):
        rows = list(AppNotification.objects.filter(user=request.user).order_by("-created_at")[:50])
        seen = profile_of(request.user).notifications_seen_at
        unseen = [str(r.pk) for r in rows if r.unread and (seen is None or r.created_at > seen)]
        return out(
            s.NotificationFeedOut,
            {"items": [p.notification(row) for row in rows], "unseenIds": unseen},
        )

    @doc(FEED, "Clear the feed", responses={204: None})
    def delete(self, request):
        AppNotification.objects.filter(user=request.user).delete()
        return Response(status=204)


class NotificationsSeenView(AppView):
    @doc(FEED, "Feed opened: clear the bell badge (unread dots stay)", responses={204: None})
    def post(self, request):
        profile = profile_of(request.user)
        profile.notifications_seen_at = timezone.now()
        profile.save(update_fields=["notifications_seen_at", "updated_at"])
        return Response(status=204)


class NotificationsReadAllView(AppView):
    @doc(FEED, "Mark every notification read", responses={204: None})
    def post(self, request):
        AppNotification.objects.filter(user=request.user, unread=True).update(unread=False)
        return Response(status=204)


class OffersView(PublicView):
    @doc(FEED, "In-store offers", responses={200: s.OfferOut(many=True)})
    def get(self, request):
        rows = Offer.objects.filter(is_active=True).select_related("image")
        return out(s.OfferOut, [p.offer(row) for row in rows], many=True)


class FaqsView(PublicView):
    @doc(FEED, "Help questions (display order)", responses={200: s.FaqOut(many=True)})
    def get(self, request):
        return out(s.FaqOut, [p.faq(row) for row in Faq.objects.filter(is_active=True)], many=True)
