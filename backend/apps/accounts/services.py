from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator, default_token_generator
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.core.exceptions import DomainError
from apps.core.services import audit, snapshot
from apps.notifications.models import EmailMessage
from apps.notifications.services import enqueue_email

from .models import CustomerProfile, SavedAddress, User


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    key_salt = "eightytwenty.email_verification"

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.email}{user.email_verified}{user.password}{timestamp}"


email_token_generator = EmailVerificationTokenGenerator()


def send_account_link(user, kind, base=None):
    """base: where the link page lives (default the website; the app uses this server)."""
    generator = email_token_generator if kind == "verify-email" else default_token_generator
    token = generator.make_token(user)
    query = urlencode({"uid": urlsafe_base64_encode(force_bytes(user.pk)), "token": token})
    url = f"{base or settings.CLIENT_BASE_URL}/{kind}?{query}"
    # Tokens are never returned by the API or logged by the application in production.
    import hashlib

    key = hashlib.sha256(f"{kind}:{user.pk}:{token}".encode()).hexdigest()
    enqueue_email(
        user.email,
        "Verify your email" if kind == "verify-email" else "Reset your password",
        f"Use this link to {kind.replace('-', ' ')}:\n{url}\nIf you did not request this, ignore this email.",
        f"account-{key}",
    )


@transaction.atomic
def register(data):
    user = User.objects.create_user(**data)
    CustomerProfile.objects.create(user=user)
    send_account_link(user, "verify-email")
    return user


def token_user(uid, token, generator):
    try:
        user = User.objects.select_for_update().get(
            pk=force_str(urlsafe_base64_decode(uid)), is_active=True
        )
    except (ValueError, TypeError, User.DoesNotExist, UnicodeDecodeError) as exc:
        raise DomainError("invalid_token", "This link is invalid or expired.") from exc
    if not generator.check_token(user, token):
        raise DomainError("invalid_token", "This link is invalid or expired.")
    return user


@transaction.atomic
def reset_password(data):
    user = token_user(data["uid"], data["token"], default_token_generator)
    validate_password(data["password"], user)
    user.set_password(data["password"])
    user.save(update_fields=["password", "updated_at"])
    revoke_sessions(user)


@transaction.atomic
def verify_email(data):
    user = token_user(data["uid"], data["token"], email_token_generator)
    user.email_verified = True
    user.save(update_fields=["email_verified", "updated_at"])


def revoke_sessions(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@transaction.atomic
def anonymize(user):
    from apps.bookings.models import Booking
    from apps.enquiries.models import Enquiry
    from apps.loyalty.models import GiftCardActivity
    from apps.notifications.models import AppNotification, PushDevice
    from apps.orders.models import Order, OrderLine

    user = User.objects.select_for_update().get(pk=user.pk)
    if user.role != "customer":
        raise DomainError("staff_account", "Staff accounts must be managed by an owner.", 403)
    previous_email = user.email
    Booking.objects.filter(customer=user).update(
        name="Deleted customer", email="deleted@example.invalid", phone="", notes="", customer=None
    )
    removed = {
        "name": "Deleted customer",
        "email": "deleted@example.invalid",
        "phone": "",
        "company": "",
        "message": "[removed]",
        "payload": {},
        "internal_notes": "",
    }
    # A verified email is evidence of ownership for guest submissions.
    if user.email_verified:
        Booking.objects.filter(email__iexact=previous_email).update(
            name="Deleted customer", email="deleted@example.invalid", phone="", notes=""
        )
        Enquiry.objects.filter(email__iexact=previous_email).update(**removed)
    Enquiry.objects.filter(customer=user).update(**removed, customer=None)
    # Mobile app data: orders stay for the books, without the personal details.
    Order.objects.filter(customer=user).update(
        contact_name="Deleted customer", contact_phone="", delivery_address=""
    )
    OrderLine.objects.filter(order__customer=user).update(note="")
    GiftCardActivity.objects.filter(card__user=user).update(
        recipient_name="", recipient_email="", message=""
    )
    SavedAddress.objects.filter(user=user).delete()
    AppNotification.objects.filter(user=user).delete()
    PushDevice.objects.filter(user=user).delete()
    EmailMessage.objects.filter(recipient=previous_email).delete()
    CustomerProfile.objects.filter(user=user).update(
        birthday=None, preferred_location=None, notes="", app_preferences=None, favourite_items=None
    )
    user.email = f"deleted-{user.pk}@example.invalid"
    user.first_name = user.last_name = user.phone = ""
    user.marketing_opt_in = user.email_verified = user.is_active = False
    user.set_unusable_password()
    user.save()
    revoke_sessions(user)


@transaction.atomic
def save_user(serializer, request):
    before = snapshot(serializer.instance)
    data = dict(serializer.validated_data)
    password = data.pop("password", None)
    if serializer.instance:
        user = serializer.instance
        if "email" in data and data["email"] != user.email:
            user.email_verified = False
        for key, value in data.items():
            setattr(user, key, value)
        if password:
            user.set_password(password)
        user.save()
    else:
        user = User.objects.create_user(password=password, **data)
    serializer.instance = user
    audit(request, user, before, "create" if before is None else "update")
    return user
